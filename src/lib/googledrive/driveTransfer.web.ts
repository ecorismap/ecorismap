import { downloadFileUrl, driveFetch } from './driveApi';
import { DriveApiError } from './types';

export async function readChunk(source: string | Blob, offset: number, size: number): Promise<Blob | Uint8Array> {
  if (typeof source === 'string') {
    throw new DriveApiError(0, 'invalidSource', 'Web upload source must be a Blob');
  }
  return source.slice(offset, Math.min(offset + size, source.size));
}

export async function downloadToUri(fileId: string): Promise<string> {
  const res = await driveFetch(downloadFileUrl(fileId));
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
