import { Platform } from 'react-native';
import { DataType, RecordType } from '../types';

/**
 * Web版で「アップロードしていない変更」があるかを判定するための目印。
 *
 * Web版の記録はタブごとの保存（IndexedDB）で、タブを閉じると消える。消えること自体は仕様なので残し、
 * アップロードしていない変更がある間だけ離脱確認を出す（UnsyncedChangesGuard.web.tsx）。
 *
 * レコードの uploaded はアップロード後に編集しても true のまま（墓標を残すかの判定に使うため外せない）なので、
 * それだけでは「アップロード後の変更」が分からない。そこで、レイヤごとに「ここまでは同期済み」とみなす時刻を持ち、
 * 自分の記録の updatedAt がそれより新しければ未アップロードの変更とみなす。
 *
 * 時刻はこのタブの sessionStorage に置く。記録と同じくタブを閉じれば要らなくなり、再読み込みでは残る。
 */
export type UnsyncedMarks = {
  //プロジェクトをこのタブで最初に開いた時刻。まだアップロードしていないレイヤの基準に使う
  //（開いたときに取得した記録はそれより前に更新されたもの。開いた後の編集だけが新しくなる）
  openedAt?: number;
  //レイヤごとに、最後にアップロードに成功したときのアップロード開始時刻
  layerUploadedAt: { [layerId: string]: number };
};

type StoredMarks = { [projectId: string]: UnsyncedMarks };

const STORAGE_KEY = 'ecorismap.unsyncedMarks.v1';

//sessionStorage が使えない（プライベートモードやテスト）ときの置き場。再読み込みで消えるが、タブを開いている間は効く
let memoryMarks: StoredMarks = {};

const getSessionStorage = (): Storage | undefined => {
  if (Platform.OS !== 'web') return undefined;
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : undefined;
  } catch {
    return undefined;
  }
};

const readMarks = (): StoredMarks => {
  const storage = getSessionStorage();
  if (storage === undefined) return memoryMarks;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return memoryMarks;
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as StoredMarks) : memoryMarks;
  } catch {
    return memoryMarks;
  }
};

const writeMarks = (marks: StoredMarks) => {
  memoryMarks = marks;
  const storage = getSessionStorage();
  if (storage === undefined) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(marks));
  } catch {
    //保存できなくてもメモリには残る。離脱確認が多めに出る側に倒れるだけ
  }
};

export const getUnsyncedMarks = (projectId: string): UnsyncedMarks =>
  readMarks()[projectId] ?? { layerUploadedAt: {} };

/** プロジェクトをこのタブで開いたことを記録する。既に記録があれば（再読み込みなど）最初の時刻を保つ */
export const markProjectOpened = (projectId: string, now: number = Date.now()) => {
  if (Platform.OS !== 'web') return;
  const marks = readMarks();
  const current = marks[projectId] ?? { layerUploadedAt: {} };
  if (current.openedAt !== undefined) return;
  writeMarks({ ...marks, [projectId]: { ...current, openedAt: now } });
};

/**
 * レイヤのアップロードに成功したことを記録する。startedAt はアップロードを始めた時刻にする
 * （アップロード中に編集した記録は送った集合に入っていないので、未アップロードとして残す）
 */
export const markLayerUploaded = (projectId: string, layerId: string, startedAt: number) => {
  if (Platform.OS !== 'web') return;
  const marks = readMarks();
  const current = marks[projectId] ?? { layerUploadedAt: {} };
  const previous = current.layerUploadedAt[layerId];
  //前回より古い時刻で上書きしない（後から終わった古いアップロードで基準が戻ると、警告が多く出るだけなので害は小さいが揃えておく）
  if (previous !== undefined && previous >= startedAt) return;
  writeMarks({
    ...marks,
    [projectId]: { ...current, layerUploadedAt: { ...current.layerUploadedAt, [layerId]: startedAt } },
  });
};

/**
 * プロジェクトを閉じた・切り替えたときに、そのプロジェクトの目印を捨てる。
 * 開き直したときは取得し直すので、開き直した時刻を基準にする（古い基準のままだと、別端末で上げた自分の記録で確認が出続ける）
 */
export const clearProjectMarks = (projectId: string) => {
  if (Platform.OS !== 'web') return;
  const marks = readMarks();
  if (marks[projectId] === undefined) return;
  const { [projectId]: _removed, ...rest } = marks;
  writeMarks(rest);
};

/** テスト用: 記録を消す */
export const clearUnsyncedMarks = () => {
  memoryMarks = {};
  const storage = getSessionStorage();
  if (storage === undefined) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    //消せなくても次のテストでは上書きされる
  }
};

