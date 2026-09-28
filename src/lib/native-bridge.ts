export const NATIVE_BRIDGE_SOURCE = 'naghshman-web';
export const NATIVE_BRIDGE_VERSION = 1;

const ALLOWED_HOSTS = new Set([
  'naghshman.ir',
  'www.naghshman.ir',
  'meydanbackend.naghshman.ir',
]);

export type NativeBridgeAction =
  | { type: 'set-safe-area-background'; color: string; theme: 'light' | 'dark' }
  | { type: 'save-media'; url: string; filename?: string }
  | { type: 'share'; url: string; title?: string }
  | { type: 'copy-link'; url: string }
  | { type: 'open-browser'; url: string }
  | { type: 'persist-refresh'; token: string }
  | { type: 'clear-refresh' };

type BridgeEnvelope = {
  source?: unknown;
  version?: unknown;
  type?: unknown;
  color?: unknown;
  theme?: unknown;
  url?: unknown;
  filename?: unknown;
  title?: unknown;
  token?: unknown;
};

export function isAllowedWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ALLOWED_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 180) : undefined;
}

function isOpaqueHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[\da-f]{6}$/iu.test(value);
}

/**
 * Turns an untrusted WebView string into the small set of actions that native
 * code is allowed to perform. The web document never gets a native capability
 * until its envelope and URL have both passed this boundary check.
 */
export function parseNativeBridgeMessage(value: string): NativeBridgeAction | null {
  let message: BridgeEnvelope;
  try {
    message = JSON.parse(value) as BridgeEnvelope;
  } catch {
    return null;
  }

  if (!message || typeof message !== 'object' || message.source !== NATIVE_BRIDGE_SOURCE || message.version !== NATIVE_BRIDGE_VERSION) {
    return null;
  }

  if (message.type === 'clear-refresh') return { type: 'clear-refresh' };

  if (message.type === 'set-safe-area-background') {
    return isOpaqueHexColor(message.color) &&
      (message.theme === 'light' || message.theme === 'dark')
      ? {
          type: 'set-safe-area-background',
          color: message.color,
          theme: message.theme,
        }
      : null;
  }

  if (message.type === 'persist-refresh') {
    return typeof message.token === 'string' && /^ref_[A-Za-z0-9_-]{20,512}$/.test(message.token)
      ? { type: 'persist-refresh', token: message.token }
      : null;
  }

  if (typeof message.url !== 'string' || !isAllowedWebUrl(message.url)) return null;

  switch (message.type) {
    case 'save-media':
      return { type: 'save-media', url: message.url, filename: optionalText(message.filename) };
    case 'share':
      return { type: 'share', url: message.url, title: optionalText(message.title) };
    case 'copy-link':
      return { type: 'copy-link', url: message.url };
    case 'open-browser':
      return { type: 'open-browser', url: message.url };
    default:
      return null;
  }
}
