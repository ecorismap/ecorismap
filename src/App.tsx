import 'react-native-gesture-handler';
import React from 'react';
import { LogBox, Platform } from 'react-native';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import Routes from './routes';
import { persistor, store } from './store';

if (Platform.OS !== 'web') {
  LogBox.ignoreLogs([
    // 'the ref',
    // 'Reanimated',
    // 'requestPermissionsAsync',
    // 'Unable to deactivate',
    // 'Unable to activate',
    // 'Overwriting fontFamily style attribute preprocessor',
    'VirtualizedLists',
  ]);
}

export default function App() {
  return (
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <Routes />
      </PersistGate>
    </Provider>
  );
}
