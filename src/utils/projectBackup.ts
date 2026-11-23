import { createMMKV, MMKV } from 'react-native-mmkv';
import { ulid } from 'ulid';
import { DataType, LayerType, ProjectType, SettingsType, TileMapType, UserType } from '../types';
import { DataSyncState } from '../modules/dataSync';

// ============================================================================
// データ破棄直前の自動バックアップ（端末内スナップショット）
//
// プロジェクトを閉じる/開く/ログアウト/データ全消去の直前に、Redux全状態を
// 専用MMKVインスタンスへ同期的に退避する。専用インスタンスにすることで
// persist用storageのclearAll等から隔離される（trackLogStorageと同じパターン）。
// 復元はsettings/layers/tileMaps/dataSet/user/projects/dataSyncのdispatchで行う。
// 写真はファイルパス参照のため、端末内復元であれば写真も維持される。
// 注意: 動的辞書（SQLite）はスナップショット対象外のため復元されない。
// ============================================================================

export type BackupTriggerType = 'projectClose' | 'projectOpen' | 'fileNew' | 'fileOpen' | 'beforeRestore';

export type BackupMetaType = {
  id: string;
  createdAt: number;
  trigger: BackupTriggerType;
  projectId?: string;
  projectName?: string;
  recordCount: number;
  //保存時のユーザー。null=未ログイン、undefined=uid導入前の旧メタ（listBackupsで補完される）
  uid?: string | null;
  //復元前の別枠（ユーザーごと1件）に入っている控えだけ true。印の無い復元前（別枠導入前に保存した分や、別枠から
  //通常の世代へ落とした分）は通常の世代として数える。導入前の控えを更新後の初回保存で黙って消さないため（S-M6）
  restoreSlot?: boolean;
};

export type BackupStateType = {
  settings: SettingsType;
  layers: LayerType[];
  tileMaps: TileMapType[];
  dataSet: DataType[];
  user: UserType;
  projects: ProjectType[];
  dataSync: DataSyncState;
};

export type BackupSnapshotType = {
  version: number;
  createdAt: number;
  trigger: BackupTriggerType;
  state: BackupStateType;
};

const INDEX_KEY = 'backup:index';
const SNAPSHOT_KEY_PREFIX = 'backup:snapshot:';
const MAX_GENERATIONS = 5;
//同一トリガーの連続呼び出し（例: 確認ダイアログ経由の二重実行）をスキップする間隔
const DUPLICATE_GUARD_MS = 5000;
//端末容量保護の上限。dataSetは通常数MB想定のため実質発動しない
const MAX_SNAPSHOT_SIZE = 50 * 1024 * 1024;

export const isBackupAvailable = true;

export const backupStorage: MMKV = createMMKV({
  id: 'ecorismap-backup',
});

const snapshotKey = (id: string) => `${SNAPSHOT_KEY_PREFIX}${id}`;

const readIndex = (): BackupMetaType[] => {
  try {
    const indexString = backupStorage.getString(INDEX_KEY);
    if (indexString === undefined) return [];
    const parsed = JSON.parse(indexString);
    return Array.isArray(parsed) ? (parsed as BackupMetaType[]) : [];
  } catch (e) {
    console.log('[projectBackup] index read error:', e);
    return [];
  }
};

const writeIndex = (index: BackupMetaType[]): void => {
  backupStorage.set(INDEX_KEY, JSON.stringify(index));
};

const countRecords = (dataSet: DataType[]): number =>
  dataSet.reduce((sum, d) => sum + d.data.filter((record) => !record.deleted).length, 0);

/**
 * 保存の結果。saved=保存した / notNeeded=守るものが無い（記録0件）か直前に同じ保存をした / failed=大きすぎる・例外で作れなかった。
 * 呼び出し側は failed のときだけ、置き換えの前に続けるかを確かめる（永続化監査 S-M5・S-L2）
 */
export type BackupSaveResultType = 'saved' | 'notNeeded' | 'failed';

