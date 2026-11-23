import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { ulid } from 'ulid';
import { LayerType, PhotoType, RecordType } from '../types';
import { getPhotoFields } from './Layer';
import { PHOTO_FOLDER } from '../constants/AppConstants';
import { hasLocalPhotoFile } from './Photo';
import { photoDownloadTarget } from './photoDownloadPath';
import { isOwnUploadablePhotoUri } from './photoUpload';
import { isSafePathSegment, isUriInsideFolder } from './safePath';

export type PhotoCopyContext = {
  /** 写しを作る元の記録の名義と引き継ぎ元。写してよい原画の置き場所を決める */
  source: { userId?: string; takenOverFrom?: string[] };
  /** 実行中のプロジェクト（ログイン前・プロジェクト外は undefined） */
  projectId?: string;
  /** 自分の uid（ログイン前・プロジェクト外は undefined） */
  uid?: string;
  /**
   * 原画が手元にない写真を、クラウドから取得して写真フォルダへ filename の名前で置き、その uri を返す。
   * 取得できなければ undefined
   */
  downloadPhoto?: (photo: PhotoType, filename: string) => Promise<string | undefined>;
};

export type DetachedPhotosResult = {
  record: RecordType;
  /** 原画もクラウドの実体もなく、写せずに外した枚数 */
  droppedPhotoCount: number;
  /** 原画を取得できず、元の url/key を指したまま残した枚数 */
  sharedPhotoCount: number;
};

/**
 * 記録の写し（データ編集の「複製」、テンプレートを編集してできる自分の写し）の写真を、元の記録と切り離す
 * （写真監査 P-M8・P-M10）。
 *
 * 写真の id・端末のファイル（uri）・クラウドの実体（url/key）を元の記録と共有したままにすると、どちらかで写真を
 * 外したり記録を消したりしたときに、もう一方の原画や Storage の実体まで消える。また未アップロードの写真は、
 * 同じパスへ2回上げることになり、2回目は Rules に上書きとして拒否されて失敗し続ける。そこで写真ごとに
 * - 新しい id を振る（Storage のパスも別になる）
 * - 手元に原画があれば、写真フォルダへ別名でコピーして uri を差し替え、url と key は空にして、
 *   写した人の名義のパスへ改めて上げさせる
 * - 原画が手元にないがクラウドに上がっている写真（Web で上げ終えた写真は uri が null になる。写真を落とさずに
 *   取得した他人・テンプレートの写真も url だけを持つ）は、その場でクラウドから原画を取得して写真フォルダへ
 *   別名で置き、手元にある写真と同じく写した人の名義で上げ直させる。元の url/key を指したままにすると、
 *   別の端末で元の写真を外したり記録を消したりしたときに、その端末には写しがないので参照に数えられず、
 *   Storage の実体が消えて写し側の写真が失われる（写真監査 P-M8(c)・P-M10(a)）
 * - 取得できなかった（圏外など）写真は、写しから外すと手元の記録から写真が消えてしまうので、元の url/key を
 *   指したまま新しい id で残し、その枚数を sharedPhotoCount で返す（呼び出し側で、元の写真を消すと消えうることを
 *   知らせる）
 * 原画が手元になく、クラウドにも上がっていない写真だけは写せないので写しから外し、その枚数を返す
 * （呼び出し側で利用者に知らせる）。
 *
 * 写してよい原画は、元の記録の名義で見て自分の写真の置き場所にあるもの（isOwnUploadablePhotoUri と同じ判定）か、
 * 他人・テンプレートの写真をこの端末へ取得した置き場所（photoDownloadTarget）にあるものだけ。他のメンバーの記録の
 * uri は送り手の端末のパスがそのまま届くので、それを写すと、自分の端末の関係のないファイル（別プロジェクトの写真など）を
 * 自分の名義の写真として上げてしまう（写真監査 P-M13 のすり抜け）。それ以外の uri は手元に原画がないものとして扱う。
 *
 * テンプレートの写しで編集中に外した写真（uri が undefined）は、写しには入れない（テンプレート側には残る。これは利用者が外したものなので数えない）。
 *
 * keepPhotoIds の写真（編集中に足したばかりの写真。既に自分のフォルダにある自分だけのファイル）はそのまま残す。
 */
export const detachCopiedRecordPhotos = async (
  layer: LayerType,
  record: RecordType,
  photoFolder: string,
  keepPhotoIds: ReadonlySet<string> = new Set(),
  context: PhotoCopyContext = { source: record }
): Promise<DetachedPhotosResult> => {
  const photoFields = getPhotoFields(layer);
  if (photoFields.length === 0) return { record, droppedPhotoCount: 0, sharedPhotoCount: 0 };
  const field = { ...record.field };
  let droppedPhotoCount = 0;
  let sharedPhotoCount = 0;
  for (const { name } of photoFields) {
    const photos = (record.field[name] as PhotoType[] | undefined) ?? [];
    const copied = await Promise.all(
      photos.map(async (photo): Promise<PhotoType | undefined> => {
        if (keepPhotoIds.has(photo.id)) return photo;
        //編集中に外した印。利用者が外したものなので、写しに入れず数えもしない
        if (photo.uri === undefined) return undefined;
        const result = await copyPhoto(photo, photoFolder, layer.id, context);
        if (result.photo === undefined) droppedPhotoCount++;
        if (result.shared) sharedPhotoCount++;
        return result.photo;
      })
    );
    field[name] = copied.filter((p): p is PhotoType => p !== undefined);
  }
  return { record: { ...record, field }, droppedPhotoCount, sharedPhotoCount };
};

