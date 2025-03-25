module.exports = function (api) {
  api.cache(true);

  const plugins = [
    '@babel/plugin-proposal-export-namespace-from',
  ];

  if (process.env.PLATFORM === 'web') {
    plugins.push(['babel-plugin-transform-define', { __DEV__: __DEV__ }]);
  }

  plugins.push('react-native-reanimated/plugin');

  return {
    presets: ['babel-preset-expo'],
    plugins,
  };
};
