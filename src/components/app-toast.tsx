import { useEffect, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { CheckIcon, SITE_FONT, SURFACE } from "@/components/download-tray";
import type { NoticeTone } from "@/components/use-downloads";

export type Notice = { id: number; message: string; tone: NoticeTone };

const TONE = {
  info: { color: "#dc2626", soft: "#dc26261f" },
  success: { color: "#16a34a", soft: "#16a34a1f" },
  error: { color: "#dc2626", soft: "#dc26261f" },
};

/**
 * The app's short confirmations ("پیوند کپی شد") as one of the site's
 * floating cards: its surface, border and shadow, a tone icon and RTL text,
 * rising in and fading out.
 */
export function AppToast({
  notice,
  theme,
  bottom,
}: {
  notice: Notice | null;
  theme: "light" | "dark";
  bottom: number;
}) {
  const colors = SURFACE[theme];
  const [shown, setShown] = useState(notice);
  const [presence] = useState(() => new Animated.Value(0));
  const [lift] = useState(() => new Animated.Value(bottom));

  if (notice && notice !== shown) setShown(notice);

  useEffect(() => {
    if (notice) presence.setValue(0);
    Animated.timing(presence, {
      toValue: notice ? 1 : 0,
      duration: notice ? 260 : 200,
      easing: notice ? Easing.out(Easing.back(1.4)) : Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !notice) setShown(null);
    });
  }, [notice, presence]);

  // Moves up and down with the downloads tray beneath it.
  useEffect(() => {
    Animated.spring(lift, {
      toValue: bottom,
      damping: 20,
      stiffness: 220,
      useNativeDriver: true,
    }).start();
  }, [bottom, lift]);

  if (!shown) return null;
  const tone = TONE[shown.tone];

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[
        styles.toast,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: presence,
          transform: [
            { translateY: Animated.multiply(lift, -1) },
            {
              translateY: presence.interpolate({
                inputRange: [0, 1],
                outputRange: [18, 0],
              }),
            },
            {
              scale: presence.interpolate({
                inputRange: [0, 1],
                outputRange: [0.94, 1],
              }),
            },
          ],
        },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: tone.soft }]}>
        {shown.tone === "success" ? (
          <CheckIcon color={tone.color} size={16} />
        ) : (
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Path
              d={
                shown.tone === "error"
                  ? "M12 7v6.5m0 3.5v.5"
                  : "M12 11v6m0-10v.5"
              }
              stroke={tone.color}
              strokeWidth={2.6}
              strokeLinecap="round"
            />
          </Svg>
        )}
      </View>
      <Text style={[styles.text, { color: colors.text }]}>{shown.message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    zIndex: 3000,
    bottom: 0,
    left: 16,
    right: 16,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  icon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    flex: 1,
    fontFamily: SITE_FONT,
    fontWeight: "500",
    fontSize: 13.5,
    lineHeight: 22,
    textAlign: "right",
    writingDirection: "rtl",
  },
});
