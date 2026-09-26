import { useEffect, useRef, useState } from 'react';
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

type LaunchSplashProps = {
  visible: boolean;
  onMounted: () => void;
};

export function LaunchSplash({ visible, onMounted }: LaunchSplashProps) {
  const mountedNotified = useRef(false);
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
      onLayout={() => {
        if (mountedNotified.current) return;
        mountedNotified.current = true;
        onMounted();
      }}
      pointerEvents={visible ? 'auto' : 'none'}
      style={[styles.overlay, { opacity: overlayOpacity }]}
    >
      <Image
        resizeMode="cover"
        source={require('../../assets/images/splash-dotless.jpg')}
        style={StyleSheet.absoluteFill}
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
    inset: 0,
    backgroundColor: '#dc2626',
    zIndex: 1000,
  },
  dots: {
    position: 'absolute',
    bottom: '5.7%',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 14,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: '#ffffff',
  },
});
