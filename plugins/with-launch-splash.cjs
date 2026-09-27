const { withAndroidStyles } = require('expo/config-plugins');

// Android's mandatory starting window cannot display a full-screen poster.
// Use its matching solid background until the full artwork is ready in React.
module.exports = function withLaunchSplash(config) {
  return withAndroidStyles(config, (mod) => {
    const theme = mod.modResults.resources.style.find(
      (style) => style.$.name === 'Theme.App.SplashScreen',
    );
    if (!theme) throw new Error('Expo splash theme is missing');
    const values = {
      windowSplashScreenAnimatedIcon: '@android:color/transparent',
      'android:windowFullscreen': 'true',
    };
    theme.item ??= [];
    for (const [name, value] of Object.entries(values)) {
      const item = theme.item.find((entry) => entry.$.name === name);
      if (item) item._ = value;
      else theme.item.push({ $: { name }, _: value });
    }
    return mod;
  });
};