/**
 * 世代上限で押し出すバックアップを選ぶ純関数。新しい順の一覧を受け取り、残す一覧と消す一覧を返す。
 * 復元前（restoreSlot の印つき）は世代上限の外の別枠で、同じユーザーの分は新しい1件だけ枠に残す。
 * 復元を試すたびに通常の世代（目的のデータが入った最古の世代など）が押し出されないようにするため（永続化監査 S-M6）。
 * 枠から外れる古い控えは、中身がほかの控えと同じ（isRedundant が true）なら消し、そうでなければ通常の世代へ落とす。
 * 目的の版を探して続けて復元すると、2回目の控えは1回目に戻した世代と同じ中身なので消してよいが、
 * 1回目の控え（最初の手元データ）はどこにも無いので消さない
 */
export const planBackupRetention = (
  index: BackupMetaType[],
  isRedundant: (meta: BackupMetaType) => boolean
): { kept: BackupMetaType[]; removed: BackupMetaType[] } => {
  const kept: BackupMetaType[] = [];
  const removed: BackupMetaType[] = [];
  const seenRestoreSlots = new Set<string>();
  let regularCount = 0;
  for (const meta of index) {
    let current = meta;
    if (meta.trigger === 'beforeRestore' && meta.restoreSlot === true) {
      const slot = meta.uid ?? '';
      if (!seenRestoreSlots.has(slot)) {
        seenRestoreSlots.add(slot);
        kept.push(meta);
        continue;
      }
      if (isRedundant(meta)) {
        removed.push(meta);
        continue;
      }
      current = { ...meta, restoreSlot: false };
    }
    regularCount += 1;
    if (regularCount > MAX_GENERATIONS) removed.push(current);
    else kept.push(current);
  }
  return { kept, removed };
};

/** 押し出す分だけを返す（枠から外れる古い控えは中身を比べず通常の世代へ落とす側で扱う） */
export const selectBackupsToRemove = (index: BackupMetaType[]): BackupMetaType[] =>
  planBackupRetention(index, () => false).removed;

/** 中身が同じかを比べる部分。復元で戻すのはこの3つで、設定は端末の値を引き継ぐので比べない */
const retentionFingerprint = (state: BackupStateType): string =>
  JSON.stringify([state.layers, state.dataSet, state.tileMaps]);

const readSnapshotFingerprint = (id: string): string | undefined => {
  try {
    const snapshotString = backupStorage.getString(snapshotKey(id));
    if (snapshotString === undefined) return undefined;
    const parsed = JSON.parse(snapshotString) as BackupSnapshotType;
    if (parsed === null || typeof parsed !== 'object' || parsed.state === undefined) return undefined;
    return retentionFingerprint(parsed.state);
  } catch (e) {
    console.log('[projectBackup] fingerprint read error:', e);
    return undefined;
  }
};

/**
 * 枠から外れる控えが、今回の控えか通常の世代のどれかと同じ中身かを返す。読めない控えは失うものが無いので true。
 * 比べる相手が読めないときは false（消さずに残す側へ倒す）
 */
const createRedundancyCheck = (index: BackupMetaType[], newState: BackupStateType) => {
  const cache = new Map<string, string | undefined>();
  let newFingerprint: string | undefined;
  const fingerprintOf = (id: string) => {
    if (!cache.has(id)) cache.set(id, readSnapshotFingerprint(id));
    return cache.get(id);
  };
  return (target: BackupMetaType): boolean => {
    const targetFingerprint = fingerprintOf(target.id);
    if (targetFingerprint === undefined) return true;
    if (newFingerprint === undefined) newFingerprint = retentionFingerprint(newState);
    if (targetFingerprint === newFingerprint) return true;
    return index.some(
      (other) =>
        other.id !== target.id &&
        !(other.trigger === 'beforeRestore' && other.restoreSlot === true) &&
        fingerprintOf(other.id) === targetFingerprint
    );
  };
};

/**
 * 破棄直前のRedux状態をスナップショットとして保存し、結果を3つに分けて返す。
 * - レコード0件なら保存しない（守るべきデータがない）。ただし復元前は保存する。復元はレイヤ構成・取り込んだ地図・設定まで
 *   置き換えるので、記録が無くても戻せる控えが要る（別枠なので通常の世代は圧迫しない。永続化監査 S-M5）
 * - 同一トリガーが5秒以内に連続した場合はスキップ（二重取得ガード）
 * - 通常の世代は直近MAX_GENERATIONS世代のみ保持（古いものから削除）。復元前はユーザーごとに別枠1件（planBackupRetention）
 * 同期実行なので、呼び出し側はdispatchで破棄する前にそのまま呼べばよい。
 */
