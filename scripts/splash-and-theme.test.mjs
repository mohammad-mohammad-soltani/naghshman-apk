import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
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
