import pako from 'pako';
import { Buffer } from 'buffer';
import { Platform } from 'react-native';
import JSZip from 'jszip';
import * as FileSystem from 'expo-file-system/legacy';
import { t } from '../i18n/config';

// 展開後の合計サイズの上限。JSZip は中身をすべてメモリに展開するため、圧縮率の高い ZIP（zip bomb）で
// 端末のメモリが尽きないよう、展開する前にセントラルディレクトリの申告サイズで拒否する
export const ZIP_MAX_TOTAL_UNCOMPRESSED_BYTES = 500 * 1024 * 1024;

export class ZipTooLargeError extends Error {
  constructor(totalBytes: number) {
    super(
      t('hooks.message.zipTooLarge', {
        size: Math.ceil(totalBytes / (1024 * 1024)),
        limit: ZIP_MAX_TOTAL_UNCOMPRESSED_BYTES / (1024 * 1024),
      })
    );
    this.name = 'ZipTooLargeError';
  }
}

// JSZip の公開型には無いが、loadAsync で読んだエントリは _data に申告サイズ（uncompressedSize）を持つ。
// JSZip は4バイトの値を符号付きで読むため、2GB以上の申告は負の値になる。符号なしに戻して数える
const declaredUncompressedSize = (file: JSZip.JSZipObject): number => {
  const data = (file as unknown as { _data?: { uncompressedSize?: unknown } })._data;
  const size = data?.uncompressedSize;
  if (typeof size !== 'number' || !Number.isFinite(size)) return 0;
  return size < 0 ? size + 2 ** 32 : size;
};

export const zipDeclaredUncompressedTotal = (zip: JSZip): number =>
  Object.values(zip.files).reduce((total, file) => total + declaredUncompressedSize(file), 0);

/**
 * 申告サイズを偽った ZIP は、JSZip が展開の終わりにサイズ不一致として失敗させる（そこまではメモリを使う）。
 * 利用者が自分で選んだファイルしか開かないため、申告サイズでの判定で足りるとしている
 */
export const assertZipWithinLimit = (zip: JSZip, limit = ZIP_MAX_TOTAL_UNCOMPRESSED_BYTES): JSZip => {
  const total = zipDeclaredUncompressedTotal(zip);
  if (total > limit) throw new ZipTooLargeError(total);
  return zip;
};

export function gzip(str: string) {
  return Buffer.from(pako.deflate(str)).toString('base64');
}

export function unzip(value: string) {
  const buffer = Buffer.from(value, 'base64'); // base64 => Bufferに変換
  return Buffer.from(pako.inflate(new Uint8Array(buffer))).toString('utf-8'); // デコード
}

export const gzipFile = async (uri: string) => {
  const response = await fetch(uri);
  const blob = await response.blob();
  const buffer = await blob.arrayBuffer();
  const compressed = pako.deflate(new Uint8Array(buffer));
  const newBlob = new Blob([compressed], { type: blob.type });
  return newBlob;
};

export const unzipFile = async (blob: Blob) => {
  const buffer = await blob.arrayBuffer();
  const text = pako.inflate(new Uint8Array(buffer));
  return new Blob([text], { type: blob.type });
};

export async function unzipFromUri(uri: string) {
  return assertZipWithinLimit(await loadZipFromUri(uri));
}

async function loadZipFromUri(uri: string) {
  if (Platform.OS === 'web') {
    // Web版: blob URLまたはdata URIに対応
    if (uri.startsWith('blob:') || uri.startsWith('http')) {
      const response = await fetch(uri);
      const arrayBuffer = await response.arrayBuffer();
      return await JSZip.loadAsync(arrayBuffer);
    } else if (uri.includes(',')) {
      // data URIの場合
      const arr = uri.split(',');
      const base64 = arr[arr.length - 1];
      return await JSZip.loadAsync(base64, { base64: true });
    } else {
      return await JSZip.loadAsync(uri, { base64: true });
    }
  } else {
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    return await JSZip.loadAsync(base64, { base64: true });
  }
}

//zipファイルを作成してtempフォルダに保存する
export async function compressFileToTempUri(uri: string) {
  const zip = await gzipFile(uri);
  const zipFileName = uri.split('/').pop() || 'temp.zip';
  const zipFilePath = `${FileSystem.cacheDirectory}${zipFileName}`;
  // Blob を base64 文字列に変換
  const arrayBuffer = await zip.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  const base64 = Buffer.from(uint8Array).toString('base64');
  await FileSystem.writeAsStringAsync(zipFilePath, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return zipFilePath;
}

//zipファイルを解凍してuriを返す
export async function decompressFileToTempUri(uri: string) {
  const loaded = await unzipFromUri(uri);
  //console.log(loaded);
  const files = Object.keys(loaded.files);
  const tempDir = `${FileSystem.cacheDirectory}temp/`;
  if (files.length !== 1) return;
  const fileData = await loaded.files[files[0]].async('base64');
  const filePath = `${tempDir}temp`;
  await FileSystem.writeAsStringAsync(filePath, fileData, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return filePath;
}
