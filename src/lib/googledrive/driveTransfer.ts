import * as RNFS from 'react-native-fs';
import * as FileSystem from 'expo-file-system/legacy';
import { Buffer } from 'buffer';
import { getAccessToken } from './auth';
import { downloadFileUrl } from './driveApi';
import { DRIVE_FILE_EXT, DriveApiError } from './types';

export async function readChunk(source: string | Blob, offset: number, size: number): Promise<Blob | Uint8Array> {
  if (typeof source !== 'string') {
    throw new DriveApiError(0, 'invalidSource', 'Native upload source must be a file path');
  }
  // RNFS.read()はiOSネイティブ実装の引数型(NSInteger)がNew Architectureで変換できず例外になるため、
  // expo-file-systemの部分読み込みを使う
  const uri = source.startsWith('file://') ? source : `file://${encodeURI(source)}`;
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
    position: offset,
    length: size,
  });
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

export async function downloadToUri(fileId: string): Promise<string> {
  // ダウンロードに時間がかかってもトークンが切れないよう、残寿命を確保してから開始する
  const token = await getAccessToken({ minTtlSec: 600 });
  const toFile = `${RNFS.CachesDirectoryPath}/drive_${fileId}.${DRIVE_FILE_EXT}`;
  const result = await RNFS.downloadFile({
    fromUrl: downloadFileUrl(fileId),
    toFile,
    headers: { Authorization: `Bearer ${token}` },
  }).promise;
  if (result.statusCode !== 200) {
    throw new DriveApiError(result.statusCode ?? 0, 'downloadFailed', `Drive download failed (${result.statusCode})`);
  }
  return `file://${toFile}`;
}
