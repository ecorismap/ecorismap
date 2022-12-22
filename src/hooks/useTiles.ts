import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { v4 as uuidv4 } from 'uuid';
import { AppState } from '../modules';
import { editSettingsAction } from '../modules/settings';
import { tileGridForRegion } from '../utils/Tile';
import { ConfirmAsync } from '../components/molecules/AlertAsync';
import { TileMapType, TileRegionType } from '../types';
import { TILE_FOLDER } from '../constants/AppConstants';
import * as FileSystem from 'expo-file-system';
import { Alert } from '../components/atoms/Alert';
import { cloneDeep } from 'lodash';
import { t } from '../i18n/config';
import { useWindow } from './useWindow';

export type UseTilesReturnType = {
  isDownloading: boolean;
  downloadArea: TileRegionType;
  savedArea: TileRegionType[];
  downloadProgress: string;
  savedTileSize: string;
  downloadTiles: () => Promise<void>;
  stopDownloadTiles: () => void;
  clearTiles: (tileMap_: TileMapType) => Promise<void>;
};

export const useTiles = (tileMap: TileMapType | undefined): UseTilesReturnType => {
  //console.log(tileMap);
  const dispatch = useDispatch();
  const { mapRegion } = useWindow();
  const pause = useRef(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setProgress] = useState('0');
  const [savedTileSize, setTileSize] = useState('0');
  const tileRegions = useSelector((state: AppState) => state.settings.tileRegions);
  const downloadArea: TileRegionType = useMemo(() => {
    const minLon = mapRegion.longitude - mapRegion.latitudeDelta / 4;
    const minLat = mapRegion.latitude - mapRegion.latitudeDelta / 4;
    const maxLon = mapRegion.longitude + mapRegion.latitudeDelta / 4;
    const maxLat = mapRegion.latitude + mapRegion.latitudeDelta / 4;
    return {
      id: '',
      tileMapId: '',
      coords: [
        { latitude: minLat, longitude: minLon },
        { latitude: maxLat, longitude: minLon },
        { latitude: maxLat, longitude: maxLon },
        { latitude: minLat, longitude: maxLon },
      ],
      centroid: {
        latitude: mapRegion.latitude,
        longitude: mapRegion.longitude,
      },
    };
  }, [mapRegion.latitude, mapRegion.latitudeDelta, mapRegion.longitude]);

  const savedArea = useMemo(
    () => tileRegions.filter(({ tileMapId }) => tileMapId === tileMap?.id),
    [tileMap?.id, tileRegions]
  );

  const stopDownloadTiles = useCallback(() => {
    pause.current = true;
  }, []);

  const addTileRegions = useCallback(() => {
    if (tileMap === undefined) return;
    const tileRegion = cloneDeep(downloadArea);
    tileRegion.id = uuidv4();
    tileRegion.tileMapId = tileMap.id;

    dispatch(editSettingsAction({ tileRegions: [...tileRegions, tileRegion] }));
    return tileRegion.id;
  }, [dispatch, downloadArea, tileMap, tileRegions]);

  const removeTileRegion = useCallback(
    (id: string) => {
      const newTileRegions = tileRegions.filter((item) => item.id !== id);
      dispatch(editSettingsAction({ tileRegions: newTileRegions }));
    },
    [dispatch, tileRegions]
  );

  const downloadTiles = useCallback(async () => {
    const id = addTileRegions();
    if (tileMap === undefined || id === undefined) return;

    setProgress('0');
    setIsDownloading(true);

    const minZoom = 0;
    const maxZoom = 16;

    const tiles = tileGridForRegion(downloadArea, minZoom, maxZoom);

    const BATCH_SIZE = 10;

    let batch = [];
    let d = 0;
    for (const tile of tiles) {
      if (pause.current) {
        const ret = await ConfirmAsync(t('hooks.confirm.stopDownload'));

        if (ret) {
          removeTileRegion(id);
          setIsDownloading(false);
          pause.current = false;
          return;
        } else {
          pause.current = false;
        }
      }
      const folder = `${TILE_FOLDER}/${tileMap.id}/${tile.z}/${tile.x}`;

      const folderPromise = FileSystem.makeDirectoryAsync(folder, {
        intermediates: true,
      });
      batch.push(folderPromise);

      if (batch.length >= BATCH_SIZE) {
        d = d + BATCH_SIZE;
        await Promise.all(batch);
        batch = [];
      }
    }
    await Promise.all(batch);

    let batchDownload = [];
    let errorCount = 0;
    d = 0;

    for (const tile of tiles) {
      if (pause.current) {
        const ret = await ConfirmAsync(t('hooks.confirm.stopDownload'));
        if (ret) {
          removeTileRegion(id);
          setIsDownloading(false);
          pause.current = false;
          return;
        } else {
          pause.current = false;
        }
      }
      const fetchUrl = tileMap.url
        .replace('{z}', tile.z.toString())
        .replace('{x}', tile.x.toString())
        .replace('{y}', tile.y.toString());

      const localLocation = `${TILE_FOLDER}/${tileMap.id}/${tile.z}/${tile.x}/${tile.y}`;
      //console.log(fetchUrl, localLocation);

      const tilePromise = FileSystem.downloadAsync(fetchUrl, localLocation)
        .then(({ uri, status }) => {
          if (status !== 200) {
            FileSystem.deleteAsync(uri);
            //console.log('A', uri);
            errorCount++;
          }
        })
        .catch(() => {
          errorCount++;
          //console.error(error);
        });
      batchDownload.push(tilePromise);
      if (batchDownload.length >= BATCH_SIZE) {
        d = d + BATCH_SIZE;
        setProgress(((d / tiles.length) * 100).toFixed());
        await Promise.all(batchDownload);
        batchDownload = [];
      }
    }
    await Promise.all(batch);

    setIsDownloading(false);
    //console.log('errorCoount', (errorCount / tiles.length) * 100);
    if ((errorCount / tiles.length) * 100 > 20) {
      removeTileRegion(id);
      Alert.alert('', t('hooks.alert.errorDownload'));
      return;
    }
    Alert.alert('', t('hooks.alert.completeDownload'));
  }, [addTileRegions, downloadArea, removeTileRegion, tileMap]);

  const clearTiles = useCallback(
    async (tileMap_: TileMapType) => {
      try {
        // console.log(`${TILE_FOLDER}/${tileMap_.id}/`);
        await FileSystem.deleteAsync(`${TILE_FOLDER}/${tileMap_.id}/`);
        const newTileRegions = tileRegions.filter((tileRegion) => tileRegion.tileMapId !== tileMap_.id);
        dispatch(editSettingsAction({ tileRegions: newTileRegions }));
        setTileSize('0');
      } catch (error) {}
    },
    [dispatch, tileRegions]
  );

  useEffect(() => {
    //ダウンロードしたタイルの情報
    if (tileMap === undefined) return;
    (async () => {
      const info = await FileSystem.getInfoAsync(`${TILE_FOLDER}/${tileMap.id}`, { size: true });
      const size = info.size === undefined ? '0' : (info.size / 1048576).toFixed(2);
      setTileSize(size);
    })();
  }, [isDownloading, tileMap]);

  return {
    isDownloading,
    downloadArea,
    savedArea,
    downloadProgress,
    savedTileSize,
    downloadTiles,
    stopDownloadTiles,
    clearTiles,
  } as const;
};
