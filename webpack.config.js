const createExpoWebpackConfigAsync = require('@expo/webpack-config');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = async function (env, argv) {
  const config = await createExpoWebpackConfigAsync(
    {
      ...env,
      babel: { dangerouslyAddModulePathsToTranspile: ['@gorhom'] },
    },
    argv
  );

  // https://github.com/webpack/webpack/issues/11467#issuecomment-691873586
  config.module.rules.push({
    test: /.m?js/,
    resolve: {
      fullySpecified: false,
    },
  });

  // https://github.com/expo/expo-webpack-integrations/issues/10
  //  from "react-native-reanimated": "^3.14.0",
  config.module.rules.forEach((rule) => {
    if (rule.oneOf instanceof Array) {
      rule.oneOf[rule.oneOf.length - 1].exclude = [/\.(js|mjs|jsx|cjs|ts|tsx)$/, /\.html$/, /\.json$/];
    }
    return rule;
  });

  // gdal3.js の設定を追加
  if (!config.plugins) {
    config.plugins = [];
  }
  config.plugins.push(
    new CopyWebpackPlugin({
      patterns: [
        { from: 'node_modules/gdal3.js/dist/package/gdal3.js', to: 'static' },
        { from: 'node_modules/gdal3.js/dist/package/gdal3WebAssembly.wasm', to: 'static' },
        { from: 'node_modules/gdal3.js/dist/package/gdal3WebAssembly.data', to: 'static' },
      ],
    })
  );

  //geotiff.js の設定を追加
  config.resolve.fallback = {
    ...config.resolve.fallback,
    fs: false,
    https: false,
    url: false,
    http: false,
  };

  return config;
};
