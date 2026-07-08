import { getAccessToken } from './auth';
import { APP_FOLDER_NAME, DriveApiError, DriveFileMeta } from './types';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

export const FILE_FIELDS = 'id,name,mimeType,size,modifiedTime,headRevisionId,appProperties';

const RETRYABLE_STATUS = [429, 500, 502, 503, 504];
const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function toDriveApiError(res: Response): Promise<DriveApiError> {
  let reason = 'unknown';
  let message = res.statusText;
  try {
    const body = (await res.json()) as { error?: { message?: string; errors?: { reason?: string }[] } };
    if (body.error?.message !== undefined) message = body.error.message;
    if (body.error?.errors?.[0]?.reason !== undefined) reason = body.error.errors[0].reason;
  } catch {
    // JSONでないエラーボディはstatusTextのまま扱う
  }
  return new DriveApiError(res.status, reason, message);
}

export async function driveFetch(url: string, init: RequestInit = {}): Promise<Response> {
  let token = await getAccessToken();
  let authRetried = false;
  let attempt = 0;
  for (;;) {
    const res = await fetch(url, {
      ...init,
      headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` },
    });
    if (res.status === 401 && !authRetried) {
      authRetried = true;
      token = await getAccessToken({ forceRefresh: true });
      continue;
    }
    if (RETRYABLE_STATUS.includes(res.status) && attempt < MAX_ATTEMPTS - 1) {
      attempt++;
      await sleep(BACKOFF_BASE_MS * 2 ** (attempt - 1));
      continue;
    }
    if (res.status >= 400) {
      throw await toDriveApiError(res);
    }
    return res;
  }
}

export async function listFiles(params: { q: string; fields?: string }): Promise<DriveFileMeta[]> {
  const files: DriveFileMeta[] = [];
  let pageToken: string | undefined;
  do {
    const search = new URLSearchParams({
      q: params.q,
      fields: `nextPageToken,files(${params.fields ?? FILE_FIELDS})`,
      pageSize: '100',
      spaces: 'drive',
    });
    if (pageToken !== undefined) search.set('pageToken', pageToken);
    const res = await driveFetch(`${DRIVE_API}/files?${search.toString()}`);
    const body = (await res.json()) as { nextPageToken?: string; files?: DriveFileMeta[] };
    files.push(...(body.files ?? []));
    pageToken = body.nextPageToken;
  } while (pageToken !== undefined);
  return files;
}

let appFolderIdCache: string | undefined;

export function clearAppFolderCache() {
  appFolderIdCache = undefined;
}

export async function ensureAppFolder(): Promise<string> {
  if (appFolderIdCache !== undefined) return appFolderIdCache;
  const escapedName = APP_FOLDER_NAME.replace(/'/g, "\\'");
  const found = await listFiles({
    q: `mimeType='${FOLDER_MIME}' and name='${escapedName}' and trashed=false`,
    fields: 'id,name',
  });
  if (found.length > 0) {
    appFolderIdCache = found[0].id;
    return appFolderIdCache;
  }
  const res = await driveFetch(`${DRIVE_API}/files?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: APP_FOLDER_NAME,
      mimeType: FOLDER_MIME,
      appProperties: { ecorismapAppFolder: '1' },
    }),
  });
  const body = (await res.json()) as { id: string };
  appFolderIdCache = body.id;
  return appFolderIdCache;
}

export async function getFileMetadata(fileId: string, fields?: string): Promise<DriveFileMeta> {
  const search = new URLSearchParams({ fields: fields ?? FILE_FIELDS });
  const res = await driveFetch(`${DRIVE_API}/files/${fileId}?${search.toString()}`);
  return (await res.json()) as DriveFileMeta;
}

export async function updateFileMetadata(
  fileId: string,
  meta: { name?: string; appProperties?: Record<string, string>; trashed?: boolean }
): Promise<DriveFileMeta> {
  const res = await driveFetch(`${DRIVE_API}/files/${fileId}?fields=${FILE_FIELDS}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(meta),
  });
  return (await res.json()) as DriveFileMeta;
}

export async function trashFile(fileId: string): Promise<void> {
  await updateFileMetadata(fileId, { trashed: true });
}

export function downloadFileUrl(fileId: string): string {
  return `${DRIVE_API}/files/${fileId}?alt=media`;
}

export async function initiateResumableUpload(args: {
  fileId?: string;
  metadata: { name?: string; parents?: string[]; appProperties?: Record<string, string>; mimeType?: string };
  contentLength: number;
  contentType: string;
}): Promise<string> {
  const url =
    args.fileId === undefined
      ? `${DRIVE_UPLOAD}/files?uploadType=resumable&fields=${FILE_FIELDS}`
      : `${DRIVE_UPLOAD}/files/${args.fileId}?uploadType=resumable&fields=${FILE_FIELDS}`;
  const res = await driveFetch(url, {
    method: args.fileId === undefined ? 'POST' : 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'X-Upload-Content-Type': args.contentType,
      'X-Upload-Content-Length': String(args.contentLength),
    },
    body: JSON.stringify(args.metadata),
  });
  const location = res.headers.get('Location') ?? res.headers.get('location');
  if (location === null) {
    throw new DriveApiError(res.status, 'noUploadSession', 'Resumable upload session URL was not returned');
  }
  return location;
}

export async function uploadChunk(
  sessionUrl: string,
  chunk: Blob | Uint8Array,
  offset: number,
  total: number
): Promise<{ done: boolean; nextOffset: number; file?: DriveFileMeta }> {
  const length = chunk instanceof Uint8Array ? chunk.byteLength : chunk.size;
  const res = await driveFetch(sessionUrl, {
    method: 'PUT',
    headers: { 'Content-Range': `bytes ${offset}-${offset + length - 1}/${total}` },
    body: chunk as BodyInit,
  });
  if (res.status === 308) {
    const range = res.headers.get('Range') ?? res.headers.get('range');
    const match = range?.match(/bytes=0-(\d+)/);
    const nextOffset = match !== null && match !== undefined ? Number(match[1]) + 1 : 0;
    return { done: false, nextOffset };
  }
  const file = (await res.json()) as DriveFileMeta;
  return { done: true, nextOffset: total, file };
}
