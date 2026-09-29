import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  offline: boolean;
  redirect: boolean;
  retrying: boolean;
  onRetry: () => void;
};

export function WebLoadError({ offline, redirect, retrying, onRetry }: Props) {
  const title = offline ? 'اتصال اینترنت قطع است' : 'صفحه باز نشد';
  const message = offline
    ? 'اینترنت را بررسی کن؛ پس از اتصال، دوباره تلاش می‌کنیم.'
    : redirect
      ? 'صفحهٔ ورود درست باز نشد. برای شروع دوباره، تلاش مجدد را بزن.'
      : 'ارتباط با سایت برقرار نشد. چند لحظه بعد دوباره تلاش کن.';
  return (
    <View style={styles.screen} accessibilityLiveRegion="polite">
      <View style={styles.card}>
        <View style={styles.symbol}><Text style={styles.symbolText}>!</Text></View>
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="تلاش مجدد"
          accessibilityState={{ disabled: retrying, busy: retrying }}
          disabled={retrying}
          onPress={onRetry}
          style={[styles.button, retrying && styles.disabled]}
        >
          <Text style={styles.buttonText}>{retrying ? 'در حال اتصال…' : 'تلاش مجدد'}</Text>
        </Pressable>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff7f5', justifyContent: 'center', padding: 28 },
  card: { alignItems: 'center', padding: 24, backgroundColor: '#ffffff', borderRadius: 24 },
  symbol: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fee2e2', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  symbolText: { color: '#b91c1c', fontSize: 32, fontWeight: '700' },
  title: { fontFamily: 'Yekan', fontSize: 21, color: '#292524', textAlign: 'center', marginBottom: 12 },
  message: { fontFamily: 'Yekan', fontSize: 15, lineHeight: 26, color: '#57534e', textAlign: 'center', marginBottom: 24 },
  button: { backgroundColor: '#c03636', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28, minWidth: 170, alignItems: 'center' },
  disabled: { opacity: 0.65 },
  buttonText: { fontFamily: 'Yekan', color: '#ffffff', fontSize: 16 },
});
