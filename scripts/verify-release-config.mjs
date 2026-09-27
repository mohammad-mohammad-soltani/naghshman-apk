import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const app = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8')).expo;
const buildProperties = app.plugins.find(
  (plugin) => Array.isArray(plugin) && plugin[0] === './plugins/with-android-release-properties.cjs',
)?.[1]?.android;

test('configures the Meydan launcher and splash assets', () => {
  assert.equal(app.icon, './assets/images/meydan-icon.png');
  assert.equal(app.android.adaptiveIcon.foregroundImage, './assets/images/meydan-icon-foreground.png');
  assert.equal(app.android.adaptiveIcon.backgroundColor, '#dc2626');
  assert.equal(app.backgroundColor, '#dc2626');
  assert.equal(app.primaryColor, '#dc2626');

  const splashPlugin = app.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen',
  )?.[1];
  assert.equal(splashPlugin.backgroundColor, '#c03636');
  assert.equal(splashPlugin.image, './assets/images/native-splash-map.png');

  for (const path of [
    '../assets/images/meydan-icon.png',
    '../assets/images/meydan-icon-foreground.png',
    '../assets/images/splash-dotless.jpg',
    '../assets/images/native-splash-map.png',
  ]) {
    assert.equal(existsSync(new URL(path, import.meta.url)), true, `${path} must exist`);
  }
});

test('configures an optimized arm64 release', () => {
  assert.deepEqual(buildProperties.buildArchs, ['arm64-v8a']);
  assert.equal(buildProperties.enableMinifyInReleaseBuilds, true);
  assert.equal(buildProperties.enableShrinkResourcesInReleaseBuilds, true);
  assert.equal(buildProperties.enableBundleCompression, true);
  assert.equal(buildProperties.useLegacyPackaging, true);
  assert.equal(buildProperties.gifEnabled, false);
  assert.equal(buildProperties.webpEnabled, false);
  assert.equal(buildProperties.webpAnimated, false);
  assert.equal(buildProperties.releasePaddingMiB, 24);
  assert.equal(app.android.package, 'ir.naghshman.app');
  assert.equal(Number.isInteger(app.android.versionCode) && app.android.versionCode > 0, true);
});
