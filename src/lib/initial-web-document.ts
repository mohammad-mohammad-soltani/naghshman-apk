const APP_ORIGIN = 'https://naghshman.ir';

export function isInitialWebDocument(url: string): boolean {
  return url === APP_ORIGIN || url.startsWith(`${APP_ORIGIN}/`);
}
