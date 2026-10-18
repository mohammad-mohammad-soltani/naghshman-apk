/** Hard cap so a slow or broken animation can never hold the app back. */
export const SPLASH_ANIMATION_CAP_MS = 6000;

export function isLaunchSplashVisible(
  initialReady: boolean,
  nativeSplashReleased: boolean,
  animationFinished: boolean,
  offline = false,
): boolean {
  return (
    offline ||
    !initialReady ||
    !nativeSplashReleased ||
    !animationFinished
  );
}
