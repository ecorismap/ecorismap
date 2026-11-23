import {
  BackupStateType,
  saveProjectBackup,
  saveProjectBackupWithResult,
  selectBackupsToRemove,
  planBackupRetention,
  BackupMetaType,
  listBackups,
  loadBackup,
  deleteBackup,
  clearAllBackups,
  backupStorage,
} from '../projectBackup';

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

//uid: null=未ログイン状態（user.uidをundefinedにする）
const createState = (recordCount: number, projectId?: string, uid: string | null = 'user1'): BackupStateType =>
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
    user: { uid: uid ?? undefined },
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
    expect(list[0].uid).toBe('user1');

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

  test('未ログイン状態の保存はuidがnullになる', () => {
    saveProjectBackup(createState(1, 'p1', null), 'projectClose');
    const [meta] = listBackups();
    expect(meta.uid).toBeNull();
  });

  test('uid導入前の旧メタはスナップショットからuidが補完される', () => {
    saveProjectBackup(createState(1, 'p1'), 'projectClose');
    //旧形式を再現するためインデックスからuidフィールドを取り除く
    const rawIndex = JSON.parse(backupStorage.getString('backup:index') as string) as { uid?: string | null }[];
    rawIndex.forEach((meta) => delete meta.uid);
    backupStorage.set('backup:index', JSON.stringify(rawIndex));

    const list = listBackups();
    expect(list).toHaveLength(1);
    expect(list[0].uid).toBe('user1');
    //補完結果がインデックスに書き戻されている
    const persisted = JSON.parse(backupStorage.getString('backup:index') as string);
    expect(persisted[0].uid).toBe('user1');
  });

  test('旧メタで本体が読めないものは補完時にインデックスから除去される', () => {
    saveProjectBackup(createState(1, 'p1'), 'projectClose');
    const rawIndex = JSON.parse(backupStorage.getString('backup:index') as string) as {
      id: string;
      uid?: string | null;
    }[];
    rawIndex.forEach((meta) => delete meta.uid);
    backupStorage.set('backup:index', JSON.stringify(rawIndex));
    backupStorage.remove(`backup:snapshot:${rawIndex[0].id}`);

    expect(listBackups()).toHaveLength(0);
  });

  test('deleteBackupで本体とインデックスの両方が消える', () => {
    saveProjectBackup(createState(1, 'p1'), 'projectClose');
    const [meta] = listBackups();
    deleteBackup(meta.id);
    expect(listBackups()).toHaveLength(0);
    expect(backupStorage.contains(`backup:snapshot:${meta.id}`)).toBe(false);
  });

  test('clearAllBackupsで全世代のスナップショットとインデックスが消える', () => {
    saveProjectBackup(createState(1, 'p1'), 'projectClose');
    saveProjectBackup(createState(2, 'p2'), 'projectOpen');
    const metas = listBackups();
    expect(metas).toHaveLength(2);
    clearAllBackups();
    expect(listBackups()).toHaveLength(0);
    metas.forEach((meta) => expect(backupStorage.contains(`backup:snapshot:${meta.id}`)).toBe(false));
  });

  describe('保存結果の3分け（永続化監査 S-M5・S-L2）', () => {
    test('保存・不要（0件・重複）・失敗（大きすぎる・例外）を区別する', () => {
      const now = 1700000000000;
      jest.spyOn(Date, 'now').mockReturnValue(now);
      expect(saveProjectBackupWithResult(createState(0), 'projectClose')).toBe('notNeeded');
      expect(saveProjectBackupWithResult(createState(1), 'projectClose')).toBe('saved');
      expect(saveProjectBackupWithResult(createState(1), 'projectClose')).toBe('notNeeded');
      jest.spyOn(backupStorage, 'set').mockImplementation(() => {
        throw new Error('no space');
      });
      jest.spyOn(Date, 'now').mockReturnValue(now + 10000);
      expect(saveProjectBackupWithResult(createState(1), 'projectClose')).toBe('failed');
    });

    test('大きすぎるスナップショットは failed', () => {
      jest.spyOn(JSON, 'stringify').mockReturnValueOnce('x'.repeat(50 * 1024 * 1024 + 1));
      expect(saveProjectBackupWithResult(createState(1), 'fileNew')).toBe('failed');
      expect(listBackups()).toHaveLength(0);
    });

    test('復元前は記録0件でも保存する（レイヤ構成・取り込んだ地図・設定も置き換わるため）', () => {
      expect(saveProjectBackupWithResult(createState(0), 'beforeRestore')).toBe('saved');
      expect(listBackups()[0].trigger).toBe('beforeRestore');
    });
  });

  describe('復元前のバックアップは世代上限の外の別枠（永続化監査 S-M6）', () => {
    test('5世代そろっていても、復元前の保存で最古の世代が消えない', () => {
      for (let i = 0; i < 5; i++) {
        jest.spyOn(Date, 'now').mockReturnValue(1700000000000 + i * 10000);
        saveProjectBackup(createState(1, `p${i}`), 'projectClose');
      }
      jest.spyOn(Date, 'now').mockReturnValue(1700000100000);
      expect(saveProjectBackupWithResult(createState(1, 'current'), 'beforeRestore')).toBe('saved');
      const list = listBackups();
      expect(list).toHaveLength(6);
      expect(list.map((m) => m.projectId)).toContain('p0');
    });

    test('同じユーザーの復元前は新しい1件で上書きし、別ユーザーの分は残す', () => {
      jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
      saveProjectBackupWithResult(createState(1, 'old', 'user1'), 'beforeRestore');
      jest.spyOn(Date, 'now').mockReturnValue(1700000010000);
      saveProjectBackupWithResult(createState(1, 'other', 'user2'), 'beforeRestore');
      jest.spyOn(Date, 'now').mockReturnValue(1700000020000);
      saveProjectBackupWithResult(createState(1, 'new', 'user1'), 'beforeRestore');
      const list = listBackups();
      expect(list.map((m) => m.projectId)).toEqual(['new', 'other']);
      expect(backupStorage.getAllKeys().filter((k) => k.startsWith('backup:snapshot:'))).toHaveLength(2);
    });

    const slotMeta = (id: string, trigger: BackupMetaType['trigger'], uid: string | null = 'u') =>
      ({ id, createdAt: 0, trigger, recordCount: 1, uid, restoreSlot: trigger === 'beforeRestore' }) as BackupMetaType;

    test('planBackupRetention は通常の世代だけを数え、枠から外れる控えは中身が同じなら消す', () => {
      const index = [
        slotMeta('r1', 'beforeRestore'),
        slotMeta('a', 'projectClose'),
        slotMeta('b', 'fileNew'),
        slotMeta('r2', 'beforeRestore'),
        slotMeta('c', 'projectOpen'),
        slotMeta('d', 'fileOpen'),
        slotMeta('e', 'projectClose'),
        slotMeta('f', 'projectClose'),
      ];
      expect(planBackupRetention(index, () => true).removed.map((m) => m.id)).toEqual(['r2', 'f']);
    });

    test('枠から外れる控えが他に無い中身なら、消さずに通常の世代へ落とす', () => {
      const index = [slotMeta('r1', 'beforeRestore'), slotMeta('r0', 'beforeRestore'), slotMeta('a', 'projectClose')];
      const { kept, removed } = planBackupRetention(index, () => false);
      expect(removed).toHaveLength(0);
      expect(kept.map((m) => [m.id, m.restoreSlot])).toEqual([
        ['r1', true],
        ['r0', false],
        ['a', false],
      ]);
      //押し出す分だけを返す版も、枠から外れる控えは消さない側で扱う
      expect(selectBackupsToRemove(index)).toHaveLength(0);
    });

    test('印の無い復元前（別枠の導入前・uid 補完前の旧メタ）は通常の世代として数え、別枠の上書きで消さない', () => {
      const legacy = (id: string, uid?: string | null) =>
        ({ id, createdAt: 0, trigger: 'beforeRestore', recordCount: 1, uid }) as BackupMetaType;
      const index = [slotMeta('new', 'beforeRestore'), legacy('l1', 'u'), legacy('l2'), legacy('l3', null)];
      expect(planBackupRetention(index, () => true).removed).toHaveLength(0);
    });

    test('更新前から残っている復元前の控えは、更新後の初回の保存で消えない', () => {
      for (let i = 0; i < 3; i++) {
        jest.spyOn(Date, 'now').mockReturnValue(1700000000000 + i * 10000);
        saveProjectBackupWithResult(createState(i + 1, `legacy${i}`), 'beforeRestore');
      }
      //別枠の印が付く前の形へ戻す
      const legacyIndex = listBackups().map(({ restoreSlot: _slot, ...rest }) => rest);
      backupStorage.set('backup:index', JSON.stringify(legacyIndex));
      jest.spyOn(Date, 'now').mockReturnValue(1700000100000);
      expect(saveProjectBackupWithResult(createState(9, 'now'), 'beforeRestore')).toBe('saved');
      expect(listBackups().map((m) => m.projectId)).toEqual(['now', 'legacy2', 'legacy1', 'legacy0']);
    });

    test('目的の世代を探して続けて復元しても、最初の手元データの控えは残る', () => {
      //通常の世代 G1（1件）・G2（2件）。手元は3件（まだどの世代にも無い）
      jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
      saveProjectBackupWithResult(createState(1, 'g1'), 'projectClose');
      jest.spyOn(Date, 'now').mockReturnValue(1700000010000);
      saveProjectBackupWithResult(createState(2, 'g2'), 'projectOpen');
      //G1 を復元する前の控え＝最初の手元データ
      jest.spyOn(Date, 'now').mockReturnValue(1700000020000);
      saveProjectBackupWithResult(createState(3, 'first'), 'beforeRestore');
      //G2 を復元する前の控え＝G1 と同じ中身
      jest.spyOn(Date, 'now').mockReturnValue(1700000030000);
      saveProjectBackupWithResult(createState(1, 'g1-restored'), 'beforeRestore');
      //G1 を復元し直す前の控え＝G2 と同じ中身。G1 と同じ中身の控えは消してよい
      jest.spyOn(Date, 'now').mockReturnValue(1700000040000);
      saveProjectBackupWithResult(createState(2, 'g2-restored'), 'beforeRestore');
      const list = listBackups();
      expect(list.map((m) => m.projectId)).toEqual(['g2-restored', 'first', 'g2', 'g1']);
      expect(list.find((m) => m.projectId === 'first')?.restoreSlot).toBe(false);
      expect(list[0].restoreSlot).toBe(true);
      expect(backupStorage.getAllKeys().filter((k) => k.startsWith('backup:snapshot:'))).toHaveLength(4);
    });
  });
});
