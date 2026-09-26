const { AndroidConfig } = require('expo/config-plugins');

const { createBuildGradlePropsConfigPlugin } = AndroidConfig.BuildProperties;

const withAndroidReleaseProperties = createBuildGradlePropsConfigPlugin(
  [
    ['reactNativeArchitectures', (props) => props.android?.buildArchs?.join(',')],
    ['android.enableMinifyInReleaseBuilds', (props) => props.android?.enableMinifyInReleaseBuilds?.toString()],
    ['android.enableShrinkResourcesInReleaseBuilds', (props) => props.android?.enableShrinkResourcesInReleaseBuilds?.toString()],
    ['android.enableBundleCompression', (props) => props.android?.enableBundleCompression?.toString()],
    ['expo.useLegacyPackaging', (props) => props.android?.useLegacyPackaging?.toString()],
    ['expo.gif.enabled', (props) => props.android?.gifEnabled?.toString()],
    ['expo.webp.enabled', (props) => props.android?.webpEnabled?.toString()],
    ['expo.webp.animated', (props) => props.android?.webpAnimated?.toString()],
  ].map(([propName, propValueGetter]) => ({ propName, propValueGetter })),
  'withAndroidReleaseProperties',
);

module.exports = withAndroidReleaseProperties;
