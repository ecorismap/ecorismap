const createExpoWebpackConfigAsync = require('@expo/webpack-config');

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
  return config;
};
