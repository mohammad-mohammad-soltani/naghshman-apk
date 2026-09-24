import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import { Asset, requestPermissionsAsync } from 'expo-media-library';
import { useNetworkState } from 'expo-network';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  WebView,
  type WebViewMessageEvent,
  type WebViewNavigation,
} from 'react-native-webview';

import {
  isAllowedWebUrl,
  parseNativeBridgeMessage,
} from '@/lib/native-bridge';

const APP_URL = 'https://naghshman.ir';
const REFRESH_TOKEN_KEY = 'naghshman.refresh-token';

function nativeBootstrap(platform: 'android' | 'ios') {
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
    const lastPathSegment = new URL(url).pathname.split('/').filter(Boolean).pop();
    return lastPathSegment && /\\.[a-z0-9]{2,8}$/iu.test(lastPathSegment)
      ? lastPathSegment
      : `naghshman-${Date.now()}.jpg`;
  } catch {
    return `naghshman-${Date.now()}.jpg`;
  }
}

export function NativeWebShell() {
  const nativePlatform = Platform.OS === 'android' || Platform.OS === 'ios' ? Platform.OS : null;
  const webViewRef = useRef<WebView>(null);
  const restoreAttemptedToken = useRef<string | null>(null);
  const network = useNetworkState();
  const [loadFailed, setLoadFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [storedRefreshToken, setStoredRefreshToken] = useState<string | null | undefined>(
    nativePlatform ? undefined : null,
  );
  const bootstrap = useMemo(
    () => nativePlatform ? nativeBootstrap(nativePlatform) : undefined,
    [nativePlatform],
  );

  useEffect(() => {
    let active = true;

    if (!nativePlatform) return () => { active = false; };

    void SecureStore.getItemAsync(REFRESH_TOKEN_KEY)
      .then((token) => {
        if (active) setStoredRefreshToken(token);
      })
      .catch(() => {
        if (active) setStoredRefreshToken(null);
      });

    return () => { active = false; };
  }, [nativePlatform]);

  const offline =
    network.isConnected === false ||
    network.isInternetReachable === false ||
    loadFailed;

  const reload = useCallback(() => {
    setLoadFailed(false);
    setLoading(true);
    webViewRef.current?.reload();
  }, []);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    setTimeout(() => setNotice((current) => (current === message ? null : current)), 3200);
  }, []);

  const saveMedia = useCallback(async (url: string, suppliedFilename?: string) => {
    if (Platform.OS !== 'android') return;

    try {
      const permission = await requestPermissionsAsync(true);
      if (permission.status !== 'granted') {
        showNotice('اجازهٔ ذخیره‌سازی در گالری داده نشد.');
        return;
      }

      const destination = new File(Paths.cache, filenameFor(url, suppliedFilename));
      const file = destination.exists ? destination : await File.downloadFileAsync(url, destination);
      await Asset.create(file.uri);
      showNotice('رسانه در گالری ذخیره شد.');
    } catch {
      showNotice('ذخیره‌سازی رسانه ممکن نشد. دوباره تلاش کنید.');
    }
  }, [showNotice]);

  const handleMessage = useCallback(async (event: WebViewMessageEvent) => {
    const action = parseNativeBridgeMessage(event.nativeEvent.data);
    if (!action) return;

    switch (action.type) {
      case 'save-media':
        await saveMedia(action.url, action.filename);
        break;
      case 'share':
        await Share.share({ message: action.url, title: action.title });
        break;
      case 'copy-link':
        await Clipboard.setStringAsync(action.url);
        showNotice('پیوند کپی شد.');
        break;
      case 'open-browser':
        await Linking.openURL(action.url);
        break;
      case 'persist-refresh':
        await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, action.token);
        restoreAttemptedToken.current = null;
        setStoredRefreshToken(action.token);
        break;
      case 'clear-refresh':
        await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
        restoreAttemptedToken.current = null;
        setStoredRefreshToken(null);
        break;
    }
  }, [saveMedia, showNotice]);

  const handleLoadEnd = useCallback((event: { nativeEvent: { url: string } }) => {
    setLoading(false);

    if (
      !nativePlatform ||
      !storedRefreshToken ||
      restoreAttemptedToken.current === storedRefreshToken ||
      !event.nativeEvent.url.startsWith(`${APP_URL}/auth`)
    ) return;

    restoreAttemptedToken.current = storedRefreshToken;
    webViewRef.current?.injectJavaScript(`
      window.dispatchEvent(new CustomEvent('naghshman:restore-session', {
        detail: ${JSON.stringify(storedRefreshToken)}
      }));
      true;
    `);
  }, [nativePlatform, storedRefreshToken]);

  const shouldStartLoad = useCallback((request: WebViewNavigation) => {
    if (request.url === 'about:blank' || isAllowedWebUrl(request.url)) return true;
    void Linking.openURL(request.url);
    return false;
  }, []);

  const webView = useMemo(() => (
    <WebView
      ref={webViewRef}
      source={{ uri: APP_URL }}
      applicationNameForUserAgent={nativePlatform ? ' NaghshmanNative/1' : undefined}
      injectedJavaScriptBeforeContentLoaded={bootstrap}
      injectedJavaScript={bootstrap}
      javaScriptEnabled
      domStorageEnabled
      sharedCookiesEnabled
      thirdPartyCookiesEnabled
      cacheEnabled
      pullToRefreshEnabled={Platform.OS === 'android'}
      startInLoadingState
      originWhitelist={['https://*']}
      onMessage={(event) => void handleMessage(event)}
      onShouldStartLoadWithRequest={shouldStartLoad}
      onLoadStart={() => setLoading(true)}
      onLoadEnd={handleLoadEnd}
      onError={() => setLoadFailed(true)}
      onHttpError={(event) => {
        if (event.nativeEvent.statusCode >= 500) setLoadFailed(true);
      }}
      renderLoading={() => <LoadingScreen />}
      style={styles.webView}
    />
  ), [bootstrap, handleLoadEnd, handleMessage, nativePlatform, shouldStartLoad]);

  if (offline) {
    return <OfflineScreen onRetry={reload} />;
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      {webView}
      {loading ? <View pointerEvents="none" style={styles.loadingLine} /> : null}
      {notice ? <View style={styles.notice}><Text style={styles.noticeText}>{notice}</Text></View> : null}
    </View>
  );
}

