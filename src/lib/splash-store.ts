import { Directory, File, Paths } from "expo-file-system";

import {
  conditionalHeaders,
  parseLottie,
  parseSplashMeta,
  splashUrl,
  type SplashMeta,
  type SplashTheme,
} from "@/lib/splash-cache";

// The persistent copy of the site's launch animation. Everything here is
// best-effort: a missing or unreadable cache simply falls back to the
// animation bundled with the app.

function splashDirectory(): Directory {
  return new Directory(Paths.document, "splash");
}

function splashFile(theme: SplashTheme): File {
  return new File(splashDirectory(), `splash-${theme}.json`);
}

function metaFile(): File {
  return new File(splashDirectory(), "meta.json");
}

function ensureDirectory() {
  splashDirectory().create({ intermediates: true, idempotent: true });
}

export function readSplashMeta(): SplashMeta {
  try {
    const file = metaFile();
    return file.exists ? parseSplashMeta(file.textSync()) : {};
  } catch {
    return {};
  }
}

function writeSplashMeta(meta: SplashMeta) {
  ensureDirectory();
  const file = metaFile();
  file.create({ overwrite: true });
  file.write(JSON.stringify(meta));
}

function updateSplashMeta(update: (meta: SplashMeta) => SplashMeta) {
  try {
    writeSplashMeta(update(readSplashMeta()));
  } catch {
    // The next successful launch rewrites it.
  }
}

/** The last downloaded animation, or null to use the bundled one. */
export function readCachedSplash(theme: SplashTheme): Record<string, unknown> | null {
  try {
    const file = splashFile(theme);
    return file.exists ? parseLottie(file.textSync()) : null;
  } catch {
    return null;
  }
}

export function saveSplashTheme(theme: SplashTheme) {
  if (readSplashMeta().theme === theme) return;
  updateSplashMeta((meta) => ({ ...meta, theme }));
}

export type SplashCheckResult = {
  /** The site answered at all; this doubles as the launch reachability probe. */
  reachable: boolean;
  /** A newer animation was saved; it plays from the next launch on. */
  updated: boolean;
};

/**
 * Asks the site whether its splash changed since the cached copy, using the
 * ETag/Last-Modified it sent last time. An unchanged splash is a bodiless 304.
 */
export async function checkForSplashUpdate(
  origin: string,
  theme: SplashTheme,
  signal?: AbortSignal,
): Promise<SplashCheckResult> {
  const cached = readCachedSplash(theme) !== null;
  const validators = cached ? readSplashMeta()[theme] : undefined;

  let response: Response;
  try {
    response = await fetch(splashUrl(origin, theme), {
      headers: conditionalHeaders(validators),
      signal,
    });
  } catch {
    return { reachable: false, updated: false };
  }

  if (response.status === 304 || !response.ok)
    return { reachable: true, updated: false };

  let animation: Record<string, unknown> | null = null;
  let text = "";
  try {
    text = await response.text();
    animation = parseLottie(text);
  } catch {
    // A body cut off mid-download keeps the previous animation.
  }
  if (!animation) return { reachable: true, updated: false };

  try {
    ensureDirectory();
    // Write beside the live copy first, so a crash mid-write never leaves a
    // half-written animation behind for the next launch.
    const temporary = new File(splashDirectory(), `splash-${theme}.json.tmp`);
    temporary.create({ overwrite: true });
    temporary.write(text);
    await temporary.move(splashFile(theme), { overwrite: true });

    const etag = response.headers.get("etag") ?? undefined;
    const lastModified = response.headers.get("last-modified") ?? undefined;
    updateSplashMeta((meta) => ({ ...meta, [theme]: { etag, lastModified } }));
    return { reachable: true, updated: true };
  } catch {
    return { reachable: true, updated: false };
  }
}
