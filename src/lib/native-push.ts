const EXPO_PUSH_TOKEN = /^(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{1,512}\]$/;

export function isExpoPushToken(value: unknown): value is string {
  return typeof value === "string" && EXPO_PUSH_TOKEN.test(value);
}

export function supportsNativePushNotifications(
  platform: "android" | "ios" | null,
  executionEnvironment: string | null | undefined,
): boolean {
  return platform !== null && !(
    platform === "android" && executionEnvironment === "storeClient"
  );
}

/**
 * Notification payloads are untrusted input. Keep navigation inside the
 * Naghshman WebView even when a third-party push provider delivers the tap.
 */
export function nativeNotificationRoute(
  data: Record<string, unknown>,
  appUrl: string,
): string | null {
  const value = typeof data.url === "string"
    ? data.url
    : typeof data.deep_link === "string"
      ? data.deep_link
      : null;
  if (!value) return null;

  try {
    const app = new URL(appUrl);
    const target = new URL(value, app);
    if (target.origin !== app.origin) return null;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return null;
  }
}
