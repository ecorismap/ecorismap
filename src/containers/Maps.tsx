import React, { useCallback, useState } from 'react';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import Maps from '../components/pages/Maps';
import { MapsContext } from '../contexts/Maps';
import { useMaps } from '../hooks/useMaps';
import { useTutrial } from '../hooks/useTutrial';
import { t } from '../i18n/config';
import { Props_Maps } from '../routes';
import { boundaryType, TileMapType } from '../types';
import dayjs from 'dayjs';
import * as DocumentPicker from 'expo-document-picker';
import { getExt } from '../utils/General';
import { Platform } from 'react-native';
import { TILE_FOLDER } from '../constants/AppConstants';
import { readAsStringAsync } from 'expo-file-system';
import { db } from '../utils/db';
import { MapModalTileMap } from '../components/organisms/MapModalTileMap';
import * as FileSystem from 'expo-file-system';
import { exportFileFromData } from '../utils/File';
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
    importStyleFile,
    changeExpand,
    getPmtilesBoundary,
    updateMapOrder,
    onDragBegin,
  } = useMaps();
  const [isLoading, setIsLoading] = useState(false);
  const { runTutrial } = useTutrial();

  const pressToggleOnline = useCallback(async () => {
    if (isOffline) {
      //await runTutrial('MAPS_BTN_OFFLINE');
    } else {
      await runTutrial('MAPS_BTN_ONLINE');
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
      if (protocol === 'http' || protocol === 'https' || protocol === 'pmtiles' || protocol === 'pdf') {
        const ext = getExt(item.url)?.toLowerCase();
        if (ext === 'pdf' || item.url.startsWith('pdf://')) {
          setIsLoading(true);
          const { message } = await importMapFile(item.url, item.name, ext, item.id, item.encryptKey);
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
      //pmTilesの場合、boundaryを取得して保存する
      if (newTileMap.url.includes('pmtiles')) {
        const { header, boundary } = await getPmtilesBoundary(newTileMap.url);
        if (Platform.OS === 'web') {
          await db.pmtiles.update(newTileMap.id, {
            boundary: JSON.stringify(boundary),
          });
        } else {
          await FileSystem.makeDirectoryAsync(`${TILE_FOLDER}/${newTileMap.id}`, {
            intermediates: true,
          });
          const boundaryUri = `${TILE_FOLDER}/${newTileMap.id}/boundary.json`;
          await FileSystem.writeAsStringAsync(boundaryUri, JSON.stringify(boundary));
        }

        //newTileMap.overzoomThreshold = header ? header.maxZoom : 16;
        newTileMap.minimumZ = header ? header.minZoom : 4;
        newTileMap.maximumZ = header ? header.maxZoom : 16;
      }
      //urlが変更された場合、boundaryとcacheを削除する
      if (editedMap?.url !== newTileMap.url) {
        if (Platform.OS === 'web') {
          await db.pmtiles.delete(newTileMap.id);
        } else {
          await FileSystem.deleteAsync(`${TILE_FOLDER}/${newTileMap.id}`, { idempotent: true });
        }
      }
      saveMap(newTileMap);
    },
    [editedMap?.url, getPmtilesBoundary, saveMap]
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
    if (!(ext === 'json' || ext === 'pdf' || ext === 'pmtiles')) {
      await AlertAsync(t('hooks.message.wrongExtension'));
      return;
    }
    setIsLoading(true);
    setTimeout(async () => {
      const { message } = await importMapFile(uri, name, ext);
      setIsLoading(false);
      if (message !== '') await AlertAsync(message);
    }, 10);
  }, [importMapFile]);

  const pressImportStyle = useCallback(
    async (tileMap: TileMapType) => {
      const file = await DocumentPicker.getDocumentAsync({});
      if (file.assets === null) return;
      const name = file.assets[0].name;
      const uri = file.assets[0].uri;
      const ext = getExt(name)?.toLowerCase();
      if (!(ext === 'json')) {
        await AlertAsync(t('hooks.message.wrongExtension'));
        return;
      }
      const { message } = await importStyleFile(uri, name, tileMap);
      if (message !== '') await AlertAsync(message);
    },
    [importStyleFile]
  );

  const pressExportMaps = useCallback(async () => {
    const time = dayjs().format('YYYY-MM-DD_HH-mm-ss');
    const mapSettings = JSON.stringify(maps);
    const fileName = `maps_${time}.json`;
    const isOK = await exportFileFromData(mapSettings, fileName);
    if (!isOK && Platform.OS !== 'web') {
      await AlertAsync(t('hooks.message.failExport'));
    } else {
      await AlertAsync(t('hooks.message.successExportMaps'));
    }
  }, [maps]);

  const gotoMapList = useCallback(() => {
    navigation.navigate('MapList');
  }, [navigation]);

  const jumpToBoundary = useCallback(
    async (item: TileMapType) => {
      let boundary: boundaryType | undefined;
      if (Platform.OS === 'web') {
        let boundaryJson;
        if (item.url.includes('pmtiles')) {
          boundaryJson = (await db.pmtiles.get(item.id))?.boundary;
          if (boundaryJson === undefined) {
            const result = await getPmtilesBoundary(item.url);
            boundary = result.boundary;
            await db.pmtiles.update(item.id, { boundary: JSON.stringify(boundary) });
          } else {
            boundary = JSON.parse(boundaryJson);
          }
        } else if (item.url.endsWith('.pdf') || item.url.startsWith('pdf://')) {
          boundaryJson = (await db.geotiff.get(item.id))?.boundary;
          if (boundaryJson === undefined) return;
          boundary = JSON.parse(boundaryJson);
        }
      } else {
        //boundary.jsonの読み込み
        const boundaryUri = `${TILE_FOLDER}/${item.id}/boundary.json`;
        let boundaryJson = await readAsStringAsync(boundaryUri).catch(() => undefined);
        if (boundaryJson === undefined) {
          if (item.url.includes('pmtiles')) {
            const result = await getPmtilesBoundary(item.url);
            boundary = result.boundary;
            boundaryJson = JSON.stringify(boundary);
            await FileSystem.makeDirectoryAsync(`${TILE_FOLDER}/${item.id}`, { intermediates: true });
            await FileSystem.writeAsStringAsync(boundaryUri, boundaryJson);
          } else {
            return;
          }
        } else {
          boundary = JSON.parse(boundaryJson);
        }
      }
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
    [getPmtilesBoundary, navigation]
  );

  const pressMapOrder = useCallback(
    (tileMap: TileMapType, direction: 'up' | 'down') => {
      changeMapOrder(tileMap, direction);
    },
    [changeMapOrder]
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
        pressImportStyle,
        changeExpand,
        pressMapOrder,
        updateMapOrder,
        onDragBegin,
      }}
    >
      <Maps />
      {isMapEditorOpen && <MapModalTileMap />}
    </MapsContext.Provider>
  );
}