const hasCloudPhoto = (photo: PhotoType) => typeof photo.url === 'string' && photo.url !== '';

/** 写真フォルダに置く名前。写真名は撮影した秒の自動命名で元の写真と同じになるので、id を前に付けて分ける */
const copiedFilename = (id: string, photo: PhotoType) =>
  isSafePathSegment(photo.name) ? `${id}_${photo.name}` : `${id}.jpg`;

/**
 * この uri の原画を写してよいか。元の記録の名義で見て自分の写真の置き場所にあるか、他人・テンプレートの写真を
 * この端末へ取得した置き場所にあるものだけ
 */
export const isCopyablePhotoSource = (photo: PhotoType, layerId: string, context: PhotoCopyContext): boolean => {
  const { uri } = photo;
  if (typeof uri !== 'string' || uri === '') return false;
  const { projectId, uid, source } = context;
  if (projectId === undefined || uid === undefined) {
    //プロジェクト外の記録はすべて自分のもの。置き場所はこのレイヤの LOCAL の写真フォルダ（Web は blob:）
    if (Platform.OS === 'web') return uri.startsWith('blob:');
    return isSafePathSegment(layerId) && isUriInsideFolder(uri, `${PHOTO_FOLDER}/LOCAL/${layerId}`);
  }
  if (isOwnUploadablePhotoUri(uri, projectId, layerId, uid, { record: source })) return true;
  //Web の他人の写真は、このタブで取得した blob: でも名義では見分けられないので、取得し直す
  if (Platform.OS === 'web') return false;
  const target = photoDownloadTarget({
    projectId,
    layerId,
    ownUid: uid,
    recordUserId: source.userId,
    photoId: photo.id,
    photoName: photo.name,
    photoUrl: photo.url,
  });
  if (target === undefined) return false;
  return uri === `${target.folder}/${target.filename}`;
};

type CopyResult = { photo: PhotoType | undefined; shared: boolean };

/**
 * 原画が手元にない写真。クラウドから取得できれば写真フォルダへ別名で置いて切り離す。取得できなければ、
 * 写しから写真を消さないよう元の url/key を指したまま新しい id で残す。クラウドにもなければ写せない
 */
const copyFromCloud = async (photo: PhotoType, context: PhotoCopyContext): Promise<CopyResult> => {
  if (!hasCloudPhoto(photo)) return { photo: undefined, shared: false };
  const id = ulid();
  if (context.downloadPhoto !== undefined && typeof photo.key === 'string' && photo.key !== '') {
    try {
      const uri = await context.downloadPhoto(photo, copiedFilename(id, photo));
      if (uri !== undefined) return { photo: { ...photo, id, uri, url: null, key: null }, shared: false };
    } catch (e) {
      console.log('detachCopiedRecordPhotos: failed to download photo', e);
    }
  }
  return { photo: { ...photo, id, uri: null }, shared: true };
};

const copyPhoto = async (
  photo: PhotoType,
  photoFolder: string,
  layerId: string,
  context: PhotoCopyContext
): Promise<CopyResult> => {
  if (!isCopyablePhotoSource(photo, layerId, context)) return copyFromCloud(photo, context);
  if (!(await hasLocalPhotoFile(photo.uri))) return copyFromCloud(photo, context);
  const sourceUri = photo.uri as string;
  const id = ulid();
  if (Platform.OS === 'web') {
    // Web の写真はメモリ上の blob で、消す操作（deleteLocalPhoto）も無い。同じ blob を指していても
    // 片方の操作でもう一方が壊れることはないので、ファイルは写さずに id と url/key だけを切り離す
    return { photo: { ...photo, id, url: null, key: null }, shared: false };
  }
  const uri = `${photoFolder}/${copiedFilename(id, photo)}`;
  try {
    await FileSystem.makeDirectoryAsync(photoFolder, { intermediates: true });
    await FileSystem.copyAsync({ from: sourceUri, to: uri });
  } catch (e) {
    console.log('detachCopiedRecordPhotos: failed to copy photo', e);
    //コピーできなくても、クラウドに上がっていれば取得するか参照で残す（元のファイルは共有させない）
    return copyFromCloud(photo, context);
  }
  return { photo: { ...photo, id, uri, url: null, key: null }, shared: false };
};
