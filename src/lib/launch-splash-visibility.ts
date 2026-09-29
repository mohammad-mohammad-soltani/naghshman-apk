export function isLaunchSplashVisible(
  initialReady: boolean,
  nativeSplashReleased: boolean,
): boolean {
  return !initialReady || !nativeSplashReleased;
}

// A failed image load event must not keep the platform splash up forever.
export function isNativeSplashReady(
  artworkLaidOut: boolean,
  artworkLoaded: boolean,
  imageWaitExpired = false,
): boolean {
  return artworkLaidOut && (artworkLoaded || imageWaitExpired);
}
