import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { ulid } from 'ulid';
import { RootState } from '../store';
import { editSettingsAction } from '../modules/settings';
import { tileGridForRegion } from '../utils/Tile';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import { TileMapType, TileRegionType } from '../types';
import { TILE_FOLDER } from '../constants/AppConstants';
import * as FileSystem from 'expo-file-system';
import { t } from '../i18n/config';
import { useWindow } from './useWindow';
import { getExt } from '../utils/General';
import * as pmtiles from 'pmtiles';
import { Buffer } from 'buffer';
import { cloneDeep } from 'lodash';

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
  const tileRegions = useSelector((state: RootState) => state.settings.tileRegions, shallowEqual);
  const downloadRegion = useMemo(() => {
    const minLon = mapRegion.longitude - mapRegion.latitudeDelta / 4;
    const minLat = mapRegion.latitude - mapRegion.latitudeDelta / 4;
    const maxLon = mapRegion.longitude + mapRegion.latitudeDelta / 4;
    const maxLat = mapRegion.latitude + mapRegion.latitudeDelta / 4;
    return { minLon, minLat, maxLon, maxLat };
  }, [mapRegion.latitude, mapRegion.latitudeDelta, mapRegion.longitude]);

  const downloadArea: TileRegionType = useMemo(() => {
    const { minLon, minLat, maxLon, maxLat } = downloadRegion;
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
  }, [downloadRegion, mapRegion.latitude, mapRegion.longitude]);

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
    tileRegion.id = ulid();
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

    const tileType =
      getExt(tileMap.url) === 'pbf'
        ? 'pbf'
        : getExt(tileMap.url) === 'pmtiles' || tileMap.url.startsWith('pmtiles://')
        ? 'pmtiles'
        : 'png';

    const pmtile = tileType === 'pmtiles' ? new pmtiles.PMTiles(tileMap.url.replace('pmtiles://', '')) : undefined;

    setProgress('0');
    setIsDownloading(true);

    const minZoom = 0;
    const maxZoom = tileType === 'png' || !tileMap.isVector ? Math.min(tileMap.overzoomThreshold, 16) : 18;

    const tiles = tileGridForRegion(downloadRegion, minZoom, maxZoom);

    const BATCH_SIZE = 10;

    let batch: Promise<void>[] = [];
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
    let batchDownload: any = [];
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

      let tilePromise;
      if (tileType === 'pmtiles' && tileMap.isVector && pmtile !== undefined) {
        //console.log(tile.z, tile.x, tile.y);
        const localLocation = `${TILE_FOLDER}/${tileMap.id}/${tile.z}/${tile.x}/${tile.y}.pbf`;
        tilePromise = pmtile
          .getZxy(tile.z, tile.x, tile.y)
          .then(async (resp) => {
            if (resp === undefined) return;
            const base64String = Buffer.from(resp.data).toString('base64');
            FileSystem.writeAsStringAsync(localLocation, base64String, {
              encoding: FileSystem.EncodingType.UTF8,
            });
          })
          .catch((e) => {
            console.log(e);
            //errorCount++;
          });
      } else if (tileType === 'pmtiles' && !tileMap.isVector && pmtile !== undefined) {
        const localLocation = `${TILE_FOLDER}/${tileMap.id}/${tile.z}/${tile.x}/${tile.y}.png`;
        tilePromise = pmtile
          .getZxy(tile.z, tile.x, tile.y)
          .then(async (resp) => {
            if (resp === undefined) return;
            const base64String = Buffer.from(resp.data).toString('base64');
            FileSystem.writeAsStringAsync(localLocation, base64String, {
              encoding: FileSystem.EncodingType.UTF8,
            });
          })
          .catch((e) => {
            console.log(e);
            //errorCount++;
          });
      } else if (tileType === 'pbf') {
        const fetchUrl = tileMap.url
          .replace('{z}', tile.z.toString())
          .replace('{x}', tile.x.toString())
          .replace('{y}', tile.y.toString());
        const localLocation = `${TILE_FOLDER}/${tileMap.id}/${tile.z}/${tile.x}/${tile.y}.pbf`;

        tilePromise = fetch(fetchUrl)
          .then((response) => {
            if (!response.ok) {
              throw new Error('Network response was not ok');
            }
            return response.arrayBuffer();
          })
          .then(async (data) => {
            const base64String = Buffer.from(data).toString('base64');
            FileSystem.writeAsStringAsync(localLocation, base64String, {
              encoding: FileSystem.EncodingType.UTF8,
            });
          })
          .catch(() => {
            errorCount++;
            //console.error(error);
          });
      } else if (tileType === 'png') {
        const fetchUrl = tileMap.url
          .replace('{z}', tile.z.toString())
          .replace('{x}', tile.x.toString())
          .replace('{y}', tile.y.toString());

        const localLocation = `${TILE_FOLDER}/${tileMap.id}/${tile.z}/${tile.x}/${tile.y}`;
        //console.log(fetchUrl, localLocation);

        tilePromise = FileSystem.downloadAsync(fetchUrl, localLocation)
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
      }

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
      //removeTileRegion(id);
      await AlertAsync(t('hooks.alert.errorDownload'));
      return;
    }
    await AlertAsync(t('hooks.alert.completeDownload'));
  }, [addTileRegions, downloadRegion, removeTileRegion, tileMap]);

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
      const size = info.exists ? (info.size / 1048576).toFixed(2) : '0';
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
