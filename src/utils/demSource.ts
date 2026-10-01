/**
 * 標高タイルの取得元（Mapterhorn）とデコードの共通基盤（ネイティブ版）。
 *
 * Mapterhornはterrarium形式のWebP（512px）。デコードはネイティブ（modules/dem-decoder）で
 * JSスレッドの外で行い、標高[m]のFloat32をコピーなしで受け取る。
 * 計画と速度比較の結果は docs/MAPTERHORN_MIGRATION_PLAN.md 参照。
 *
 * 参照順: デコード済みLRU → オフラインDL → ディスクキャッシュ → ネットワーク。
 * 0バイトのファイルは404（外洋・提供範囲外）のマーカー。
 */
import * as FileSystem from 'expo-file-system/legacy';
import { decodeDemFile } from '../../modules/dem-decoder/src';
import { TILE_FOLDER } from '../constants/AppConstants';
import { DEM_MAPTERHORN_MAP_ID, MAPTERHORN_URL } from '../constants/DemSources';
import { createDemTileCache, DemTile, DemTileResult, demTileKey, isValidTile } from './demSourceCommon';

export type { DemTile, DemTileResult } from './demSourceCommon';
export { DEM_SOURCE_TILE_SIZE } from './demSourceCommon';

const CACHE_DIR = `${FileSystem.cacheDirectory}dem_mapterhorn`;
let cacheDirEnsured = false;

const cacheFileUri = (z: number, x: number, y: number) => `${CACHE_DIR}/${z}_${x}_${y}.webp`;
/** オフラインDLの保存先（TILE_FOLDER/dem_mapterhorn/{z}/{x}/{y}.webp） */
export const downloadedDemTileUri = (z: number, x: number, y: number) =>
  `${TILE_FOLDER}/${DEM_MAPTERHORN_MAP_ID}/${z}/${x}/${y}.webp`;

const tileUrl = (z: number, x: number, y: number) =>
  MAPTERHORN_URL.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));

const cache = createDemTileCache();

/** ファイルの状態。0バイトは404マーカー */
const fileState = async (uri: string): Promise<'data' | 'noData' | 'missing'> => {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return 'missing';
    return (info.size ?? 0) === 0 ? 'noData' : 'data';
  } catch {
    return 'missing';
  }
};

/**
 * ファイルをデコードする。壊れたファイル（途中で切れたダウンロード等）はundefinedを返し、
 * 呼び出し側で取り直せるようにする。
 */
const decodeFile = async (z: number, x: number, y: number, uri: string): Promise<DemTile | undefined> => {
  try {
    const result = await decodeDemFile(uri, 'terrarium');
    if (result.width !== result.height) return undefined;
    return { z, x, y, size: result.width, elev: result.elevation, min: result.min, max: result.max };
  } catch {
    return undefined;
  }
};

/** ネットワークから取得してディスクキャッシュへ保存する。404はマーカーを書いてnull */
const download = async (z: number, x: number, y: number): Promise<'data' | 'noData' | 'error'> => {
  if (!cacheDirEnsured) {
    await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true }).catch(() => {});
    cacheDirEnsured = true;
  }
  const uri = cacheFileUri(z, x, y);
  // 電波が不安定な屋外での瞬断に備えて1回だけリトライする
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await FileSystem.downloadAsync(tileUrl(z, x, y), uri);
      if (res.status === 200) return 'data';
      if (res.status === 404) {
        // 本文（エラーメッセージ）が書かれているので0バイトのマーカーで上書きする
        await FileSystem.writeAsStringAsync(uri, '');
        return 'noData';
      }
      // 5xx等は一時的とみなし、キャッシュに残さない
      await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    } catch {
      await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    }
  }
  return 'error';
};

const loadTile = async (z: number, x: number, y: number): Promise<DemTileResult> => {
  // オフラインDL済みを最優先（オンライン時も通信を省ける）
  const offlineUri = downloadedDemTileUri(z, x, y);
  const offline = await fileState(offlineUri);
  if (offline === 'noData') return null;
  if (offline === 'data') {
    const tile = await decodeFile(z, x, y, offlineUri);
    if (tile !== undefined) return tile;
  }

  const cacheUri = cacheFileUri(z, x, y);
  const cached = await fileState(cacheUri);
  if (cached === 'noData') return null;
  if (cached === 'data') {
    const tile = await decodeFile(z, x, y, cacheUri);
    if (tile !== undefined) return tile;
    // 壊れたキャッシュは捨てて取り直す
    await FileSystem.deleteAsync(cacheUri, { idempotent: true }).catch(() => {});
  }

  const fetched = await download(z, x, y);
  if (fetched === 'noData') return null;
  if (fetched === 'error') return undefined;
  const tile = await decodeFile(z, x, y, cacheUri);
  if (tile === undefined) await FileSystem.deleteAsync(cacheUri, { idempotent: true }).catch(() => {});
  return tile;
};

/**
 * 標高タイルを取得する。
 * @returns 標高タイル / null=データなし（外洋・提供範囲外） / undefined=通信エラー等（一時的、キャッシュしない）
 */
export const getDemTile = (z: number, x: number, y: number): Promise<DemTileResult> => {
  if (!isValidTile(z, x, y)) return Promise.resolve(null);
  return cache.getOrLoad(demTileKey(z, x, y), () => loadTile(z, x, y));
};

/** デコード済みLRUにあるタイルを同期で返す（未取得はundefined） */
export const peekDemTile = (z: number, x: number, y: number): DemTile | null | undefined =>
  cache.peek(demTileKey(z, x, y));

/** メモリ上のキャッシュを捨てる */
export const clearDemTileMemoryCache = (): void => cache.clear();

/** ディスクキャッシュを削除する（オフラインDLは消さない） */
export const clearDemTileDiskCache = async (): Promise<void> => {
  await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true }).catch(() => {});
  cacheDirEnsured = false;
};
