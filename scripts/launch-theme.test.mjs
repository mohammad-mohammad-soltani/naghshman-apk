import assert from 'node:assert/strict';
import test from 'node:test';
import plugin from '../plugins/with-launch-splash.cjs';

test('removes the separate native logo and hides system bars during launch', () => {
  const result = plugin.configureLaunchTheme({ resources: { style: [{
    $: { name: 'Theme.App.SplashScreen' },
    item: [
      { $: { name: 'windowSplashScreenAnimatedIcon' }, _: '@drawable/splashscreen_logo' },
      { $: { name: 'postSplashScreenTheme' }, _: '@style/AppTheme' },
    ],
  }] } });
  const values = Object.fromEntries(result.resources.style[0].item.map((entry) => [entry.$.name, entry._]));
  assert.equal(values.windowSplashScreenAnimatedIcon, '@android:color/transparent');
  assert.equal(values['android:windowFullscreen'], 'true');
  assert.equal(values.postSplashScreenTheme, '@style/AppTheme');
});
