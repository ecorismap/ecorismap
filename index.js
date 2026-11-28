import 'react-native-gesture-handler';
import 'react-native-get-random-values';
import { registerRootComponent } from 'expo';
import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { LogBox, Platform } from 'react-native';
import App from './src/App';

if (Platform.OS !== 'web') {
  require('./src/backgroundGeolocationHeadlessTask');
}

// E2E（Maestro）で流すときは、開発ビルドの警告・エラーのトーストを出さない。トーストは下部のボタンに重なり、
// 閉じようとして本体を押すとMac側でReact Native DevToolsが開く。EXPO_PUBLIC_E2E=1 でMetroを起動したときだけ効く
if (__DEV__ && process.env.EXPO_PUBLIC_E2E === '1') {
  LogBox.ignoreAllLogs(true);
}

if (Platform.OS === 'web') {
  const rootTag = createRoot(document.getElementById('root') ?? document.getElementById('main'));
  rootTag.render(createElement(App));
} else {
  registerRootComponent(App);
}
