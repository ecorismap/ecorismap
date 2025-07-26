import 'react-native-gesture-handler';
import React from 'react';
import { LogBox, Platform } from 'react-native';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Routes from './routes';
import { persistor, store } from './store';
import { StatusBarOverlay } from './components/atoms/StatusBarOverlay';

const IGNORED_LOGS = ['Animated: `useNativeDriver`', 'VirtualizedLists', 'worklet', 'NativeEventEmitter', 'Possible'];

LogBox.ignoreLogs(IGNORED_LOGS);

// Workaround for Expo 45
if (__DEV__ && Platform.OS !== 'web') {
  const withoutIgnored =
    (logger: any) =>
    (...args: any[]) => {
      const output = args.join(' ');

      if (!IGNORED_LOGS.some((log) => output.includes(log))) {
        logger(...args);
      }
    };

  console.log = withoutIgnored(console.log);
  console.info = withoutIgnored(console.info);
  console.warn = withoutIgnored(console.warn);
  console.error = withoutIgnored(console.error);
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Provider store={store}>
        <PersistGate loading={null} persistor={persistor}>
          <>
            <Routes />
            <StatusBarOverlay />
          </>
        </PersistGate>
      </Provider>
    </SafeAreaProvider>
  );
}
