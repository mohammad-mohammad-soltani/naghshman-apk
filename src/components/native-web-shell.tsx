import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";
import { File, Paths } from "expo-file-system";
import { useNetworkState } from "expo-network";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BackHandler,
  Linking,
  Platform,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  WebView,
  type WebViewMessageEvent,
  type WebViewNavigation,
} from "react-native-webview";

import { LaunchSplash } from "@/components/launch-splash";
import { isInitialWebDocument } from "@/lib/initial-web-document";
import { isLaunchSplashVisible } from "@/lib/launch-splash-visibility";
import {
  initialNativeWebUrl,
  shouldAllowNativeGuestNavigation,
} from "@/lib/native-auth-gate";
import {
  isExpoPushToken,
  nativeNotificationRoute,
} from "@/lib/native-push";
import { isAllowedWebUrl, parseNativeBridgeMessage } from "@/lib/native-bridge";
import {
  INITIAL_WEB_SHELL_STATE,
  reduceWebShellState,
  shouldRetryInitialLoad,
  type WebShellEvent,
} from "@/lib/web-shell-state";
import { shouldHandleWebViewBack } from "@/lib/webview-back-navigation";
import * as SplashScreen from "expo-splash-screen";

const APP_URL = "https://naghshman.ir";
const REFRESH_TOKEN_KEY = "naghshman.refresh-token";
const BRAND_BACKGROUND = "#dc2626";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function statusBarStyleFor(
  backgroundColor: string,
): "light-content" | "dark-content" {
  const red = Number.parseInt(backgroundColor.slice(1, 3), 16);
  const green = Number.parseInt(backgroundColor.slice(3, 5), 16);
  const blue = Number.parseInt(backgroundColor.slice(5, 7), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
  return luminance > 160 ? "dark-content" : "light-content";
}

function nativeBootstrap(
  platform: "android" | "ios",
  initiallyAuthenticated: boolean,
) {
  return `
  (function () {
    var nativeAlreadyInitialized = Boolean(window.NaghshmanNative);
    if (!nativeAlreadyInitialized) {
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
    window.addEventListener('naghshman:native-push-token', function (event) {
      var detail = event && event.detail;
      var token = detail && detail.token;
      var platform = detail && detail.platform;
      if (typeof token !== 'string' || !/^(?:ExponentPushToken|ExpoPushToken)\\[[A-Za-z0-9_-]{1,512}\\]$/.test(token)) return;
      if (platform !== 'android' && platform !== 'ios') return;
      originalFetch('/api/meydan/push/native-tokens', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: token, platform: platform })
      }).catch(function () {});
    });
    window.dispatchEvent(new Event('naghshman:native-ready'));
    }

    if (!window.__naghshmanBackgroundReporter) {
      window.__naghshmanBackgroundReporter = true;
      var lastBackground;
      var reportBackground = function () {
        var root = document.documentElement;
        if (!root) return;
        var background = window.getComputedStyle(root)
          .getPropertyValue('--background').trim();
        if (/^#[0-9a-f]{6}$/i.test(background) && background !== lastBackground) {
          lastBackground = background;
          if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              source: 'naghshman-web',
              version: 1,
              type: 'set-safe-area-background',
              color: background
            }));
          }
        }
      };
      var scheduleBackgroundReport = function () {
        if (typeof window.requestAnimationFrame === 'function') {
          window.requestAnimationFrame(reportBackground);
        } else {
          window.setTimeout(reportBackground, 0);
        }
      };
      var observeBackground = function () {
        var root = document.documentElement;
        if (!root) return;
        scheduleBackgroundReport();
        new MutationObserver(scheduleBackgroundReport).observe(root, {
          attributes: true,
          attributeFilter: ['class', 'style']
        });
      };
      if (document.documentElement) observeBackground();
      else document.addEventListener('DOMContentLoaded', observeBackground, { once: true });
    }

    if (!window.__naghshmanAuthGuard) {
      window.__naghshmanAuthGuard = true;
      window.__naghshmanNativeAuthenticated = ${initiallyAuthenticated};
      var authPath = function (value) {
        try {
          var url = new URL(value, window.location.origin);
          return url.origin === window.location.origin &&
            (url.pathname === '/auth' || url.pathname.indexOf('/auth/') === 0);
        } catch (error) {
          return false;
        }
      };
      var syncGuestNavigation = function () {
        var root = document.documentElement;
        if (root) root.dataset.naghshmanNativeGuest = window.__naghshmanNativeAuthenticated ? 'false' : 'true';
        if (!window.__naghshmanNativeAuthenticated && !authPath(window.location.href)) {
          window.location.replace('/auth');
        }
      };
      var guardNavigation = function (event) {
        if (window.__naghshmanNativeAuthenticated) return;
        var link = event.target && event.target.closest ? event.target.closest('a[href]') : null;
        if (!link || authPath(link.href)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        syncGuestNavigation();
      };
      document.addEventListener('click', guardNavigation, true);
      ['pushState', 'replaceState'].forEach(function (method) {
        var original = window.history[method];
        window.history[method] = function () {
          var result = original.apply(this, arguments);
          window.setTimeout(syncGuestNavigation, 0);
          return result;
        };
      });
      window.addEventListener('popstate', syncGuestNavigation);
      window.addEventListener('naghshman:native-auth-state', function (event) {
        window.__naghshmanNativeAuthenticated = Boolean(event && event.detail && event.detail.authenticated);
        syncGuestNavigation();
      });
      var installGuestChrome = function () {
        var root = document.documentElement;
        if (!root) return;
        var guestStyle = document.createElement('style');
        guestStyle.textContent = '[data-naghshman-native-guest="true"] #bottomNavBar { display: none !important; }';
        (document.head || root).appendChild(guestStyle);
        syncGuestNavigation();
      };
      if (document.documentElement) installGuestChrome();
      else document.addEventListener('DOMContentLoaded', installGuestChrome, { once: true });
    }
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
  const pendingNotificationRoute = useRef<string | null>(null);
  const webViewDocumentReady = useRef(false);
  const initialAttemptHadError = useRef(false);
  const mainDocumentUrl = useRef(APP_URL);
  const shellStateRef = useRef(INITIAL_WEB_SHELL_STATE);
  const network = useNetworkState();
  const [shellState, setShellState] = useState(INITIAL_WEB_SHELL_STATE);
  const [loading, setLoading] = useState(false);
  const [safeAreaBackground, setSafeAreaBackground] = useState(BRAND_BACKGROUND);
  const [notice, setNotice] = useState<string | null>(null);
  const [storedRefreshToken, setStoredRefreshToken] = useState<
    string | null | undefined
  >(nativePlatform ? undefined : null);
  const [nativePushToken, setNativePushToken] = useState<string | null>(null);
  const nativeAuthStateResolved = !nativePlatform || storedRefreshToken !== undefined;
  const nativeAuthenticated = !nativePlatform || Boolean(storedRefreshToken);
  const initialWebUrl = nativeAuthStateResolved
    ? nativePlatform
      ? initialNativeWebUrl(APP_URL, storedRefreshToken ?? null)
      : APP_URL
    : null;
  const bootstrap = useMemo(
    () =>
      nativePlatform
        ? nativeBootstrap(nativePlatform, nativeAuthenticated)
        : undefined,
    [nativeAuthenticated, nativePlatform],
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

  const openNativeNotification = useCallback((data: Record<string, unknown>) => {
    const route = nativeNotificationRoute(data, APP_URL);
    if (!route) return;
    pendingNotificationRoute.current = route;
    if (webViewDocumentReady.current) {
      pendingNotificationRoute.current = null;
      webViewRef.current?.injectJavaScript(
        `window.location.assign(${JSON.stringify(route)}); true;`,
      );
    }
  }, []);

  useEffect(() => {
    if (!nativePlatform) return;

    const lastResponse = Notifications.getLastNotificationResponse();
    if (lastResponse) {
      openNativeNotification(lastResponse.notification.request.content.data ?? {});
    }
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => openNativeNotification(response.notification.request.content.data ?? {}),
    );
    return () => subscription.remove();
  }, [nativePlatform, openNativeNotification]);

  useEffect(() => {
    if (!nativePlatform || !nativeAuthenticated) return;
    let active = true;

    void (async () => {
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "اعلان‌های نقش من",
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 150, 250],
          lightColor: BRAND_BACKGROUND,
        });
      }
      const existing = await Notifications.getPermissionsAsync();
      const permission = existing.status === "granted"
        ? existing
        : await Notifications.requestPermissionsAsync();
      if (permission.status !== "granted") return;

      const projectId = Constants.expoConfig?.extra?.eas?.projectId
        ?? Constants.easConfig?.projectId;
      if (!projectId) return;
      const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      if (active && isExpoPushToken(token)) setNativePushToken(token);
    })().catch(() => {
      // A later app launch retries transient network and provider failures.
    });

    return () => {
      active = false;
    };
  }, [nativeAuthenticated, nativePlatform]);

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (!shouldHandleWebViewBack(canGoBackRef.current)) return false;
        webViewRef.current?.goBack();
        return true;
      },
    );

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

  const syncSafeAreaBackground = useCallback(() => {
    webViewRef.current?.injectJavaScript(`
      (function () {
        var root = document.documentElement;
        if (!root || !window.ReactNativeWebView) return true;
        var background = window.getComputedStyle(root)
          .getPropertyValue('--background').trim();
        if (/^#[0-9a-f]{6}$/i.test(background)) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            source: 'naghshman-web',
            version: 1,
            type: 'set-safe-area-background',
            color: background
          }));
        }
        return true;
      })();
    `);
  }, []);

  const setNativeAuthentication = useCallback((authenticated: boolean) => {
    webViewRef.current?.injectJavaScript(`
      window.dispatchEvent(new CustomEvent('naghshman:native-auth-state', {
        detail: { authenticated: ${authenticated} }
      }));
      true;
    `);
  }, []);

  const syncNativePushToken = useCallback(() => {
    if (!nativePushToken || !nativePlatform) return;
    webViewRef.current?.injectJavaScript(`
      window.dispatchEvent(new CustomEvent('naghshman:native-push-token', {
        detail: ${JSON.stringify({ token: nativePushToken, platform: nativePlatform })}
      }));
      true;
    `);
  }, [nativePlatform, nativePushToken]);

  useEffect(() => {
    syncNativePushToken();
  }, [syncNativePushToken]);

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
        case "set-safe-area-background":
          setSafeAreaBackground(action.color);
          break;
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
          setNativeAuthentication(true);
          break;
        case "clear-refresh":
          await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
          restoreAttemptedToken.current = null;
          setStoredRefreshToken(null);
          setNativeAuthentication(false);
          break;
      }
    },
    [saveMedia, setNativeAuthentication, showNotice],
  );

  const handleLoadEnd = useCallback(
    (event: { nativeEvent: { url: string } }) => {
      setLoading(false);
      webViewDocumentReady.current = true;
      // The initial bootstrap can run before Next has applied its theme CSS.
      // Reading after document load makes the first safe-area color deterministic.
      syncSafeAreaBackground();
      syncNativePushToken();

      if (pendingNotificationRoute.current) {
        const route = pendingNotificationRoute.current;
        pendingNotificationRoute.current = null;
        webViewRef.current?.injectJavaScript(
          `window.location.assign(${JSON.stringify(route)}); true;`,
        );
        return;
      }

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
    [nativePlatform, storedRefreshToken, syncNativePushToken, syncSafeAreaBackground],
  );

  const handleLoadStart = useCallback(
    (event: { nativeEvent: { url: string } }) => {
      mainDocumentUrl.current = event.nativeEvent.url;
      webViewDocumentReady.current = false;
      initialAttemptHadError.current = false;
      if (shellStateRef.current.initialReady) setLoading(true);
    },
    [],
  );

  const handleLoad = useCallback(
    (event: { nativeEvent: { url: string } }) => {
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
    },
    [dispatchShellEvent],
  );

  const handleInitialError = useCallback(() => {
    initialAttemptHadError.current = true;
    dispatchShellEvent({ type: "load-failed" });
  }, [dispatchShellEvent]);

  const shouldStartLoad = useCallback((request: WebViewNavigation) => {
    if (request.url === "about:blank") return true;
    if (!isAllowedWebUrl(request.url)) {
      void Linking.openURL(request.url);
      return false;
    }
    if (
      nativePlatform &&
      !nativeAuthenticated &&
      !shouldAllowNativeGuestNavigation(request.url, APP_URL)
    ) {
      webViewRef.current?.injectJavaScript("window.location.replace('/auth'); true;");
      return false;
    }
    if (isAllowedWebUrl(request.url))
      return true;
    return false;
  }, [nativeAuthenticated, nativePlatform]);

  const webView = nativeAuthStateResolved && initialWebUrl ? (
    <WebView
      ref={webViewRef}
      source={{ uri: initialWebUrl }}
      applicationNameForUserAgent="NaghshmanNative/1"
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
  ) : null;

  return (
    <View style={[styles.container, { backgroundColor: safeAreaBackground }]}>
      <StatusBar
        backgroundColor={safeAreaBackground}
        barStyle={statusBarStyleFor(safeAreaBackground)}
      />
      <SafeAreaView
        edges={["top", "bottom"]}
        style={[styles.safeArea, { backgroundColor: safeAreaBackground }]}
      >
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
      <LaunchSplash visible={isLaunchSplashVisible(shellState.initialReady)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
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
