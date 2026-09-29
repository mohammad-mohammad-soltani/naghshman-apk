const { withAndroidManifest, withAndroidStyles } = require('expo/config-plugins');

// Android still creates its mandatory launch window. Do not show a separate
// centered logo before the full-screen React loading artwork.
function configureLaunchTheme(resources) {
  const theme = resources.resources.style.find(
    (style) => style.$.name === 'Theme.App.SplashScreen',
  );
  if (!theme) throw new Error('Expo splash theme is missing');
  theme.item ??= [];
  for (const [name, value] of Object.entries({
    windowSplashScreenAnimatedIcon: '@android:color/transparent',
    'android:windowFullscreen': 'false',
    'android:statusBarColor': '#c03636',
    'android:windowLightStatusBar': 'false',
  })) {
    const item = theme.item.find((entry) => entry.$.name === name);
    if (item) item._ = value;
    else theme.item.push({ $: { name }, _: value });
  }
  return resources;
}

function configureAndroidManifest(manifest) {
  const application = manifest.manifest.application?.[0];
  if (!application) throw new Error('Android application manifest is missing');
  application.$ ??= {};
  application.$['android:hardwareAccelerated'] = 'true';
  return manifest;
}

module.exports = (config) => {
  config = withAndroidStyles(config, (mod) => {
    mod.modResults = configureLaunchTheme(mod.modResults);
    return mod;
  });
  return withAndroidManifest(config, (mod) => {
    mod.modResults = configureAndroidManifest(mod.modResults);
    return mod;
  });
};
module.exports.configureLaunchTheme = configureLaunchTheme;
module.exports.configureAndroidManifest = configureAndroidManifest;
