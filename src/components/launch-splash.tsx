import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Image,
  StyleSheet,
  View,
} from 'react-native';

import {
  RIGHT_TO_LEFT_DOT_ORDER,
  STATIC_REDUCED_MOTION_OPACITIES,
} from '@/lib/launch-splash-timing';

const DOT_IDLE_OPACITY = 0.4;
const DOT_SIZE = 18;
const FADE_DURATION_MS = 260;
const ARTWORK_BACKGROUND = '#c03636';

type LaunchSplashProps = {
  visible: boolean;
};

export function LaunchSplash({ visible }: LaunchSplashProps) {
  const [overlayOpacity] = useState(() => new Animated.Value(1));
  const [dotOpacities] = useState(() => [
    new Animated.Value(DOT_IDLE_OPACITY),
    new Animated.Value(DOT_IDLE_OPACITY),
    new Animated.Value(DOT_IDLE_OPACITY),
  ]);
  const [rendered, setRendered] = useState(true);

  useEffect(() => {
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

      loop = Animated.loop(Animated.stagger(180, pulses));
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
  }, [dotOpacities]);

  useEffect(() => {
    if (visible) return;

    Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: 240,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setRendered(false);
    });
  }, [overlayOpacity, visible]);

  if (!rendered) return null;

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents={visible ? 'auto' : 'none'}
      style={[styles.overlay, { opacity: overlayOpacity }]}
    >
      <Image
        resizeMode="stretch"
        source={require('../../assets/images/splash-dotless.jpg')}
        style={styles.artwork}
      />
      <View style={styles.dots}>
        {dotOpacities.map((opacity, index) => (
          <Animated.View
            key={index}
            style={[styles.dot, { opacity }]}
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
    bottom: '5.7%',
    right: 0,
    left: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: '#ffffff',
  },
});
