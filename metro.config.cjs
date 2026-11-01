const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// The launch splash ships as dotLottie files (scripts/build-splash.mjs), which
// Lottie loads natively instead of through the JS bundle.
config.resolver.assetExts.push('lottie');

module.exports = config;
