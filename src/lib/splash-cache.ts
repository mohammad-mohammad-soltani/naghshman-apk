export type SplashTheme = 'light' | 'dark';

/** HTTP validators of the cached copy, replayed on the next launch's check. */
export type SplashValidators = { etag?: string; lastModified?: string };

export type SplashMeta = {
  /** The last theme the user picked on the site. */
  theme?: SplashTheme;
  light?: SplashValidators;
  dark?: SplashValidators;
};

export const SPLASH_THEMES: readonly SplashTheme[] = ['light', 'dark'];

/** Matches the Lottie background layer and the native launch window. */
export const SPLASH_BACKGROUND: Record<SplashTheme, string> = {
  light: '#ffffff',
  dark: '#000000',
};

export function splashUrl(origin: string, theme: SplashTheme): string {
  return `${origin}/splash/splash-${theme}.json`;
}

/** Like the site, the "black" theme reads closest to the dark animation. */
export function normalizeSplashTheme(value: unknown): SplashTheme | null {
  if (value === 'light') return 'light';
  if (value === 'dark' || value === 'black') return 'dark';
  return null;
}

/** The site's own choice wins; before one is known, follow the system. */
export function resolveSplashTheme(
  stored: unknown,
  systemScheme: string | null | undefined,
): SplashTheme {
  return normalizeSplashTheme(stored) ?? (systemScheme === 'dark' ? 'dark' : 'light');
}

export function parseSplashMeta(text: string | null | undefined): SplashMeta {
  if (!text) return {};
  try {
    const raw: unknown = JSON.parse(text);
    if (!raw || typeof raw !== 'object') return {};
    const record = raw as Record<string, unknown>;
    const meta: SplashMeta = {};
    const theme = normalizeSplashTheme(record.theme);
    if (theme) meta.theme = theme;
    for (const key of SPLASH_THEMES) {
      const validators = parseValidators(record[key]);
      if (validators) meta[key] = validators;
    }
    return meta;
  } catch {
    return {};
  }
}

function parseValidators(value: unknown): SplashValidators | null {
  if (!value || typeof value !== 'object') return null;
  const { etag, lastModified } = value as Record<string, unknown>;
  const validators: SplashValidators = {};
  if (typeof etag === 'string' && etag) validators.etag = etag;
  if (typeof lastModified === 'string' && lastModified)
    validators.lastModified = lastModified;
  return validators.etag || validators.lastModified ? validators : null;
}

/** Conditional request headers: an unchanged splash costs one empty 304. */
export function conditionalHeaders(
  validators: SplashValidators | undefined,
): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (validators?.etag) headers['If-None-Match'] = validators.etag;
  if (validators?.lastModified)
    headers['If-Modified-Since'] = validators.lastModified;
  return headers;
}

/**
 * A server error page, a captive-portal HTML response or a truncated download
 * must never replace a working animation.
 */
export function isValidLottie(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const { v, w, h, op, layers } = value as Record<string, unknown>;
  return (
    typeof v === 'string' &&
    typeof w === 'number' &&
    w > 0 &&
    typeof h === 'number' &&
    h > 0 &&
    typeof op === 'number' &&
    op > 0 &&
    Array.isArray(layers) &&
    layers.length > 0
  );
}

/** Returns the parsed animation, or null for anything that is not a Lottie. */
export function parseLottie(text: string | null | undefined): Record<string, unknown> | null {
  if (!text) return null;
  try {
    const value: unknown = JSON.parse(text);
    return isValidLottie(value) ? value : null;
  } catch {
    return null;
  }
}
