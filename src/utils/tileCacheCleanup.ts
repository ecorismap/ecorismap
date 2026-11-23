import * as FileSystem from 'expo-file-system/legacy';
import { TILE_FOLDER } from '../constants/AppConstants';
import { DEM_MAPTERHORN_MAP_ID, LEGACY_DEM_VIEWSHED_MAP_ID } from '../constants/DemSources';
import { TileMapType, TileRegionType } from '../types';
import { getExt } from './General';
import { db } from './db';

/**
 * 地図のフォルダ（`${TILE_FOLDER}/${id}`）で、消しても取り直せるもの・消すと戻らないものを分ける規則。
 * 「キャッシュをクリア」・ダウンロード画面の削除・地図の取得内容の変更では、取り直せるタイルだけを消す。
 * フォルダごと消すのは地図そのものを削除するとき（useMaps.clearTiles）だけ。
 */

// タイルはズームごとの数字ディレクトリか .pbf。style.json や取り込んだ .pmtiles 本体はここに当てはまらない
export const isTileCacheEntry = (name: string) => /^\d+$/.test(name) || name.toLowerCase().endsWith('.pbf');

// metadata.json はベクタ PMTiles のダウンロード時に配信元から取ったもので、次のダウンロードで取り直せる
export const isRefetchableTileCacheEntry = (name: string) => isTileCacheEntry(name) || name === 'metadata.json';

/**
 * フォルダの中身が端末で生成した実体で、取り直す経路がない地図か。
 * PDF 地図のタイルは取り込み時に PDF から作ったもので、配信元が無い（URL の PDF も自動では取り直さない）
 */
export const hasIrreplaceableTiles = (tileMap: Pick<TileMapType, 'url'>): boolean => {
  const { url } = tileMap;
  return (
    url.endsWith('.pdf') ||
    getExt(url).toLowerCase() === 'pdf' ||
    url.startsWith('pdf://') ||
    url.startsWith('file://') ||
    url.includes('blob:')
  );
};

/** 1つの地図フォルダから、取り直せるタイルだけを消す（style.json・boundary.json などは残す）。ネイティブ専用 */
export const removeTileCacheEntries = async (mapId: string): Promise<void> => {
  const folder = `${TILE_FOLDER}/${mapId}`;
  const entries = await FileSystem.readDirectoryAsync(folder).catch(() => [] as string[]);
  for (const name of entries) {
    if (!isRefetchableTileCacheEntry(name)) continue;
    await FileSystem.deleteAsync(`${folder}/${name}`, { idempotent: true });
  }
};

// tileMaps に載らない内部専用の地図で、タイルは配信元から取り直せる
const REFETCHABLE_PSEUDO_MAP_IDS = [DEM_MAPTERHORN_MAP_ID, LEGACY_DEM_VIEWSHED_MAP_ID];

/**
 * 端末内の地図フォルダから、取り直せるタイルだけを消す。ネイティブ専用。
 * 対象は今の一覧にある PDF 以外の地図と、標高タイルなどの疑似地図だけ。
 * 一覧に無いフォルダは触らない。PDF 地図のフォルダは数字ディレクトリだけで中身から見分けられず、
 * プロジェクトを開いている間や .ecorismap の読み込み後は一覧から外れていても、
 * バックアップの復元などで一覧に戻ることがあるため（Web の clearWebTileCache と同じ扱い）。
 * 戻り値はタイルを消した地図 ID（保存範囲の記録を外すため）
 */
export const clearRefetchableTileCache = async (tileMaps: Pick<TileMapType, 'id' | 'url'>[]): Promise<string[]> => {
  const targetIds = [
    ...tileMaps.filter((tileMap) => !hasIrreplaceableTiles(tileMap)).map(({ id }) => id),
    ...REFETCHABLE_PSEUDO_MAP_IDS,
  ];
  const folders = await FileSystem.readDirectoryAsync(TILE_FOLDER).catch(() => [] as string[]);
  const clearedIds: string[] = [];
  for (const mapId of folders) {
    if (!targetIds.includes(mapId)) continue;
    await removeTileCacheEntries(mapId);
    clearedIds.push(mapId);
  }
  return clearedIds;
};

/**
 * Web の「キャッシュをクリア」。Web はタイルを保存しておらず、IndexedDB の行は取り込んだ実体なので、
 * 取り直せる行（blob も style も持たず boundary だけの pmtiles 行）だけを消す。
 * - pmtiles の blob（取り込んだ PMTiles 本体）と style（取り込んだ・共有のスタイル）は残す
 * - geotiff（PDF 地図）は url が file:// なら唯一の実体、URL・pdf:// でも自動では取り直さないので残す
 * - 今の地図一覧に無い行も消さない（プロジェクトの切り替えで一時的に一覧から外れた地図の実体かもしれない）
 * boundary だけの行は地図一覧のタップ時に配信元から取り直される（Maps.tsx の loadBoundary）
 */
export const clearWebTileCache = async (): Promise<void> => {
  const pmtilesRows = await db.pmtiles.toArray();
  for (const row of pmtilesRows) {
    if (row.blob === undefined && (row.style === undefined || row.style === '')) {
      await db.pmtiles.delete(row.mapId);
    }
  }
};

/** タイルを消した地図の保存範囲の記録を外す（触らなかったフォルダの記録は残す） */
export const regionsAfterTileCacheClear = (tileRegions: TileRegionType[], clearedMapIds: string[]): TileRegionType[] =>
  tileRegions.filter(({ tileMapId }) => !clearedMapIds.includes(tileMapId));
