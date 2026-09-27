import * as Clipboard from "expo-clipboard";
import { File, Paths } from "expo-file-system";
import { useNetworkState } from "expo-network";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, Linking, Platform, Share, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  WebView,
  type WebViewMessageEvent,
  type WebViewNavigation,
} from "react-native-webview";

import { LaunchSplash } from "@/components/launch-splash";
import { isLaunchSplashVisible } from "@/lib/launch-splash-visibility";
import { isInitialWebDocument } from "@/lib/initial-web-document";
import { isAllowedWebUrl, parseNativeBridgeMessage } from "@/lib/native-bridge";
import { shouldHandleWebViewBack } from "@/lib/webview-back-navigation";
import {
  INITIAL_WEB_SHELL_STATE,
  reduceWebShellState,
  shouldRetryInitialLoad,
  type WebShellEvent,
} from "@/lib/web-shell-state";
import * as SplashScreen from "expo-splash-screen";

const APP_URL = "https://naghshman.ir";
const REFRESH_TOKEN_KEY = "naghshman.refresh-token";

function nativeBootstrap(platform: "android" | "ios") {
  return `
  (function () {
    if (window.NaghshmanNative) return true;
    window.NaghshmanNative = Object.freeze({ platform: '${platform}', version: 1 });
    var post = function (payload) {
      if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
        window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({
          source: 'naghshman-web',
          version: 1
        }, payload)));
      }
    };
    var originalFetch = window.fetch;
    if (typeof originalFetch === 'function') {
      window.fetch = async function () {
        var response = await originalFetch.apply(this, arguments);
        var input = arguments[0];
        var url = typeof input === 'string' ? input : (input && input.url) || '';

        if (url.indexOf('/api/auth/logout') !== -1 && response.ok) {
          post({ type: 'clear-refresh' });
        } else if (
          response.ok &&
          (url.indexOf('/api/auth/otp-verify') !== -1 ||
            url.indexOf('/api/auth/register-user') !== -1 ||
            url.indexOf('/api/auth/register-square') !== -1)
        ) {
          response.clone().json().then(function (body) {
            var token = body && body.data && body.data.refresh_token;
            if (typeof token === 'string' && /^ref_[A-Za-z0-9_-]{20,512}$/.test(token)) {
              post({ type: 'persist-refresh', token: token });
            }
          }).catch(function () {});
        }
        return response;
      };
    }
    window.addEventListener('naghshman:restore-session', async function (event) {
      var token = event && event.detail;
      if (window.__naghshmanRestoreInProgress || typeof token !== 'string') return;
      window.__naghshmanRestoreInProgress = true;
      try {
        var response = await originalFetch('/api/auth/native-restore', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ refresh_token: token })
        });
        if (response.ok) {
          window.location.replace('/');
          return;
        }
        post({ type: 'clear-refresh' });
      } catch (error) {
        // Keep the credential for a future online retry.
      } finally {
        window.__naghshmanRestoreInProgress = false;
      }
    });
    window.dispatchEvent(new Event('naghshman:native-ready'));
    return true;
  })();
`;
}

function filenameFor(url: string, supplied?: string): string {
  if (supplied && /^[\\w.-]+$/u.test(supplied)) return supplied;
  try {
    const lastPathSegment = new URL(url).pathname
      .split("/")
      .filter(Boolean)
      .pop();
    return lastPathSegment && /\\.[a-z0-9]{2,8}$/iu.test(lastPathSegment)
      ? lastPathSegment
      : `naghshman-${Date.now()}.jpg`;
  } catch {
    return `naghshman-${Date.now()}.jpg`;
  }
}

