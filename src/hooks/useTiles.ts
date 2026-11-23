import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { shallowEqual, useDispatch, useSelector, useStore } from 'react-redux';
import { ulid } from 'ulid';
import { RootState } from '../store';
import { editSettingsAction } from '../modules/settings';
import { toDemUrl } from '../utils/terrainShading';
import { TileSignaturesType, withTileSignature } from '../utils/TileSignature';
import { AlertAsync, ResumeDownloadConfirmAsync, StopDownloadConfirmAsync } from '../components/molecules/AlertAsync';
import { TileMapType, TileRegionType } from '../types';
import { migrateFlipYTileCaches } from '../utils/flipYTileCacheMigration';
import { TILE_FOLDER } from '../constants/AppConstants';
import * as FileSystem from 'expo-file-system/legacy';
import { t } from '../i18n/config';
import { useWindow } from './useWindow';
import * as pmtiles from 'pmtiles';
import { cloneDeep } from 'lodash';
import {
  boundsFromCoords,
  downloadOneTile,
  downloadTileGrid,
  getTileType,
  getZoomRange,
  isDownloadableTileMap,
  listExistingTiles,
  readPmtileZoomRange,
  markRegionsPaused,
  removeIncompleteRegions,
  removeLegacyRasterPmtilePngs,
  resolvePmtileIsVector,
  TileDownloadResult,
  TileType,
  TileZoomRange,
  toCompletedRegion,
} from '../utils/tileDownloadHelpers';
import { downloadDemTile, getDemTileMap } from '../utils/demTileDownload';
import { hasIrreplaceableTiles, removeTileCacheEntries } from '../utils/tileCacheCleanup';
import { DEM_MAPTERHORN_MAP_ID } from '../constants/DemSources';

export type UseTilesReturnType = {
  isDownloading: boolean;
  downloadArea: TileRegionType;
  savedArea: TileRegionType[];
  downloadProgress: string;
  savedTileSize: string;
  downloadTiles: (zoom: number) => Promise<void>;
  downloadMultipleTiles: (
    zoom: number,
    tileMaps: TileMapType[],
    resumeRegions?: (TileRegionType | undefined)[]
  ) => Promise<void>;
  resumeDownloadTiles: () => Promise<void>;
  hasIncompleteDownload: boolean;
  stopDownloadTiles: () => void;
  clearTiles: (tileMap_: TileMapType) => Promise<void>;
};

type TileXYZ = { x: number; y: number; z: number };

/** 1枚分のダウンロード。単一地図版と複数地図版で同じ規則で数えるために共通化する */
const downloadTileOfMap = (
  tileType: TileType,
  tileMap: TileMapType,
  tile: TileXYZ,
  pmtile: pmtiles.PMTiles | undefined,
  pmtileIsVector: boolean,
  tileSignatures: TileSignaturesType
): Promise<TileDownloadResult> => {
  if (tileType === 'dem') return downloadDemTile(tile);
  const sourceUrl = tileType === 'hillshade' ? toDemUrl(tileMap.url) : tileMap.url;
  return downloadOneTile({
    tileType,
    tileMapId: tileMap.id,
    urlTemplate: withTileSignature(sourceUrl, tileSignatures),
    flipY: tileMap.flipY === true,
    pmtile,
    pmtileIsVector,
    tile,
  });
};

