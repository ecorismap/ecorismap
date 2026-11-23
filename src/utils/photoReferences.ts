import { DataType, LayerType, PhotoType, RecordType } from '../types';

/** Storage から消す候補の写真（id と、消すパスを決めるための url） */
export type PendingPhotoDelete = { id: string; url: string | null };

/** 写真を参照している印（同じ実体かどうかを、photo.id か url の一致で見る） */
export type PhotoReferences = { ids: Set<string>; urls: Set<string> };

/**
 * 記録の写真の参照を集める。今回送る集合では、消した記録（deleted）と編集で外した写真（uri が undefined。
 * アップロード時に Storage から消す印）は参照に数えない。
 * 送らない集合（conservative: true）は、墓標や外した印の写真も数える。テンプレートを編集して写しを作ると、
 * 手元のテンプレートの記録は墓標になるが、クラウドのテンプレートは写真を参照したまま。消しすぎるより
 * 実体が残る方がよいので、写真を持っている限り参照とみなす
 */
export const collectPhotoReferences = (
  records: RecordType[],
  photoFields: LayerType['field'],
  into: PhotoReferences = { ids: new Set(), urls: new Set() },
  options: { conservative?: boolean } = {}
): PhotoReferences => {
  const conservative = options.conservative === true;
  records
    .filter((record) => conservative || record.deleted !== true)
    .forEach((record) => {
      photoFields.forEach(({ name }) => {
        ((record.field[name] as PhotoType[] | undefined) ?? []).forEach((photo) => {
          if (!conservative && photo.uri === undefined) return;
          into.ids.add(photo.id);
          if (typeof photo.url === 'string' && photo.url !== '') into.urls.add(photo.url);
        });
      });
    });
  return into;
};

export const isPhotoReferenced = (photo: PendingPhotoDelete, refs: PhotoReferences) =>
  refs.ids.has(photo.id) || (photo.url !== null && refs.urls.has(photo.url));

/**
 * アップロードで送る集合の元にならない、手元の他の集合（名義）の記録。
 * テンプレートの記録とその写し（テンプレートを編集した自分の記録）は記録の id が同じで、写しの作り方によっては
 * 写真の id と url も同じ実体を指す。今回送る集合だけを見て消すと、送らない側（テンプレート・自分・他人）が
 * まだ参照している実体まで消える（写真監査 P-M10）。送る集合の元は getTargetRecordSet・mergeTemplateRecords と同じ:
 * - テンプレートの送信: テンプレート・未設定・自分
 * - COMMON（テンプレート以外）: テンプレート以外の全員（全員分をまとめて送る）
 * - それ以外: 未設定・自分
 */
export const recordsOutsideUpload = (
  dataSet: DataType[],
  layer: LayerType,
  ownUid: string,
  isTemplate: boolean
): RecordType[] => {
  const isSource = (userId: string | undefined) => {
    if (isTemplate) return userId === 'template' || userId === undefined || userId === ownUid;
    if (layer.permission === 'COMMON') return userId !== 'template';
    return userId === undefined || userId === ownUid;
  };
  return dataSet.filter((d) => d.layerId === layer.id && !isSource(d.userId)).flatMap((d) => d.data);
};

/**
 * Storage の写真を消すときのパスの uid（写真監査 P-M9）。
 * 写真は上げた人の uid の下（projects/{project}/PHOTO/{layer}/{uid}/{photoId}）にある。管理者が他のメンバーの写真を
 * 外したときに自分の uid のパスを消しても実体は残るので、url のパスから上げた人の uid を読む。
 * url のプロジェクト・レイヤ・写真 id が今消そうとしているものと一致するときだけ使い、読めなければ自分の uid にする
 * （url が他のプロジェクトを指すような値で、関係のない写真を消さないため）
 */
export const photoStorageOwnerUid = (
  photo: PendingPhotoDelete,
  projectId: string,
  layerId: string,
  fallbackUid: string
): string => {
  if (typeof photo.url !== 'string') return fallbackUid;
  let decoded: string;
  try {
    decoded = decodeURIComponent(photo.url);
  } catch (e) {
    return fallbackUid;
  }
  const match = decoded.match(/projects\/([^/?#]+)\/PHOTO\/([^/?#]+)\/([^/?#]+)\/([^/?#]+)/);
  if (match === null) return fallbackUid;
  const [, urlProjectId, urlLayerId, uid, urlPhotoId] = match;
  if (urlProjectId !== projectId || urlLayerId !== layerId || urlPhotoId !== photo.id) return fallbackUid;
  return uid;
};
