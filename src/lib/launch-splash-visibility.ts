export function isLaunchSplashVisible(
  initialReady: boolean,
  nativeSplashReleased: boolean,
): boolean {
  return !initialReady || !nativeSplashReleased;
}
