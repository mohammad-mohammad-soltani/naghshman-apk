export function isLaunchSplashVisible(initialReady: boolean): boolean {
  return !initialReady;
}

// Do not reveal the platform splash until the branded full-screen overlay
// is both laid out and its bundled image has completed loading.
export function isNativeSplashReady(
  artworkLaidOut: boolean,
  artworkLoaded: boolean,
): boolean {
  return artworkLaidOut && artworkLoaded;
}
