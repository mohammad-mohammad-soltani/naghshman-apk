import LottieView, { type AnimationObject } from "lottie-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { SPLASH_BACKGROUND, type SplashTheme } from "@/lib/splash-cache";
import { readCachedSplash } from "@/lib/splash-store";

// The same light/dark animations the site plays, bundled for the very first
// launch and for launches without a reachable site. A newer copy downloaded
// from the site (see splash-store) takes precedence once it exists.
const BUNDLED_SPLASH: Record<SplashTheme, Record<string, unknown>> = {
  light: require("../../assets/splash/splash-light.json"),
  dark: require("../../assets/splash/splash-dark.json"),
};

/** Matches the site's splash fade-out (`FADE_OUT_MS` in meydan's SplashScreen). */
const FADE_OUT_MS = 450;
const BRAND = "#dc2626";

const PALETTE = {
  light: {
    card: "rgba(255, 255, 255, 0.96)",
    border: "#f0e6e4",
    title: "#1c1917",
    message: "#57534e",
    iconBackground: "#fde8e8",
    shadow: "#7f1d1d",
  },
  dark: {
    card: "rgba(23, 23, 23, 0.96)",
    border: "#2a2a2a",
    title: "#fafaf9",
    message: "#a8a29e",
    iconBackground: "#3a1515",
    shadow: "#000000",
  },
} as const;

type LaunchSplashProps = {
  visible: boolean;
  theme: SplashTheme;
  /** Hold the final frame, show the offline card and keep the art alive. */
  offline: boolean;
  retrying: boolean;
  onRetry: () => void;
  /** The overlay is laid out, so the OS splash beneath it may be released. */
  onReady: () => void;
  onAnimationFinish: () => void;
  onHidden?: () => void;
};

export function LaunchSplash({
  visible,
  theme,
  offline,
  retrying,
  onRetry,
  onReady,
  onAnimationFinish,
  onHidden,
}: LaunchSplashProps) {
  const insets = useSafeAreaInsets();
  // Both sources passed `isValidLottie` (the bundled ones are the site's own).
  const source = useMemo(
    () =>
      (readCachedSplash(theme) ?? BUNDLED_SPLASH[theme]) as unknown as AnimationObject,
    [theme],
  );
  const reducedMotion = useReducedMotion();
  const [faded, setFaded] = useState(!visible);
  const [animationDone, setAnimationDone] = useState(false);
  const [fade] = useState(() => new Animated.Value(1));
  const background = SPLASH_BACKGROUND[theme];

  // Shown again (only in theory): undo the fade before painting.
  if (visible && faded) setFaded(false);

  // Fade and settle out like the site, instead of a hard cut to the WebView.
  useEffect(() => {
    if (visible) {
      fade.setValue(1);
      return;
    }
    const animation = Animated.timing(fade, {
      toValue: 0,
      duration: FADE_OUT_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (!finished) return;
      setFaded(true);
      onHidden?.();
    });
    return () => animation.stop();
  }, [fade, onHidden, visible]);

  // The offline card waits for the animation to land on its final frame.
  const showOffline = offline && animationDone;

  if (!visible && faded) return null;

  return (
    <Animated.View
      accessible={!showOffline}
      accessibilityLabel="در حال بارگذاری"
      accessibilityState={{ busy: !showOffline }}
      pointerEvents={visible ? "auto" : "none"}
      style={[
        styles.overlay,
        {
          backgroundColor: background,
          opacity: fade,
          transform: [
            {
              scale: fade.interpolate({
                inputRange: [0, 1],
                outputRange: [1.03, 1],
              }),
            },
          ],
        },
      ]}
      onLayout={({ nativeEvent }) => {
        // The React splash is physically laid out behind the OS splash, so
        // release it now; never wait for the animation or the network.
        if (nativeEvent.layout.width > 0) onReady();
      }}
    >
      <Wiggle active={showOffline} reducedMotion={reducedMotion}>
        <LottieView
          source={source}
          autoPlay
          loop={false}
          resizeMode="contain"
          renderMode="HARDWARE"
          style={styles.animation}
          onAnimationFinish={() => {
            setAnimationDone(true);
            onAnimationFinish();
          }}
          onAnimationFailure={() => {
            setAnimationDone(true);
            onAnimationFinish();
          }}
        />
      </Wiggle>
      {showOffline && (
        <OfflineCard
          theme={theme}
          retrying={retrying}
          onRetry={onRetry}
          bottomInset={insets.bottom}
          reducedMotion={reducedMotion}
        />
      )}
    </Animated.View>
  );
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active) setReduced(value);
    });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}

const sine = Easing.inOut(Easing.sin);

/**
 * A gentle, living idle motion: a slow sway, an out-of-phase float and a
 * breath. The three loops have different periods so they never line up into
 * a mechanical, repeating beat.
 */
