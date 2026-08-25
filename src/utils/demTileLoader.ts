/**
 * 標高タイルのPNGバイト列を取得する（ネイティブ版）。
 *
 * cacheDirectory（OSがストレージ逼迫時に自動削除できる領域）にディスクキャッシュする。
 * 地図タイルのTILE_FOLDER（documentDirectory・ユーザーの明示ダウンロード）とは用途が違うため分けている。
 * 0バイトのファイルは404（海上・提供範囲外）のマーカー。
 *
 * @returns PNGバイト列。404はnull。ネットワークエラーはthrow（呼び出し側でキャッシュさせないため）
 */
import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

const CACHE_DIR = `${FileSystem.cacheDirectory}dem_png`;
let dirEnsured = false;

const cacheFileUri = (key: string) => `${CACHE_DIR}/${key.replace(/\//g, '_')}.png`;

/** atobに依存しない素朴なbase64デコード */
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_LOOKUP = new Uint8Array(128);
for (let i = 0; i < BASE64_CHARS.length; i++) {
  BASE64_LOOKUP[BASE64_CHARS.charCodeAt(i)] = i;
}

const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  let length = base64.length;
  while (length > 0 && base64[length - 1] === '=') length--;
  const byteLength = Math.floor((length * 3) / 4);
  const bytes = new Uint8Array(byteLength);
  let p = 0;
  for (let i = 0; i < length; i += 4) {
    const a = BASE64_LOOKUP[base64.charCodeAt(i)];
    const b = BASE64_LOOKUP[base64.charCodeAt(i + 1)];
    const c = i + 2 < length ? BASE64_LOOKUP[base64.charCodeAt(i + 2)] : 0;
    const d = i + 3 < length ? BASE64_LOOKUP[base64.charCodeAt(i + 3)] : 0;
    bytes[p++] = (a << 2) | (b >> 4);
    if (p < byteLength) bytes[p++] = ((b & 15) << 4) | (c >> 2);
    if (p < byteLength) bytes[p++] = ((c & 3) << 6) | d;
  }
  return bytes.buffer;
};

const readTileFile = async (fileUri: string): Promise<ArrayBuffer> => {
  const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
  return base64ToArrayBuffer(base64);
};

export const loadDemTilePng = async (url: string, key: string): Promise<ArrayBuffer | null> => {
  const fileUri = cacheFileUri(key);

  // ディスクキャッシュを確認
  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (info.exists) {
      if ((info.size ?? 0) === 0) return null; // 404マーカー
      return await readTileFile(fileUri);
    }
  } catch {
    // 読めなければネットワークから取得し直す
  }

  if (!dirEnsured) {
    await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true }).catch(() => {});
    dirEnsured = true;
  }

  // ネットワークエラー時はdownloadAsyncがthrowし、呼び出し側でキャッシュされない
  const res = await FileSystem.downloadAsync(url, fileUri);
  if (res.status !== 200) {
    // 404はエラーページ等が書かれている可能性があるので0バイトのマーカーで上書き
    await FileSystem.writeAsStringAsync(fileUri, '').catch(() => {});
    return null;
  }
  return await readTileFile(fileUri);
};


/**
 * ローカルファイル（オフラインダウンロード済みタイル等）のPNGバイト列を読む。
 * 存在しない・空・読めない場合はnull。
 */
export const loadLocalDemTilePng = async (fileUri: string): Promise<ArrayBuffer | null> => {
  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists || (info.size ?? 0) === 0) return null;
    return await readTileFile(fileUri);
  } catch {
    return null;
  }
};

/** バイト列がWebP（RIFFコンテナ）か */
const isWebp = (buffer: ArrayBuffer): boolean => {
  const bytes = new Uint8Array(buffer);
  return bytes.length > 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
};

/**
 * WebPファイルをPNGへ変換してバイト列を返す。
 * HermesのJS側デコーダ（pngLite）はWebPを読めないため、ネイティブのデコーダを
 * expo-image-manipulator経由で借りる（無変換・可逆PNG出力なので標高値は保たれる）。
 */
const convertWebpFileToPng = async (fileUri: string): Promise<ArrayBuffer | null> => {
  try {
    const result = await manipulateAsync(fileUri, [], { format: SaveFormat.PNG, base64: true });
    if (!result.base64) return null;
    return base64ToArrayBuffer(result.base64);
  } catch {
    return null;
  }
};

/**
 * 標高タイルをPNGバイト列として取得する（WebP配信のelev2用）。
 * 取得はloadDemTilePngと同じキャッシュを使い、WebPならPNGへ変換して返す。
 */
export const loadDemTileAsPngBytes = async (url: string, key: string): Promise<ArrayBuffer | null> => {
  const bytes = await loadDemTilePng(url, key);
  if (bytes === null || !isWebp(bytes)) return bytes;
  return await convertWebpFileToPng(cacheFileUri(key));
};

/** ローカルファイル版。WebPならPNGへ変換して返す */
export const loadLocalDemTileAsPngBytes = async (fileUri: string): Promise<ArrayBuffer | null> => {
  const bytes = await loadLocalDemTilePng(fileUri);
  if (bytes === null || !isWebp(bytes)) return bytes;
  return await convertWebpFileToPng(fileUri);
};

/** ディスクキャッシュを削除する（設定画面等からの利用を想定） */
export const clearDemTileDiskCache = async (): Promise<void> => {
  await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true }).catch(() => {});
  dirEnsured = false;
};
