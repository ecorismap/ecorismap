import React, { useCallback, useState } from 'react';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import Maps from '../components/pages/Maps';
import { MapsContext } from '../contexts/Maps';
import { useMaps } from '../hooks/useMaps';
import { useTutrial } from '../hooks/useTutrial';
import { t } from '../i18n/config';
import { Props_Maps } from '../routes';
import { TileMapType, boundaryType } from '../types';
import { exportFile } from '../utils/File';
import dayjs from 'dayjs';
import * as DocumentPicker from 'expo-document-picker';
import { getExt } from '../utils/General';
import { Platform } from 'react-native';

export default function MapContainer({ navigation }: Props_Maps) {
  const {
    progress,
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
    importMapFile,
  } = useMaps();
  const [isLoading, setIsLoading] = useState(false);
  const { runTutrial } = useTutrial();

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
    async (item: TileMapType) => {
      const protocol = item.url.split(':')[0];
      if (protocol === 'http' || protocol === 'https' || protocol === 'pmtiles') {
        const ext = getExt(item.url)?.toLowerCase();
        if (ext === 'pdf') {
          setIsLoading(true);
          const { message } = await importMapFile(item.url, item.name, ext, item.id);
          setIsLoading(false);
          if (message !== '') await AlertAsync(message);
        } else {
          navigation.navigate('Home', {
            tileMap: item,
            previous: 'Maps',
            mode: 'downloadMap',
          });
        }
      }
    },
    [importMapFile, navigation]
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
      saveMap(newTileMap);
    },
    [saveMap]
  );

  const pressEditMapCancel = useCallback(() => {
    closeEditMap();
  }, [closeEditMap]);

  const pressImportMaps = useCallback(async () => {
    const file = await DocumentPicker.getDocumentAsync({});
    if (file.assets === null) return;
    const name = file.assets[0].name;
    const uri = file.assets[0].uri;
    const ext = getExt(name)?.toLowerCase();
    if (!(ext === 'json' || ext === 'pdf')) {
      await AlertAsync(t('hooks.message.wrongExtension'));
      return;
    }
    if (Platform.OS === 'web' && ext === 'pdf') {
      await AlertAsync(t('hooks.message.notSupportPDF'));
      return;
    }
    setIsLoading(true);
    setTimeout(async () => {
      const { message } = await importMapFile(uri, name, ext);
      if (message !== '') await AlertAsync(message);
      setIsLoading(false);
    }, 10);
  }, [importMapFile]);

  const pressExportMaps = useCallback(async () => {
    const time = dayjs().format('YYYY-MM-DD_HH-mm-ss');
    const mapSettings = JSON.stringify(maps);
    const fileName = `maps_${time}.json`;
    const isOK = await exportFile(mapSettings, fileName);
    if (!isOK && Platform.OS !== 'web') await AlertAsync(t('hooks.message.failExport'));
  }, [maps]);

  const gotoMapList = useCallback(() => {
    navigation.navigate('MapList');
  }, [navigation]);

  const jumpToBoundary = useCallback(
    (boundary: boundaryType | undefined) => {
      if (boundary === undefined) return;
      navigation.navigate('Home', {
        previous: 'Maps',
        jumpTo: {
          latitude: boundary.center.latitude,
          longitude: boundary.center.longitude,
          latitudeDelta: 0.001, //デタラメな値だが,changeMapRegionで計算しなおす。svgの変換で正しい値が必要
          longitudeDelta: 0.001,
          zoom: boundary.zoom,
        },
        mode: 'jumpTo',
      });
    },
    [navigation]
  );

  return (
    <MapsContext.Provider
      value={{
        progress,
        isLoading,
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
        pressImportMaps,
        pressExportMaps,
        jumpToBoundary,
      }}
    >
      <Maps />
    </MapsContext.Provider>
  );
}