function Wiggle({
  active,
  reducedMotion,
  children,
}: {
  active: boolean;
  reducedMotion: boolean;
  children: React.ReactNode;
}) {
  const [sway] = useState(() => new Animated.Value(0));
  const [float] = useState(() => new Animated.Value(0));
  const [breath] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const values = [sway, float, breath];
    if (!active) {
      // Settle back to rest instead of snapping out of the motion.
      const settle = Animated.parallel(
        values.map((value) =>
          Animated.timing(value, {
            toValue: 0,
            duration: 360,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ),
      );
      settle.start();
      return () => settle.stop();
    }

    const oscillate = (value: Animated.Value, period: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(value, {
            toValue: 1,
            duration: period / 4,
            easing: sine,
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: -1,
            duration: period / 2,
            easing: sine,
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration: period / 4,
            easing: sine,
            useNativeDriver: true,
          }),
        ]),
      );

    const loops = reducedMotion
      ? [oscillate(breath, 4200)]
      : [oscillate(sway, 2600), oscillate(float, 3400), oscillate(breath, 4200)];
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [active, breath, float, reducedMotion, sway]);

  const style = reducedMotion
    ? {
        opacity: breath.interpolate({
          inputRange: [-1, 0, 1],
          outputRange: [0.82, 1, 0.82],
        }),
      }
    : {
        transform: [
          {
            translateY: float.interpolate({
              inputRange: [-1, 1],
              outputRange: [5, -5],
            }),
          },
          {
            rotate: sway.interpolate({
              inputRange: [-1, 1],
              outputRange: ["-1.6deg", "1.6deg"],
            }),
          },
          {
            scale: breath.interpolate({
              inputRange: [-1, 0, 1],
              outputRange: [0.99, 1, 1.02],
            }),
          },
        ],
      };

  return <Animated.View style={[styles.wiggle, style]}>{children}</Animated.View>;
}

function OfflineCard({
  theme,
  retrying,
  onRetry,
  bottomInset,
  reducedMotion,
}: {
  theme: SplashTheme;
  retrying: boolean;
  onRetry: () => void;
  bottomInset: number;
  reducedMotion: boolean;
}) {
  const palette = PALETTE[theme];
  const [enter] = useState(() => new Animated.Value(0));
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const animation = Animated.spring(enter, {
      toValue: 1,
      damping: 16,
      stiffness: 140,
      mass: 0.9,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [enter]);

  // A soft ring around the icon, like a signal that keeps searching.
  useEffect(() => {
    if (reducedMotion) return;
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1800,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => {
      loop.stop();
      pulse.setValue(0);
    };
  }, [pulse, reducedMotion]);

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={[
        styles.card,
        {
          bottom: bottomInset + 28,
          backgroundColor: palette.card,
          borderColor: palette.border,
          shadowColor: palette.shadow,
          opacity: enter,
          transform: [
            {
              translateY: enter.interpolate({
                inputRange: [0, 1],
                outputRange: [36, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.iconWrap}>
        {!reducedMotion && (
          <Animated.View
            style={[
              styles.iconRing,
              {
                borderColor: BRAND,
                opacity: pulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.45, 0],
                }),
                transform: [
                  {
                    scale: pulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 1.6],
                    }),
                  },
                ],
              },
            ]}
          />
        )}
        <View
          style={[styles.icon, { backgroundColor: palette.iconBackground }]}
        >
          <WifiOffIcon />
        </View>
      </View>
      <Text
        accessibilityRole="header"
        style={[styles.title, { color: palette.title }]}
      >
        شما آفلاین هستید
      </Text>
      <Text style={[styles.message, { color: palette.message }]}>
        اتصال اینترنت را بررسی کنید و دوباره تلاش کنید. به محض برقراری
        اتصال، خودمان ادامه می‌دهیم.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="تلاش مجدد"
        accessibilityState={{ disabled: retrying, busy: retrying }}
        disabled={retrying}
        onPress={onRetry}
        style={({ pressed }) => [
          styles.button,
          pressed && styles.buttonPressed,
          retrying && styles.buttonBusy,
        ]}
      >
        {retrying ? (
          <View style={styles.buttonRow}>
            <ActivityIndicator color="#ffffff" size="small" />
            <Text style={styles.buttonText}>در حال بررسی…</Text>
          </View>
        ) : (
          <Text style={styles.buttonText}>تلاش مجدد</Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

function WifiOffIcon() {
  return (
    <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
      <Path
        d="M2 2l20 20M8.5 16.43a5 5 0 0 1 7 0M5 12.86a10 10 0 0 1 5.17-2.69M19 12.86a10 10 0 0 0-2.03-1.53M2 8.82a15 15 0 0 1 4.18-2.65M22 8.82A15 15 0 0 0 11.29 5.03M12 20h.01"
        stroke={BRAND}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: "hidden",
    zIndex: 1000,
    elevation: 1000,
  },
  wiggle: { flex: 1 },
  animation: { flex: 1 },
  card: {
    position: "absolute",
    left: 20,
    right: 20,
    alignItems: "center",
    paddingTop: 26,
    paddingBottom: 20,
    paddingHorizontal: 22,
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    elevation: 12,
  },
  iconWrap: {
    width: 60,
    height: 60,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  iconRing: {
    position: "absolute",
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
  },
  icon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: "Yekan",
    fontSize: 20,
    textAlign: "center",
    writingDirection: "rtl",
    marginBottom: 8,
  },
  message: {
    fontFamily: "Yekan",
    fontSize: 14,
    lineHeight: 24,
    textAlign: "center",
    writingDirection: "rtl",
    marginBottom: 20,
  },
  button: {
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: BRAND,
  },
  buttonPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  buttonBusy: { opacity: 0.75 },
  buttonRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  buttonText: {
    fontFamily: "Yekan",
    fontSize: 16,
    color: "#ffffff",
  },
});