export function NativeWebShell() {
  const nativePlatform =
    Platform.OS === "android" || Platform.OS === "ios" ? Platform.OS : null;
  const webViewRef = useRef<WebView>(null);
  const canGoBackRef = useRef(false);
  const hasHiddenNativeSplashRef = useRef(false);
  const restoreAttemptedToken = useRef<string | null>(null);
  const initialAttemptHadError = useRef(false);
  const mainDocumentUrl = useRef(APP_URL);
  const shellStateRef = useRef(INITIAL_WEB_SHELL_STATE);
  const network = useNetworkState();
  const [shellState, setShellState] = useState(INITIAL_WEB_SHELL_STATE);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [storedRefreshToken, setStoredRefreshToken] = useState<
    string | null | undefined
  >(nativePlatform ? undefined : null);
  const bootstrap = useMemo(
    () => (nativePlatform ? nativeBootstrap(nativePlatform) : undefined),
    [nativePlatform],
  );

  const dispatchShellEvent = useCallback((event: WebShellEvent) => {
    const next = reduceWebShellState(shellStateRef.current, event);
    shellStateRef.current = next;
    setShellState(next);
  }, []);

  useEffect(() => {
    let active = true;

    if (!nativePlatform)
      return () => {
        active = false;
      };

    void SecureStore.getItemAsync(REFRESH_TOKEN_KEY)
      .then((token) => {
        if (active) setStoredRefreshToken(token);
      })
      .catch(() => {
        if (active) setStoredRefreshToken(null);
      });

    return () => {
      active = false;
    };
  }, [nativePlatform]);

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!shouldHandleWebViewBack(canGoBackRef.current)) return false;
      webViewRef.current?.goBack();
      return true;
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const online = !(
      network.isConnected === false || network.isInternetReachable === false
    );
    const retry = shouldRetryInitialLoad(shellStateRef.current, online);

    dispatchShellEvent({ type: "network-changed", online });
    if (retry) {
      dispatchShellEvent({ type: "retry-started" });
      initialAttemptHadError.current = false;
      webViewRef.current?.reload();
    }
  }, [dispatchShellEvent, network.isConnected, network.isInternetReachable]);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    setTimeout(
      () => setNotice((current) => (current === message ? null : current)),
      3200,
    );
  }, []);

  const saveMedia = useCallback(
    async (url: string, suppliedFilename?: string) => {
      if (Platform.OS !== "android") return;

      try {
        // Expo Go on Android does not bundle the full media-library native module.
        // Loading it only when saving keeps the rest of the app usable in Expo Go.
        const MediaLibrary = await import("expo-media-library/legacy");
        const permission = await MediaLibrary.requestPermissionsAsync(true);
        if (permission.status !== "granted") {
          showNotice("اجازهٔ ذخیره‌سازی در گالری داده نشد.");
          return;
        }

        const destination = new File(
          Paths.cache,
          filenameFor(url, suppliedFilename),
        );
        const file = destination.exists
          ? destination
          : await File.downloadFileAsync(url, destination);
        await MediaLibrary.createAssetAsync(file.uri);
        showNotice("رسانه در گالری ذخیره شد.");
      } catch {
        showNotice("ذخیره‌سازی رسانه ممکن نشد. دوباره تلاش کنید.");
      }
    },
    [showNotice],
  );

  const handleMessage = useCallback(
    async (event: WebViewMessageEvent) => {
      const action = parseNativeBridgeMessage(event.nativeEvent.data);
      if (!action) return;

      switch (action.type) {
        case "save-media":
          await saveMedia(action.url, action.filename);
          break;
        case "share":
          await Share.share({ message: action.url, title: action.title });
          break;
        case "copy-link":
          await Clipboard.setStringAsync(action.url);
          showNotice("پیوند کپی شد.");
          break;
        case "open-browser":
          await Linking.openURL(action.url);
          break;
        case "persist-refresh":
          await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, action.token);
          restoreAttemptedToken.current = null;
          setStoredRefreshToken(action.token);
          break;
        case "clear-refresh":
          await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
          restoreAttemptedToken.current = null;
          setStoredRefreshToken(null);
          break;
      }
    },
    [saveMedia, showNotice],
  );

  const handleLoadEnd = useCallback(
    (event: { nativeEvent: { url: string } }) => {
      setLoading(false);

      if (
        !nativePlatform ||
        !storedRefreshToken ||
        restoreAttemptedToken.current === storedRefreshToken ||
        !event.nativeEvent.url.startsWith(`${APP_URL}/auth`)
      )
        return;

      restoreAttemptedToken.current = storedRefreshToken;
      webViewRef.current?.injectJavaScript(`
      window.dispatchEvent(new CustomEvent('naghshman:restore-session', {
        detail: ${JSON.stringify(storedRefreshToken)}
      }));
      true;
    `);
    },
    [nativePlatform, storedRefreshToken],
  );

  const handleLoadStart = useCallback(
    (event: { nativeEvent: { url: string } }) => {
      mainDocumentUrl.current = event.nativeEvent.url;
      initialAttemptHadError.current = false;
      if (shellStateRef.current.initialReady) setLoading(true);
    },
    [],
  );

  const handleLoad = useCallback((event: { nativeEvent: { url: string } }) => {
    if (
      !initialAttemptHadError.current &&
      isInitialWebDocument(event.nativeEvent.url)
    ) {
      dispatchShellEvent({ type: "load-succeeded" });
      if (!hasHiddenNativeSplashRef.current) {
        hasHiddenNativeSplashRef.current = true;
        void SplashScreen.hideAsync().catch(() => {
          // The custom overlay remains visible until this first successful load.
        });
      }
    }
  }, [dispatchShellEvent]);

  const handleInitialError = useCallback(() => {
    initialAttemptHadError.current = true;
    dispatchShellEvent({ type: "load-failed" });
  }, [dispatchShellEvent]);

  const shouldStartLoad = useCallback((request: WebViewNavigation) => {
    if (request.url === "about:blank" || isAllowedWebUrl(request.url))
      return true;
    void Linking.openURL(request.url);
    return false;
  }, []);

  const webView = (
    <WebView
      ref={webViewRef}
      source={{ uri: APP_URL }}
      injectedJavaScriptBeforeContentLoaded={bootstrap}
      injectedJavaScript={bootstrap}
      javaScriptEnabled
      domStorageEnabled
      sharedCookiesEnabled
      thirdPartyCookiesEnabled
      cacheEnabled
      pullToRefreshEnabled={Platform.OS === "android"}
      originWhitelist={["https://*"]}
      onMessage={(event) => void handleMessage(event)}
      onShouldStartLoadWithRequest={shouldStartLoad}
      onNavigationStateChange={(navigation) => {
        canGoBackRef.current = navigation.canGoBack;
      }}
      onLoadStart={handleLoadStart}
      onLoad={handleLoad}
      onLoadEnd={handleLoadEnd}
      onError={handleInitialError}
      onHttpError={(event) => {
        if (
          event.nativeEvent.statusCode >= 500 &&
          event.nativeEvent.url === mainDocumentUrl.current
        ) {
          handleInitialError();
        }
      }}
      style={styles.webView}
    />
  );

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
        <View style={styles.webFrame}>
          {webView}
          {loading && shellState.initialReady ? (
            <View pointerEvents="none" style={styles.loadingLine} />
          ) : null}
          {notice ? (
            <View style={styles.notice}>
              <Text style={styles.noticeText}>{notice}</Text>
            </View>
          ) : null}
        </View>
      </SafeAreaView>
      <LaunchSplash
        visible={isLaunchSplashVisible(shellState.initialReady)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#dc2626" },
  safeArea: { flex: 1, backgroundColor: "#dc2626" },
  webFrame: { flex: 1, backgroundColor: "#ffffff" },
  webView: { flex: 1, backgroundColor: "#ffffff" },
  loadingLine: {
    position: "absolute",
    top: 0,
    right: 0,
    left: 0,
    height: 3,
    backgroundColor: "#dc2626",
  },
  notice: {
    position: "absolute",
    bottom: 34,
    left: 20,
    right: 20,
    backgroundColor: "#1d2825",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  noticeText: {
    color: "#ffffff",
    fontFamily: "Yekan",
    fontSize: 14,
    textAlign: "center",
  },
});
