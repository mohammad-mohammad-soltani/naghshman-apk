const fs = require('node:fs');
const path = require('node:path');
const {
  withAndroidManifest,
  withAndroidStyles,
  withDangerousMod,
} = require('expo/config-plugins');

const LIGHT_STATUS_BAR_BOOL = 'launch_light_status_bar';

// Android still creates its mandatory launch window. Keep it a plain white
// (or black, in system dark mode) sheet without a separate centered logo: the
// React Lottie splash draws on the same background right after it.
function configureLaunchTheme(resources) {
  const theme = resources.resources.style.find(
    (style) => style.$.name === 'Theme.App.SplashScreen',
  );
  if (!theme) throw new Error('Expo splash theme is missing');
  theme.item ??= [];
  for (const [name, value] of Object.entries({
    windowSplashScreenAnimatedIcon: '@android:color/transparent',
    'android:windowFullscreen': 'false',
    // `splashscreen_background` has a values-night variant from expo-splash-screen.
    'android:statusBarColor': '@color/splashscreen_background',
    'android:windowLightStatusBar': `@bool/${LIGHT_STATUS_BAR_BOOL}`,
  })) {
    const item = theme.item.find((entry) => entry.$.name === name);
    if (item) item._ = value;
    else theme.item.push({ $: { name }, _: value });
  }
  return resources;
}

function launchStatusBarBools(night) {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <bool name="${LIGHT_STATUS_BAR_BOOL}">${night ? 'false' : 'true'}</bool>
</resources>
`;
}

function writeLaunchStatusBarBools(resDir) {
  for (const [folder, night] of [['values', false], ['values-night', true]]) {
    const dir = path.join(resDir, folder);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'launch_status_bar.xml'),
      launchStatusBarBools(night),
    );
  }
}

// The splash animations reach Lottie as raw resources looked up by name from
// JS (see scripts/build-splash.mjs), which the release resource shrinker
// cannot see. Keep them explicitly.
const SPLASH_RAW_KEEP = `<?xml version="1.0" encoding="utf-8"?>
<resources xmlns:tools="http://schemas.android.com/tools"
  tools:keep="@raw/assets_splash_splash*" />
`;

function writeSplashRawKeep(resDir) {
  const dir = path.join(resDir, 'raw');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'launch_splash_keep.xml'), SPLASH_RAW_KEEP);
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
  config = withDangerousMod(config, [
    'android',
    (mod) => {
      const resDir = path.join(
        mod.modRequest.platformProjectRoot,
        'app/src/main/res',
      );
      writeLaunchStatusBarBools(resDir);
      writeSplashRawKeep(resDir);
      return mod;
    },
  ]);
  return withAndroidManifest(config, (mod) => {
    mod.modResults = configureAndroidManifest(mod.modResults);
    return mod;
  });
};
module.exports.configureLaunchTheme = configureLaunchTheme;
module.exports.configureAndroidManifest = configureAndroidManifest;
module.exports.launchStatusBarBools = launchStatusBarBools;
module.exports.SPLASH_RAW_KEEP = SPLASH_RAW_KEEP;
