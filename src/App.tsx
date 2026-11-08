import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as NavigationBar from 'expo-navigation-bar';
import Routes from './routes';
import { persistor, store } from './store';
import { StatusBarOverlay } from './components/atoms/StatusBarOverlay';
import { ExportDestinationModal } from './components/organisms/ExportDestinationModal';
import { StyledDialog } from './components/molecules/StyledDialog';
import { TileSignatureSync } from './components/atoms/TileSignatureSync';
import { runDemSourceMigration } from './utils/demSourceMigration';
import { setTileMapsAction } from './modules/tileMaps';
import { dropUnsafeTileMaps } from './utils/tileMapId';
import { TileMapType } from './types';

// 検証導入前に取り込まれて永続化された地図にも、保存先フォルダ（TILE_FOLDER/{id}）の外を指すIDが
// 残っている可能性があるため、復元直後（地図IDでタイルを消す標高データ移行より前）に取り除く
const dropUnsafePersistedTileMaps = () => {
  const tileMaps: TileMapType[] | undefined = store.getState().tileMaps;
  if (!Array.isArray(tileMaps)) return;
  const safeTileMaps = dropUnsafeTileMaps(tileMaps);
  if (safeTileMaps.length < tileMaps.length) store.dispatch(setTileMapsAction(safeTileMaps));
};

export default function App() {
  useEffect(() => {
    if (Platform.OS === 'android') {
      // SDK 56: setBackgroundColorAsync/setButtonStyleAsync are removed. With edge-to-edge
      // (now the default) the navigation bar is transparent automatically; setStyle controls button icons.
      NavigationBar.setStyle('light');
    }
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Provider store={store}>
          <PersistGate
            loading={null}
            persistor={persistor}
            onBeforeLift={() => {
              dropUnsafePersistedTileMaps();
              runDemSourceMigration(store);
            }}
          >
            <>
              <Routes />
              <TileSignatureSync />
              <StatusBarOverlay />
              <ExportDestinationModal />
              <StyledDialog />
            </>
          </PersistGate>
        </Provider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
