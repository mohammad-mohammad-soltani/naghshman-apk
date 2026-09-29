import { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  StyleSheet,
  View,
} from "react-native";
import Svg, { Image as SvgImage, SvgXml } from "react-native-svg";

import artwork from "../../assets/images/massage.generated.json";

import {
  RIGHT_TO_LEFT_DOT_ORDER,
  STATIC_REDUCED_MOTION_OPACITIES,
} from "@/lib/launch-splash-timing";

const DOT_IDLE_OPACITY = 0.4;
const FADE_DURATION_MS = 260;
const ARTWORK_BACKGROUND = "#c03636";

const ARTWORK_WIDTH = 880;
const ARTWORK_HEIGHT = 1912;

const DOTS_X = 380;
const DOTS_Y = 1768;
const DOT_SIZE = 24;
const DOT_GAP = 17;

type LaunchSplashProps = {
  visible: boolean;
  onReady: () => void;
  onHidden?: () => void;
};

export function LaunchSplash({
  visible,
  onReady,
  onHidden,
}: LaunchSplashProps) {
  const [dotOpacities] = useState(() => [
    new Animated.Value(DOT_IDLE_OPACITY),
    new Animated.Value(DOT_IDLE_OPACITY),
    new Animated.Value(DOT_IDLE_OPACITY),
  ]);

  const [screenWidth, setScreenWidth] = useState(0);

  /**
   * انیمیشن سه نقطه
   */
  useEffect(() => {
    if (!visible) return;

    let active = true;
    let loop: Animated.CompositeAnimation | null = null;

    const configureMotion = (reduced: boolean) => {
      if (!active) return;

      loop?.stop();

      dotOpacities.forEach((opacity, index) => {
        opacity.setValue(
          reduced ? STATIC_REDUCED_MOTION_OPACITIES[index] : DOT_IDLE_OPACITY,
        );
      });

      if (reduced) return;

      const pulses = RIGHT_TO_LEFT_DOT_ORDER.map((index) =>
        Animated.sequence([
          Animated.timing(dotOpacities[index], {
            toValue: 1,
            duration: FADE_DURATION_MS,
            useNativeDriver: true,
          }),
          Animated.timing(dotOpacities[index], {
            toValue: DOT_IDLE_OPACITY,
            duration: FADE_DURATION_MS,
            useNativeDriver: true,
          }),
        ]),
      );

      loop = Animated.loop(Animated.sequence(pulses));
      loop.start();
    };

    void AccessibilityInfo.isReduceMotionEnabled().then(configureMotion);

    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      configureMotion,
    );

    return () => {
      active = false;
      loop?.stop();
      subscription.remove();
    };
  }, [dotOpacities, visible]);

  useEffect(() => {
    if (!visible) {
      onHidden?.();
    }
  }, [visible, onHidden]);

  if (!visible) {
    return null;
  }

  /**
   * SVG دقیقاً به اندازه عرض صفحه scale می‌شود.
   */
  const scale = screenWidth > 0 ? screenWidth / ARTWORK_WIDTH : 1;

  const dotSize = DOT_SIZE * scale;

  return (
    <Animated.View
      accessible
      accessibilityLabel="در حال بارگذاری"
      accessibilityState={{ busy: true }}
      pointerEvents="auto"
      style={styles.overlay}
      onLayout={({ nativeEvent }) => {
        const width = nativeEvent.layout.width;

        if (width > 0) {
          setScreenWidth(width);

          // The React splash is now physically laid out behind the OS splash.
          // Release the native splash here instead of waiting for SvgImage.onLoad,
          // which is not guaranteed to fire in every Android release build.
          onReady();
        }
      }}
    >
      {screenWidth > 0 && (
        <View
          style={[
            styles.artworkContainer,
            {
              width: screenWidth,
              height: screenWidth * (ARTWORK_HEIGHT / ARTWORK_WIDTH),
            },
          ]}
        >
          <Svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${ARTWORK_WIDTH} ${ARTWORK_HEIGHT}`}
            preserveAspectRatio="xMidYMid meet"
            style={styles.svg}
          >
            <SvgXml
              xml={artwork.vectors}
              width={ARTWORK_WIDTH}
              height={ARTWORK_HEIGHT}
            />

            <SvgImage
              {...artwork.image.frame}
              href={artwork.image.uri}
              preserveAspectRatio="xMidYMid meet"
            />
          </Svg>

          <View
            pointerEvents="none"
            style={[
              styles.dots,
              {
                left: DOTS_X * scale,
                top: DOTS_Y * scale,
                gap: DOT_GAP * scale,
              },
            ]}
          >
            {dotOpacities.map((opacity, index) => (
              <Animated.View
                key={index}
                style={[
                  styles.dot,
                  {
                    opacity,
                    width: dotSize,
                    height: dotSize,
                    borderRadius: dotSize / 2,
                  },
                ]}
              />
            ))}
          </View>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,

    backgroundColor: ARTWORK_BACKGROUND,

    alignItems: "center",
    justifyContent: "center",

    overflow: "hidden",

    zIndex: 1000,
    elevation: 1000,
  },

  artworkContainer: {
    position: "relative",
    alignSelf: "center",
  },

  svg: {
    position: "absolute",
    top: 0,
    left: 0,
  },

  dots: {
    position: "absolute",

    flexDirection: "row",
    direction: "ltr",

    alignItems: "center",
  },

  dot: {
    backgroundColor: "#ffffff",
  },
});
