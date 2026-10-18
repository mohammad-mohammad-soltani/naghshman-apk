export type AppReleaseStatus = {
  /** Android versionCode below which this app may not run; 0 means off. */
  minVersionCode: number;
  updateUrl: string;
  message: string;
};

export const DEFAULT_UPDATE_URL = "https://myket.ir/app/ir.naghshman.app";
export const DEFAULT_UPDATE_MESSAGE =
  "نسخهٔ جدید نقش من منتشر شده است. برای ادامه، لطفاً برنامه را به‌روزرسانی کنید.";

/** Stores and web pages over https, or a store app's own scheme. */
const UPDATE_URL = /^(?:https:\/\/|market:\/\/|myket:\/\/|bazaar:\/\/)\S+$/iu;

export function releaseStatusUrl(appUrl: string, versionCode: number): string {
  return `${appUrl}/api/meydan/app/android/release?version_code=${versionCode}`;
}

/** Reads `/app/android/release` (inside the API's `{ data }` envelope) or a stored copy. */
export function parseAppReleaseStatus(value: unknown): AppReleaseStatus | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const body = (
    record.data && typeof record.data === "object" ? record.data : record
  ) as Record<string, unknown>;
  const minVersionCode = Number(body.min_version_code ?? body.minVersionCode);
  if (!Number.isInteger(minVersionCode) || minVersionCode < 0) return null;
  const url = String(body.update_url ?? body.updateUrl ?? "").trim();
  const message = String(body.message ?? "").trim();
  return {
    minVersionCode,
    updateUrl: UPDATE_URL.test(url) ? url : DEFAULT_UPDATE_URL,
    message: message.slice(0, 300) || DEFAULT_UPDATE_MESSAGE,
  };
}

/** An unknown version (a dev build) is never locked out. */
export function requiresUpdate(
  versionCode: number | null,
  status: AppReleaseStatus | null,
): boolean {
  return (
    versionCode !== null &&
    versionCode > 0 &&
    status !== null &&
    status.minVersionCode > 0 &&
    versionCode < status.minVersionCode
  );
}

export function parseVersionCode(value: string | null | undefined): number | null {
  const code = Number(value);
  return Number.isInteger(code) && code > 0 ? code : null;
}
