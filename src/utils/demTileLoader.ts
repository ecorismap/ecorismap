/**
 * 任意の標高タイルURL（産総研GEBCO・陰影起伏のソース等）の取得とデコード（ネイティブ版）。
 *
 * Mapterhorn本体はdemSource.tsが担う。ここはレイヤごとにURLが違うもの
 * （3Dの段彩テクスチャ・海底値・等深線ラベル）のための汎用の取得口。
 * ファイルはcacheDirectory（OSがストレージ逼迫時に自動削除できる領域）にキャッシュし、
 * デコードはネイティブ（modules/dem-decoder）でJSスレッドの外で行う。
 * 0バイトのファイルは404（海上・提供範囲外）のマーカー。
 */
import * as FileSystem from 'expo-file-system/legacy';
import { File } from 'expo-file-system';
import { decodeDemFile, DemDecodeEncoding } from '../../modules/dem-decoder/src';

const CACHE_DIR = `${FileSystem.cacheDirectory}dem_tiles`;
let dirEnsured = false;

const cacheFileUri = (key: string) => `${CACHE_DIR}/${encodeURIComponent(key)}`;

/** デコード済み標高（行優先・一辺size）。GSI形式のNoData・透明画素はNaN */
export type DecodedDemTile = { size: number; elev: Float32Array };

/**
 * ファイルを標高へデコードする。壊れたファイル・正方形でないタイルはnull
 */
export const decodeDemTileFile = async (
  fileUri: string,
  encoding: DemDecodeEncoding
): Promise<DecodedDemTile | null> => {
  try {
    const result = await decodeDemFile(fileUri, encoding);
    if (result.width !== result.height) return null;
    return { size: result.width, elev: result.elevation };
  } catch {
    return null;
  }
};

/**
 * 標高タイルを取得してキャッシュファイルのパスを返す。
 * @returns ファイルのパス。404はnull。ネットワークエラーはthrow（呼び出し側でキャッシュさせないため）
 */
export const fetchDemTileFile = async (url: string, key: string): Promise<string | null> => {
  const fileUri = cacheFileUri(key);
  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (info.exists) return (info.size ?? 0) === 0 ? null : fileUri;
  } catch {
    // 読めなければネットワークから取得し直す
  }
  if (!dirEnsured) {
    await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true }).catch(() => {});
    dirEnsured = true;
  }
  // ネットワークエラー時はdownloadAsyncがthrowし、呼び出し側でキャッシュされない
  const res = await FileSystem.downloadAsync(url, fileUri);
  if (res.status === 200) return fileUri;
  if (res.status === 404) {
    // 404はエラーページ等が書かれている可能性があるので0バイトのマーカーで上書き
    await FileSystem.writeAsStringAsync(fileUri, '').catch(() => {});
    return null;
  }
  // 5xx等は一時的とみなし、キャッシュに残さない
  await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
  throw new Error(`DEM tile download failed: ${res.status}`);
};

/** ローカルファイル（オフラインダウンロード済みタイル等）があればそのパス。無い・空ならnull */
export const localDemTileFile = async (fileUri: string): Promise<string | null> => {
  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    return info.exists && (info.size ?? 0) > 0 ? fileUri : null;
  } catch {
    return null;
  }
};

/**
 * ローカルファイルをバイト列として読む（地図タイル画像のJSデコード用）。
 * 存在しない・空・読めない場合はnull。base64を経由せずネイティブから直接受け取る
 */
export const readLocalFileBytes = async (fileUri: string): Promise<ArrayBuffer | null> => {
  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists || (info.size ?? 0) === 0) return null;
    const bytes = await new File(fileUri).bytes();
    // Uint8Arrayのviewがバッファ全体とは限らないため、必要ならコピーして切り出す
    return bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
      ? (bytes.buffer as ArrayBuffer)
      : (bytes.slice().buffer as ArrayBuffer);
  } catch {
    return null;
  }
};

/** ディスクキャッシュを削除する */
export const clearDemTileDiskCache = async (): Promise<void> => {
  await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true }).catch(() => {});
  dirEnsured = false;
};