export const saveProjectBackupWithResult = (state: BackupStateType, trigger: BackupTriggerType): BackupSaveResultType => {
  try {
    const recordCount = countRecords(state.dataSet);
    if (recordCount === 0 && trigger !== 'beforeRestore') return 'notNeeded';

    const index = readIndex();
    const now = Date.now();
    const latest = index[0];
    if (latest !== undefined && latest.trigger === trigger && now - latest.createdAt < DUPLICATE_GUARD_MS) {
      return 'notNeeded';
    }

    const snapshot: BackupSnapshotType = {
      version: 1,
      createdAt: now,
      trigger,
      state,
    };
    const snapshotString = JSON.stringify(snapshot);
    if (snapshotString.length > MAX_SNAPSHOT_SIZE) {
      console.log('[projectBackup] snapshot too large, skipped:', snapshotString.length);
      return 'failed';
    }

    const meta: BackupMetaType = {
      id: ulid(),
      createdAt: now,
      trigger,
      projectId: state.settings.projectId,
      projectName: state.settings.projectName,
      recordCount,
      //undefinedはJSON化で消えて旧メタと区別できなくなるため、未ログインはnullで記録する
      uid: state.user.uid ?? null,
      ...(trigger === 'beforeRestore' ? { restoreSlot: true } : {}),
    };

    backupStorage.set(snapshotKey(meta.id), snapshotString);

    const { kept, removed } = planBackupRetention([meta, ...index], createRedundancyCheck(index, state));
    removed.forEach((old) => backupStorage.remove(snapshotKey(old.id)));
    writeIndex(kept);
    return 'saved';
  } catch (e) {
    //バックアップ失敗で本来の操作（プロジェクトを閉じる等）を妨げない。続けるかは呼び出し側が結果を見て決める
    console.log('[projectBackup] save error:', e);
    return 'failed';
  }
};

/** 結果を区別しない旧来の呼び出し用。保存できたときだけ true */
export const saveProjectBackup = (state: BackupStateType, trigger: BackupTriggerType): boolean =>
  saveProjectBackupWithResult(state, trigger) === 'saved';

/**
 * バックアップ一覧（新しい順）を返す。
 * uid導入前の旧メタはスナップショット本体からuidを補完してインデックスを書き直す。
 * 本体が読めない旧メタはloadBackup内でインデックスからも除去される。
 */
export const listBackups = (): BackupMetaType[] => {
  const index = readIndex();
  if (index.every((meta) => meta.uid !== undefined)) return index;

  const backfilled: BackupMetaType[] = [];
  for (const meta of index) {
    if (meta.uid !== undefined) {
      backfilled.push(meta);
      continue;
    }
    const snapshot = loadBackup(meta.id);
    if (snapshot === undefined) continue;
    backfilled.push({ ...meta, uid: snapshot.state.user.uid ?? null });
  }
  writeIndex(backfilled);
  return backfilled;
};

/**
 * スナップショット本体を読み込む。JSONが壊れている場合はundefinedを返し、
 * 壊れたエントリをインデックスから除去する。
 */
export const loadBackup = (id: string): BackupSnapshotType | undefined => {
  try {
    const snapshotString = backupStorage.getString(snapshotKey(id));
    if (snapshotString === undefined) {
      writeIndex(readIndex().filter((meta) => meta.id !== id));
      return undefined;
    }
    const parsed = JSON.parse(snapshotString) as BackupSnapshotType;
    if (parsed === null || typeof parsed !== 'object' || parsed.state === undefined) throw new Error('invalid snapshot');
    return parsed;
  } catch (e) {
    console.log('[projectBackup] load error:', e);
    backupStorage.remove(snapshotKey(id));
    writeIndex(readIndex().filter((meta) => meta.id !== id));
    return undefined;
  }
};

/** 指定バックアップを削除する。 */
export const deleteBackup = (id: string): void => {
  backupStorage.remove(snapshotKey(id));
  writeIndex(readIndex().filter((meta) => meta.id !== id));
};

/**
 * 端末内のバックアップを全件削除する。
 * 端末を手放す前などに復号済みデータを残さないための操作なので、
 * 一覧のuidフィルタに関わらず他アカウントのスナップショットも含めて消す。
 */
export const clearAllBackups = (): void => {
  backupStorage.clearAll();
};
