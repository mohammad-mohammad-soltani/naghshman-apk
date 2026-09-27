/** Run only after a successful native document load, then wait for fonts and paint. */
export function webDocumentReadyScript(attempt: number): string {
  return `
    (function () {
      var url = window.location.href;
      var ready = function () {
        Promise.resolve(document.fonts && document.fonts.ready).then(function () {
          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              if (window.location.href !== url) return;
              if (window.__naghshmanRestoreInProgress) {
                window.setTimeout(ready, 100);
                return;
              }
              window.ReactNativeWebView.postMessage(JSON.stringify({
                source: 'naghshman-render', attempt: ${attempt}, url: url
              }));
            });
          });
        });
      };
      if (document.readyState === 'complete') ready();
      else window.addEventListener('load', ready, { once: true });
    })(); true;
  `;
}

export function isCurrentDocumentReady(
  message: unknown, attempt: number, url: string | null, failed: boolean,
): boolean {
  if (!message || typeof message !== 'object' || failed || !url) return false;
  const value = message as Record<string, unknown>;
  return value.source === 'naghshman-render' && value.attempt === attempt && value.url === url;
}
