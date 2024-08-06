import { useCallback, useState } from 'react';
import * as FileSystem from 'expo-file-system';
import { ulid } from 'ulid';
import { TILE_FOLDER } from '../constants/AppConstants';
import { TileMapItemType, TileMapType } from '../types';
import { Platform } from 'react-native';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { editSettingsAction } from '../modules/settings';
import { RootState } from '../store';
import { deleteTileMapAction, setTileMapsAction } from '../modules/tileMaps';
import { cloneDeep } from 'lodash';
import { csvToJsonArray, isMapListArray, isTileMapType, isValidMapListURL } from '../utils/Map';
import { t } from '../i18n/config';
import { blobToBase64, decodeUri } from '../utils/File.web';
import { convert, warpedFileType } from 'react-native-gdalwarp';
import { webMercatorToLatLon } from '../utils/Coords';
import { Buffer } from 'buffer';
import { unlink } from '../utils/File';
import { convertPDFToGeoTiff } from '../utils/PDF';
import { db } from '../utils/db';
import { generateTilesFromPDF } from '../utils/PDF';

export type UseMapsReturnType = {
  progress: string;
  mapListURL: string;
  mapList: TileMapItemType[];
  maps: TileMapType[];
  editedMap: TileMapType;
  isOffline: boolean;
  isMapEditorOpen: boolean;
  changeVisible: (visible: boolean, index: number) => void;
  changeMapOrder: (index: number) => void;
  toggleOnline: () => void;
  deleteMap: (deletedTileMap: TileMapType) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  openEditMap: (editTileMap: TileMapType | null) => {
    isOK: boolean;
    message: string;
  };
  closeEditMap: () => void;
  saveMap: (newTileMap: TileMapType) => void;
  fetchMapList: (signal: AbortSignal) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  saveMapListURL: (url: string) => void;
  importMapFile: (
    uri: string,
    name: string,
    ext: 'json' | 'pdf',
    id?: string
  ) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  importPdfMapFile: (
    uri: string,
    name: string,
    id?: string
  ) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  clearTileCache: () => Promise<void>;
};

