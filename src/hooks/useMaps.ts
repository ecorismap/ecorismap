import { useCallback, useState } from 'react';
import * as FileSystem from 'expo-file-system';
import { v4 as uuidv4 } from 'uuid';
import { TILE_FOLDER } from '../constants/AppConstants';
import { TileMapItemType, TileMapType } from '../types';
import { Platform } from 'react-native';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { editSettingsAction } from '../modules/settings';
import { AppState } from '../modules';
import { deleteTileMapAction, setTileMapsAction } from '../modules/tileMaps';
import { cloneDeep } from 'lodash';
import { csvToJsonArray, isMapListArray, isTileMapType, isValidMapListURL } from '../utils/Map';
import { t } from '../i18n/config';
import { decodeUri } from '../utils/File.web';
import { convert } from 'react-native-gdalwarp';
import ImageEditor from '@react-native-community/image-editor';
import { tileToWebMercator } from '../utils/Tile';
import { webMercatorToLatLon } from '../utils/Coords';
import { Buffer } from 'buffer';
import { moveFile, unlink } from '../utils/File';
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
    ext: 'json' | 'pdf'
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
  const [progress, setProgress] = useState('10');
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

  const calculateTile = (coordinate: { x: number; y: number }, zoomLevel: number): { tileX: number; tileY: number } => {
    const earthCircumference = 40075016.686;
    const offset = 20037508.342789244;
    const tileX = Math.floor(((coordinate.x + offset) / earthCircumference) * Math.pow(2, zoomLevel));
    const tileY = Math.floor(((offset - coordinate.y) / earthCircumference) * Math.pow(2, zoomLevel));
    return { tileX, tileY };
  };

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

  const calculateOffset = (
    pdfTopLeftCoord: { x: number; y: number },
    topLeftCoord: { mercatorX: number; mercatorY: number },
    coordPerPixel: number
  ) => {
    const offsetLeft = pdfTopLeftCoord.x - topLeftCoord.mercatorX;
    const offsetTop = topLeftCoord.mercatorY - pdfTopLeftCoord.y;
    return { x: -offsetLeft / coordPerPixel, y: -offsetTop / coordPerPixel };
  };

  const calculateCropSize = (zoomLevel: number, coordPerPixel: number) => {
    const earthCircumference = Math.PI * 2 * 6378137;
    return {
      width: earthCircumference / Math.pow(2, zoomLevel) / coordPerPixel,
      height: earthCircumference / Math.pow(2, zoomLevel) / coordPerPixel,
    };
  };

  const importPdfMapFile = useCallback(
    async (uri: string, name: string) => {
      const { outputFiles } = await convert(uri.replace('file://', '')).catch((e) => {
        console.error(e);
        return { outputFiles: [] };
      });

      if (outputFiles === undefined || outputFiles.length === 0) {
        return { isOK: false, message: t('hooks.message.failReceiveFile') };
      }
      setProgress('50');
      const newTileMaps = cloneDeep(maps);
      for (let i = 0; i < outputFiles.length; i++) {
        const outputFile = outputFiles[i];
        const mapId = uuidv4();
        const pdfImage = 'file://' + outputFile.uri;

        const { y: pdfTopCoord } = outputFile.topLeft;
        const { y: pdfBottomCoord } = outputFile.bottomRight;
        //const imageWidth = outputFile.width;
        const imageHeight = outputFile.height;
        const topLeftLatLon = webMercatorToLatLon(outputFile.topLeft);
        const bottomRightLatLon = webMercatorToLatLon(outputFile.bottomRight);
        const coordPerPixel = (pdfTopCoord - pdfBottomCoord) / imageHeight;
        const baseZoomLevel = calculateZoomLevel(pdfTopCoord, pdfBottomCoord, imageHeight);
        //console.log('width', imageWidth, 'height', imageHeight);
        const tileSize = 512;

        const minimumZ = 3;
        const tiles = [];
        for (let tileZ = baseZoomLevel; tileZ >= minimumZ; tileZ--) {
          const topLeftTile = calculateTile(outputFile.topLeft, tileZ);
          const bottomRightTile = calculateTile(outputFile.bottomRight, tileZ);
          const topLeftCoord = tileToWebMercator(topLeftTile.tileX, topLeftTile.tileY, tileZ);
          const offset = calculateOffset(outputFile.topLeft, topLeftCoord, coordPerPixel);
          const cropSize = calculateCropSize(tileZ, coordPerPixel);
          const tileX = topLeftTile.tileX;
          const tileY = topLeftTile.tileY;
          const loopX = bottomRightTile.tileX - topLeftTile.tileX + 1;
          const loopY = bottomRightTile.tileY - topLeftTile.tileY + 1;
          // console.log('topLeftTile', topLeftTile, 'bottomRightTile', bottomRightTile);
          // console.log('topLeftCoord', topLeftCoord);
          // console.log('offset', offset);
          // console.log('cropSize', cropSize);
          // console.log('tileX', tileX, 'tileY', tileY, 'tileZ', tileZ);

          for (let y = 0; y < loopY; y++) {
            for (let x = 0; x < loopX; x++) {
              const offsetX = offset.x + x * cropSize.width;
              const offsetY = offset.y + y * cropSize.height;
              tiles.push({ x: tileX + x, y: tileY + y, z: tileZ, offsetX, offsetY, cropSize });
            }
          }
        }
        const BATCH_SIZE = 10;
        let batch: Promise<void>[] = [];

        for (const tile of tiles) {
          const folder = `${TILE_FOLDER}/${mapId}/${tile.z}/${tile.x}`;
          const folderPromise = FileSystem.makeDirectoryAsync(folder, {
            intermediates: true,
          });
          batch.push(folderPromise);
          if (batch.length >= BATCH_SIZE) {
            await Promise.all(batch);
            batch = [];
          }
        }
        await Promise.all(batch);

        let batchCount = 0;
        batch = [];

        for (const tile of tiles) {
          const tileUri = `${TILE_FOLDER}/${mapId}/${tile.z}/${tile.x}/${tile.y}`;

          const cropImagePromise = ImageEditor.cropImage(pdfImage, {
            offset: { x: tile.offsetX, y: tile.offsetY },
            size: tile.cropSize,
            displaySize: { width: tileSize, height: tileSize },
            resizeMode: 'cover',
          })
            .then((croppedImageUri) => {
              moveFile(croppedImageUri, tileUri);
            })
            .catch((e) => {
              console.log(tile, e);
            });

          batch.push(cropImagePromise);
          if (batch.length >= BATCH_SIZE) {
            batchCount = batchCount + BATCH_SIZE;
            const percentPerPage = 50 / outputFiles.length;
            setProgress((50 + percentPerPage * i + (batchCount / tiles.length) * percentPerPage).toFixed());
            await Promise.all(batch);
            batch = [];
          }
        }
        await Promise.all(batch);

        unlink(pdfImage);
        const pdfName = outputFiles.length === 1 ? name : `${name}_page${(i + 1).toString().padStart(2, '0')}`;
        const newTileMap: TileMapType = {
          id: mapId,
          name: pdfName,
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
          boundary: {
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
          },
        };

        newTileMaps.unshift(newTileMap);
        setProgress((50 + ((i + 1) / outputFiles.length) * 50).toFixed());
      }
      setProgress('10'); //次回のための初期値
      dispatch(setTileMapsAction(newTileMaps));
      return { isOK: true, message: t('hooks.message.receiveFile') };
    },
    [dispatch, maps]
  );

  const importMapFile = useCallback(
    async (uri: string, name: string, ext: 'json' | 'pdf') => {
      if (ext === 'json') {
        return importJsonMapFile(uri);
      } else if (ext === 'pdf') {
        let pdfUri = uri;
        const tempPdf = `${FileSystem.cacheDirectory}${uuidv4()}.pdf`;
        if (uri.startsWith('file://') === false) {
          //uriからbasicauth部分を取得
          const auth = uri.split('@')[0].split('//')[1];
          const options = auth ? 'Basic' + ' ' + Buffer.from(auth).toString('base64') : '';
          const download = FileSystem.createDownloadResumable(uri, tempPdf, {
            headers: { Authorization: options },
          });
          const result = await download.downloadAsync();
          if (!result || result.status !== 200) {
            return { isOK: false, message: t('hooks.message.failReceiveFile') };
          }

          pdfUri = result.uri;
        }

        const result = await importPdfMapFile(pdfUri, name);
        unlink(tempPdf);
        return result;
      } else {
        return { isOK: false, message: t('hooks.message.failReceiveFile') };
      }
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
    clearTileCache,
  } as const;
};
