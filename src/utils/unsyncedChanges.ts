import { Platform } from 'react-native';
import { DataType } from '../types';

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
 * アップロードしていない変更があるか。判定に迷う場合は「ある」に倒す（確認が1回多く出るだけで、記録は消えない）。
 *
 * - プロジェクトを開いていないとき: 記録はクラウドへ上げる先が無く、タブを閉じると必ず消える。削除済みでない記録が
 *   1件でもあれば「ある」とする
 * - プロジェクトを開いているとき:
 *   - uploaded が true でない記録（新しく作ったもの）があれば「ある」
 *   - 自分の記録（自分の名義・名義なし・テンプレート）で、そのレイヤの基準時刻より後に更新・削除したものがあれば「ある」。
 *     他のメンバーの記録は取得したものなので見ない（取得のたびに、相手の更新時刻で確認が出てしまうため）
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
      //基準時刻が分からないときは、アップロード後に変えたかを判定できないので「ある」に倒す
      if (reference === undefined) return true;
      return (record.updatedAt ?? 0) > reference;
    });
  });
};
