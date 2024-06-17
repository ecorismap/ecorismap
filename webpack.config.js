const createExpoWebpackConfigAsync = require('@expo/webpack-config');

module.exports = async function (env, argv) {
  const config = await createExpoWebpackConfigAsync(
    {
      ...env,
      babel: { dangerouslyAddModulePathsToTranspile: ['@gorhom'] },
    },
    argv
  );
  config.module.rules.push({
    test: /.m?js/,
    resolve: {
      fullySpecified: false,
    },
  });
  return config;
};
