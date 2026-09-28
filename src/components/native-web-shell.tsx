import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";
import { File, Paths } from "expo-file-system";
import { NavigationBar } from "expo-navigation-bar";
import { useNetworkState } from "expo-network";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BackHandler,
  Linking,
  Platform,
  Share,
  StatusBar,
  StyleSheet,
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
import { isAllowedWebUrl, parseNativeBridgeMessage } from "@/lib/native-bridge";
import {
  isExpoPushToken,
  nativeNotificationRoute,
  supportsNativePushNotifications,
} from "@/lib/native-push";
import {
  isCurrentDocumentReady,
  webDocumentReadyScript,
} from "@/lib/web-document-ready";
import {
  INITIAL_WEB_SHELL_STATE,
  reduceWebShellState,
  shouldRetryFailedLoad,
  type WebShellEvent,
} from "@/lib/web-shell-state";
import { shouldHandleWebViewBack } from "@/lib/webview-back-navigation";
import * as SplashScreen from "expo-splash-screen";

const APP_URL = "https://naghshman.ir";
const REFRESH_TOKEN_KEY = "naghshman.refresh-token";
const BRAND_BACKGROUND = "#dc2626";
const LAUNCH_BACKGROUND = "#c03636";

type NotificationsModule = typeof import("expo-notifications");

