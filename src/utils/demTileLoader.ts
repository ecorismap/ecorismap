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

const CACHE_DIR = `${FileSystem.cacheDirectory}dem_png`;
let dirEnsured = false;

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
  const fileUri = `${CACHE_DIR}/${key.replace(/\//g, '_')}.png`;

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


/** ディスクキャッシュを削除する（設定画面等からの利用を想定） */
export const clearDemTileDiskCache = async (): Promise<void> => {
  await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true }).catch(() => {});
  dirEnsured = false;
};