export const useTiles = (
  tileMap: TileMapType | undefined,
  selectedTileMapIds?: string[],
  tileMaps?: TileMapType[]
): UseTilesReturnType => {
  //console.log(tileMap);
  const dispatch = useDispatch();
  const store = useStore<RootState>();
  const { mapRegion } = useWindow();
  const pause = useRef(false);
  const pauseReason = useRef<'user' | 'background' | null>(null);
  const isDownloadingRef = useRef(false);
  // バックグラウンド中断後、フォアグラウンド復帰時に再開確認を出すためのフラグ
  const pendingResumePrompt = useRef(false);
  // downloadMultipleTiles→resumeDownloadTilesの循環参照を避けるためrefで参照する
  const resumeFnRef = useRef<(() => Promise<void>) | null>(null);
  const checkedIncompleteOnLaunch = useRef(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setProgress] = useState('0');
  const [savedTileSize, setTileSize] = useState('0');
  const tileRegions = useSelector((state: RootState) => state.settings.tileRegions, shallowEqual);
  // 署名付きタイル配信の署名。ダウンロードもオンラインアクセスなので表示側と同様に必要。
  const tileSignatures = useSelector((state: RootState) => state.tileSignatures);
  // redux-persistの内部stateは型定義に現れないためキャストして参照する
  const rehydrated = useSelector(
    (state: RootState) => (state as unknown as { _persist?: { rehydrated?: boolean } })._persist?.rehydrated === true
  );
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
    // tileMapsが渡されている場合（ダウンロードモード）は、ダウンロード可能な地図のsavedAreaのみ返す
    if (tileMaps && tileMaps.length > 0) {
      const downloadableMapIds = tileMaps.filter(isDownloadableTileMap).map((map) => map.id);
      // 標高タイル（疑似地図）は「すべての地図」に常に含める
      downloadableMapIds.push(DEM_MAPTERHORN_MAP_ID);
      return tileRegions.filter(({ tileMapId }) => downloadableMapIds.includes(tileMapId));
    }
    // どちらでもない場合は全て返す
    return tileRegions;
  }, [tileMap?.id, tileRegions, selectedTileMapIds, tileMaps]);

  const hasIncompleteDownload = useMemo(() => tileRegions.some((r) => r.status !== undefined), [tileRegions]);

  useEffect(() => {
    isDownloadingRef.current = isDownloading;
  }, [isDownloading]);

  const stopDownloadTiles = useCallback(() => {
    pause.current = true;
    pauseReason.current = 'user';
  }, []);

  // 未完了（status付き）の記録をすべて破棄する（保存済みタイルのファイル自体は残る）
  const discardIncompleteDownloads = useCallback(() => {
    const currentTileRegions = store.getState().settings.tileRegions;
    dispatch(editSettingsAction({ tileRegions: currentTileRegions.filter((r) => r.status === undefined) }));
  }, [dispatch, store]);

  const promptResumeAfterBackground = useCallback(async () => {
    if (!pendingResumePrompt.current) return;
    pendingResumePrompt.current = false;
    const choice = await ResumeDownloadConfirmAsync(t('hooks.confirm.resumeDownload'));
    if (choice === 'resume') {
      await resumeFnRef.current?.();
    } else if (choice === 'discard') {
      discardIncompleteDownloads();
    }
    // 'later'はpausedのまま保持し、次回起動時に改めて確認する
  }, [discardIncompleteDownloads]);

  const downloadTiles = useCallback(
    async (zoom: number) => {
      if (tileMap === undefined) return;
      // flipY の地図は旧規約のタイルを先に片付けて印を置く。後にすると、iOS が初めて表示したときに
      // 今回 XYZ で保存したタイルを旧規約とみなして消してしまう（M-M2）
      await migrateFlipYTileCaches(store, [tileMap]);
      const tileRegion = cloneDeep(downloadArea);
      tileRegion.id = ulid();
      tileRegion.tileMapId = tileMap.id;
      tileRegion.status = 'downloading';
      tileRegion.zoom = zoom;
      // 非同期ループ中はuseSelectorのtileRegionsが更新されないため、storeから直接読んでローカルに累積する。
      // 同じ地図の古い未完了記録は新規ダウンロードで置き換える（残すと起動のたびに再開確認が出続ける）
      let updatedTileRegions = [
        ...store.getState().settings.tileRegions.filter((r) => !(r.status !== undefined && r.tileMapId === tileMap.id)),
        tileRegion,
      ];
      dispatch(editSettingsAction({ tileRegions: updatedTileRegions }));

      // 中断要求の処理。trueを返したら呼び出し元はreturnする。
      const handlePause = async (): Promise<boolean> => {
        const reason = pauseReason.current;
        pause.current = false;
        pauseReason.current = null;
        if (reason === 'background') {
          // バックグラウンド移行による中断: ダイアログを出さず'paused'で保存して終了し、
          // 復帰時（この時点で既にactiveなら今）に再開を確認する
          updatedTileRegions = markRegionsPaused(updatedTileRegions, [tileRegion.id]);
          dispatch(editSettingsAction({ tileRegions: updatedTileRegions }));
          setIsDownloading(false);
          pendingResumePrompt.current = true;
          if (AppState.currentState === 'active') await promptResumeAfterBackground();
          return true;
        }
        const choice = await StopDownloadConfirmAsync();
        if (choice === 'continue') return false;
        if (choice === 'pause') {
          updatedTileRegions = markRegionsPaused(updatedTileRegions, [tileRegion.id]);
        } else {
          updatedTileRegions = removeIncompleteRegions(updatedTileRegions, [tileRegion.id]);
        }
        dispatch(editSettingsAction({ tileRegions: updatedTileRegions }));
        setIsDownloading(false);
        return true;
      };

      const tileType = getTileType(tileMap);
      const pmtile =
        tileType === 'pmtiles'
          ? new pmtiles.PMTiles(withTileSignature(tileMap.url, tileSignatures).replace('pmtiles://', ''))
          : undefined;
      setProgress('0');
      setIsDownloading(true);
      let pmtileIsVector = tileMap.isVector === true;
      let archiveZoom: TileZoomRange | undefined;
      if (pmtile !== undefined) {
        pmtileIsVector = await resolvePmtileIsVector(pmtile, pmtileIsVector);
        archiveZoom = await readPmtileZoomRange(pmtile);
      }

      //ベクタータイルの場合はmetadataとスタイルをダウンロード
      if (tileType === 'pmtiles' && pmtileIsVector) {
        const folder = `${TILE_FOLDER}/${tileMap.id}`;
        await FileSystem.makeDirectoryAsync(folder, {
          intermediates: true,
        });
        if (pmtile === undefined) {
          await AlertAsync(t('hooks.alert.failDownload'));
          updatedTileRegions = removeIncompleteRegions(updatedTileRegions, [tileRegion.id]);
          dispatch(editSettingsAction({ tileRegions: updatedTileRegions }));
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
        const fetchUrl = tileMap.styleURL ? withTileSignature(tileMap.styleURL, tileSignatures) : '';
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
          const fetchUrl = withTileSignature(tileMap.styleURL, tileSignatures);
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

      if (tileType === 'pmtiles' && !pmtileIsVector) await removeLegacyRasterPmtilePngs(tileMap.id);

      const { minZoom, maxZoom } = getZoomRange(tileType, { ...tileMap, isVector: pmtileIsVector }, archiveZoom);

      const tiles = downloadTileGrid(tileType, downloadRegion, minZoom, maxZoom);

      const BATCH_SIZE = 10;

      let batch: Promise<void>[] = [];
      let d = 0;
      for (const tile of tiles) {
        if (pause.current) {
          if (await handlePause()) return;
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
      let batchDownload: Promise<void>[] = [];
      // 404・PMTiles の範囲外以外で取れなかった枚数。完了扱いは変えず、1枚でもあれば枚数を知らせる
      let failedCount = 0;
      // PMTiles は範囲外のタイルを undefined で返すので、1枚も保存されなかったことを数えて知らせる
      let savedCount = 0;
      d = 0;

      for (const tile of tiles) {
        if (pause.current) {
          if (await handlePause()) return;
        }

        const tilePromise = downloadTileOfMap(tileType, tileMap, tile, pmtile, pmtileIsVector, tileSignatures).then(
          (result) => {
            if (result === 'saved') savedCount++;
            else if (result === 'failed') failedCount++;
          }
        );

        batchDownload.push(tilePromise);
        if (batchDownload.length >= BATCH_SIZE) {
          d = d + BATCH_SIZE;
          setProgress(((d / tiles.length) * 100).toFixed());
          await Promise.all(batchDownload);
          batchDownload = [];
        }
      }
      await Promise.all(batchDownload);

      // 1枚も保存できなかったら完了扱いにしない（保存範囲の枠が出て、保存済みと誤解される）
      if (tileType === 'pmtiles' && savedCount === 0) {
        updatedTileRegions = removeIncompleteRegions(updatedTileRegions, [tileRegion.id]);
        dispatch(editSettingsAction({ tileRegions: updatedTileRegions }));
        setIsDownloading(false);
        await AlertAsync(failedCount > 0 ? t('hooks.alert.errorDownload') : t('hooks.message.noTilesInRange'));
        return;
      }

      // 完了: 未完了マーカー（status/zoom）を外して保存する
      updatedTileRegions = updatedTileRegions.map((r) => (r.id === tileRegion.id ? toCompletedRegion(r) : r));
      dispatch(editSettingsAction({ tileRegions: updatedTileRegions }));

      setIsDownloading(false);
      if (failedCount > 0) {
        await AlertAsync(t('hooks.alert.someTilesFailed', { count: failedCount }));
        return;
      }
      await AlertAsync(t('hooks.alert.completeDownload'));
    },
    [dispatch, downloadArea, downloadRegion, promptResumeAfterBackground, store, tileMap, tileSignatures]
  );

  const clearTiles = useCallback(
    async (tileMap_: TileMapType) => {
      try {
        // ダウンロードの取り消しなので取り直せるタイルだけを消す（style.json・boundary.json・PDF 地図の実体は残す）
        if (!hasIrreplaceableTiles(tileMap_)) await removeTileCacheEntries(tileMap_.id);
        const newTileRegions = tileRegions.filter((tileRegion) => tileRegion.tileMapId !== tileMap_.id);
        dispatch(editSettingsAction({ tileRegions: newTileRegions }));
        setTileSize('0');
      } catch (error) {
        await AlertAsync(t('hooks.message.failClearTiles'));
      }
    },
    [dispatch, tileRegions]
  );

  const downloadMultipleTiles = useCallback(
    async (zoom: number, tileMapsToDownload: TileMapType[], resumeRegions?: (TileRegionType | undefined)[]) => {
      setIsDownloading(true);
      await migrateFlipYTileCaches(store, tileMapsToDownload);
      let totalCompleted = 0;
      const totalMaps = tileMapsToDownload.length;
      const errorMaps: string[] = [];
      let hasFailedTiles = false;
      // 非同期ループ中はuseSelectorのtileRegionsが更新されないため、storeから直接読んでローカルに累積する
      let updatedTileRegions = [...store.getState().settings.tileRegions];

      // 全地図の領域レコードを開始時に'downloading'で作成する。
      // 途中で強制終了されても未着手の地図が記録に残り、次回起動時の再開検出で拾える。
      // 再開時は既存レコードを再利用し、保存済み座標・ズームからタイル集合を復元する。
      const regions: TileRegionType[] = tileMapsToDownload.map((map, i) => {
        const resumeRegion = resumeRegions?.[i];
        if (resumeRegion) return { ...resumeRegion, status: 'downloading' as const };
        const tileRegion = cloneDeep(downloadArea);
        tileRegion.id = ulid();
        tileRegion.tileMapId = map.id;
        tileRegion.status = 'downloading';
        tileRegion.zoom = zoom;
        return tileRegion;
      });
      const regionIds = regions.map((r) => r.id);
      // 同じ地図の古い未完了記録は今回のダウンロードで置き換える（残すと起動のたびに再開確認が出続ける）
      const downloadingMapIds = tileMapsToDownload.map((m) => m.id);
      updatedTileRegions = [
        ...updatedTileRegions.filter(
          (r) => !regionIds.includes(r.id) && !(r.status !== undefined && downloadingMapIds.includes(r.tileMapId))
        ),
        ...regions,
      ];
      dispatch(editSettingsAction({ tileRegions: updatedTileRegions }));

      // 中断要求の処理。trueを返したら呼び出し元はreturnする。
      const handlePause = async (): Promise<boolean> => {
        const reason = pauseReason.current;
        pause.current = false;
        pauseReason.current = null;
        if (reason === 'background') {
          updatedTileRegions = markRegionsPaused(updatedTileRegions, regionIds);
          dispatch(editSettingsAction({ tileRegions: updatedTileRegions }));
          setIsDownloading(false);
          pendingResumePrompt.current = true;
          if (AppState.currentState === 'active') await promptResumeAfterBackground();
          return true;
        }
        const choice = await StopDownloadConfirmAsync();
        if (choice === 'continue') return false;
        if (choice === 'pause') {
          updatedTileRegions = markRegionsPaused(updatedTileRegions, regionIds);
        } else {
          // 破棄: 未完了（status付き）の記録のみ削除する（完了済み地図の記録は保持）
          updatedTileRegions = removeIncompleteRegions(updatedTileRegions, regionIds);
        }
        dispatch(editSettingsAction({ tileRegions: updatedTileRegions }));
        setIsDownloading(false);
        return true;
      };

      for (let i = 0; i < tileMapsToDownload.length; i++) {
        if (pause.current) {
          if (await handlePause()) return;
        }

        const currentTileMap = tileMapsToDownload[i];
        const tileRegion = regions[i];
        const isResume = resumeRegions?.[i] !== undefined;
        setProgress(
          t('hooks.progress.downloadingMap', { current: i + 1, total: totalMaps, name: currentTileMap.name, progress: 0 })
        );

        const tileType = getTileType(currentTileMap);

        const pmtile =
          tileType === 'pmtiles'
            ? new pmtiles.PMTiles(withTileSignature(currentTileMap.url, tileSignatures).replace('pmtiles://', ''))
            : undefined;
        let pmtileIsVector = currentTileMap.isVector === true;
        let archiveZoom: TileZoomRange | undefined;
        if (pmtile !== undefined) {
          pmtileIsVector = await resolvePmtileIsVector(pmtile, pmtileIsVector);
          archiveZoom = await readPmtileZoomRange(pmtile);
        }

        // メタデータとスタイルのダウンロード
        if (tileType === 'pmtiles' && pmtileIsVector) {
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
            await fetch(withTileSignature(currentTileMap.styleURL, tileSignatures))
              .then((response) => {
                // エラー応答の本文（HTML）をstyle.jsonとして保存すると、既存の正しいスタイルを壊す
                if (!response.ok) throw new Error(`Bad response code: ${response.status}`);
                return response.text();
              })
              .then(async (data) => {
                await FileSystem.writeAsStringAsync(localLocation, data, {
                  encoding: FileSystem.EncodingType.UTF8,
                });
              })
              .catch(() => {
                // スタイルが無いとベクタ地図が表示できないため、完了時のサマリで通知する
                errorMaps.push(`${currentTileMap.name} (style.json)`);
              });
          }
        } else if (tileType === 'pbf' && currentTileMap.styleURL) {
          const folder = `${TILE_FOLDER}/${currentTileMap.id}`;
          await FileSystem.makeDirectoryAsync(folder, { intermediates: true });

          const localLocation = `${folder}/style.json`;
          await fetch(withTileSignature(currentTileMap.styleURL, tileSignatures))
            .then((response) => {
              // エラー応答の本文（HTML）をstyle.jsonとして保存すると、既存の正しいスタイルを壊す
              if (!response.ok) throw new Error(`Bad response code: ${response.status}`);
              return response.text();
            })
            .then(async (data) => {
              await FileSystem.writeAsStringAsync(localLocation, data, {
                encoding: FileSystem.EncodingType.UTF8,
              });
            })
            .catch(() => {
              errorMaps.push(`${currentTileMap.name} (style.json)`);
            });
        }

        if (tileType === 'pmtiles' && !pmtileIsVector) await removeLegacyRasterPmtilePngs(currentTileMap.id);

        const { minZoom, maxZoom } = getZoomRange(tileType, { ...currentTileMap, isVector: pmtileIsVector }, archiveZoom);

        // 再開時は現在の地図表示ではなく、保存された領域からタイル集合を復元する
        const tiles = downloadTileGrid(tileType, boundsFromCoords(tileRegion.coords), minZoom, maxZoom);
        // 再開時のみ、保存済みタイルをスキップして残りだけダウンロードする
        const existingTiles = isResume ? await listExistingTiles(currentTileMap.id) : null;
        const tilesToDownload = existingTiles
          ? tiles.filter((tile) => !existingTiles.has(`${tile.z}/${tile.x}/${tile.y}`))
          : tiles;
        // 進捗は全タイル数を分母にする（再開時に中断時点のパーセントから表示が始まる）
        const skippedCount = tiles.length - tilesToDownload.length;
        if (skippedCount > 0 && tiles.length > 0) {
          setProgress(
            t('hooks.progress.downloadingMap', {
              current: i + 1,
              total: totalMaps,
              name: currentTileMap.name,
              progress: ((skippedCount / tiles.length) * 100).toFixed(),
            })
          );
        }
        const BATCH_SIZE = 10;

        // フォルダ作成
        let batch: Promise<void>[] = [];
        for (const tile of tilesToDownload) {
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
        let batchDownload: Promise<void>[] = [];
        // 404・PMTiles の範囲外以外で取れなかった枚数。完了扱いは変えず、1枚でもあれば枚数を知らせる
        let failedCount = 0;
        // PMTiles は範囲外のタイルを undefined で返すので、1枚も保存されなかったことを数えて知らせる
        let savedCount = 0;
        let d = 0;

        for (const tile of tilesToDownload) {
          if (pause.current) {
            if (await handlePause()) return;
          }

          const tilePromise = downloadTileOfMap(
            tileType,
            currentTileMap,
            tile,
            pmtile,
            pmtileIsVector,
            tileSignatures
          ).then((result) => {
            if (result === 'saved') savedCount++;
            else if (result === 'failed') failedCount++;
          });

          batchDownload.push(tilePromise);
          if (batchDownload.length >= BATCH_SIZE) {
            d = d + BATCH_SIZE;
            const mapProgress = (((skippedCount + d) / tiles.length) * 100).toFixed();
            setProgress(
              t('hooks.progress.downloadingMap', {
                current: i + 1,
                total: totalMaps,
                name: currentTileMap.name,
                progress: mapProgress,
              })
            );
            await Promise.all(batchDownload);
            batchDownload = [];
          }
        }
        await Promise.all(batchDownload);

        // 1枚も保存できなかったら完了扱いにしない（保存範囲の枠が出て、保存済みと誤解される）。
        // 再開で保存済みを飛ばした地図は、既に保存したタイルがあるので対象外
        if (tileType === 'pmtiles' && skippedCount === 0 && savedCount === 0) {
          errorMaps.push(
            failedCount > 0 ? currentTileMap.name : `${currentTileMap.name} (${t('hooks.message.noTilesInRange')})`
          );
          updatedTileRegions = removeIncompleteRegions(updatedTileRegions, [tileRegion.id]);
          dispatch(editSettingsAction({ tileRegions: updatedTileRegions }));
          continue;
        }

        if (failedCount > 0) {
          errorMaps.push(t('hooks.message.failedTileCount', { name: currentTileMap.name, count: failedCount }));
          hasFailedTiles = true;
        }

        // この地図は完了: 未完了マーカー（status/zoom）を外して保存する
        updatedTileRegions = updatedTileRegions.map((r) => (r.id === tileRegion.id ? toCompletedRegion(r) : r));
        dispatch(editSettingsAction({ tileRegions: updatedTileRegions }));

        totalCompleted++;
      }

      setIsDownloading(false);

      let message = t('hooks.message.completeDownloadMaps', { total: totalCompleted });
      if (errorMaps.length > 0) {
        message += `\n\n${t('hooks.message.mapsWithError')}\n${errorMaps.join('\n')}`;
        if (hasFailedTiles) message += `\n\n${t('hooks.message.retryFailedTiles')}`;
      }
      await AlertAsync(message);
    },
    [dispatch, downloadArea, promptResumeAfterBackground, store, tileSignatures]
  );

  const resumeDownloadTiles = useCallback(async () => {
    const currentTileRegions = store.getState().settings.tileRegions;
    const pendingRegions = currentTileRegions.filter((r) => r.status !== undefined);
    if (pendingRegions.length === 0) return;
    const maps = tileMaps && tileMaps.length > 0 ? tileMaps : store.getState().tileMaps;
    const resumeMaps: TileMapType[] = [];
    const resumeRegions: TileRegionType[] = [];
    const orphanIds: string[] = [];
    for (const region of pendingRegions) {
      // 標高タイルの疑似地図はRedux tileMapsに存在しないため合成して引き当てる
      const map =
        region.tileMapId === DEM_MAPTERHORN_MAP_ID ? getDemTileMap() : maps.find((m) => m.id === region.tileMapId);
      if (map) {
        resumeMaps.push(map);
        resumeRegions.push(region);
      } else {
        // 地図が削除されている場合は再開できないため記録を破棄する
        orphanIds.push(region.id);
      }
    }
    if (orphanIds.length > 0) {
      dispatch(editSettingsAction({ tileRegions: currentTileRegions.filter((r) => !orphanIds.includes(r.id)) }));
    }
    if (resumeMaps.length === 0) return;
    // zoomは各regionに保存された値を使うため、第1引数はフォールバックにすぎない
    await downloadMultipleTiles(resumeRegions[0].zoom ?? 11, resumeMaps, resumeRegions);
  }, [dispatch, downloadMultipleTiles, store, tileMaps]);

  useEffect(() => {
    resumeFnRef.current = resumeDownloadTiles;
  }, [resumeDownloadTiles]);

  // ダウンロード中にバックグラウンドへ移行したら安全に一時停止し、フォアグラウンド復帰時に再開を確認する
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'background' && isDownloadingRef.current) {
        pause.current = true;
        pauseReason.current = 'background';
      } else if (nextAppState === 'active') {
        promptResumeAfterBackground();
      }
    });
    return () => subscription.remove();
  }, [promptResumeAfterBackground]);

  // 強制終了などで残った未完了ダウンロードを起動時に検出して再開を提案する
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!rehydrated || checkedIncompleteOnLaunch.current) return;
    checkedIncompleteOnLaunch.current = true;
    (async () => {
      const hasPending = store.getState().settings.tileRegions.some((r) => r.status !== undefined);
      if (!hasPending) return;
      const choice = await ResumeDownloadConfirmAsync(t('hooks.confirm.resumeIncompleteDownload'));
      if (choice === 'resume') {
        await resumeFnRef.current?.();
      } else if (choice === 'discard') {
        discardIncompleteDownloads();
      }
      // 'later'はpausedのまま保持し、次回起動時に改めて確認する
    })();
  }, [discardIncompleteDownloads, rehydrated, store]);

  useEffect(() => {
    //ダウンロードしたタイルの情報
    (async () => {
      // Web版では FileSystem.getInfoAsync が使えないのでスキップ
      if (Platform.OS === 'web') {
        setTileSize('0');
        return;
      }

      if (!tileMaps || tileMaps.length === 0) {
        if (tileMap) {
          const info = await FileSystem.getInfoAsync(`${TILE_FOLDER}/${tileMap.id}`);
          const size = info.exists ? (info.size / 1048576).toFixed(1) : '0';
          setTileSize(size);
        }
        return;
      }

      // 選択された地図のサイズの合計を計算。疑似地図（標高タイル）はフォルダ名=IDなのでIDベースで走査し、
      // 「すべての地図」（未選択）時は常に含める
      const idsToCheck =
        selectedTileMapIds && selectedTileMapIds.length > 0
          ? selectedTileMapIds
          : [...tileMaps.filter(isDownloadableTileMap).map((m) => m.id), DEM_MAPTERHORN_MAP_ID];

      let totalSize = 0;
      for (const id of idsToCheck) {
        const info = await FileSystem.getInfoAsync(`${TILE_FOLDER}/${id}`);
        if (info.exists) {
          totalSize += info.size;
        }
      }
      const size = (totalSize / 1048576).toFixed(1);
      setTileSize(size);
    })();
  }, [isDownloading, tileMap, selectedTileMapIds, tileMaps, tileRegions]);

  return {
    isDownloading,
    downloadArea,
    savedArea,
    downloadProgress,
    savedTileSize,
    downloadTiles,
    downloadMultipleTiles,
    resumeDownloadTiles,
    hasIncompleteDownload,
    stopDownloadTiles,
    clearTiles,
  } as const;
};
