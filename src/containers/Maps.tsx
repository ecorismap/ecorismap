import React, { useCallback, useState } from 'react';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import Maps from '../components/pages/Maps';
import { MapsContext } from '../contexts/Maps';
import { TextInputDialog } from '../components/molecules/TextInputDialog';
import { ulid } from 'ulid';
import { useMaps } from '../hooks/useMaps';
import { useTutrial } from '../hooks/useTutrial';
import { t } from '../i18n/config';
import { useBottomSheetNavigation } from '../contexts/BottomSheetNavigationContext';
import { boundaryType, TileMapType } from '../types';
import dayjs from 'dayjs';
import * as DocumentPicker from 'expo-document-picker';
import { getExt } from '../utils/General';
import { Platform } from 'react-native';
import { TILE_FOLDER } from '../constants/AppConstants';
import { readAsStringAsync } from 'expo-file-system/legacy';
import { db } from '../utils/db';
import * as FileSystem from 'expo-file-system/legacy';
import { exportFileFromData } from '../utils/File';
import { isPdfTileMap } from '../utils/pdfTileMap';

// Web版のexpo-document-pickerはblob: URLを返すが、PDFインポート経路(importMapFile)はdata:を想定しているため変換する
async function blobUriToDataUri(blobUri: string): Promise<string> {
  const blob = await (await fetch(blobUri)).blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export default function MapContainer() {
  const { navigate, navigateToHome } = useBottomSheetNavigation();
  const {
    progress,
    maps,
    isOffline,
    filterdMaps,
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
    exportSingleMap,
    saveMap,
  } = useMaps();
  const [isLoading, setIsLoading] = useState(false);
  const [groupNameDialogVisible, setGroupNameDialogVisible] = useState(false);
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
      // Web版でローカルインポートしたPDF（file://）の場合はIndexedDBから保存済みPDFをダウンロード
      if (Platform.OS === 'web' && item.url.startsWith('file://') && isPdfTileMap(item)) {
        try {
          const geotiff = await db.geotiff.get(item.id);
          if (geotiff && geotiff.pdf) {
            const link = document.createElement('a');
            link.href = geotiff.pdf;
            link.download = `${item.name}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            return;
          }
          await AlertAsync(t('Maps.alert.pdfNotFound'));
          return;
        } catch (e: any) {
          await AlertAsync(e.message);
          return;
        }
      }

      // Web版でFirebaseまたは外部URLのPDF（pdf://, http://, https://）の場合は再ダウンロード
      if (Platform.OS === 'web' && (item.url.startsWith('pdf://') || item.url.startsWith('http'))) {
        const ext = getExt(item.url)?.toLowerCase();
        if (ext === 'pdf' || item.url.startsWith('pdf://')) {
          setIsLoading(true);
          const { message } = await importMapFile(item.url, item.name, ext, item.id, item.encryptKey);
          setIsLoading(false);
          if (message !== '') await AlertAsync(message);
          return;
        }
      }

      if (Platform.OS === 'web') {
        AlertAsync(t('Maps.alert.cannotDownloadOnWeb'));
        return;
      }
      const protocol = item.url.split(':')[0];
      if (
        protocol === 'http' ||
        protocol === 'https' ||
        protocol === 'pmtiles' ||
        protocol === 'pdf' ||
        protocol === 'hillshade' ||
        protocol === 'relief'
      ) {
        const ext = getExt(item.url)?.toLowerCase();
        if (ext === 'pdf' || item.url.startsWith('pdf://')) {
          setIsLoading(true);
          const { message } = await importMapFile(item.url, item.name, ext, item.id, item.encryptKey);
          setIsLoading(false);
          if (message !== '') await AlertAsync(message);
        } else {
          navigateToHome?.({
            tileMap: item,
            previous: 'Maps',
            mode: 'downloadMap',
          });
        }
      }
    },
    [importMapFile, navigateToHome]
  );

  const gotoMapEdit = useCallback(
    (editTileMap: TileMapType | null) => {
      navigate('MapEdit', {
        targetMap: editTileMap,
        previous: 'Maps',
      });
    },
    [navigate]
  );

  const pressAddMapGroup = useCallback(() => {
    setGroupNameDialogVisible(true);
  }, []);

  const submitMapGroupName = useCallback(
    (name: string) => {
      setGroupNameDialogVisible(false);
      const newGroup: TileMapType = {
        id: ulid(),
        name,
        url: '',
        attribution: '',
        maptype: 'none',
        visible: true,
        transparency: 0,
        overzoomThreshold: 18,
        highResolutionEnabled: false,
        minimumZ: 0,
        maximumZ: 22,
        flipY: false,
        isGroup: true,
        expanded: true,
      };
      saveMap(newGroup);
    },
    [saveMap]
  );

  const cancelMapGroupName = useCallback(() => {
    setGroupNameDialogVisible(false);
  }, []);

  const pressImportMaps = useCallback(async () => {
    const file = await DocumentPicker.getDocumentAsync({
      type: ['application/json', 'application/pdf', 'application/octet-stream', '*/*'],
    });
    if (file.assets === null) return;
    const name = file.assets[0].name;
    const uri = file.assets[0].uri;
    const ext = getExt(name)?.toLowerCase();
    if (!ext || !(ext === 'json' || ext === 'pdf' || ext === 'pmtiles')) {
      await AlertAsync(t('hooks.message.wrongExtension'));
      return;
    }
    // ネイティブはPMTilesのヘッダーを読めず取り込みが必ず失敗するため、選ばれた時点で案内する
    if (ext === 'pmtiles' && Platform.OS !== 'web') {
      await AlertAsync(t('hooks.message.pmtilesNotSupportedOnMobile'));
      return;
    }
    setIsLoading(true);
    setTimeout(async () => {
      let message = '';
      try {
        // expo-document-picker(Web)はblob: URLを返す。data:へ変換が要るのはPDFの経路だけ。
        // PMTilesはfetch(blob:)で読めるので変換しない（数百MBを文字列にすると上限を超えて失敗する）（M-M10）
        let importUri = uri;
        if (Platform.OS === 'web' && ext === 'pdf' && uri.startsWith('blob:')) {
          importUri = await blobUriToDataUri(uri);
        }
        const result = await importMapFile(importUri, name, ext);
        message = result.message;
      } catch (e) {
        console.error('pressImportMaps error:', e);
        message = t('hooks.message.failReceiveFile');
      } finally {
        setIsLoading(false);
      }
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
    const result = await exportFileFromData(mapSettings, fileName);
    if (result === 'error') {
      await AlertAsync(t('hooks.message.failExport'));
    } else if (result === 'saved') {
      await AlertAsync(t('hooks.message.successExportMaps'));
    }
  }, [maps]);

  const pressExportMap = useCallback(
    async (tileMap: TileMapType) => {
      const result = await exportSingleMap(tileMap);
      if (result.message !== '') await AlertAsync(result.message);
    },
    [exportSingleMap]
  );

  const gotoMapList = useCallback(() => {
    navigate('MapList', undefined);
  }, [navigate]);

  const gotoDownload = useCallback(() => {
    navigateToHome?.({
      mode: 'download',
      previous: 'Maps',
    });
  }, [navigateToHome]);

  const loadBoundary = useCallback(
    async (item: TileMapType): Promise<boundaryType | undefined> => {
      let boundary: boundaryType | undefined;
      if (Platform.OS === 'web') {
        let boundaryJson;
        if (item.url.includes('pmtiles')) {
          boundaryJson = (await db.pmtiles.get(item.id))?.boundary;
          // スタイルだけのレコードや配信元の変更直後は '' が入っている
          if (!boundaryJson) {
            const result = await getPmtilesBoundary(item.url);
            boundary = result.boundary;
            if (boundary === undefined) {
              await AlertAsync(t('hooks.message.cannotGetBoundary'));
              return undefined;
            }
            await db.pmtiles.update(item.id, { boundary: JSON.stringify(boundary) });
          } else {
            boundary = JSON.parse(boundaryJson);
          }
        } else if (item.url.endsWith('.pdf') || item.url.startsWith('pdf://') || item.url.startsWith('file://')) {
          boundaryJson = (await db.geotiff.get(item.id))?.boundary;
          if (!boundaryJson) return undefined;
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
            // 未取得のまま書き込もうとすると例外で終わり、利用者には何も表示されない
            if (boundary === undefined) {
              await AlertAsync(t('hooks.message.cannotGetBoundary'));
              return undefined;
            }
            boundaryJson = JSON.stringify(boundary);
            await FileSystem.makeDirectoryAsync(`${TILE_FOLDER}/${item.id}`, { intermediates: true });
            await FileSystem.writeAsStringAsync(boundaryUri, boundaryJson);
          } else {
            return undefined;
          }
        } else {
          boundary = JSON.parse(boundaryJson);
        }
      }
      return boundary;
    },
    [getPmtilesBoundary]
  );

  const jumpToBoundary = useCallback(
    async (item: TileMapType) => {
      // 地図名タップから呼ばれ、拒否されると未処理のPromise拒否になるためここで受け止める
      let boundary: boundaryType | undefined;
      try {
        boundary = await loadBoundary(item);
      } catch (e) {
        console.error('jumpToBoundary error:', e);
        await AlertAsync(t('hooks.message.cannotGetBoundary'));
        return;
      }
      if (boundary === undefined) return;
      navigateToHome?.({
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
    [loadBoundary, navigateToHome]
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
        filterdMaps,
        changeVisible,
        pressToggleOnline,
        pressDownloadMap,
        pressDeleteMap,
        gotoMapEdit,
        pressAddMapGroup,
        gotoMapList,
        gotoDownload,
        pressImportMaps,
        pressExportMaps,
        jumpToBoundary,
        pressImportStyle,
        changeExpand,
        pressMapOrder,
        updateMapOrder,
        onDragBegin,
        pressExportMap,
      }}
    >
      <Maps />
      <TextInputDialog
        visible={groupNameDialogVisible}
        title={t('common.addGroup')}
        placeholder={t('common.inputGroupName')}
        presenceKey="map-group-name"
        onSubmit={submitMapGroupName}
        onCancel={cancelMapGroupName}
      />
    </MapsContext.Provider>
  );
}
