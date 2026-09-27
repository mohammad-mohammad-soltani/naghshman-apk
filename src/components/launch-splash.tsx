import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { isNativeSplashReady } from '@/lib/launch-splash-visibility';
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
  onReady: () => void;
  onHidden?: () => void;
  failure?: 'offline' | 'unavailable' | null;
  onRetry?: () => void;
};

export function LaunchSplash({
  visible,
  onReady,
  onHidden,
  failure = null,
  onRetry,
}: LaunchSplashProps) {
  const [overlayOpacity] = useState(() => new Animated.Value(1));
  const [dotOpacities] = useState(() => [
    new Animated.Value(DOT_IDLE_OPACITY),
    new Animated.Value(DOT_IDLE_OPACITY),
    new Animated.Value(DOT_IDLE_OPACITY),
  ]);
  const [rendered, setRendered] = useState(true);
  const [artworkLaidOut, setArtworkLaidOut] = useState(false);
  const [artworkLoaded, setArtworkLoaded] = useState(false);

  useEffect(() => {
    if (isNativeSplashReady(artworkLaidOut, artworkLoaded)) onReady();
  }, [artworkLaidOut, artworkLoaded, onReady]);

  useEffect(() => {
    if (!visible || failure) return;

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
  }, [dotOpacities, failure, visible]);

  useEffect(() => {
    // An interrupted fade must never notify the parent that a newer splash
    // has disappeared (for example, during two rapid WebView navigations).
    overlayOpacity.stopAnimation();
    if (visible) {
      overlayOpacity.setValue(1);
      return;
    }

    const fade = Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: 240,
      useNativeDriver: true,
    });
    fade.start(({ finished }) => {
      if (finished) {
        setRendered(false);
        onHidden?.();
      }
    });

    return () => fade.stop();
  }, [overlayOpacity, visible, onHidden]);

  if (!rendered) return null;

  return (
    <Animated.View
      accessibilityElementsHidden={!failure}
      importantForAccessibility={failure ? "auto" : "no-hide-descendants"}
      pointerEvents={visible ? 'auto' : 'none'}
      onLayout={() => setArtworkLaidOut(true)}
      style={[styles.overlay, { opacity: overlayOpacity }]}
    >
      <Image
        resizeMode="cover"
        source={require('../../assets/images/splash-dotless.jpg')}
        onLoadEnd={() => setArtworkLoaded(true)}
        style={styles.artwork}
      />
      {failure ? (
        <View style={styles.errorPanel} accessibilityLiveRegion="polite">
          <Text style={styles.errorTitle}>
            {failure === 'offline' ? 'اتصال اینترنت برقرار نیست' : 'بارگذاری صفحه ممکن نشد'}
          </Text>
          <Text style={styles.errorHint}>
            {failure === 'offline'
              ? 'پس از اتصال اینترنت، برنامه خودکار تلاش می‌کند.'
              : 'اتصال اینترنت یا وضعیت سرور را بررسی کنید.'}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onRetry}
            style={styles.retryButton}
          >
            <Text style={styles.retryText}>تلاش دوباره</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.dots}>
          {dotOpacities.map((opacity, index) => (
            <Animated.View
              key={index}
              style={[styles.dot, { opacity }]}
            />
          ))}
        </View>
      )}
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
  errorPanel: {
    position: 'absolute',
    top: '67%',
    alignSelf: 'center',
    width: '84%',
    maxWidth: 360,
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderRadius: 18,
    alignItems: 'center',
    backgroundColor: 'rgba(111, 24, 30, 0.92)',
  },
  errorTitle: {
    color: '#ffffff',
    fontFamily: 'Yekan',
    fontSize: 18,
    textAlign: 'center',
  },
  errorHint: {
    color: '#f8e7e7',
    fontFamily: 'Yekan',
    fontSize: 14,
    lineHeight: 24,
    textAlign: 'center',
    marginTop: 8,
  },
  retryButton: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingVertical: 9,
    paddingHorizontal: 24,
    marginTop: 16,
    minHeight: 44,
    justifyContent: 'center',
  },
  retryText: {
    color: '#922529',
    fontFamily: 'Yekan',
    fontSize: 16,
    textAlign: 'center',
  },
});