export const useMaps = (): UseMapsReturnType => {
  const dispatch = useDispatch();
  const isOffline = useSelector((state: RootState) => state.settings.isOffline, shallowEqual);
  const mapListURL = useSelector((state: RootState) => state.settings.mapListURL, shallowEqual);
  const maps = useSelector((state: RootState) => state.tileMaps);
  const tileRegions = useSelector((state: RootState) => state.settings.tileRegions, shallowEqual);
  const [editedMap, setEditedMap] = useState({} as TileMapType);
  const [isMapEditorOpen, setMapEditorOpen] = useState(false);
  const [progress, setProgress] = useState('10');
  const mapList = useSelector((state: RootState) => state.settings.mapList, shallowEqual);

  const fetchMapList = useCallback(
    async (signal: AbortSignal) => {
      //console.log('###', mapListURL);
      dispatch(editSettingsAction({ mapList: [] }));
      if (mapListURL === undefined) return { isOK: true, message: '' };
      if (!isValidMapListURL(mapListURL)) {
        return { isOK: false, message: t('hooks.message.inputMaplistURL') };
      }
      try {
        const response = await fetch(mapListURL, { signal: signal });

        const csv = await response.text();
        //console.log(csv);
        const mapListArray = csvToJsonArray(csv);
        //console.log(mapListArray);
        if (!isMapListArray(mapListArray)) {
          return { isOK: false, message: t('hooks.message.invalidDataFormat') };
        }
        if (mapListArray.length > 50) {
          return { isOK: false, message: t('hooks.message.tooManyMapList') };
        }
        dispatch(editSettingsAction({ mapList: mapListArray }));
        return { isOK: true, message: '' };
      } catch (error: any) {
        if (error.name === 'AbortError') {
          //console.log('Aborted!!');
          return { isOK: true, message: '' };
        }
        //console.log(error);
        return { isOK: false, message: t('hooks.message.failGetData') };
      }
    },
    [dispatch, mapListURL]
  );

  const clearTiles = useCallback(
    async (tileMap_: TileMapType) => {
      if (Platform.OS === 'web') {
        //@ts-ignore
        await db.geotiff.delete(tileMap_.id);
      } else {
        const { uri } = await FileSystem.getInfoAsync(`${TILE_FOLDER}/${tileMap_.id}/`);
        if (uri) {
          await FileSystem.deleteAsync(uri);
          const newTileRegions = tileRegions.filter((tileRegion) => tileRegion.tileMapId !== tileMap_.id);
          dispatch(editSettingsAction({ tileRegions: newTileRegions }));
        }
      }
    },
    [dispatch, tileRegions]
  );

  const clearTileCache = useCallback(async () => {
    if (Platform.OS === 'web') {
      //@ts-ignore
      await db.geotiff.clear();
    } else {
      const { uri } = await FileSystem.getInfoAsync(TILE_FOLDER);
      if (uri) {
        await FileSystem.deleteAsync(uri);
        dispatch(editSettingsAction({ tileRegions: [] }));
      }
    }
  }, [dispatch]);

  const changeVisible = useCallback(
    (visible: boolean, index: number) => {
      const newTileMaps = cloneDeep(maps);
      newTileMaps[index].visible = visible;

      //標準を可視。衛星を不可視に
      if (newTileMaps[index].id === 'standard' && newTileMaps[index].visible) {
        dispatch(editSettingsAction({ mapType: newTileMaps[index].maptype }));
        newTileMaps.find((tileMap_) => tileMap_.id === 'hybrid')!.visible = false;
        //衛星を可視。標準を不可視に
      } else if (newTileMaps[index].id === 'hybrid' && newTileMaps[index].visible) {
        dispatch(editSettingsAction({ mapType: newTileMaps[index].maptype }));
        newTileMaps.find((tileMap_) => tileMap_.id === 'standard')!.visible = false;
        //標準を不可視
      } else if (newTileMaps[index].id === 'standard' && newTileMaps[index].visible === false) {
        dispatch(editSettingsAction({ mapType: 'none' }));
        //衛星を不可視
      } else if (newTileMaps[index].id === 'hybrid' && newTileMaps[index].visible === false) {
        dispatch(editSettingsAction({ mapType: 'none' }));
      }
      dispatch(setTileMapsAction(newTileMaps));
    },
    [dispatch, maps]
  );

  const changeMapOrder = useCallback(
    (index: number) => {
      if (index === 0) return;
      const newTileMaps = cloneDeep(maps);
      [newTileMaps[index], newTileMaps[index - 1]] = [newTileMaps[index - 1], newTileMaps[index]];
      dispatch(setTileMapsAction(newTileMaps));
    },
    [dispatch, maps]
  );

  const toggleOnline = useCallback(() => {
    dispatch(editSettingsAction({ isOffline: !isOffline }));
  }, [dispatch, isOffline]);

  const deleteMap = useCallback(
    async (deletedTileMap: TileMapType) => {
      clearTiles(deletedTileMap);
      dispatch(deleteTileMapAction(deletedTileMap));
      setMapEditorOpen(false);
      return { isOK: true, message: '' };
    },
    [clearTiles, dispatch]
  );

  const openEditMap = useCallback((editTileMap: TileMapType | null) => {
    let newTileMap: TileMapType;
    if (editTileMap === null) {
      newTileMap = {
        id: ulid(),
        name: '',
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
      };
    } else {
      newTileMap = cloneDeep(editTileMap);
    }

    setEditedMap(newTileMap);
    setMapEditorOpen(true);
    return { isOK: true, message: '' };
  }, []);

  const closeEditMap = () => {
    setMapEditorOpen(false);
  };

  const saveMap = useCallback(
    (newTileMap: TileMapType) => {
      const newTileMaps = cloneDeep(maps);
      //新規だったら追加、編集だったら置き換え
      const index = newTileMaps.findIndex(({ id }) => id === newTileMap.id);
      if (index === -1) {
        newTileMaps.unshift(newTileMap);
      } else {
        newTileMaps[index] = newTileMap;
      }
      dispatch(setTileMapsAction(newTileMaps));
      setMapEditorOpen(false);
    },
    [dispatch, maps]
  );

  const saveMapListURL = useCallback(
    (url: string) => {
      dispatch(editSettingsAction({ mapListURL: url }));
    },
    [dispatch]
  );

  const importJsonMapFile = useCallback(
    async (uri: string) => {
      try {
        const jsonStrings = Platform.OS === 'web' ? decodeUri(uri) : await FileSystem.readAsStringAsync(uri);
        const json = JSON.parse(jsonStrings);
        if (Array.isArray(json)) {
          const isValid = json.every((tileMap) => !isTileMapType(tileMap));
          if (!isValid) {
            return { isOK: false, message: t('hooks.message.invalidDataFormat') };
          }
        } else {
          return { isOK: false, message: 'Data is not an array' + '\n' + t('hooks.message.invalidDataFormat') };
        }
        dispatch(setTileMapsAction(json));
        return { isOK: true, message: t('hooks.message.receiveFile') };
      } catch (e: any) {
        return { isOK: false, message: e.message + '\n' + t('hooks.message.failReceiveFile') };
      }
    },
    [dispatch]
  );

  const calculateZoomLevel = (pdfTopCoord: number, pdfBottomCoord: number, imageHeight: number) => {
    const coordPerPixel = (pdfTopCoord - pdfBottomCoord) / imageHeight;
    const earthCircumference = Math.PI * 2 * 6378137;
    return Math.round(Math.log2(earthCircumference / coordPerPixel / 256)) - 1;
  };

  const importPdfMapFile = useCallback(
    async (uri: string, name: string, id?: string) => {
      let outputFiles: warpedFileType[] = [];
      if (Platform.OS === 'web') {
        outputFiles = await convertPDFToGeoTiff(uri);
      } else {
        const result = await convert(uri.replace('file://', '')).catch(() => {
          //console.error('Error processing PDF:', e);
          return { outputFiles: [] };
        });
        outputFiles = result.outputFiles;
      }
      if (outputFiles.length === 0) {
        return { isOK: false, message: t('hooks.message.failReceiveFile') };
      }
      setProgress('50');
      const newTileMaps = cloneDeep(maps);
      const totalPages = outputFiles.length;
      for (let page = 1; page <= totalPages; page++) {
        const outputFile = outputFiles[page - 1];
        const mapId = id === undefined || totalPages > 1 ? ulid() : id;
        const pdfImage = 'file://' + outputFile.uri;

        const { y: pdfTopCoord } = outputFile.topLeft;
        const { y: pdfBottomCoord } = outputFile.bottomRight;
        //const imageWidth = outputFile.width;
        const imageHeight = outputFile.height;
        const topLeftLatLon = webMercatorToLatLon(outputFile.topLeft);
        const bottomRightLatLon = webMercatorToLatLon(outputFile.bottomRight);
        const coordPerPixel = (pdfTopCoord - pdfBottomCoord) / imageHeight;
        const baseZoomLevel = calculateZoomLevel(pdfTopCoord, pdfBottomCoord, imageHeight);
        const tileSize = 512;
        const minimumZ = 3;
        const boundary = {
          center: {
            latitude: (topLeftLatLon.latitude + bottomRightLatLon.latitude) / 2,
            longitude: (topLeftLatLon.longitude + bottomRightLatLon.longitude) / 2,
          },
          zoom: baseZoomLevel - 1,
          bounds: {
            north: topLeftLatLon.latitude,
            south: bottomRightLatLon.latitude,
            west: topLeftLatLon.longitude,
            east: bottomRightLatLon.longitude,
          },
        };
        const boundaryJson = JSON.stringify(boundary);
        //console.log('width', imageWidth, 'height', imageHeight);
        if (Platform.OS === 'web') {
          //@ts-ignore
          await db.geotiff.put({ mapId, blob: outputFile.blob, boundary: boundaryJson });
        } else {
          generateTilesFromPDF(pdfImage, outputFile, mapId, tileSize, minimumZ, baseZoomLevel, coordPerPixel);
          //${TILE_FOLDER}/${mapId}/boundary.jsonに保存.
          const boundaryUri = `${TILE_FOLDER}/${mapId}/boundary.json`;
          await FileSystem.writeAsStringAsync(boundaryUri, boundaryJson);
        }

        const tileMap: TileMapType = {
          id: mapId,
          name: name,
          url: `file://${name}`,
          attribution: 'PDF',
          maptype: 'none',
          visible: true,
          transparency: 0,
          overzoomThreshold: baseZoomLevel,
          highResolutionEnabled: false,
          minimumZ: minimumZ,
          maximumZ: 22,
          flipY: false,
          tileSize: tileSize,
          boundary,
        };
        if (totalPages > 1) {
          //複数ページの場合は名前を変える
          tileMap.name = `${name}_page${page.toString().padStart(2, '0')}`;
          newTileMaps.unshift(tileMap);
        } else if (id === undefined) {
          //単ページでローカル読み込みの場合は新規追加
          newTileMaps.unshift(tileMap);
        } else if (id) {
          //単ページでファイルダウンロードの場合は置き換え
          const index = newTileMaps.findIndex((item) => item.id === id);
          const oldTileMap = newTileMaps[index];
          tileMap.name = oldTileMap.name;
          tileMap.url = oldTileMap.url;
          tileMap.attribution = oldTileMap.attribution;
          tileMap.transparency = oldTileMap.transparency;
          newTileMaps[index] = tileMap;
        }

        setProgress((50 + (page / totalPages) * 50).toFixed());
      }
      setProgress('10'); //次回のための初期値
      dispatch(setTileMapsAction(newTileMaps));
      return { isOK: true, message: t('hooks.message.receiveFile') };
    },
    [dispatch, maps]
  );

  const importMapFile = useCallback(
    async (uri: string, name: string, ext: 'json' | 'pdf', id?: string) => {
      //設定ファイルの場合
      if (ext === 'json') return importJsonMapFile(uri);
      //PDFでローカルファイルでWebブラウザの場合
      if (ext === 'pdf' && uri.startsWith('data:')) {
        return importPdfMapFile(uri, name, id);
      }
      //PDFでローカルファイルでモバイルの場合
      if (ext === 'pdf' && uri.startsWith('file://')) {
        return await importPdfMapFile(uri, name, id);
      }
      //PDFでWebからダウンロードする場合
      if (ext === 'pdf' && uri.startsWith('http')) {
        //uriからbasicauth部分を取得
        const auth = uri.split('@')[0].split('//')[1];
        const options = auth ? 'Basic' + ' ' + Buffer.from(auth).toString('base64') : '';

        if (Platform.OS === 'ios' || Platform.OS === 'android') {
          const tempPdf = `${FileSystem.cacheDirectory}${ulid()}.pdf`;
          const download = FileSystem.createDownloadResumable(uri, tempPdf, {
            headers: { Authorization: options },
          });
          const response = await download.downloadAsync();
          if (!response || response.status !== 200) {
            return { isOK: false, message: t('hooks.message.failReceiveFile') };
          }

          const result = await importPdfMapFile(response.uri, name, id);
          unlink(tempPdf);
          return result;
        }

        if (Platform.OS === 'web') {
          const noAuthUri = uri.replace(/^(https?:\/\/)([^:]+):([^@]+)@/, '$1');
          const response = await fetch(noAuthUri, {
            mode: 'cors',
            headers: {
              Authorization: options,
            },
          });

          if (!response.ok) {
            return { isOK: false, message: t('hooks.message.failReceiveFile') };
          }
          const blob = await response.blob();
          const base64 = await blobToBase64(blob);
          const dataUrl = `data:application/pdf;base64,${base64}`;
          const result = importPdfMapFile(dataUrl, name, id);
          return result;
        }
      }
      return { isOK: false, message: t('hooks.message.failReceiveFile') };
    },
    [importJsonMapFile, importPdfMapFile]
  );

  return {
    progress,
    mapListURL,
    mapList,
    maps,
    editedMap,
    isOffline,
    isMapEditorOpen,
    changeVisible,
    changeMapOrder,
    toggleOnline,
    deleteMap,
    openEditMap,
    closeEditMap,
    saveMap,
    fetchMapList,
    saveMapListURL,
    importMapFile,
    importPdfMapFile,
    clearTileCache,
  } as const;
};
