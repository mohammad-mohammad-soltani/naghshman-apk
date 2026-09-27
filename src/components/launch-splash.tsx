import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Image,
  StyleSheet,
  View,
} from 'react-native';

import { isNativeSplashReady } from '@/lib/launch-splash-visibility';
import {
  RIGHT_TO_LEFT_DOT_ORDER,
  STATIC_REDUCED_MOTION_OPACITIES,
} from '@/lib/launch-splash-timing';

const DOT_IDLE_OPACITY = 0.4;
const FADE_DURATION_MS = 260;
const ARTWORK_BACKGROUND = '#c03636';

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
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [artworkLaidOut, setArtworkLaidOut] = useState(false);
  const [artworkLoaded, setArtworkLoaded] = useState(false);

  useEffect(() => {
    if (isNativeSplashReady(artworkLaidOut, artworkLoaded)) onReady();
  }, [artworkLaidOut, artworkLoaded, onReady]);

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
      'reduceMotionChanged',
      configureMotion,
    );

    return () => {
      active = false;
      loop?.stop();
      subscription.remove();
    };
  }, [dotOpacities, visible]);

  useEffect(() => {
    if (!visible) onHidden?.();
  }, [visible, onHidden]);

  if (!visible) return null;

  // Map the dots through the same centered cover transform as the artwork.
  // Coordinates are measured from the supplied 880 x 1912 reference.
  const scale = Math.max(size.width / 880, size.height / 1912);
  const dotSize = 24 * scale;
  const dotsLeft = (size.width - 880 * scale) / 2 + 380 * scale;
  const dotsTop = (size.height - 1912 * scale) / 2 + 1768 * scale;

  return (
    <Animated.View
      accessible
      accessibilityLabel="در حال بارگذاری"
      accessibilityState={{ busy: true }}
      pointerEvents={visible ? 'auto' : 'none'}
      onLayout={({ nativeEvent: { layout } }) => {
        setSize({ width: layout.width, height: layout.height });
        setArtworkLaidOut(true);
      }}
      style={styles.overlay}
    >
      <Image
        resizeMode="cover"
        source={require('../../assets/images/splash-dotless.jpg')}
        onLoad={() => setArtworkLoaded(true)}
        style={styles.artwork}
      />
        <View style={[styles.dots, { left: dotsLeft, top: dotsTop, gap: 17 * scale }]}>
          {dotOpacities.map((opacity, index) => (
            <Animated.View
              key={index}
              style={[styles.dot, { opacity, width: dotSize, height: dotSize, borderRadius: dotSize / 2 }]}
            />
          ))}
        </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: ARTWORK_BACKGROUND,
    zIndex: 1000,
  },
  artwork: {
    width: '100%',
    height: '100%',
  },
  dots: {
    position: 'absolute',
    flexDirection: 'row',
    direction: 'ltr',
    justifyContent: 'center',
  },
  dot: {
    backgroundColor: '#ffffff',
  },
});
