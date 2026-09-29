import assert from 'node:assert/strict';
import test from 'node:test';
import plugin from '../plugins/with-launch-splash.cjs';

test('removes the separate native logo and keeps a branded status bar during launch', () => {
  const result = plugin.configureLaunchTheme({ resources: { style: [{
    $: { name: 'Theme.App.SplashScreen' },
    item: [
      { $: { name: 'windowSplashScreenAnimatedIcon' }, _: '@drawable/splashscreen_logo' },
      { $: { name: 'postSplashScreenTheme' }, _: '@style/AppTheme' },
    ],
  }] } });
  const values = Object.fromEntries(result.resources.style[0].item.map((entry) => [entry.$.name, entry._]));
  assert.equal(values.windowSplashScreenAnimatedIcon, '@android:color/transparent');
  assert.equal(values['android:windowFullscreen'], 'false');
  assert.equal(values['android:statusBarColor'], '#c03636');
  assert.equal(values['android:windowLightStatusBar'], 'false');
  assert.equal(values.postSplashScreenTheme, '@style/AppTheme');
});


test('keeps Android hardware acceleration enabled for WebView rendering', () => {
  const result = plugin.configureAndroidManifest({
    manifest: {
      application: [{ $: {} }],
    },
  });
  assert.equal(
    result.manifest.application[0].$['android:hardwareAccelerated'],
    'true',
  );
});
