import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { LogBox, Platform } from 'react-native';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as NavigationBar from 'expo-navigation-bar';
import Routes from './routes';
import { persistor, store } from './store';
import { StatusBarOverlay } from './components/atoms/StatusBarOverlay';
import {
  checkAsyncStorageData,
  isMigrationCompleted,
  isMigrationSkipped,
  StorageInfo,
} from './utils/storageMigration';

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

  /* eslint-disable no-console */
  console.log = withoutIgnored(console.log);
  console.info = withoutIgnored(console.info);
  console.warn = withoutIgnored(console.warn);
  console.error = withoutIgnored(console.error);
  /* eslint-enable no-console */
}

// 動的インポート用のコンポーネント
const StorageMigrationDialog = Platform.OS !== 'web' 
  ? require('./components/organisms/StorageMigrationDialog').StorageMigrationDialog
  : null;

export default function App() {
  const [showMigrationDialog, setShowMigrationDialog] = useState(false);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);

  useEffect(() => {
    if (Platform.OS === 'android') {
      // Android の NavigationBar の設定
      NavigationBar.setBackgroundColorAsync('#00000000');
      NavigationBar.setButtonStyleAsync('light'); // ボタンを白に
    }
  }, []);

  useEffect(() => {
    // ストレージ移行チェック（モバイル版のみ）
    const checkMigration = async () => {
      // Web版では実行しない
      if (Platform.OS === 'web') {
        return;
      }

      try {
        // 既に移行済みまたはスキップ済みの場合
        if (isMigrationCompleted() || isMigrationSkipped()) {
          return;
        }

        // AsyncStorageにデータがあるか確認
        const info = await checkAsyncStorageData();
        if (info.hasData) {
          setStorageInfo(info);
          setShowMigrationDialog(true);
        }
      } catch (error) {
        // Migration check failed
      }
    };

    checkMigration();
  }, []);

  const handleMigrationComplete = () => {
    // 移行完了後、アプリをリロード
    persistor.purge().then(() => {
      persistor.persist();
    });
  };

  return (
    <SafeAreaProvider>
      <Provider store={store}>
        <PersistGate loading={null} persistor={persistor}>
          <>
            <Routes />
            <StatusBarOverlay />
            {Platform.OS !== 'web' && storageInfo && StorageMigrationDialog && (
              <StorageMigrationDialog
                visible={showMigrationDialog}
                storageInfo={storageInfo}
                onClose={() => setShowMigrationDialog(false)}
                onMigrationComplete={handleMigrationComplete}
              />
            )}
          </>
        </PersistGate>
      </Provider>
    </SafeAreaProvider>
  );
}
