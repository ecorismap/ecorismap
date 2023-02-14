import pako from 'pako';
import { Buffer } from 'buffer';
import { Platform } from 'react-native';
import JSZip from 'jszip';
import * as FileSystem from 'expo-file-system';

export function gzip(str: string) {
  return Buffer.from(pako.deflate(str)).toString('base64');
}

export function unzip(value: string) {
  const buffer = Buffer.from(value, 'base64'); // base64 => Bufferに変換
  return Buffer.from(pako.inflate(buffer)).toString('utf-8'); // デコード
}

export const gzipFile = async (uri: string) => {
  const response = await fetch(uri);
  const blob = await response.blob();
  const buffer = await blob.arrayBuffer();
  const compressed = pako.deflate(toBuffer(buffer));
  const newBlob = new Blob([compressed], { type: blob.type });
  return newBlob;
};

export const unzipFile = async (blob: Blob) => {
  const buffer = await blob.arrayBuffer();
  const text = pako.inflate(toBuffer(buffer));
  const e = toArrayBuffer(Buffer.from(text));
  return new Blob([e], { type: blob.type });
};

function toArrayBuffer(buffer: Buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function toBuffer(byteArray: ArrayBuffer) {
  return Buffer.from(byteArray);
}

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
