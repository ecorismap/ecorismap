import 'react-native-gesture-handler';
import 'react-native-get-random-values';
import { registerRootComponent } from 'expo';
import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { Platform } from 'react-native';
import App from './src/App';

if (Platform.OS !== 'web') {
  require('./src/backgroundGeolocationHeadlessTask');
}

if (Platform.OS === 'web') {
  const rootTag = createRoot(document.getElementById('root') ?? document.getElementById('main'));
  rootTag.render(createElement(App));
} else {
  registerRootComponent(App);
}
