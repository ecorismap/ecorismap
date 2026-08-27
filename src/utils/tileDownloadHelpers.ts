import * as FileSystem from 'expo-file-system/legacy';
import { TileMapType, TileRegionType } from '../types';
import { TILE_FOLDER } from '../constants/AppConstants';
import { DEM_DOWNLOAD_MAX_ZOOM, DEM_DOWNLOAD_MIN_ZOOM, DEM_VIEWSHED_MAP_ID } from '../constants/DemSources';
import { getExt } from './General';
import { isDemProtocolUrl } from './terrainShading';
import { lonToTileX, latToTileY } from './Tile';

// hillshadeはrelief://（陰影段彩）も含む。どちらも生のDEMタイルを保存する点で同じ扱い。
// demは可視領域用の疑似地図（GSI→terrariumフォールバック保存、demTileDownload.ts）
export type TileType = 'pbf' | 'pmtiles' | 'hillshade' | 'png' | 'dem';

export const getTileType = (tileMap: TileMapType): TileType =>
  tileMap.id === DEM_VIEWSHED_MAP_ID
    ? 'dem'
    : getExt(tileMap.url) === 'pbf'
    ? 'pbf'
    : getExt(tileMap.url) === 'pmtiles' || tileMap.url.startsWith('pmtiles://')
    ? 'pmtiles'
    : isDemProtocolUrl(tileMap.url)
    ? 'hillshade'
    : 'png';

export const getZoomRange = (tileType: TileType, tileMap: TileMapType, zoom: number) => {
  // 可視領域の計算が使うのはselectDemZoomの返域(z8-14)のみなのでz0-7は取らない
  if (tileType === 'dem') return { minZoom: DEM_DOWNLOAD_MIN_ZOOM, maxZoom: DEM_DOWNLOAD_MAX_ZOOM };
  const minZoom = tileType === 'png' || tileType === 'hillshade' ? 0 : zoom;
  const maxZoom =
    tileType === 'png' || tileType === 'hillshade' || !tileMap.isVector ? Math.min(tileMap.overzoomThreshold, 16) : 18;
  return { minZoom, maxZoom };
};

// ダウンロード可否の閾値。ズームレベルではなく推定タイル数で判定する
// （最大z9のGEBCOは広域でも少数、z16まで取るラスタは広域だと爆発するため）
export const DOWNLOAD_TILE_COUNT_CONFIRM = 3000; // これ以下は確認なしで即開始
export const DOWNLOAD_TILE_COUNT_LIMIT = 30000; // これ超はダウンロード不可
export const ESTIMATED_TILE_SIZE_MB = 0.03; // 概算サイズ表示用（約30KB/枚）

// tilesForZoomと同じ数え方（max側+1タイル余分）を、配列を実体化せず算術で数える。
// 広域指定ではz16で数十万枚になるためtileGridForRegionの流用は不可
export const countTilesForRegion = (
  bounds: { minLon: number; minLat: number; maxLon: number; maxLat: number },
  minZoom: number,
  maxZoom: number
): number => {
  let count = 0;
  for (let z = minZoom; z <= maxZoom; z++) {
    const xCount = lonToTileX(bounds.maxLon, z) - lonToTileX(bounds.minLon, z) + 2;
    const yCount = latToTileY(bounds.minLat, z) - latToTileY(bounds.maxLat, z) + 2;
    count += xCount * yCount;
  }
  return count;
};

// 対象地図ごとに実際の取得ズーム範囲（getZoomRange）でタイル数を見積もり合算する
export const estimateDownloadTileCount = (
  bounds: { minLon: number; minLat: number; maxLon: number; maxLat: number },
  maps: TileMapType[],
  zoom: number
): number =>
  maps.reduce((total, tileMap) => {
    const { minZoom, maxZoom } = getZoomRange(getTileType(tileMap), tileMap, zoom);
    return total + countTilesForRegion(bounds, minZoom, maxZoom);
  }, 0);

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
