import type { LottieViewProps } from "lottie-react-native";

import { optimizeLottie } from "@/lib/lottie-optimize";
import type { SplashTheme } from "@/lib/splash-cache";

// The web player takes the animation itself; the native build uses the
// prebuilt .lottie files instead (see launch-splash-source.ts).
const BUNDLED_SPLASH: Record<SplashTheme, Record<string, unknown>> = {
  light: require("../../assets/splash/splash-light.json"),
  dark: require("../../assets/splash/splash-dark.json"),
};

export function launchSplashSource(
  theme: SplashTheme,
): LottieViewProps["source"] {
  return optimizeLottie(BUNDLED_SPLASH[theme]) as unknown as LottieViewProps["source"];
}
