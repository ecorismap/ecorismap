import * as FileSystem from 'expo-file-system/legacy';
import { TileMapType, TileRegionType } from '../types';
import { TILE_FOLDER } from '../constants/AppConstants';
import { getExt } from './General';
import { isReliefUrl } from './terrainShading';

export type TileType = 'pbf' | 'pmtiles' | 'relief' | 'png';

export const getTileType = (tileMap: TileMapType): TileType =>
  getExt(tileMap.url) === 'pbf'
    ? 'pbf'
    : getExt(tileMap.url) === 'pmtiles' || tileMap.url.startsWith('pmtiles://')
    ? 'pmtiles'
    : isReliefUrl(tileMap.url)
    ? 'relief'
    : 'png';

export const getZoomRange = (tileType: TileType, tileMap: TileMapType, zoom: number) => {
  const minZoom = tileType === 'png' || tileType === 'relief' ? 0 : zoom;
  const maxZoom =
    tileType === 'png' || tileType === 'relief' || !tileMap.isVector ? Math.min(tileMap.overzoomThreshold, 16) : 18;
  return { minZoom, maxZoom };
};

// 保存済みregionの4隅座標からダウンロード範囲を復元する（頂点順序に依存しない）
export const boundsFromCoords = (coords: TileRegionType['coords']) => {
  const lons = coords.map((c) => c.longitude);
  const lats = coords.map((c) => c.latitude);
  return {
    minLon: Math.min(...lons),
    minLat: Math.min(...lats),
    maxLon: Math.max(...lons),
    maxLat: Math.max(...lats),
  };
};

// 保存済みタイルを"z/x/y"キーのSetで返す。
// タイル毎のgetInfoAsyncではなくフォルダ毎のreadDirectoryAsyncで走査してコストを抑える。
// 失敗時は空Set（スキップされず再ダウンロードされるだけで安全側）。
export const listExistingTiles = async (tileMapId: string): Promise<Set<string>> => {
  const existing = new Set<string>();
  try {
    const zDirs = await FileSystem.readDirectoryAsync(`${TILE_FOLDER}/${tileMapId}`);
    for (const z of zDirs) {
      // metadata.json / style.json 等の非数値エントリを除外
      if (!/^\d+$/.test(z)) continue;
      const xDirs = await FileSystem.readDirectoryAsync(`${TILE_FOLDER}/${tileMapId}/${z}`);
      for (const x of xDirs) {
        if (!/^\d+$/.test(x)) continue;
        const files = await FileSystem.readDirectoryAsync(`${TILE_FOLDER}/${tileMapId}/${z}/${x}`);
        for (const file of files) {
          const y = file.replace(/\.(pbf|png)$/, '');
          if (!/^\d+$/.test(y)) continue;
          existing.add(`${z}/${x}/${y}`);
        }
      }
    }
  } catch (e) {
    return new Set<string>();
  }
  return existing;
};

// ダウンロード完了したregionからstatus/zoomを取り除く（undefined残しではなくキー自体を除去）
export const toCompletedRegion = (region: TileRegionType): TileRegionType => ({
  id: region.id,
  tileMapId: region.tileMapId,
  coords: region.coords,
  centroid: region.centroid,
});

// idsに含まれる未完了（status付き）regionを'paused'にする
export const markRegionsPaused = (tileRegions: TileRegionType[], ids: string[]): TileRegionType[] =>
  tileRegions.map((r) => (ids.includes(r.id) && r.status !== undefined ? { ...r, status: 'paused' as const } : r));

// idsに含まれる未完了（status付き）regionを削除する（完了済みregionは保持）
export const removeIncompleteRegions = (tileRegions: TileRegionType[], ids: string[]): TileRegionType[] =>
  tileRegions.filter((r) => !(ids.includes(r.id) && r.status !== undefined));
