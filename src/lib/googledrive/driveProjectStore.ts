import { ulid } from 'ulid';
import { getAccessToken } from './auth';
import { ensureAppFolder, initiateResumableUpload, listFiles, trashFile, uploadChunk } from './driveApi';
import { downloadToUri, readChunk } from './driveTransfer';
import {
  DRIVE_FILE_EXT,
  DRIVE_SCHEMA_VERSION,
  DriveApiError,
  DriveFileMeta,
  DriveProjectItem,
  LEGACY_DRIVE_FILE_EXT,
} from './types';

// 256KiBの倍数必須（Google Drive resumable uploadの仕様）
const CHUNK_SIZE = 8 * 1024 * 1024;

function toItem(f: DriveFileMeta): DriveProjectItem {
  return {
    fileId: f.id,
    name: f.name.replace(new RegExp(`\\.(${DRIVE_FILE_EXT}|${LEGACY_DRIVE_FILE_EXT})$`), ''),
    projectId: f.appProperties?.ecorismapProjectId ?? '',
    updatedAt: f.modifiedTime ?? f.appProperties?.ecorismapUpdatedAt ?? '',
    size: f.size !== undefined ? Number(f.size) : 0,
    headRevisionId: f.headRevisionId ?? '',
  };
}

export async function listDriveProjects(): Promise<DriveProjectItem[]> {
  const folderId = await ensureAppFolder();
  const files = await listFiles({
    q: `'${folderId}' in parents and trashed=false and appProperties has { key='ecorismapSchema' and value='${DRIVE_SCHEMA_VERSION}' }`,
  });
  return files.map(toItem).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function uploadDriveProject(args: {
  name: string;
  source: string | Blob;
  size: number;
  existingFileId?: string;
  projectId?: string;
  onProgress?: (progress: number) => void;
}): Promise<DriveProjectItem> {
  // 長時間アップロード中の期限切れを避けるため、開始前にトークンの残寿命を確保する
  await getAccessToken({ minTtlSec: 600 });

  const projectId = args.projectId ?? ulid();
  const fileName = `${args.name}.${DRIVE_FILE_EXT}`;
  const appProperties = {
    ecorismapSchema: DRIVE_SCHEMA_VERSION,
    ecorismapProjectId: projectId,
    ecorismapUpdatedAt: new Date().toISOString(),
  };
  // Hermes(RN 0.81)のバグ回避: 三項演算子の分岐内のオブジェクトリテラルにawaitを書くと
  // 式全体が数値0に評価される。awaitは必ず式の外に出すこと。
  let metadata: { name: string; parents?: string[]; appProperties: Record<string, string>; mimeType?: string };
  if (args.existingFileId === undefined) {
    const folderId = await ensureAppFolder();
    metadata = { name: fileName, parents: [folderId], appProperties, mimeType: 'application/zip' };
  } else {
    metadata = { name: fileName, appProperties };
  }

  const sessionUrl = await initiateResumableUpload({
    fileId: args.existingFileId,
    metadata,
    contentLength: args.size,
    contentType: 'application/zip',
  });

  let offset = 0;
  let file: DriveFileMeta | undefined;
  while (offset < args.size) {
    const chunk = await readChunk(args.source, offset, Math.min(CHUNK_SIZE, args.size - offset));
    const result = await uploadChunk(sessionUrl, chunk, offset, args.size);
    if (result.done) {
      file = result.file;
      break;
    }
    if (result.nextOffset <= offset) {
      throw new DriveApiError(0, 'stalled', 'Resumable upload did not make progress');
    }
    offset = result.nextOffset;
    args.onProgress?.(offset / args.size);
  }
  if (file === undefined) {
    throw new DriveApiError(0, 'incomplete', 'Resumable upload did not complete');
  }
  args.onProgress?.(1);
  return toItem(file);
}

export async function downloadDriveProject(fileId: string): Promise<string> {
  return await downloadToUri(fileId);
}

export async function deleteDriveProject(fileId: string): Promise<void> {
  await trashFile(fileId);
}
