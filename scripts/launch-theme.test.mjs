import assert from 'node:assert/strict';
import test from 'node:test';
import plugin from '../plugins/with-launch-splash.cjs';

test('removes the native logo and keeps the status bar on the white/black launch sheet', () => {
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
  assert.equal(values['android:statusBarColor'], '@color/splashscreen_background');
  assert.equal(values['android:windowLightStatusBar'], '@bool/launch_light_status_bar');
  assert.equal(values.postSplashScreenTheme, '@style/AppTheme');
});


test('uses dark status-bar icons on the white sheet and light ones on black', () => {
  assert.match(plugin.launchStatusBarBools(false), /<bool name="launch_light_status_bar">true<\/bool>/);
  assert.match(plugin.launchStatusBarBools(true), /<bool name="launch_light_status_bar">false<\/bool>/);
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
