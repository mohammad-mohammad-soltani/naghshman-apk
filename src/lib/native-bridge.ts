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
  | { type: 'open-file'; url: string; filename?: string }
  | { type: 'share'; url: string; title?: string }
  | { type: 'copy-link'; url: string }
  | { type: 'open-browser'; url: string }
  | { type: 'persist-refresh'; token: string }
  | { type: 'clear-refresh' }
  | { type: 'ensure-media-permission'; requestId: string; kinds: MediaPermissionKind[] }
  | { type: 'floating-layout'; navHeight: number; audioTop: number | null }
  | { type: 'native-audio-load'; track: NativeAudioTrack; position: number; autoplay: boolean }
  | { type: 'native-audio-play' }
  | { type: 'native-audio-pause' }
  | { type: 'native-audio-seek'; seconds: number }
  | { type: 'native-audio-clear' };

/** A track the site hands to the app's own player. */
export type NativeAudioTrack = {
  id: string;
  title: string;
  artist?: string;
  url: string;
  /** Shown as the cover in the system's media controls. */
  artwork?: string;
};

export type MediaPermissionKind = 'microphone' | 'camera';
const MEDIA_PERMISSION_KINDS: readonly MediaPermissionKind[] = ['microphone', 'camera'];

// Uploads are served from object storage and legacy deployment hosts, never
// navigated to. These may be saved, shared or opened, but not loaded in-app.
const MEDIA_HOSTS = new Set(['naghshman-media.s3.ir-thr-at1.arvanstorage.ir']);
const MEDIA_DOMAIN_SUFFIXES = ['naghshman.ir', 'nabzjahan.ir'];

type BridgeEnvelope = {
  navHeight?: unknown;
  audioTop?: unknown;
  track?: unknown;
  position?: unknown;
  autoplay?: unknown;
  seconds?: unknown;
  source?: unknown;
  version?: unknown;
  type?: unknown;
  color?: unknown;
  theme?: unknown;
  url?: unknown;
  filename?: unknown;
  title?: unknown;
  token?: unknown;
  requestId?: unknown;
  kinds?: unknown;
};

export function isAllowedWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ALLOWED_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export function isAllowedMediaUrl(value: string): boolean {
  if (isAllowedWebUrl(value)) return true;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    return (
      MEDIA_HOSTS.has(url.hostname) ||
      MEDIA_DOMAIN_SUFFIXES.some(
        (domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`),
      )
    );
  } catch {
    return false;
  }
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/** A finite CSS pixel distance, clamped to what a phone screen can hold. */
function layoutDistance(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(Math.max(value, 0), 2000) : null;
}

function parseAudioTrack(value: unknown): NativeAudioTrack | null {
  if (!value || typeof value !== 'object') return null;
  const track = value as Record<string, unknown>;
  if (typeof track.id !== 'string' || !/^[\w:.-]{1,128}$/u.test(track.id)) return null;
  // Podcasts stream from their own hosts, so any HTTPS audio may play.
  if (!isHttpsUrl(track.url)) return null;
  const artwork = [track.artwork, track.artistAvatar, track.cover].find(isHttpsUrl);
  return {
    id: track.id,
    title: optionalText(track.title) ?? 'صوت',
    artist: optionalText(track.artist),
    url: track.url,
    ...(artwork ? { artwork } : {}),
  };
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

  if (message.type === 'ensure-media-permission') {
    if (typeof message.requestId !== 'string' || !/^[\w-]{1,64}$/u.test(message.requestId)) return null;
    if (!Array.isArray(message.kinds) || message.kinds.length === 0) return null;
    const kinds = MEDIA_PERMISSION_KINDS.filter((kind) => (message.kinds as unknown[]).includes(kind));
    if (kinds.length !== new Set(message.kinds).size) return null;
    return { type: 'ensure-media-permission', requestId: message.requestId, kinds };
  }

  if (message.type === 'persist-refresh') {
    return typeof message.token === 'string' && /^ref_[A-Za-z0-9_-]{20,512}$/.test(message.token)
      ? { type: 'persist-refresh', token: message.token }
      : null;
  }

  if (message.type === 'floating-layout') {
    const navHeight = layoutDistance(message.navHeight);
    const audioTop = message.audioTop === null ? null : layoutDistance(message.audioTop);
    if (navHeight === null || (message.audioTop !== null && audioTop === null)) return null;
    return { type: 'floating-layout', navHeight, audioTop };
  }

  switch (message.type) {
    case 'native-audio-load': {
      const track = parseAudioTrack(message.track);
      if (!track) return null;
      return {
        type: 'native-audio-load',
        track,
        position:
          typeof message.position === 'number' && Number.isFinite(message.position)
            ? Math.max(0, message.position)
            : 0,
        autoplay: message.autoplay !== false,
      };
    }
    case 'native-audio-play':
    case 'native-audio-pause':
    case 'native-audio-clear':
      return { type: message.type };
    case 'native-audio-seek':
      return typeof message.seconds === 'number' && Number.isFinite(message.seconds)
        ? { type: 'native-audio-seek', seconds: Math.max(0, message.seconds) }
        : null;
  }

  if (typeof message.url !== 'string' || !isAllowedMediaUrl(message.url)) return null;

  switch (message.type) {
    case 'save-media':
      return { type: 'save-media', url: message.url, filename: optionalText(message.filename) };
    case 'open-file':
      return { type: 'open-file', url: message.url, filename: optionalText(message.filename) };
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
