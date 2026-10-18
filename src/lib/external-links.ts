/**
 * Links the page may hand to another app: maps for directions, the dialer,
 * mail and SMS. They pass the WebView's origin whitelist so the shell opens
 * them itself; otherwise react-native-webview asks Linking.canOpenURL first,
 * which Android 11+ answers "no" for apps the manifest does not declare.
 */
export const EXTERNAL_APP_SCHEMES = ['geo', 'tel', 'mailto', 'sms'] as const;

export const EXTERNAL_APP_WHITELIST = EXTERNAL_APP_SCHEMES.map((scheme) => `${scheme}:*`);

export function isExternalAppUrl(url: string): boolean {
  const scheme = /^([a-z][a-z0-9+.-]*):/iu.exec(url)?.[1]?.toLowerCase();
  return Boolean(scheme && (EXTERNAL_APP_SCHEMES as readonly string[]).includes(scheme));
}

/**
 * A web page that does the same job when no app answers the link, e.g. Google
 * Maps for a `geo:` destination on a phone without a map app. Null otherwise.
 */
export function webFallbackFor(url: string): string | null {
  if (!/^geo:/iu.test(url)) return null;
  const body = url.slice(4);
  const [point = '', query = ''] = body.split('?');
  const q = new URLSearchParams(query).get('q')?.trim() ?? '';
  // `geo:lat,lng?q=lat,lng(Label)`: the coordinates are the destination.
  const coordinates = /^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/u.exec(q) ?? /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/u.exec(point);
  const destination =
    coordinates && !(Number(coordinates[1]) === 0 && Number(coordinates[2]) === 0)
      ? `${coordinates[1]},${coordinates[2]}`
      : q;
  if (!destination) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}
