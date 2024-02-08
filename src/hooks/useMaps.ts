import { useCallback, useState } from 'react';
import * as FileSystem from 'expo-file-system';
import { v4 as uuidv4 } from 'uuid';
import { TILE_FOLDER } from '../constants/AppConstants';
import { TileMapItemType, TileMapType } from '../types';
import { Platform, Image } from 'react-native';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { editSettingsAction } from '../modules/settings';
import { AppState } from '../modules';
import { deleteTileMapAction, setTileMapsAction } from '../modules/tileMaps';
import { cloneDeep } from 'lodash';
import { csvToJsonArray, isMapListArray, isTileMapType, isValidMapListURL } from '../utils/Map';
import { t } from '../i18n/config';
import { decodeUri } from '../utils/File.web';
import { convert } from 'react-native-pdf-to-image';
import ImageEditor from '@react-native-community/image-editor';
import * as RNFS from 'react-native-fs';
import { tileToWebMercator } from '../utils/Tile';

//import initGdalJs from 'gdal3.js';

export type UseMapsReturnType = {
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
    ext: 'json' | 'pdf' | 'tif'
  ) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  clearTileCache: () => Promise<void>;
};

export const useMaps = (): UseMapsReturnType => {
  const dispatch = useDispatch();
  const isOffline = useSelector((state: AppState) => state.settings.isOffline, shallowEqual);
  const mapListURL = useSelector((state: AppState) => state.settings.mapListURL, shallowEqual);
  const maps = useSelector((state: AppState) => state.tileMaps);
  const tileRegions = useSelector((state: AppState) => state.settings.tileRegions, shallowEqual);
  const [editedMap, setEditedMap] = useState({} as TileMapType);
  const [isMapEditorOpen, setMapEditorOpen] = useState(false);
  const mapList = useSelector((state: AppState) => state.settings.mapList, shallowEqual);

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
      if (Platform.OS === 'web') return;

      const { uri } = await FileSystem.getInfoAsync(`${TILE_FOLDER}/${tileMap_.id}/`);
      if (uri) {
        await FileSystem.deleteAsync(uri);
        const newTileRegions = tileRegions.filter((tileRegion) => tileRegion.tileMapId !== tileMap_.id);
        dispatch(editSettingsAction({ tileRegions: newTileRegions }));
      }
    },
    [dispatch, tileRegions]
  );

  const clearTileCache = useCallback(async () => {
    if (Platform.OS === 'web') return;

    const { uri } = await FileSystem.getInfoAsync(TILE_FOLDER);
    if (uri) {
      await FileSystem.deleteAsync(uri);
      dispatch(editSettingsAction({ tileRegions: [] }));
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
        id: uuidv4(),
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

  const getImageSize = (imageUri: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      Image.getSize(
        imageUri,
        (width, height) => {
          resolve({ width, height });
        },
        reject
      );
    });
  };

  const calculateTile = (coordinate: { x: number; y: number }, zoomLevel: number): { tileX: number; tileY: number } => {
    const earthCircumference = 40075016.686;
    const offset = 20037508.342789244;
    const tileX = Math.floor(((coordinate.x + offset) / earthCircumference) * Math.pow(2, zoomLevel));
    const tileY = Math.floor(((offset - coordinate.y) / earthCircumference) * Math.pow(2, zoomLevel));
    return { tileX, tileY };
  };

  const importMapFile = useCallback(
    async (uri: string, ext: 'json' | 'pdf' | 'tif') => {
      if (ext === 'json') {
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
      } else if (ext === 'pdf') {
        const mapId = uuidv4();
        const copyUri = `${TILE_FOLDER}/temp.pdf`;
        RNFS.unlink(copyUri);
        await RNFS.moveFile(uri, copyUri);
        //const images = await convert(copyUri.replace('file://', ''));
        console.log('###', copyUri);
        const images = await convert(copyUri);
        console.log('####', images);
        if (images.outputFiles === undefined || images.outputFiles[0].length === 0) {
          return { isOK: false, message: t('hooks.message.failReceiveFile') };
        }

        //const pdfImage = 'file://' + images.outputFiles[0];
        const pdfImage = images.outputFiles[0];
        console.log(pdfImage);
        const { width: imageWidth, height: imageHeight } = await getImageSize(pdfImage);
        console.log('image', imageWidth, imageHeight);
        const ratio = 72 / 150;
        const GCP1 = { pixel: 59 * ratio, line: 59 * ratio, x: 15027250.074291376, y: 4164549.9790928965 };
        const GCP2 = { pixel: 1181 * ratio, line: 1695 * ratio, x: 15029569.332909595, y: 4161168.7441600203 };
        //pdfImageの四隅の座標を計算。pixel,lineは画像の左上からの座標
        const dx = GCP2.x - GCP1.x;
        const dy = GCP1.y - GCP2.y;
        const dpx = GCP2.pixel - GCP1.pixel;
        const dpy = GCP2.line - GCP1.line;
        const pdfLeftCoord = ((0 - GCP1.pixel) * dx) / dpx + GCP1.x;
        const pdfTopCoord = (GCP1.line * dy) / dpy + GCP1.y;
        const pdfRightCoord = pdfLeftCoord + (imageWidth * dx) / dpx;
        const pdfBottomCoord = pdfTopCoord - (imageHeight * dy) / dpy;

        // const pdfLeftCoord = parseFloat(images.outputFiles[1]);
        // const pdfTopCoord = parseFloat(images.outputFiles[2]);
        // const pdfRightCoord = parseFloat(images.outputFiles[3]);
        // const pdfBottomCoord = parseFloat(images.outputFiles[4]);
        // const imageWidth = parseFloat(images.outputFiles[5]);
        // const imageHeight = parseFloat(images.outputFiles[6]);
        // console.log('Warped:', imageWidth, imageHeight);
        // console.log(pdfLeftCoord, pdfTopCoord, pdfRightCoord, pdfBottomCoord);
        //四隅の座標と画像のサイズから最適なズームレベルを計算
        //1pxあたりの座標を計算して地球の円周からズームレベルを求める
        const coordPerPixel = (pdfTopCoord - pdfBottomCoord) / imageHeight;
        //地球の円周
        const earthCircumference = Math.PI * 2 * 6378137;
        //zoomLevel = log2(地球の円周 / 1pxあたりの座標)
        const zoomLevel = Math.round(Math.log2(earthCircumference / coordPerPixel / 256));
        console.log(zoomLevel);
        //四隅の座標からタイルの座標を計算
        const topLeftTile = calculateTile({ x: pdfLeftCoord, y: pdfTopCoord }, zoomLevel);
        const bottomRightTile = calculateTile({ x: pdfRightCoord, y: pdfBottomCoord }, zoomLevel);
        console.log(topLeftTile, bottomRightTile);
        //タイルの左上の座標を計算
        const topLeftCoord = tileToWebMercator(topLeftTile.tileX, topLeftTile.tileY, zoomLevel);
        const rightBottomCoord = tileToWebMercator(bottomRightTile.tileX, bottomRightTile.tileY, zoomLevel);
        console.log(topLeftCoord, rightBottomCoord);
        //offsetを計算
        const offsetLeft = pdfLeftCoord - topLeftCoord.mercatorX;
        const offsetTop = topLeftCoord.mercatorY - pdfTopCoord;
        console.log(offsetLeft, offsetTop);
        const offset = { x: -offsetLeft / coordPerPixel, y: -offsetTop / coordPerPixel };
        console.log('offset', offset);
        //cropSizeを計算.zoomLevelにおけるタイルのサイズ
        const cropSize = {
          width: earthCircumference / Math.pow(2, zoomLevel) / coordPerPixel,
          height: earthCircumference / Math.pow(2, zoomLevel) / coordPerPixel,
        };
        console.log('cropSize', cropSize);

        const tileSize = { width: 256, height: 256 };
        const tileZ = zoomLevel;
        const tileX = topLeftTile.tileX;
        const tileY = topLeftTile.tileY;
        //offsetからwidth,heightを超えるまで切り出すためのループを回す回数を計算

        const loopX = bottomRightTile.tileX - topLeftTile.tileX + 1;
        const loopY = bottomRightTile.tileY - topLeftTile.tileY + 1;
        for (let y = 0; y < loopY; y++) {
          for (let x = 0; x < loopX; x++) {
            const offsetX = offset.x + x * cropSize.width;
            const offsetY = offset.y + y * cropSize.height;
            //console.log(offsetX, offsetY, cropSize.width, cropSize.height);
            const croppedImageUri = await ImageEditor.cropImage(pdfImage, {
              offset: { x: offsetX, y: offsetY },
              size: cropSize,
              displaySize: tileSize,
            });
            const tileUri = `${TILE_FOLDER}/${mapId}/${tileZ}/${tileX + x}/${tileY + y}`;
            const folder = `${TILE_FOLDER}/${mapId}/${tileZ}/${tileX + x}`;
            await FileSystem.makeDirectoryAsync(folder, {
              intermediates: true,
            });
            await RNFS.moveFile(croppedImageUri, tileUri);
            //console.log(tileUri);
          }
        }

        RNFS.unlink(pdfImage);

        const newTileMap: TileMapType = {
          id: mapId,
          name: 'PDF',
          url: 'https://localhost/' + mapId + '/{z}/{x}/{y}.png',
          attribution: 'PDF',
          maptype: 'none',
          visible: true,
          transparency: 0,
          overzoomThreshold: zoomLevel,
          highResolutionEnabled: false,
          minimumZ: 0,
          maximumZ: 22,
          flipY: false,
        };
        const newTileMaps = cloneDeep(maps);
        newTileMaps.unshift(newTileMap);
        dispatch(setTileMapsAction(newTileMaps));
        return { isOK: true, message: t('hooks.message.receiveFile') };
      } else if (ext === 'tif') {
        // const response = await fetch(uri);
        // // console.log(response);
        // const blob = await response.blob();
        // const paths = {
        //   wasm: require('../assets/gdal3/gdal3WebAssembly.wasm'),
        //   data: require('../assets/gdal3/gdal3WebAssembly.data'),
        //   js: require('../assets/gdal3/gdal3.js'),
        // };
        // const gdal = await initGdalJs({ paths, useWorker: true });
        //const gdal = await initGdalJs({ path: '/' });
        // console.log('GDAL initialized');
        // const file = new File([blob], 'maxdepth.tif');
        // const tif = (await gdal.open(file)).datasets[0];
        // console.log('GDAL TIF', tif);
        // const datasetInfo = await gdal.getInfo(tif);
        // console.log('GDAL INFO', datasetInfo);

        return { isOK: true, message: t('hooks.message.receiveFile') };
      } else {
        return { isOK: false, message: t('hooks.message.failReceiveFile') };
      }
    },
    [dispatch, maps]
  );

  return {
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
    clearTileCache,
  } as const;
};