/**
 * このページで作った blob: URL（写真監査 P-M4）。
 *
 * blob: URL は作ったページ（document）の中でしか読めず、再読み込みで無効になる。一方で記録は IndexedDB から戻るので、
 * 再読み込みの後も写真の uri には前のページの blob: が残る。その原画はもう取り戻せず、上げても必ず失敗するので、
 * 「未同期あり」に数えると、利用者が写真を外さない限り離脱確認が出続ける。
 * 離脱確認（beforeunload）の判定は同期で行う必要があり、fetch で読めるかを確かめられない。そこで起動時に
 * URL.createObjectURL を包み、このページで作った blob: を覚えておく（このモジュールは App から UnsyncedChangesGuard
 * 経由で起動時に読み込まれるので、利用者の操作で blob を作るより前に包める）。
 * 包めない環境（ネイティブ・URL.createObjectURL のない環境）では、すべての blob: を読めるものとして扱う（確認を出す側に倒す）
 */
const pageBlobUrls = new Set<string>();
let isTrackingPageBlobUrls = false;

export const trackPageBlobUrls = () => {
  if (isTrackingPageBlobUrls) return;
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return;
  const create = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (obj: Blob | MediaSource) => {
    const url = create(obj);
    pageBlobUrls.add(url);
    return url;
  };
  if (typeof URL.revokeObjectURL === 'function') {
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (url: string) => {
      //破棄した blob: も読めなくなる
      pageBlobUrls.delete(url);
      revoke(url);
    };
  }
  isTrackingPageBlobUrls = true;
};

if (Platform.OS === 'web') trackPageBlobUrls();

/** blob: URL がこのページで読めるか（前のページの blob: は false）。覚えられない環境では true */
export const isLivePageBlobUrl = (uri: string) => !isTrackingPageBlobUrls || pageBlobUrls.has(uri);

/**
 * 記録に、まだアップロードしていない（url が null）で原画が blob: URL にしかない写真があるか（写真監査 P-M4 の当面の策）。
 * 写真欄はレイヤの定義を見なくても、{ uri, url } を持つ要素の配列として見分けられる。
 * 前のページの blob:（再読み込みで無効になったもの）は、もう失われていて同期しても取り戻せないので数えない
 */
export const hasUnuploadedBlobPhoto = (record: RecordType): boolean =>
  Object.values(record.field ?? {}).some(
    (value) =>
      Array.isArray(value) &&
      value.some((item: unknown) => {
        if (typeof item !== 'object' || item === null) return false;
        const photo = item as { uri?: unknown; url?: unknown };
        return (
          photo.url === null &&
          typeof photo.uri === 'string' &&
          photo.uri.startsWith('blob:') &&
          isLivePageBlobUrl(photo.uri)
        );
      })
  );

/**
 * アップロードしていない変更があるか。判定に迷う場合は「ある」に倒す（確認が1回多く出るだけで、記録は消えない）。
 *
 * - プロジェクトを開いていないとき: 記録はクラウドへ上げる先が無く、タブを閉じると必ず消える。削除済みでない記録が
 *   1件でもあれば「ある」とする
 * - プロジェクトを開いているとき:
 *   - uploaded が true でない記録（新しく作ったもの）があれば「ある」
 *   - 自分の記録（自分の名義・名義なし・テンプレート）で、そのレイヤの基準時刻より後に更新・削除したものがあれば「ある」。
 *     他のメンバーの記録は取得したものなので見ない（取得のたびに、相手の更新時刻で確認が出てしまうため）
 *   - 自分の記録に、まだアップロードしていない blob: の写真があれば「ある」（記録は上がっていても写真の原画はこのタブにしかない）
 */
export const hasUnsyncedChanges = (
  dataSet: DataType[],
  projectId: string | undefined,
  uid: string | undefined,
  marks: UnsyncedMarks
): boolean => {
  if (projectId === undefined) {
    return dataSet.some((d) => d.data.some((record) => record.deleted !== true));
  }
  return dataSet.some((d) => {
    const isOwnBucket = d.userId === undefined || d.userId === uid || d.userId === 'template';
    const reference = marks.layerUploadedAt[d.layerId] ?? marks.openedAt;
    //他のメンバーの記録は取得した写しで、この端末で失われる変更を持たない（編集すると自分のバケットへ移る）。
    //uploaded の印を持たない古い記録もあるので、印より先に除く（後に置くと、何をしても確認が消えない）
    if (!isOwnBucket) return false;
    return d.data.some((record) => {
      //アップロードしていない記録を消したものは手元からも消えている（墓標を作らない）ので、ここには来ない
      if (record.uploaded !== true) return record.deleted !== true;
      //写真だけアップロードに失敗した記録は、記録自体は uploaded で基準時刻も進むが、写真の原画は
      //このタブの blob: URL にしかなく、再読み込みやタブの破棄で失われる。上がっていない写真があれば「ある」とする
      if (record.deleted !== true && hasUnuploadedBlobPhoto(record)) return true;
      //基準時刻が分からないときは、アップロード後に変えたかを判定できないので「ある」に倒す
      if (reference === undefined) return true;
      return (record.updatedAt ?? 0) > reference;
    });
  });
};
