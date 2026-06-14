module.exports = function (api) {
  api.cache(true);

  const plugins = [
    '@babel/plugin-proposal-export-namespace-from',
  ];

  plugins.push('react-native-worklets/plugin');

  return {
    presets: ['babel-preset-expo'],
    plugins,
  };
};
