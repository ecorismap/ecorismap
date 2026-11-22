import { PHOTO_FOLDER } from '../constants/AppConstants';
import { isSafePathSegment } from './safePath';

/**
 * クラウドの写真を端末へ保存する場所（フォルダとファイル名）。
 * 写真名は撮影した秒の自動命名なので、別のメンバーが同じ秒に撮ると同じ名前になる。他人の写真を自分のフォルダへ
 * 名前だけで保存すると、既にある自分の写真を使い回したり上書きしたりして、別人の写真に化ける。
 * 写真を撮った（アップロードした）人で決める。記録の持ち主は、他人の記録を編集すると編集した人に替わるので当てにならない。
 * アップロードした人は Storage のパス（projects/{project}/PHOTO/{layer}/{uid}/{photoId}）に入っているので URL から読む。
 * 読めないときだけ記録の持ち主で代える。
 * - 自分が撮った写真: 従来どおり自分のフォルダに写真名で置く（撮影した端末の原画をそのまま使う）
 * - 他人が撮った写真: その人のフォルダに分け、写真 id を前に付ける（同じ人の別端末で同じ秒に撮った場合も分ける）
 * パスに使えない id・名前のときは undefined（保存しない）
 */
export const photoUploaderUid = (url: string | null | undefined): string | undefined => {
  if (typeof url !== 'string') return undefined;
  let decoded: string;
  try {
    decoded = decodeURIComponent(url);
  } catch (e) {
    return undefined;
  }
  const match = decoded.match(/projects\/[^/?#]+\/PHOTO\/[^/?#]+\/([^/?#]+)\/[^/?#]+/);
  return match?.[1];
};

export const photoDownloadTarget = ({
  projectId,
  layerId,
  ownUid,
  recordUserId,
  photoId,
  photoName,
  photoUrl,
}: {
  projectId: string;
  layerId: string;
  ownUid: string;
  recordUserId: string | undefined;
  photoId: string;
  photoName: string;
  photoUrl?: string | null;
}): { folder: string; filename: string } | undefined => {
  if (![projectId, layerId, ownUid, photoName].every(isSafePathSegment)) return undefined;
  const ownerUid = photoUploaderUid(photoUrl) ?? recordUserId;
  const isOwn = ownerUid === undefined || ownerUid === ownUid;
  if (isOwn) return { folder: `${PHOTO_FOLDER}/${projectId}/${layerId}/${ownUid}`, filename: photoName };
  if (!isSafePathSegment(ownerUid) || ownerUid === 'template') {
    // テンプレートなど持ち主のフォルダを作れない記録は、自分のフォルダに id 付きの名前で置く
    if (!isSafePathSegment(photoId)) return undefined;
    return { folder: `${PHOTO_FOLDER}/${projectId}/${layerId}/${ownUid}`, filename: `${photoId}_${photoName}` };
  }
  const filename = isSafePathSegment(photoId) ? `${photoId}_${photoName}` : photoName;
  return { folder: `${PHOTO_FOLDER}/${projectId}/${layerId}/${ownerUid}`, filename };
};
