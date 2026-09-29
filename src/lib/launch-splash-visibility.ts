export function isLaunchSplashVisible(
  initialReady: boolean,
  nativeSplashReleased: boolean,
): boolean {
  return !initialReady || !nativeSplashReleased;
}

export function isNativeSplashReady(
  artworkLaidOut: boolean,
  artworkLoaded: boolean,
): boolean {
  return artworkLaidOut && artworkLoaded;
}
