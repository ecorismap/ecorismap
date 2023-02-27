import React, { useCallback } from 'react';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import Maps from '../components/pages/Maps';
import { MapsContext } from '../contexts/Maps';
import { useScreen } from '../hooks/useScreen';
import { useMaps } from '../hooks/useMaps';
import { useTutrial } from '../hooks/useTutrial';
import { t } from '../i18n/config';
import { Props_Maps } from '../routes';
import { TileMapType } from '../types';
import { usePermission } from '../hooks/usePermission';
import { Alert } from 'react-native';

export default function MapContainer({ navigation }: Props_Maps) {
  const {
    maps,
    editedMap,
    isOffline,
    isMapEditorOpen,
    openEditMap,
    closeEditMap,
    saveMap,
    deleteMap,
    changeVisible,
    changeMapOrder,
    toggleOnline,
  } = useMaps();
  const { closeData } = useScreen();
  const { runTutrial } = useTutrial();
  const { isMemberAndProjectOpened, projectOpened } = usePermission();

  const pressToggleOnline = useCallback(async () => {
    if (isOffline) {
      await runTutrial('MAPS_BTN_OFFLINE');
    } else {
      //await runTutrial('MAPS_BTN_ONLINE');
    }
    toggleOnline();
  }, [isOffline, runTutrial, toggleOnline]);

  const pressDeleteMap = useCallback(
    async (item: TileMapType) => {
      const ret = await ConfirmAsync(t('Maps.confirm.deleteMap'));
      if (ret) {
        const { isOK, message } = await deleteMap(item);
        if (!isOK) {
          await AlertAsync(message);
        }
      }
    },
    [deleteMap]
  );

  const pressDownloadMap = useCallback(
    (item: TileMapType) => {
      closeData();
      navigation.navigate('Home', {
        tileMap: item,
      });
    },
    [closeData, navigation]
  );

  const pressOpenEditMap = useCallback(
    async (editTileMap: TileMapType | null) => {
      const { isOK, message } = openEditMap(editTileMap);
      if (!isOK) {
        await AlertAsync(message);
      }
    },
    [openEditMap]
  );

  const pressEditMapOK = useCallback(
    async (newTileMap: TileMapType) => {
      if (isMemberAndProjectOpened) {
        Alert.alert('', t('hooks.message.onlyAdminCanEdit'));
        return;
      }
      if (projectOpened) {
        Alert.alert(t('hooks.message.lockProject'));
        return;
      }
      saveMap(newTileMap);
    },
    [isMemberAndProjectOpened, projectOpened, saveMap]
  );

  const pressEditMapCancel = useCallback(() => {
    closeEditMap();
  }, [closeEditMap]);

  const gotoMapList = useCallback(() => {
    navigation.navigate('MapList');
  }, [navigation]);

  return (
    <MapsContext.Provider
      value={{
        isOffline,
        maps,
        editedMap,
        isMapEditorOpen,
        changeVisible,
        changeMapOrder,
        pressToggleOnline,
        pressDownloadMap,
        pressDeleteMap,
        pressOpenEditMap,
        pressEditMapOK,
        pressEditMapCancel,
        gotoMapList,
      }}
    >
      <Maps />
    </MapsContext.Provider>
  );
}
