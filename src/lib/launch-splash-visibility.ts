export function isLaunchSplashVisible(
  initialReady: boolean,
  nativeSplashReleased: boolean,
  minimumCustomSplashElapsed: boolean,
): boolean {
  return (
    !initialReady ||
    !nativeSplashReleased ||
    !minimumCustomSplashElapsed
  );
}
