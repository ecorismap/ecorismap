const { getDefaultConfig } = require('expo/metro-config');

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('db');

module.exports = config;
