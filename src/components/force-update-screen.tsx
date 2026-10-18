import { useEffect, useState } from "react";
import {
  Animated,
  BackHandler,
  Easing,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { DEFAULT_UPDATE_URL, type AppReleaseStatus } from "@/lib/app-release";
import { SPLASH_BACKGROUND, type SplashTheme } from "@/lib/splash-cache";

const BRAND = "#dc2626";

const PALETTE = {
  light: { title: "#1c1917", message: "#57534e", iconBackground: "#fde8e8", meta: "#a8a29e" },
  dark: { title: "#fafaf9", message: "#a8a29e", iconBackground: "#3a1515", meta: "#78716c" },
} as const;

type Props = {
  status: AppReleaseStatus;
  theme: SplashTheme;
  versionCode: number;
};

/**
 * Blocks an install the admin has retired. There is deliberately no way past
 * it: back leaves the app, and only installing the new build lifts it.
 */
export function ForceUpdateScreen({ status, theme, versionCode }: Props) {
  const palette = PALETTE[theme];
  const [enter] = useState(() => new Animated.Value(0));
  const [openFailed, setOpenFailed] = useState(false);

  useEffect(() => {
    const animation = Animated.timing(enter, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [enter]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      BackHandler.exitApp();
      return true;
    });
    return () => subscription.remove();
  }, []);

  const openUpdate = async () => {
    setOpenFailed(false);
    for (const url of [status.updateUrl, DEFAULT_UPDATE_URL]) {
      try {
        await Linking.openURL(url);
        return;
      } catch {
        // e.g. myket:// without Myket installed; try the store web page.
      }
    }
    setOpenFailed(true);
  };

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={[styles.screen, { backgroundColor: SPLASH_BACKGROUND[theme] }]}
    >
      <Animated.View
        accessibilityLiveRegion="polite"
        style={[
          styles.content,
          {
            opacity: enter,
            transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
          },
        ]}
      >
        <View style={[styles.icon, { backgroundColor: palette.iconBackground }]}>
          <Svg width={34} height={34} viewBox="0 0 24 24" fill="none">
            <Path
              d="M12 16V4m0 0L7 9m5-5 5 5M5 20h14"
              stroke={BRAND}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </View>
        <Text accessibilityRole="header" style={[styles.title, { color: palette.title }]}>
          نسخهٔ جدید آماده است
        </Text>
        <Text style={[styles.message, { color: palette.message }]}>{status.message}</Text>
        {openFailed ? (
          <Text style={[styles.message, { color: BRAND }]}>
            فروشگاه باز نشد. نقش من را در مایکت جست‌وجو و به‌روزرسانی کنید.
          </Text>
        ) : null}
      </Animated.View>
      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="به‌روزرسانی برنامه"
          onPress={() => void openUpdate()}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonText}>به‌روزرسانی</Text>
        </Pressable>
        <Text style={[styles.meta, { color: palette.meta }]}>
          نسخهٔ نصب‌شده: {versionCode.toLocaleString("fa-IR")}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 5000,
    elevation: 5000,
    paddingHorizontal: 28,
  },
  content: { flex: 1, alignItems: "center", justifyContent: "center" },
  icon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  title: {
    fontFamily: "Yekan",
    fontSize: 22,
    textAlign: "center",
    writingDirection: "rtl",
    marginBottom: 12,
  },
  message: {
    fontFamily: "Yekan",
    fontSize: 15,
    lineHeight: 27,
    textAlign: "center",
    writingDirection: "rtl",
    marginBottom: 8,
  },
  footer: { paddingBottom: 20, alignItems: "center", gap: 12 },
  button: {
    alignSelf: "stretch",
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: BRAND,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  buttonText: { fontFamily: "Yekan", fontSize: 16, color: "#ffffff" },
  meta: { fontFamily: "Yekan", fontSize: 12 },
});
