module.exports = {
  presets: ['babel-preset-expo'],
  plugins: ['@babel/plugin-proposal-export-namespace-from',
    ['babel-plugin-transform-define', { __DEV__: __DEV__ }],
    'react-native-reanimated/plugin'],
};
