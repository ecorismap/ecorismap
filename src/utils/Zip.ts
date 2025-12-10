import pako from 'pako';
import { Buffer } from 'buffer';
import { Platform } from 'react-native';
import JSZip from 'jszip';
import * as FileSystem from 'expo-file-system/legacy';

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
  let base64;
  if (Platform.OS === 'web') {
    const arr = uri.split(',');
    base64 = arr[arr.length - 1];
  } else {
    base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  }
  const loaded = await JSZip.loadAsync(base64, { base64: true });
  return loaded;
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
