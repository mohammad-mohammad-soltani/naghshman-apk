/** A photo/video <input type="file"> that the native media sheet answers. */
export type MediaRequest = {
  images: boolean;
  videos: boolean;
  multiple: boolean;
  /** The input has a `capture` attribute: go straight to the camera. */
  capture: boolean;
};

/** More than this per send is rarely intended and slows the upload a lot. */
export const MAX_MEDIA_SELECTION = 10;

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'avif', 'bmp']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'm4v', 'mov', 'webm', '3gp', 'mkv']);

/**
 * Which media an input's accept types allow, or null when it also takes other
 * files (or any file), which keeps the system chooser. The Android module
 * makes this decision natively with the same rules (mediaKinds in
 * NaghshmanMediaChooserModule.kt).
 */
export function mediaKindsForAccept(
  acceptTypes: readonly string[],
): { images: boolean; videos: boolean } | null {
  const tokens = acceptTypes
    .flatMap((value) => value.split(','))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return null;

  let images = false;
  let videos = false;
  for (const token of tokens) {
    const extension = token.startsWith('.') ? token.slice(1) : null;
    if (token.startsWith('image/') || (extension && IMAGE_EXTENSIONS.has(extension))) images = true;
    else if (token.startsWith('video/') || (extension && VIDEO_EXTENSIONS.has(extension))) videos = true;
    else return null;
  }
  return { images, videos };
}

/** Validates the native module's event before the sheet trusts it. */
export function parseMediaRequest(value: unknown): MediaRequest | null {
  if (!value || typeof value !== 'object') return null;
  const event = value as Record<string, unknown>;
  const flags = [event.images, event.videos, event.multiple, event.capture];
  if (!flags.every((flag) => typeof flag === 'boolean')) return null;
  if (!event.images && !event.videos) return null;
  return {
    images: event.images as boolean,
    videos: event.videos as boolean,
    multiple: event.multiple as boolean,
    capture: event.capture as boolean,
  };
}

/** Taps add an item at the end or remove it; a full selection ignores new taps. */
export function toggleSelection(
  selected: readonly string[],
  id: string,
  max = MAX_MEDIA_SELECTION,
): string[] {
  if (selected.includes(id)) return selected.filter((item) => item !== id);
  if (selected.length >= max) return [...selected];
  return [...selected, id];
}

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

export function persianDigits(value: string | number): string {
  return String(value).replace(/\d/gu, (digit) => PERSIAN_DIGITS[Number(digit)]);
}

/** A video badge such as ۰:۰۷ or ۱:۰۲:۰۵. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, '0');
  const text = hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
  return persianDigits(text);
}
