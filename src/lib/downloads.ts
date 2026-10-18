/**
 * The downloads tray's state: attachments being fetched to open, and media
 * being saved to the gallery. Several may run at once; each reports its own
 * progress and ends done or failed. Cancelling simply removes it.
 */
export type DownloadKind = 'file' | 'media';
export type DownloadStatus = 'downloading' | 'done' | 'failed';

export type DownloadItem = {
  id: string;
  kind: DownloadKind;
  url: string;
  /** The name the page gave it; refined once the download is named. */
  name: string;
  /** What the page asked for, kept so a retry asks for the same. */
  requestedName?: string;
  status: DownloadStatus;
  bytes: number;
  /** Null while the size is unknown (no Content-Length). */
  total: number | null;
  /** Why it failed, shown under its name. */
  error?: string;
};

export type DownloadEvent =
  | { type: 'start'; id: string; kind: DownloadKind; url: string; name: string; requestedName?: string }
  | { type: 'progress'; id: string; bytes: number; total: number }
  | { type: 'named'; id: string; name: string }
  | { type: 'done'; id: string }
  | { type: 'failed'; id: string; error: string }
  | { type: 'remove'; id: string }
  | { type: 'clear-settled' };

/** Older settled rows fall off so the tray never grows without bound. */
export const MAX_DOWNLOADS = 20;

export function reduceDownloads(items: DownloadItem[], event: DownloadEvent): DownloadItem[] {
  switch (event.type) {
    case 'start': {
      const item: DownloadItem = {
        id: event.id,
        kind: event.kind,
        url: event.url,
        name: event.name,
        requestedName: event.requestedName,
        status: 'downloading',
        bytes: 0,
        total: null,
      };
      const next = [item, ...items.filter((existing) => existing.id !== event.id)];
      if (next.length <= MAX_DOWNLOADS) return next;
      // Drop the oldest settled rows first; running downloads always stay.
      const overflow = next.length - MAX_DOWNLOADS;
      let dropped = 0;
      return next
        .slice()
        .reverse()
        .filter((existing) => {
          if (dropped < overflow && existing.status !== 'downloading') {
            dropped += 1;
            return false;
          }
          return true;
        })
        .reverse();
    }
    case 'progress':
      return update(items, event.id, (item) =>
        item.status === 'downloading'
          ? {
              ...item,
              bytes: Math.max(0, event.bytes),
              total: event.total > 0 ? event.total : null,
            }
          : item,
      );
    case 'named':
      return update(items, event.id, (item) => ({ ...item, name: event.name }));
    case 'done':
      return update(items, event.id, (item) => ({
        ...item,
        status: 'done',
        bytes: item.total ?? item.bytes,
        error: undefined,
      }));
    case 'failed':
      return update(items, event.id, (item) => ({ ...item, status: 'failed', error: event.error }));
    case 'remove':
      return items.filter((item) => item.id !== event.id);
    case 'clear-settled':
      return items.filter((item) => item.status === 'downloading');
  }
}

function update(items: DownloadItem[], id: string, change: (item: DownloadItem) => DownloadItem) {
  let changed = false;
  const next = items.map((item) => {
    if (item.id !== id) return item;
    const updated = change(item);
    changed ||= updated !== item;
    return updated;
  });
  return changed ? next : items;
}

/** 0..1 for one row, or null while its size is unknown. */
export function downloadFraction(item: DownloadItem): number | null {
  if (item.status === 'done') return 1;
  if (!item.total) return null;
  return Math.min(1, item.bytes / item.total);
}

export type DownloadSummary = {
  active: number;
  done: number;
  failed: number;
  /** Combined progress of the running downloads, or null when unknown. */
  fraction: number | null;
};

export function summarizeDownloads(items: DownloadItem[]): DownloadSummary {
  let active = 0;
  let done = 0;
  let failed = 0;
  let bytes = 0;
  let total = 0;
  let unknown = false;
  for (const item of items) {
    if (item.status === 'done') done += 1;
    else if (item.status === 'failed') failed += 1;
    else {
      active += 1;
      if (item.total) {
        bytes += Math.min(item.bytes, item.total);
        total += item.total;
      } else {
        unknown = true;
      }
    }
  }
  const fraction = active === 0 ? (done > 0 ? 1 : null) : !unknown && total > 0 ? bytes / total : null;
  return { active, done, failed, fraction };
}

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

export function faDigits(value: string | number): string {
  return String(value)
    .replace(/\d/gu, (digit) => PERSIAN_DIGITS[Number(digit)])
    .replace(/\./gu, '٫');
}

/** «۸۰۰ کیلوبایت», «۲٫۴ مگابایت». */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${faDigits(Math.max(1, Math.round(bytes / 1024)))} کیلوبایت`;
  if (bytes < 1024 * 1024 * 1024) return `${faDigits((bytes / (1024 * 1024)).toFixed(1))} مگابایت`;
  return `${faDigits((bytes / (1024 * 1024 * 1024)).toFixed(2))} گیگابایت`;
}

/** The line under a row's name. */
export function downloadDetail(item: DownloadItem): string {
  if (item.status === 'failed') return item.error ?? 'دریافت نشد';
  if (item.status === 'done') {
    const size = item.total ?? item.bytes;
    const where = item.kind === 'media' ? 'در گالری ذخیره شد' : 'دریافت شد · برای باز کردن بزنید';
    return size > 0 ? `${formatBytes(size)} · ${where}` : where;
  }
  if (!item.total) return item.bytes > 0 ? `${formatBytes(item.bytes)} دریافت شد` : 'در حال آماده‌سازی…';
  const percent = Math.floor((Math.min(item.bytes, item.total) / item.total) * 100);
  return `${formatBytes(item.bytes)} از ${formatBytes(item.total)} · ${faDigits(percent)}٪`;
}

export type FileBadge = { label: string; color: string };

const BADGES: [RegExp, FileBadge][] = [
  [/^pdf$/u, { label: 'PDF', color: '#dc2626' }],
  [/^(docx?|odt|rtf)$/u, { label: 'DOC', color: '#2563eb' }],
  [/^(xlsx?|ods|csv)$/u, { label: 'XLS', color: '#16a34a' }],
  [/^(pptx?|odp)$/u, { label: 'PPT', color: '#ea580c' }],
  [/^(zip|rar|7z|tar|gz)$/u, { label: 'ZIP', color: '#a16207' }],
  [/^(txt|md)$/u, { label: 'TXT', color: '#64748b' }],
  [/^(mp3|m4a|aac|ogg|oga|wav|flac|opus)$/u, { label: 'صوت', color: '#0891b2' }],
  [/^(mp4|m4v|mov|webm|3gp|mkv)$/u, { label: 'ویدیو', color: '#db2777' }],
  [/^(jpe?g|png|webp|gif|heic|heif|avif|bmp)$/u, { label: 'عکس', color: '#7c3aed' }],
  [/^apk$/u, { label: 'APK', color: '#15803d' }],
];

/** The coloured tile a row starts with, from the file's extension. */
export function fileBadge(name: string, kind: DownloadKind): FileBadge {
  const extension = /\.([a-z0-9]{1,5})$/iu.exec(name)?.[1]?.toLowerCase();
  if (extension) {
    for (const [pattern, badge] of BADGES) if (pattern.test(extension)) return badge;
    return { label: extension.slice(0, 4).toUpperCase(), color: '#64748b' };
  }
  return kind === 'media' ? { label: 'رسانه', color: '#7c3aed' } : { label: 'فایل', color: '#64748b' };
}
