const { mkdirSync, writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');

const { AndroidConfig, withDangerousMod } = require('expo/config-plugins');

const { createBuildGradlePropsConfigPlugin } = AndroidConfig.BuildProperties;

const withBuildGradleProperties = createBuildGradlePropsConfigPlugin(
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

function createReleasePadding(outputPath, bytes) {
  const buffer = Buffer.allocUnsafe(bytes);
  let value = 0x6d2b79f5;

  for (let offset = 0; offset < bytes; offset += 4) {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    const remaining = Math.min(4, bytes - offset);
    for (let byte = 0; byte < remaining; byte += 1) {
      buffer[offset + byte] = (value >>> (byte * 8)) & 0xff;
    }
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, buffer);
}

function withAndroidReleaseProperties(config, props) {
  const configured = withBuildGradleProperties(config, props);
  const paddingMiB = props?.android?.releasePaddingMiB ?? 0;

  return withDangerousMod(configured, [
    'android',
    async (modConfig) => {
      if (paddingMiB > 0) {
        const outputPath = join(
          modConfig.modRequest.platformProjectRoot,
          'app/src/main/assets/release-size-pad.bin',
        );
        createReleasePadding(outputPath, paddingMiB * 1024 * 1024);
      }
      return modConfig;
    },
  ]);
}

module.exports = withAndroidReleaseProperties;
module.exports.createReleasePadding = createReleasePadding;
