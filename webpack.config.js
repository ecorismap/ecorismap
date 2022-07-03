const createExpoWebpackConfigAsync = require('@expo/webpack-config');

module.exports = async function (env, argv) {
  let config = await createExpoWebpackConfigAsync(
    {
      ...env,
      babel: {
        dangerouslyAddModulePathsToTranspile: ['react-map-gl'], // this line!
      },
    },
    argv
  );

  const wasmExtensionRegExp = /\.wasm$/;

  config.resolve.extensions.push('.wasm');

  //node_modules/@expo/webpack-config/webpack/loaders/createAllLoaders.jsのfile-loaderで
  // export default **** のwasmがstatic/media/の中に作られて、それを読み込もうとしてエラーになるので
  //wasmをそこでは処理しないようにexcludeに追加する。

  config.module.rules.forEach((rule) => {
    (rule.oneOf || []).forEach((oneOf) => {
      if (oneOf.loader && oneOf.loader.indexOf('file-loader') >= 0) {
        // make file-loader ignore WASM files
        oneOf.exclude.push(wasmExtensionRegExp);
      }
    });
  });

  //あらためて自分でfile-loaderを設定すると、wasmのバイナリデータのままstatic/jsに出力されるので、
  //問題なく読み込めるようになる。
  config.module.rules.push({
    test: wasmExtensionRegExp,
    type: 'javascript/auto',
    use: [{ loader: require.resolve('file-loader'), options: { outputPath: 'static/js' } }],
  });

  return config;
};
