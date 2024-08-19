import { useCallback, useState } from 'react';
import * as FileSystem from 'expo-file-system';
import { ulid } from 'ulid';
import { TILE_FOLDER } from '../constants/AppConstants';
import { TileMapItemType, TileMapType } from '../types';
import { Platform } from 'react-native';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { editSettingsAction } from '../modules/settings';
import { RootState } from '../store';
import { addTileMapAction, deleteTileMapAction, setTileMapsAction, updateTileMapAction } from '../modules/tileMaps';
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
import * as pmtiles from 'pmtiles';

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
  importStyleFile: (
    uri: string,
    name: string,
    id: string
  ) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  importMapFile: (
    uri: string,
    name: string,
    ext: string,
    id?: string,
    key?: string
  ) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  importPdfFile: (
    uri: string,
    name: string,
    id?: string
  ) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  importPmtilesFile: (
    uri: string,
    name: string,
    id?: string
  ) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  clearTileCache: () => Promise<void>;
  updatePmtilesURL: () => Promise<void>;
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
        await db.geotiff.delete(tileMap_.id);
        await db.pmtiles.delete(tileMap_.id);
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
      await db.geotiff.clear();
      await db.pmtiles.clear();
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
      //新規だったら追加、編集だったら置き換え
      const index = maps.findIndex(({ id }) => id === newTileMap.id);
      if (index === -1) {
        dispatch(addTileMapAction(newTileMap));
      } else {
        dispatch(updateTileMapAction(newTileMap));
      }
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

  const importStyleFile = useCallback(
    async (uri: string, name: string, id: string) => {
      try {
        // console.log('importStyleFile', uri, name, id);
        const jsonStrings = Platform.OS === 'web' ? decodeUri(uri) : await FileSystem.readAsStringAsync(uri);
        if (Platform.OS === 'web') {
          db.pmtiles.update(id, { style: jsonStrings });
          setEditedMap({ ...editedMap, styleURL: 'style://' + name });
        } else {
          const styleUri = `${TILE_FOLDER}/${id}/style.json`;
          await FileSystem.makeDirectoryAsync(`${TILE_FOLDER}/${id}`, { intermediates: true });
          await FileSystem.copyAsync({ from: uri, to: styleUri });
          setEditedMap({ ...editedMap, styleURL: styleUri });
        }

        return { isOK: true, message: '' };
      } catch (e: any) {
        return { isOK: false, message: e.message + '\n' + t('hooks.message.failReceiveFile') };
      }
    },
    [editedMap]
  );
  const updatePmtilesURL = useCallback(async () => {
    //URL.createObjectURLはセッションごとにリセットされるため、再度生成する必要がある
    if (Platform.OS !== 'web') return;
    for (const tileMap of maps) {
      try {
        if (tileMap.url && tileMap.url.startsWith('pmtiles://')) {
          const pmtile = await db.pmtiles.get(tileMap.id);
          if (pmtile && pmtile.blob) {
            const url = 'pmtiles://' + URL.createObjectURL(pmtile.blob);
            dispatch(updateTileMapAction({ ...tileMap, url }));
          }
        }
      } catch (e) {
        console.log(e);
      }
    }
  }, [dispatch, maps]);

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
        //console.log(json);
        dispatch(setTileMapsAction(json));
        await updatePmtilesURL();
        return { isOK: true, message: t('hooks.message.receiveFile') };
      } catch (e: any) {
        return { isOK: false, message: e.message + '\n' + t('hooks.message.failReceiveFile') };
      }
    },
    [dispatch, updatePmtilesURL]
  );

  const calculateZoomLevel = (pdfTopCoord: number, pdfBottomCoord: number, imageHeight: number) => {
    const coordPerPixel = (pdfTopCoord - pdfBottomCoord) / imageHeight;
    const earthCircumference = Math.PI * 2 * 6378137;
    return Math.round(Math.log2(earthCircumference / coordPerPixel / 256)) - 1;
  };

  const importPdfFile = useCallback(
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
          await db.geotiff.put({ mapId, blob: outputFile.blob!, boundary: boundaryJson, pdf: uri });
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
          dispatch(addTileMapAction(tileMap));
        } else if (id === undefined) {
          //単ページでローカル読み込みの場合は新規追加
          dispatch(addTileMapAction(tileMap));
        } else if (id) {
          //単ページでファイルダウンロードの場合は置き換え
          const index = maps.findIndex((item) => item.id === id);
          const oldTileMap = maps[index];
          tileMap.name = oldTileMap.name;
          tileMap.url = oldTileMap.url;
          tileMap.attribution = oldTileMap.attribution;
          tileMap.transparency = oldTileMap.transparency;
          tileMap.key = oldTileMap.key;
          dispatch(updateTileMapAction(tileMap));
        }

        setProgress((50 + (page / totalPages) * 50).toFixed());
      }
      setProgress('10'); //次回のための初期値

      return { isOK: true, message: t('hooks.message.receiveFile') };
    },
    [dispatch, maps]
  );

  const importPmtilesFile = useCallback(
    async (uri: string, name: string, id?: string) => {
      const mapId = id === undefined ? ulid() : id;
      let url;
      let blob;
      if (Platform.OS === 'web') {
        const response = await fetch(uri);
        blob = await response.blob();
        url = URL.createObjectURL(blob);
      } else {
        url = `${TILE_FOLDER}/${mapId}/${name}`;
        await FileSystem.makeDirectoryAsync(`${TILE_FOLDER}/${mapId}`, { intermediates: true });
        await FileSystem.copyAsync({ from: uri, to: url });
      }
      const pmtile = new pmtiles.PMTiles(url);
      const header = await pmtile.getHeader();
      const boundary = {
        center: {
          latitude: header.centerLat,
          longitude: header.centerLon,
        },
        zoom: Math.floor((header.maxZoom + header.minZoom) / 2),
        bounds: {
          north: header.maxLat,
          south: header.minLat,
          west: header.minLon,
          east: header.maxLon,
        },
      };
      //console.log('AAA', metadata);
      //console.log('BBB', header);

      if (Platform.OS === 'web') {
        await db.pmtiles.put({ mapId, blob: blob, boundary: JSON.stringify(boundary), style: undefined });
      } else {
        const boundaryUri = `${TILE_FOLDER}/${mapId}/boundary.json`;
        await FileSystem.writeAsStringAsync(boundaryUri, JSON.stringify(boundary));
      }

      const tileMap: TileMapType = {
        id: mapId,
        name: name,
        url: 'pmtiles://' + url,
        attribution: 'pmtiles',
        maptype: 'none',
        visible: true,
        transparency: 0,
        overzoomThreshold: header.maxZoom,
        highResolutionEnabled: false,
        minimumZ: header.minZoom,
        maximumZ: header.maxZoom,
        flipY: false,
        tileSize: 512,
        isVector: header.tileType === 1,
      };
      dispatch(addTileMapAction(tileMap));
      return { isOK: true, message: t('hooks.message.receiveFile') };
    },
    [dispatch]
  );
  const importMapFile = useCallback(
    async (uri: string, name: string, ext: string, id?: string, _key?: string) => {
      //設定ファイルの場合
      if (ext === 'json') return importJsonMapFile(uri);
      //PDFでローカルファイルでWebブラウザの場合
      if (ext === 'pmtiles') return importPmtilesFile(uri, name, id);
      if (ext === 'pdf' && uri.startsWith('data:')) {
        return importPdfFile(uri, name, id);
      }
      //PDFでローカルファイルでモバイルの場合
      if (ext === 'pdf' && uri.startsWith('file://')) {
        return await importPdfFile(uri, name, id);
      }
      //PDFでWebからダウンロードする場合
      if ((ext === 'pdf' && uri.startsWith('http')) || uri.startsWith('pdf://')) {
        //uriからbasicauth部分を取得
        let dataUri = '';
        const auth = uri.split('@')[0].split('//')[1];
        const options = auth ? 'Basic' + ' ' + Buffer.from(auth).toString('base64') : '';
        if (Platform.OS === 'ios' || Platform.OS === 'android') {
          const tempPdf = `${FileSystem.cacheDirectory}${ulid()}.pdf`;
          const downloadUrl = uri;
          const download = FileSystem.createDownloadResumable(downloadUrl, tempPdf, {
            headers: { Authorization: options },
          });
          const response = await download.downloadAsync();
          if (!response || response.status !== 200) {
            return { isOK: false, message: t('hooks.message.failReceiveFile') };
          }
          unlink(tempPdf);
          dataUri = response.uri;
        } else if (Platform.OS === 'web') {
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
          dataUri = `data:application/pdf;base64,${base64}`;
        }
        return importPdfFile(dataUri, name, id);
      }

      return { isOK: false, message: t('hooks.message.failReceiveFile') };
    },
    [importJsonMapFile, importPdfFile, importPmtilesFile]
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
    importPdfFile,
    importPmtilesFile,
    importStyleFile,
    clearTileCache,
    updatePmtilesURL,
  } as const;
};
