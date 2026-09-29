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


test('splash keeps the system chrome on the brand red independently of light web theme', () => {
  const source = readFileSync(new URL('src/components/native-web-shell.tsx', root), 'utf8');
  assert.match(source, /const systemChromeBackground = splashOverlayMounted[\s\S]*\? LAUNCH_BACKGROUND[\s\S]*: safeAreaBackground/);
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


test('releases the OS splash from the React overlay layout without waiting for SVG image load', () => {
  const source = readFileSync(new URL('src/components/launch-splash.tsx', root), 'utf8');
  assert.match(source, /onLayout=\{\(\{ nativeEvent \}\) => \{/);
  assert.match(source, /if \(width > 0\)[\s\S]*onReady\(\)/);
  assert.doesNotMatch(source, /onLoad=\{handleArtworkLoaded\}/);
  assert.doesNotMatch(source, /artworkLoaded/);
  assert.doesNotMatch(source, /isNativeSplashReady/);
});


test('keeps the SVG splash visible for at least two seconds while the WebView warms visible media', () => {
  const source = readFileSync(new URL('src/components/native-web-shell.tsx', root), 'utf8');

  assert.match(source, /const MIN_CUSTOM_SPLASH_MS = 2000/);
  assert.match(source, /if \(!nativeSplashReleased \|\| minimumCustomSplashElapsed\) return/);
  assert.match(source, /setTimeout\(\(\) => \{[\s\S]*setMinimumCustomSplashElapsed\(true\)[\s\S]*MIN_CUSTOM_SPLASH_MS/);
  assert.match(source, /isLaunchSplashVisible\([\s\S]*minimumCustomSplashElapsed/);

  assert.match(source, /__naghshmanLaunchMediaWarmup/);
  assert.match(source, /image\.loading = 'eager'/);
  assert.match(source, /image\.fetchPriority = 'high'/);
  assert.match(source, /video\.preload = 'auto'/);
  assert.match(source, /warmedImages >= 8/);
  assert.match(source, /warmedVideos >= 2/);
});