function LoadingScreen() {
  return (
    <View style={styles.loadingScreen}>
      <ActivityIndicator color="#126c5a" size="large" />
    </View>
  );
}

function OfflineScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.offlineContainer}>
      <StatusBar style="dark" />
      <View style={styles.offlineIcon}><Text style={styles.offlineIconText}>⌁</Text></View>
      <Text style={styles.offlineEyebrow}>نقش من</Text>
      <Text style={styles.offlineTitle}>به اینترنت متصل نیستید</Text>
      <Text style={styles.offlineBody}>
        شما نمی‌توانید به‌صورت آفلاین وارد این سایت شوید. پس از اتصال به اینترنت دوباره تلاش کنید.
      </Text>
      <Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}>
        <Text style={styles.retryText}>تلاش دوباره</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fbfaf7' },
  webView: { flex: 1, backgroundColor: '#fbfaf7' },
  loadingLine: { position: 'absolute', top: 0, right: 0, left: 0, height: 3, backgroundColor: '#126c5a' },
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fbfaf7' },
  offlineContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f7f5ee', paddingHorizontal: 32 },
  offlineIcon: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: '#dcebe5', marginBottom: 24 },
  offlineIconText: { color: '#126c5a', fontSize: 42, lineHeight: 48, fontFamily: 'Yekan' },
  offlineEyebrow: { color: '#126c5a', fontSize: 15, fontFamily: 'Yekan', marginBottom: 10 },
  offlineTitle: { color: '#1d2825', fontSize: 24, lineHeight: 38, fontFamily: 'Yekan', textAlign: 'center' },
  offlineBody: { color: '#64716c', fontSize: 16, lineHeight: 30, fontFamily: 'Yekan', textAlign: 'center', marginTop: 14, maxWidth: 330 },
  retryButton: { backgroundColor: '#126c5a', borderRadius: 16, minHeight: 52, justifyContent: 'center', paddingHorizontal: 28, marginTop: 28 },
  retryButtonPressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
  retryText: { color: '#ffffff', fontFamily: 'Yekan', fontSize: 16, textAlign: 'center' },
  notice: { position: 'absolute', bottom: 34, left: 20, right: 20, backgroundColor: '#1d2825', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12 },
  noticeText: { color: '#ffffff', fontFamily: 'Yekan', fontSize: 14, textAlign: 'center' },
});
