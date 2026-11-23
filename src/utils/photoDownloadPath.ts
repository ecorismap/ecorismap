import { PHOTO_FOLDER } from '../constants/AppConstants';
import { isSafePathSegment } from './safePath';

/** 写真名の末尾に付ける一意な文字の長さ。ZIP 内のパスが長くなると Windows で解凍できないので短く保つ */
export const PHOTO_NAME_UNIQUE_LENGTH = 6;

// ULID の文字（Crockford Base32）
const UNIQUE_PHOTO_NAME = new RegExp(`^EMAP_\\d{8}_\\d{6}_[0-9A-HJKMNP-TV-Z]{${PHOTO_NAME_UNIQUE_LENGTH}}\\.[^./]+$`);
const ULID_PREFIXED_NAME = /^[0-9A-HJKMNP-TV-Z]{26}_/;

/**
 * 撮影・選択時に一意な文字を付けた写真名か（写真監査 P-L15 以降の命名）。
 * 以前の名前（EMAP_日付_時刻.拡張子）は秒単位なので、同じアカウントの別の端末で同じ秒に撮ると重なる
 */
export const isUniquePhotoName = (name: string): boolean => UNIQUE_PHOTO_NAME.test(name);

/** Storage の写真のパス（projects/{project}/PHOTO/{layer}/{uid}/{photoId}）を URL から読む */
const parsePhotoStoragePath = (url: string | null | undefined): { uid: string; photoId: string } | undefined => {
  if (typeof url !== 'string') return undefined;
  let decoded: string;
  try {
    decoded = decodeURIComponent(url);
  } catch (e) {
    return undefined;
  }
  const match = decoded.match(/projects\/[^/?#]+\/PHOTO\/[^/?#]+\/([^/?#]+)\/([^/?#]+)/);
  return match ? { uid: match[1], photoId: match[2] } : undefined;
};

export const photoIdFromUrl = (url: string | null | undefined): string | undefined =>
  parsePhotoStoragePath(url)?.photoId;

/**
 * 端末にある同名のファイルを、そのまま別の写真のものと取り違えずに使い回せる名前か。
 * 一意な文字を含む名前と、写真 id（ULID）を前に付けた名前だけ
 */
export const isCollisionFreePhotoFilename = (filename: string, photoId?: string): boolean =>
  isUniquePhotoName(filename) ||
  ULID_PREFIXED_NAME.test(filename) ||
  (photoId !== undefined && photoId !== '' && filename.startsWith(`${photoId}_`));

/** 写真をアップロードした人の uid を URL から読む */
export const photoUploaderUid = (url: string | null | undefined): string | undefined =>
  parsePhotoStoragePath(url)?.uid;

/**
 * クラウドの写真を端末へ保存する場所（フォルダとファイル名）。
 * 写真名は撮影した秒の自動命名なので、別のメンバーが同じ秒に撮ると同じ名前になる。他人の写真を自分のフォルダへ
 * 名前だけで保存すると、既にある自分の写真を使い回したり上書きしたりして、別人の写真に化ける。
 * 写真を撮った（アップロードした）人で決める。記録の持ち主は、他人の記録を編集すると編集した人に替わるので当てにならない。
 * アップロードした人は Storage のパス（projects/{project}/PHOTO/{layer}/{uid}/{photoId}）に入っているので URL から読む。
 * 読めないときだけ記録の持ち主で代える。
 * - 自分が撮った写真: 自分のフォルダに写真名で置く。ただし以前の秒単位の名前は、同じアカウントの別の端末で同じ秒に
 *   撮った写真と重なる（写真監査 P-L15）。この端末で同じ photo.id の写真がそのファイルを指していると確かめられた
 *   ときだけ、既にある同名のファイルを使い回す（reuseExisting）。確かめられなければ、同名のファイルがあれば
 *   downloadPhoto が `${photoId}_${name}` に保存する
 * - 他人が撮った写真: その人のフォルダに分け、写真 id を前に付ける（同じ人の別端末で同じ秒に撮った場合も分ける）
 * パスに使えない id・名前のときは undefined（保存しない）
 */
export const photoDownloadTarget = ({
  projectId,
  layerId,
  ownUid,
  recordUserId,
  photoId,
  photoName,
  photoUrl,
  localPhotoUri,
}: {
  projectId: string;
  layerId: string;
  ownUid: string;
  recordUserId: string | undefined;
  photoId: string;
  photoName: string;
  photoUrl?: string | null;
  /** この端末の記録で同じ photo.id の写真が指している uri。同期で届いた記録の uri は送り手の端末のパスなので渡さない */
  localPhotoUri?: string | null;
}): { folder: string; filename: string; reuseExisting?: boolean } | undefined => {
  if (![projectId, layerId, ownUid, photoName].every(isSafePathSegment)) return undefined;
  const ownerUid = photoUploaderUid(photoUrl) ?? recordUserId;
  const isOwn = ownerUid === undefined || ownerUid === ownUid;
  if (isOwn) {
    const folder = `${PHOTO_FOLDER}/${projectId}/${layerId}/${ownUid}`;
    if (!isCollisionFreePhotoFilename(photoName, photoId) && localPhotoUri === `${folder}/${photoName}`) {
      return { folder, filename: photoName, reuseExisting: true };
    }
    return { folder, filename: photoName };
  }
  if (!isSafePathSegment(ownerUid) || ownerUid === 'template') {
    // テンプレートなど持ち主のフォルダを作れない記録は、自分のフォルダに id 付きの名前で置く
    if (!isSafePathSegment(photoId)) return undefined;
    return { folder: `${PHOTO_FOLDER}/${projectId}/${layerId}/${ownUid}`, filename: `${photoId}_${photoName}` };
  }
  const filename = isSafePathSegment(photoId) ? `${photoId}_${photoName}` : photoName;
  return { folder: `${PHOTO_FOLDER}/${projectId}/${layerId}/${ownerUid}`, filename };
};

const isPhotoLike = (value: unknown): value is { id: string; uri: string | null | undefined } =>
  typeof value === 'object' && value !== null && typeof (value as { id?: unknown }).id === 'string';

/**
 * この端末の記録で、写真 id が指している uri（photoDownloadTarget の localPhotoUri に渡す）。
 * 同期で届いた記録の uri は送り手の端末のパスで、Android ではアプリ領域の絶対パスが端末間で同じになりやすい。
 * 同じアカウントの別の端末で同じ秒に撮った写真（写真監査 P-L15）は、手元の自分の写真と同じ uri を別の id で
 * 指すので、同じ uri を別の id の写真も指しているときや、同じ id が別々の uri を指しているときは確かめられないとして返さない
 */
export const findLocalPhotoUri = (
  dataSet: { layerId: string; data: { field: Record<string, unknown> }[] }[],
  layerId: string,
  photoId: string
): string | undefined => {
  const uris = new Set<string>();
  const idsByUri = new Map<string, Set<string>>();
  dataSet
    .filter((d) => d.layerId === layerId)
    .forEach((d) =>
      d.data.forEach((record) =>
        Object.values(record.field).forEach((value) => {
          if (!Array.isArray(value)) return;
          value.forEach((photo: unknown) => {
            if (!isPhotoLike(photo) || typeof photo.uri !== 'string' || photo.uri === '') return;
            const ids = idsByUri.get(photo.uri) ?? new Set<string>();
            ids.add(photo.id);
            idsByUri.set(photo.uri, ids);
            if (photo.id === photoId) uris.add(photo.uri);
          });
        })
      )
    );
  if (uris.size !== 1) return undefined;
  const [uri] = [...uris];
  return idsByUri.get(uri)?.size === 1 ? uri : undefined;
};
