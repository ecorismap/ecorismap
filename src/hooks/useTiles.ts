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
  downloadTiles: (zoom: number) => Promise<void>;
  downloadMultipleTiles: (zoom: number, tileMaps: TileMapType[]) => Promise<void>;
  stopDownloadTiles: () => void;
  clearTiles: (tileMap_: TileMapType) => Promise<void>;
};

export const useTiles = (tileMap: TileMapType | undefined, selectedTileMapIds?: string[], tileMaps?: TileMapType[]): UseTilesReturnType => {
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

  const savedArea = useMemo(() => {
    // 複数地図選択がある場合は、選択された地図のsavedAreaを全て返す
    if (selectedTileMapIds && selectedTileMapIds.length > 0) {
      return tileRegions.filter(({ tileMapId }) => selectedTileMapIds.includes(tileMapId));
    }
    // 単一地図の場合は従来通り
    if (tileMap?.id) {
      return tileRegions.filter(({ tileMapId }) => tileMapId === tileMap.id);
    }
    // どちらでもない場合は全て返す
    return tileRegions;
  }, [tileMap?.id, tileRegions, selectedTileMapIds]);

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

  const downloadTiles = useCallback(
    async (zoom: number) => {
      const id = addTileRegions();
      if (tileMap === undefined || id === undefined) return;

      const tileType =
        getExt(tileMap.url) === 'pbf'
          ? 'pbf'
          : getExt(tileMap.url) === 'pmtiles' || tileMap.url.startsWith('pmtiles://')
          ? 'pmtiles'
          : tileMap.url.startsWith('hillshade://')
          ? 'hillshade'
          : 'png';

      const pmtile = tileType === 'pmtiles' ? new pmtiles.PMTiles(tileMap.url.replace('pmtiles://', '')) : undefined;
      setProgress('0');
      setIsDownloading(true);

      //ベクタータイルの場合はmetadataとスタイルをダウンロード
      if (tileType === 'pmtiles' && tileMap.isVector) {
        const folder = `${TILE_FOLDER}/${tileMap.id}`;
        await FileSystem.makeDirectoryAsync(folder, {
          intermediates: true,
        });
        if (pmtile === undefined) {
          await AlertAsync(t('hooks.alert.failDownload'));
          setIsDownloading(false);
          return;
        }
        try {
          const metadata = await pmtile.getMetadata();
          //console.log('metadata', metadata);
          if (metadata !== undefined) {
            const localLocation = `${folder}/metadata.json`;
            await FileSystem.writeAsStringAsync(localLocation, JSON.stringify(metadata), {
              encoding: FileSystem.EncodingType.UTF8,
            });
          }
        } catch (error) {
          console.error('Error fetching metadata:', error);
        }
        const fetchUrl = tileMap.styleURL ?? '';
        const localLocation = `${folder}/style.json`;

        await fetch(fetchUrl)
          .then((response) => {
            if (!response.ok) {
              throw new Error('Network response was not ok');
            }
            return response.text();
          })
          .then(async (data) => {
            await FileSystem.writeAsStringAsync(localLocation, data, {
              encoding: FileSystem.EncodingType.UTF8,
            });
          })
          .catch(() => {
            //console.error(error);
          });
      } else if (tileType === 'pbf') {
        // PBFタイルの場合はスタイルのみダウンロード（メタデータは不要）
        const folder = `${TILE_FOLDER}/${tileMap.id}`;
        await FileSystem.makeDirectoryAsync(folder, {
          intermediates: true,
        });

        if (tileMap.styleURL) {
          const fetchUrl = tileMap.styleURL;
          const localLocation = `${folder}/style.json`;

          await fetch(fetchUrl)
            .then((response) => {
              if (!response.ok) {
                throw new Error('Network response was not ok');
              }
              return response.text();
            })
            .then(async (data) => {
              await FileSystem.writeAsStringAsync(localLocation, data, {
                encoding: FileSystem.EncodingType.UTF8,
              });
            })
            .catch(() => {
              //console.error(error);
            });
        }
      }

      const minZoom = tileType === 'png' || tileType === 'hillshade' ? 0 : zoom;
      const maxZoom =
        tileType === 'png' || tileType === 'hillshade' || !tileMap.isVector
          ? Math.min(tileMap.overzoomThreshold, 16)
          : 18;

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
        } else if (tileType === 'hillshade') {
          // hillshadeの場合は元のDEMタイルURLを構築
          const cleanUrl = tileMap.url.replace('hillshade://', '');
          const fetchUrl = cleanUrl
            .replace('{z}', tile.z.toString())
            .replace('{x}', tile.x.toString())
            .replace('{y}', tile.y.toString());

          const localLocation = `${TILE_FOLDER}/${tileMap.id}/${tile.z}/${tile.x}/${tile.y}`;
          //console.log('Hillshade download:', fetchUrl, localLocation);

          tilePromise = FileSystem.downloadAsync(fetchUrl, localLocation)
            .then(({ uri, status }) => {
              if (status !== 200) {
                FileSystem.deleteAsync(uri);
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
    },
    [addTileRegions, downloadRegion, removeTileRegion, tileMap]
  );

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

  const downloadMultipleTiles = useCallback(
    async (zoom: number, tileMapsToDownload: TileMapType[]) => {
      setIsDownloading(true);
      let totalCompleted = 0;
      const totalMaps = tileMapsToDownload.length;

      for (let i = 0; i < tileMapsToDownload.length; i++) {
        if (pause.current) {
          const ret = await ConfirmAsync(t('hooks.confirm.stopDownload'));
          if (ret) {
            setIsDownloading(false);
            pause.current = false;
            return;
          } else {
            pause.current = false;
          }
        }

        const currentTileMap = tileMapsToDownload[i];
        setProgress(`地図 ${i + 1}/${totalMaps}: ${currentTileMap.name}`);

        const tileRegion = cloneDeep(downloadArea);
        tileRegion.id = ulid();
        tileRegion.tileMapId = currentTileMap.id;
        dispatch(editSettingsAction({ tileRegions: [...tileRegions, tileRegion] }));

        const tileType =
          getExt(currentTileMap.url) === 'pbf'
            ? 'pbf'
            : getExt(currentTileMap.url) === 'pmtiles' || currentTileMap.url.startsWith('pmtiles://')
            ? 'pmtiles'
            : currentTileMap.url.startsWith('hillshade://')
            ? 'hillshade'
            : 'png';

        const pmtile =
          tileType === 'pmtiles' ? new pmtiles.PMTiles(currentTileMap.url.replace('pmtiles://', '')) : undefined;

        // メタデータとスタイルのダウンロード
        if (tileType === 'pmtiles' && currentTileMap.isVector) {
          const folder = `${TILE_FOLDER}/${currentTileMap.id}`;
          await FileSystem.makeDirectoryAsync(folder, { intermediates: true });

          if (pmtile) {
            try {
              const metadata = await pmtile.getMetadata();
              if (metadata !== undefined) {
                const localLocation = `${folder}/metadata.json`;
                await FileSystem.writeAsStringAsync(localLocation, JSON.stringify(metadata), {
                  encoding: FileSystem.EncodingType.UTF8,
                });
              }
            } catch (error) {
              console.error('Error fetching metadata:', error);
            }
          }

          if (currentTileMap.styleURL) {
            const localLocation = `${folder}/style.json`;
            await fetch(currentTileMap.styleURL)
              .then((response) => response.text())
              .then(async (data) => {
                await FileSystem.writeAsStringAsync(localLocation, data, {
                  encoding: FileSystem.EncodingType.UTF8,
                });
              })
              .catch(() => {});
          }
        } else if (tileType === 'pbf' && currentTileMap.styleURL) {
          const folder = `${TILE_FOLDER}/${currentTileMap.id}`;
          await FileSystem.makeDirectoryAsync(folder, { intermediates: true });

          const localLocation = `${folder}/style.json`;
          await fetch(currentTileMap.styleURL)
            .then((response) => response.text())
            .then(async (data) => {
              await FileSystem.writeAsStringAsync(localLocation, data, {
                encoding: FileSystem.EncodingType.UTF8,
              });
            })
            .catch(() => {});
        }

        const minZoom = tileType === 'png' || tileType === 'hillshade' ? 0 : zoom;
        const maxZoom =
          tileType === 'png' || tileType === 'hillshade' || !currentTileMap.isVector
            ? Math.min(currentTileMap.overzoomThreshold, 16)
            : 18;

        const tiles = tileGridForRegion(downloadRegion, minZoom, maxZoom);
        const BATCH_SIZE = 10;

        // フォルダ作成
        let batch: Promise<void>[] = [];
        for (const tile of tiles) {
          const folder = `${TILE_FOLDER}/${currentTileMap.id}/${tile.z}/${tile.x}`;
          const folderPromise = FileSystem.makeDirectoryAsync(folder, { intermediates: true });
          batch.push(folderPromise);
          if (batch.length >= BATCH_SIZE) {
            await Promise.all(batch);
            batch = [];
          }
        }
        await Promise.all(batch);

        // タイルダウンロード
        let batchDownload: any = [];
        let errorCount = 0;
        let d = 0;

        for (const tile of tiles) {
          if (pause.current) {
            const ret = await ConfirmAsync(t('hooks.confirm.stopDownload'));
            if (ret) {
              setIsDownloading(false);
              pause.current = false;
              return;
            } else {
              pause.current = false;
            }
          }

          let tilePromise;
          if (tileType === 'pmtiles' && currentTileMap.isVector && pmtile !== undefined) {
            const localLocation = `${TILE_FOLDER}/${currentTileMap.id}/${tile.z}/${tile.x}/${tile.y}.pbf`;
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
              });
          } else if (tileType === 'pmtiles' && !currentTileMap.isVector && pmtile !== undefined) {
            const localLocation = `${TILE_FOLDER}/${currentTileMap.id}/${tile.z}/${tile.x}/${tile.y}.png`;
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
              });
          } else if (tileType === 'pbf') {
            const fetchUrl = currentTileMap.url
              .replace('{z}', tile.z.toString())
              .replace('{x}', tile.x.toString())
              .replace('{y}', tile.y.toString());
            const localLocation = `${TILE_FOLDER}/${currentTileMap.id}/${tile.z}/${tile.x}/${tile.y}.pbf`;

            tilePromise = fetch(fetchUrl)
              .then((response) => {
                if (!response.ok) throw new Error('Network response was not ok');
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
              });
          } else if (tileType === 'png') {
            const fetchUrl = currentTileMap.url
              .replace('{z}', tile.z.toString())
              .replace('{x}', tile.x.toString())
              .replace('{y}', tile.y.toString());
            const localLocation = `${TILE_FOLDER}/${currentTileMap.id}/${tile.z}/${tile.x}/${tile.y}`;

            tilePromise = FileSystem.downloadAsync(fetchUrl, localLocation)
              .then(({ uri, status }) => {
                if (status !== 200) {
                  FileSystem.deleteAsync(uri);
                  errorCount++;
                }
              })
              .catch(() => {
                errorCount++;
              });
          } else if (tileType === 'hillshade') {
            const cleanUrl = currentTileMap.url.replace('hillshade://', '');
            const fetchUrl = cleanUrl
              .replace('{z}', tile.z.toString())
              .replace('{x}', tile.x.toString())
              .replace('{y}', tile.y.toString());
            const localLocation = `${TILE_FOLDER}/${currentTileMap.id}/${tile.z}/${tile.x}/${tile.y}`;

            tilePromise = FileSystem.downloadAsync(fetchUrl, localLocation)
              .then(({ uri, status }) => {
                if (status !== 200) {
                  FileSystem.deleteAsync(uri);
                  errorCount++;
                }
              })
              .catch(() => {
                errorCount++;
              });
          }

          batchDownload.push(tilePromise);
          if (batchDownload.length >= BATCH_SIZE) {
            d = d + BATCH_SIZE;
            const mapProgress = ((d / tiles.length) * 100).toFixed();
            setProgress(`地図 ${i + 1}/${totalMaps}: ${currentTileMap.name} ${mapProgress}%`);
            await Promise.all(batchDownload);
            batchDownload = [];
          }
        }
        await Promise.all(batchDownload);

        if ((errorCount / tiles.length) * 100 > 20) {
          await AlertAsync(t('hooks.alert.errorDownload') + ` (${currentTileMap.name})`);
        }

        totalCompleted++;
      }

      setIsDownloading(false);
      await AlertAsync(`${totalCompleted}個の地図のダウンロードが完了しました`);
    },
    [addTileRegions, dispatch, downloadArea, downloadRegion, tileRegions]
  );

  useEffect(() => {
    //ダウンロードしたタイルの情報
    (async () => {
      if (!tileMaps || tileMaps.length === 0) {
        if (tileMap) {
          const info = await FileSystem.getInfoAsync(`${TILE_FOLDER}/${tileMap.id}`, { size: true });
          const size = info.exists ? (info.size / 1048576).toFixed(1) : '0';
          setTileSize(size);
        }
        return;
      }

      // 選択された地図のサイズの合計を計算
      const mapsToCheck = selectedTileMapIds && selectedTileMapIds.length > 0
        ? tileMaps.filter(m => selectedTileMapIds.includes(m.id))
        : tileMaps;

      let totalSize = 0;
      for (const map of mapsToCheck) {
        const info = await FileSystem.getInfoAsync(`${TILE_FOLDER}/${map.id}`, { size: true });
        if (info.exists) {
          totalSize += info.size;
        }
      }
      const size = (totalSize / 1048576).toFixed(1);
      setTileSize(size);
    })();
  }, [isDownloading, tileMap, selectedTileMapIds, tileMaps]);

  return {
    isDownloading,
    downloadArea,
    savedArea,
    downloadProgress,
    savedTileSize,
    downloadTiles,
    downloadMultipleTiles,
    stopDownloadTiles,
    clearTiles,
  } as const;
};
