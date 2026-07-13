import { BackupStateType, saveProjectBackup, listBackups, loadBackup, deleteBackup, backupStorage } from '../projectBackup';

// 専用MMKVインスタンスをMapベースでモック（removeを含む実APIに合わせる）
jest.mock('react-native-mmkv', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    createMMKV: jest.fn(() => ({
      set: (key: string, value: string) => store.set(key, value),
      getString: (key: string) => store.get(key),
      remove: (key: string) => store.delete(key),
      contains: (key: string) => store.has(key),
      clearAll: () => store.clear(),
      getAllKeys: () => Array.from(store.keys()),
    })),
  };
});

const createState = (recordCount: number, projectId?: string): BackupStateType =>
  ({
    settings: { projectId, projectName: projectId ? `name-${projectId}` : undefined },
    layers: [],
    tileMaps: [],
    dataSet:
      recordCount > 0
        ? [
            {
              layerId: 'layer1',
              userId: 'user1',
              data: Array.from({ length: recordCount }, (_, i) => ({ id: `r${i}`, field: {} })),
            },
          ]
        : [],
    user: { uid: 'user1' },
    projects: [],
    dataSync: {},
  } as unknown as BackupStateType);

describe('projectBackup', () => {
  beforeEach(() => {
    backupStorage.clearAll();
    jest.restoreAllMocks();
  });

  test('保存してメタ一覧と本体を取得できる', () => {
    const saved = saveProjectBackup(createState(3, 'p1'), 'projectClose');
    expect(saved).toBe(true);

    const list = listBackups();
    expect(list).toHaveLength(1);
    expect(list[0].trigger).toBe('projectClose');
    expect(list[0].projectId).toBe('p1');
    expect(list[0].projectName).toBe('name-p1');
    expect(list[0].recordCount).toBe(3);

    const snapshot = loadBackup(list[0].id);
    expect(snapshot?.version).toBe(1);
    expect(snapshot?.state.dataSet[0].data).toHaveLength(3);
  });

  test('レコード0件なら保存をスキップする', () => {
    expect(saveProjectBackup(createState(0), 'projectClose')).toBe(false);
    expect(listBackups()).toHaveLength(0);
  });

  test('削除済みレコードのみの場合も保存をスキップする', () => {
    const state = createState(2);
    state.dataSet[0].data.forEach((r) => ((r as { deleted?: boolean }).deleted = true));
    expect(saveProjectBackup(state, 'projectClose')).toBe(false);
  });

  test('同一トリガーが5秒以内に連続した場合はスキップする', () => {
    const now = 1700000000000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    expect(saveProjectBackup(createState(1), 'projectClose')).toBe(true);
    jest.spyOn(Date, 'now').mockReturnValue(now + 3000);
    expect(saveProjectBackup(createState(1), 'projectClose')).toBe(false);
    //別トリガーならスキップしない
    expect(saveProjectBackup(createState(1), 'projectOpen')).toBe(true);
    //5秒経過後は同一トリガーでも保存する
    jest.spyOn(Date, 'now').mockReturnValue(now + 10000);
    expect(saveProjectBackup(createState(1), 'projectClose')).toBe(true);
    expect(listBackups()).toHaveLength(3);
  });

  test('5世代を超えたら古いものから削除される', () => {
    for (let i = 0; i < 7; i++) {
      jest.spyOn(Date, 'now').mockReturnValue(1700000000000 + i * 10000);
      expect(saveProjectBackup(createState(i + 1, `p${i}`), 'projectClose')).toBe(true);
    }
    const list = listBackups();
    expect(list).toHaveLength(5);
    //新しい順（最後に保存したp6が先頭、p0/p1は消えている）
    expect(list[0].projectId).toBe('p6');
    expect(list.map((m) => m.projectId)).not.toContain('p0');
    expect(list.map((m) => m.projectId)).not.toContain('p1');
    //消された世代の本体も読めない
    expect(list.every((m) => loadBackup(m.id) !== undefined)).toBe(true);
  });

  test('壊れたスナップショットはundefinedを返しインデックスから除去される', () => {
    saveProjectBackup(createState(1, 'p1'), 'projectClose');
    const [meta] = listBackups();
    backupStorage.set(`backup:snapshot:${meta.id}`, '{broken json');
    expect(loadBackup(meta.id)).toBeUndefined();
    expect(listBackups()).toHaveLength(0);
  });

  test('本体が存在しないエントリはインデックスから除去される', () => {
    saveProjectBackup(createState(1, 'p1'), 'projectClose');
    const [meta] = listBackups();
    backupStorage.remove(`backup:snapshot:${meta.id}`);
    expect(loadBackup(meta.id)).toBeUndefined();
    expect(listBackups()).toHaveLength(0);
  });

  test('deleteBackupで本体とインデックスの両方が消える', () => {
    saveProjectBackup(createState(1, 'p1'), 'projectClose');
    const [meta] = listBackups();
    deleteBackup(meta.id);
    expect(listBackups()).toHaveLength(0);
    expect(backupStorage.contains(`backup:snapshot:${meta.id}`)).toBe(false);
  });
});
