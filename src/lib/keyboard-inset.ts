/**
 * How much of the WebView frame the soft keyboard covers, in dp.
 *
 * Android draws the app edge to edge, so `adjustResize` no longer shrinks the
 * window and the keyboard simply covers the page. The shell shrinks the
 * WebView by this amount instead, so the site's viewport (and its `dvh`
 * layout) ends at the keyboard: top bars stay at the top and bottom bars sit
 * on the keyboard, as in Telegram.
 *
 * `keyboardTop` is the keyboard's top edge in window coordinates and
 * `frameBottom` the frame's bottom edge, measured without this inset. When the
 * window was already resized for the keyboard the frame ends above it and the
 * inset is zero, so the two never add up.
 */
export function keyboardOverlap(
  frameBottom: number,
  keyboardTop: number,
  keyboardHeight: number,
): number {
  if (!(keyboardHeight > 0)) return 0;
  if (!Number.isFinite(frameBottom) || !Number.isFinite(keyboardTop) || keyboardTop <= 0) {
    return Math.round(keyboardHeight);
  }
  return Math.max(0, Math.round(frameBottom - keyboardTop));
}