function configureNotificationHandler(Notifications: NotificationsModule) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

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
        // Keep a valid device credential during upstream outages.
        // Only a definite authentication failure revokes the local session.
        if (response.status === 401 || response.status === 403) {
          post({ type: 'clear-refresh' });
        }
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
        var theme = root.classList.contains('dark') || root.classList.contains('black') || window.getComputedStyle(root).colorScheme === 'dark' ? 'dark' : 'light';
        var backgroundKey = theme + ':' + background;
        if (/^#[0-9a-f]{6}$/i.test(background) && backgroundKey !== lastBackground) {
          lastBackground = backgroundKey;
          if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              source: 'naghshman-web',
              version: 1,
              type: 'set-safe-area-background',
              color: background,
              theme: theme
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
        // SafeAreaView already excludes the system navigation area from the
        // WebView. Keep the site's ordinary padding without adding that inset again.
        guestStyle.textContent = '#bottomNavBar { padding-bottom: .5rem !important; } [data-naghshman-native-guest="true"] #bottomNavBar { display: none !important; }';
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
  const canUseNativePush = supportsNativePushNotifications(
    nativePlatform,
    Constants.executionEnvironment,
  );
  const webViewRef = useRef<WebView>(null);
  const canGoBackRef = useRef(false);
  const hasHiddenNativeSplashRef = useRef(false);
  const restoreAttemptedToken = useRef<string | null>(null);
  // Synchronous guard avoids rejecting the first navigation before React
  // commits the state change following SecureStore persistence.
  const nativeAuthenticatedRef = useRef(!nativePlatform);
  const pendingNotificationRoute = useRef<string | null>(null);
  const webViewDocumentReady = useRef(false);
  const initialAttemptHadError = useRef(false);
  const completedDocumentUrl = useRef<string | null>(null);
  const loadAttempt = useRef(0);
  const mainDocumentUrl = useRef(APP_URL);
  const retryDelayMs = useRef(4000);
  const webViewProcessDead = useRef(false);
  const shellStateRef = useRef(INITIAL_WEB_SHELL_STATE);
  const network = useNetworkState();
  const [shellState, setShellState] = useState(INITIAL_WEB_SHELL_STATE);
  const [loading, setLoading] = useState(false);
  const [webViewGeneration, setWebViewGeneration] = useState(0);
  const [splashOverlayMounted, setSplashOverlayMounted] = useState(true);
  const [nativeSplashReleased, setNativeSplashReleased] = useState(false);
  const [safeAreaBackground, setSafeAreaBackground] =
    useState(LAUNCH_BACKGROUND);
  const [notice, setNotice] = useState<string | null>(null);
  const [storedRefreshToken, setStoredRefreshToken] = useState<
    string | null | undefined
  >(nativePlatform ? undefined : null);
  const [nativePushToken, setNativePushToken] = useState<string | null>(null);
  const nativeAuthStateResolved =
    !nativePlatform || storedRefreshToken !== undefined;
  const nativeAuthenticated = !nativePlatform || Boolean(storedRefreshToken);
  // WebView's source is set once when the initial credential is loaded.
  // Updating storedRefreshToken after OTP must not navigate or remount it.
  const [initialWebUrl, setInitialWebUrl] = useState<string | null>(
    nativePlatform ? null : APP_URL,
  );
  const bootstrap = useMemo(
    () =>
      nativePlatform
        ? nativeBootstrap(nativePlatform, nativeAuthenticated)
        : undefined,
    [nativeAuthenticated, nativePlatform],
  );

  // The platform splash is only a bridge until React Native can draw the
  // identical branded artwork and animated dots. Never wait for the network.
  const hideNativeSplash = useCallback(() => {
    if (hasHiddenNativeSplashRef.current) return;
    hasHiddenNativeSplashRef.current = true;
    void SplashScreen.hideAsync()
      .catch(() => {
        // Some preview runtimes have no native splash to hide.
        hasHiddenNativeSplashRef.current = false;
      })
      .finally(() => {
        // Do not let the custom splash fade beneath the OS splash while
        // the native handoff is still pending.
        setNativeSplashReleased(true);
      });
  }, []);

  const handleSplashHidden = useCallback(() => {
    setSplashOverlayMounted(false);
  }, []);

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
        if (active) {
          nativeAuthenticatedRef.current = Boolean(token);
          setInitialWebUrl(
            (current) => current ?? initialNativeWebUrl(APP_URL, token),
          );
          setStoredRefreshToken(token);
        }
      })
      .catch(() => {
        if (active) {
          nativeAuthenticatedRef.current = false;
          setInitialWebUrl(
            (current) => current ?? initialNativeWebUrl(APP_URL, null),
          );
          setStoredRefreshToken(null);
        }
      });

    return () => {
      active = false;
    };
  }, [nativePlatform]);

  const openNativeNotification = useCallback(
    (data: Record<string, unknown>) => {
      const route = nativeNotificationRoute(data, APP_URL);
      if (!route) return;
      pendingNotificationRoute.current = route;
      if (webViewDocumentReady.current) {
        pendingNotificationRoute.current = null;
        webViewRef.current?.injectJavaScript(
          `window.location.assign(${JSON.stringify(route)}); true;`,
        );
      }
    },
    [],
  );

  useEffect(() => {
    if (!canUseNativePush) return;
    let active = true;
    let subscription: { remove(): void } | undefined;

    void import("expo-notifications")
      .then((Notifications) => {
        if (!active) return;
        configureNotificationHandler(Notifications);
        const lastResponse = Notifications.getLastNotificationResponse();
        if (lastResponse) {
          openNativeNotification(
            lastResponse.notification.request.content.data ?? {},
          );
          Notifications.clearLastNotificationResponse();
        }
        subscription = Notifications.addNotificationResponseReceivedListener(
          (response) => {
            openNativeNotification(
              response.notification.request.content.data ?? {},
            );
            Notifications.clearLastNotificationResponse();
          },
        );
      })
      .catch(() => {
        // Push support is unavailable in an unsupported native runtime.
      });
    return () => {
      active = false;
      subscription?.remove();
    };
  }, [canUseNativePush, openNativeNotification]);

  useEffect(() => {
    if (!canUseNativePush || !nativeAuthenticated) return;
    let active = true;

    void (async () => {
      const Notifications = await import("expo-notifications");
      configureNotificationHandler(Notifications);
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "اعلان‌های نقش من",
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 150, 250],
          lightColor: BRAND_BACKGROUND,
        });
      }
      const existing = await Notifications.getPermissionsAsync();
      const permission =
        existing.status === "granted"
          ? existing
          : await Notifications.requestPermissionsAsync();
      if (permission.status !== "granted") return;

      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ??
        Constants.easConfig?.projectId;
      if (!projectId) return;
      const token = (await Notifications.getExpoPushTokenAsync({ projectId }))
        .data;
      if (active && isExpoPushToken(token)) setNativePushToken(token);
    })().catch(() => {
      // A later app launch retries transient network and provider failures.
    });

    return () => {
      active = false;
    };
  }, [canUseNativePush, nativeAuthenticated]);

  useEffect(() => {
    if (!canUseNativePush) return;
    let active = true;
    let subscription: { remove(): void } | undefined;

    void import("expo-notifications")
      .then((Notifications) => {
        if (!active) return;
        subscription = Notifications.addPushTokenListener((token) => {
          if (isExpoPushToken(token.data)) setNativePushToken(token.data);
        });
      })
      .catch(() => {
        // Push support is unavailable in an unsupported native runtime.
      });
    return () => {
      active = false;
      subscription?.remove();
    };
  }, [canUseNativePush]);

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

  const retryFailedPage = useCallback(() => {
    // A manual retry is also allowed if the OS has detected an offline first
    // launch before WebView has emitted its failure event.
    if (
      !shellStateRef.current.documentFailed &&
      shellStateRef.current.initialReady
    )
      return;

    dispatchShellEvent({ type: "retry-started" });
    loadAttempt.current += 1;
    initialAttemptHadError.current = false;
    completedDocumentUrl.current = null;
    setLoading(true);

    if (webViewProcessDead.current) {
      webViewProcessDead.current = false;
      setWebViewGeneration((generation) => generation + 1);
    } else {
      webViewRef.current?.reload();
    }
  }, [dispatchShellEvent]);

  useEffect(() => {
    const online = !(
      network.isConnected === false || network.isInternetReachable === false
    );
    const retry = shouldRetryFailedLoad(shellStateRef.current, online);

    dispatchShellEvent({ type: "network-changed", online });
    if (retry) retryFailedPage();
  }, [
    dispatchShellEvent,
    network.isConnected,
    network.isInternetReachable,
    retryFailedPage,
  ]);

  // A server can recover without the OS reporting any connectivity change.
  // Retry online failures with capped backoff, while leaving healthy pages alone.
  useEffect(() => {
    if (!shellState.documentFailed || !shellState.online) return;

    const delay = retryDelayMs.current;
    retryDelayMs.current = Math.min(delay * 2, 30000);
    const timer = setTimeout(retryFailedPage, delay);
    return () => clearTimeout(timer);
  }, [retryFailedPage, shellState.documentFailed, shellState.online]);

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
            color: background,
            theme: root.classList.contains('dark') || root.classList.contains('black') || window.getComputedStyle(root).colorScheme === 'dark' ? 'dark' : 'light'
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
      try {
        const message: unknown = JSON.parse(event.nativeEvent.data);
        if (
          isCurrentDocumentReady(
            message,
            loadAttempt.current,
            completedDocumentUrl.current,
            initialAttemptHadError.current,
          )
        ) {
          setLoading(false);
          dispatchShellEvent({ type: "load-succeeded" });
          retryDelayMs.current = 4000;
          return;
        }
      } catch {
        return;
      }
      const action = parseNativeBridgeMessage(event.nativeEvent.data);
      if (!action) return;

      switch (action.type) {
        case "set-safe-area-background":
          setSafeAreaBackground(
            action.theme === "light" ? "#ffffff" : action.color,
          );
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
          try {
            await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, action.token);
            restoreAttemptedToken.current = null;
            nativeAuthenticatedRef.current = true;
            setStoredRefreshToken(action.token);
            // This event doubles as the web login's persistence acknowledgement.
            setNativeAuthentication(true);
          } catch {
            showNotice("ذخیره‌سازی ورود در گوشی انجام نشد. دوباره تلاش کنید.");
            webViewRef.current?.injectJavaScript(
              "window.dispatchEvent(new Event('naghshman:native-auth-error')); true;",
            );
          }
          break;
        case "clear-refresh":
          await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
          restoreAttemptedToken.current = null;
          nativeAuthenticatedRef.current = false;
          setStoredRefreshToken(null);
          setNativeAuthentication(false);
          break;
      }
    },
    [dispatchShellEvent, saveMedia, setNativeAuthentication, showNotice],
  );

  const handleLoadEnd = useCallback(
    (event: { nativeEvent: { url: string } }) => {
      // onLoadEnd fires for failures too. Do not expose WebView's native
      // "Error loading page" screen or run session restoration on a failed load.
      if (
        initialAttemptHadError.current ||
        completedDocumentUrl.current !== event.nativeEvent.url
      )
        return;

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

      webViewRef.current?.injectJavaScript(
        webDocumentReadyScript(loadAttempt.current),
      );

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
    [
      nativePlatform,
      storedRefreshToken,
      syncNativePushToken,
      syncSafeAreaBackground,
    ],
  );

  const handleLoadStart = useCallback(
    (event: { nativeEvent: { url: string } }) => {
      if (!isInitialWebDocument(event.nativeEvent.url)) return;
      mainDocumentUrl.current = event.nativeEvent.url;
      loadAttempt.current += 1;
      setLoading(true);
      webViewDocumentReady.current = false;
      completedDocumentUrl.current = null;
      initialAttemptHadError.current = false;
    },
    [],
  );

  const handleLoad = useCallback((event: { nativeEvent: { url: string } }) => {
    if (
      !initialAttemptHadError.current &&
      event.nativeEvent.url === mainDocumentUrl.current &&
      isInitialWebDocument(event.nativeEvent.url)
    ) {
      completedDocumentUrl.current = event.nativeEvent.url;
      // Only the full artwork's layout + image load can release the OS splash.
    }
  }, []);

  const handlePageFailure = useCallback(() => {
    loadAttempt.current += 1;
    initialAttemptHadError.current = true;
    completedDocumentUrl.current = null;
    webViewDocumentReady.current = false;
    setLoading(false);
    dispatchShellEvent({ type: "load-failed" });
  }, [dispatchShellEvent]);

  // A stalled load or renderer must recover without ever revealing partial content.
  useEffect(() => {
    if (
      !initialWebUrl ||
      shellState.documentFailed ||
      (!loading && shellState.initialReady)
    )
      return;
    const timer = setTimeout(() => {
      handlePageFailure();
      webViewRef.current?.stopLoading();
    }, 45000);
    return () => clearTimeout(timer);
  }, [
    handlePageFailure,
    initialWebUrl,
    loading,
    shellState.documentFailed,
    shellState.initialReady,
    webViewGeneration,
  ]);

  const handleWebViewError = useCallback(
    (event: { nativeEvent: { url?: string }; preventDefault: () => void }) => {
      const failedUrl = event.nativeEvent.url;
      // Cancellation of an earlier redirected navigation is not a failure of
      // the new top-level document (and must not replace its loading screen).
      if (failedUrl && failedUrl !== mainDocumentUrl.current) {
        event.preventDefault();
        return;
      }
      handlePageFailure();
    },
    [handlePageFailure],
  );

  const shouldStartLoad = useCallback(
    (request: WebViewNavigation) => {
      if (request.url === "about:blank") return true;
      if (!isAllowedWebUrl(request.url)) {
        void Linking.openURL(request.url);
        return false;
      }
      if (
        nativePlatform &&
        !nativeAuthenticatedRef.current &&
        !shouldAllowNativeGuestNavigation(request.url, APP_URL)
      ) {
        webViewRef.current?.injectJavaScript(
          "window.location.replace('/auth'); true;",
        );
        return false;
      }
      if (isAllowedWebUrl(request.url)) return true;
      return false;
    },
    [nativePlatform],
  );

  const launchSplashVisible = isLaunchSplashVisible(
    shellState.initialReady,
    nativeSplashReleased,
  );
  const displayedStatusBarBackground = splashOverlayMounted
    ? LAUNCH_BACKGROUND
    : safeAreaBackground;

  const webView =
    nativeAuthStateResolved && initialWebUrl ? (
      <WebView
        key={webViewGeneration}
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
        pullToRefreshEnabled={false}
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
        renderLoading={() => <View style={styles.webViewErrorFallback} />}
        originWhitelist={["https://*"]}
        onMessage={(event) => void handleMessage(event)}
        onShouldStartLoadWithRequest={shouldStartLoad}
        onNavigationStateChange={(navigation) => {
          canGoBackRef.current = navigation.canGoBack;
        }}
        onLoadStart={handleLoadStart}
        onLoad={handleLoad}
        onLoadEnd={handleLoadEnd}
        onError={handleWebViewError}
        // Replace react-native-webview's white diagnostic error screen.
        // The initial launch overlay covers errors before the first ready page.
        renderError={() => <View style={styles.webViewErrorFallback} />}
        onHttpError={(event) => {
          if (
            event.nativeEvent.statusCode >= 400 &&
            event.nativeEvent.url === mainDocumentUrl.current
          ) {
            handlePageFailure();
          }
        }}
        onRenderProcessGone={() => {
          webViewProcessDead.current = true;
          handlePageFailure();
        }}
        onContentProcessDidTerminate={() => {
          webViewProcessDead.current = true;
          handlePageFailure();
        }}
        style={styles.webView}
      />
    ) : null;

  return (
    <View style={[styles.container, { backgroundColor: safeAreaBackground }]}>
      <StatusBar
        hidden={splashOverlayMounted}
        backgroundColor={displayedStatusBarBackground}
        barStyle={
          splashOverlayMounted
            ? "light-content"
            : statusBarStyleFor(safeAreaBackground)
        }
      />
      {Platform.OS === "android" && (
        <NavigationBar hidden={splashOverlayMounted} />
      )}
      <SafeAreaView
        edges={["top", "bottom"]}
        style={[styles.safeArea, { backgroundColor: safeAreaBackground }]}
      >
        <View style={styles.webFrame}>{webView}</View>
      </SafeAreaView>
      <LaunchSplash
        visible={launchSplashVisible}
        onReady={hideNativeSplash}
        onHidden={handleSplashHidden}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  webFrame: { flex: 1, backgroundColor: "#ffffff" },
  webView: { flex: 1, backgroundColor: "#ffffff" },
  webViewErrorFallback: { flex: 1, backgroundColor: LAUNCH_BACKGROUND },
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
