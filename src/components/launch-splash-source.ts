import type { LottieViewProps } from "lottie-react-native";

import type { SplashTheme } from "@/lib/splash-cache";
import { cachedSplashPath } from "@/lib/splash-store";

// The same light/dark animations the site plays, optimized at build time
// (scripts/build-splash.mjs) and bundled for the very first launch and for
// launches without a reachable site.
const BUNDLED_SPLASH: Record<SplashTheme, number> = {
  light: require("../../assets/splash/splash-light.lottie"),
  dark: require("../../assets/splash/splash-dark.lottie"),
};

/**
 * Where Lottie reads the splash from. Both are files it parses natively on a
 * background thread: no JSON is built, stringified or sent over the bridge.
 * A newer copy downloaded from the site (see splash-store) wins once it exists.
 */
export function launchSplashSource(
  theme: SplashTheme,
): LottieViewProps["source"] {
  const cached = cachedSplashPath(theme);
  // lottie-react-native loads a required asset id as dotLottie, though its
  // `source` type does not list numbers.
  return cached
    ? { uri: cached }
    : (BUNDLED_SPLASH[theme] as unknown as LottieViewProps["source"]);
}
