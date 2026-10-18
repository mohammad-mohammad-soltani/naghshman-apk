import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
test('native theme reporter uses the stored web theme and hard-locks light to white', () => {
  const source = readFileSync(new URL('src/components/native-web-shell.tsx', root), 'utf8');
  assert.match(source, /localStorage\.getItem\('meydan-theme'\)/);
  assert.match(source, /explicitTheme === 'light'/);
  assert.match(source, /theme === 'light'[\s\S]*\? '#ffffff'/);
  assert.match(source, /meydan-theme-change'[\s\S]*event && event\.detail/);
});


test('light web theme drives white system bars and releases the launch overlay', () => {
  const source = readFileSync(new URL('src/components/native-web-shell.tsx', root), 'utf8');
  assert.match(source, /action\.theme === "light" \? "#ffffff" : action\.color/);
  assert.match(source, /const lightWebTheme =[\s\S]*safeAreaBackground === "#ffffff"/);
  assert.match(source, /style=\{lightWebTheme \? "dark" : "light"\}/);
  assert.match(source, /visible=\{launchSplashVisible\}/);
  assert.doesNotMatch(source, /visible=\{true\}\s*\/\/ launchSplashVisible/);
});


test('light theme starts white and theme changes explicitly resync native system bars', () => {
  const source = readFileSync(new URL('src/components/native-web-shell.tsx', root), 'utf8');
  assert.match(source, /useState\("#ffffff"\)/);
  assert.match(source, /window\.addEventListener\('meydan-theme-change',[\s\S]*event && event\.detail/);
  assert.match(source, /style=\{lightWebTheme \? "dark" : "light"\}/);
});


test('splash keeps the system chrome on the white or black splash background', () => {
  const source = readFileSync(new URL('src/components/native-web-shell.tsx', root), 'utf8');
  assert.match(source, /const systemChromeBackground = splashOverlayMounted[\s\S]*\? splashBackground[\s\S]*: safeAreaBackground/);
  assert.match(source, /const splashBackground = SPLASH_BACKGROUND\[splashTheme\]/);
  assert.doesNotMatch(source, /#c03636|LAUNCH_BACKGROUND/);
  assert.match(source, /backgroundColor=\{systemChromeBackground\}/);
  assert.match(source, /styles\.safeArea, \{ backgroundColor: systemChromeBackground \}/);
});


test('light mode can never report an interpolated or stale gray system-bar color', () => {
  const source = readFileSync(new URL('src/components/native-web-shell.tsx', root), 'utf8');
  const lightLocks = source.match(/theme === 'light'[\s\S]{0,120}\? '#ffffff'/g) ?? [];
  assert.ok(lightLocks.length >= 2, 'both continuous and one-shot reporters must hard-lock light to white');
});


test('native shell enables hardware rendering and strips the expensive blur animation only in-app', () => {
  const source = readFileSync(new URL('src/components/native-web-shell.tsx', root), 'utf8');
  assert.match(source, /androidLayerType=\{Platform\.OS === "android" \? "hardware" : undefined\}/);
  assert.match(source, /naghshman-native-performance/);
  assert.match(source, /read-more-reveal-open/);
  assert.match(source, /filter: none !important/);
  assert.match(source, /will-change: transform, opacity/);
});


test('releases the OS splash from the React overlay layout without waiting for the animation', () => {
  const source = readFileSync(new URL('src/components/launch-splash.tsx', root), 'utf8');
  assert.match(source, /onLayout=\{\(\{ nativeEvent \}\) => \{/);
  assert.match(source, /if \(nativeEvent\.layout\.width > 0\) onReady\(\)/);
  assert.doesNotMatch(source, /isNativeSplashReady/);
});


test('plays the Lottie splash through once (capped) while the WebView warms visible media', () => {
  const source = readFileSync(new URL('src/components/native-web-shell.tsx', root), 'utf8');

  assert.match(source, /if \(!nativeSplashReleased \|\| splashAnimationFinished\) return/);
  assert.match(source, /setTimeout\(\(\) => \{[\s\S]*setSplashAnimationFinished\(true\)[\s\S]*SPLASH_ANIMATION_CAP_MS/);
  assert.match(source, /isLaunchSplashVisible\([\s\S]*splashAnimationFinished,[\s\S]*launchOffline/);
  assert.match(source, /onAnimationFinish=\{handleSplashAnimationFinish\}/);

  assert.match(source, /__naghshmanLaunchMediaWarmup/);
  assert.match(source, /image\.loading = 'eager'/);
  assert.match(source, /image\.fetchPriority = 'high'/);
  assert.match(source, /video\.preload = 'auto'/);
  assert.match(source, /warmedImages >= 8/);
  assert.match(source, /warmedVideos >= 2/);
});


test('never opens the WebView before the launch probe reached the site', () => {
  const source = readFileSync(new URL('src/components/native-web-shell.tsx', root), 'utf8');
  assert.match(source, /nativeAuthStateResolved &&\s*initialWebUrl &&\s*launchGate\.status === "online" \?/);
  assert.match(source, /checkForSplashUpdate\(APP_URL, splashTheme, controller\.signal\)/);
  assert.match(source, /setTimeout\(\s*\(\) => controller\.abort\(\),\s*LAUNCH_PROBE_TIMEOUT_MS,?\s*\)/);
  assert.match(source, /if \(nativePlatform\) saveSplashTheme\(action\.theme\)/);
});
