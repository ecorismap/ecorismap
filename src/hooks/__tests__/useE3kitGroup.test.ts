import { renderHook } from '@testing-library/react-hooks';
import { useE3kitGroup } from '../useE3kitGroup';
import {
  initializeUser,
  clearPublicKeyCache,
  addGroupMembers,
  deleteGroupMembers,
} from '../../lib/virgilsecurity/e3kit';
import { addMemberKey, clearProjectCryptoCache, removeMemberKey } from '../../lib/firebase/firestore';
import { clearPublicKeyLedgerCache } from '../../lib/crypto';
import { ProjectType } from '../../types';

jest.mock('../../lib/virgilsecurity/e3kit', () => ({
  initializeUser: jest.fn(),
  clearPublicKeyCache: jest.fn(),
  addGroupMembers: jest.fn(),
  createGroup: jest.fn(),
  deleteGroup: jest.fn(),
  deleteGroupMembers: jest.fn(),
  loadGroup: jest.fn(),
}));

jest.mock('../../lib/firebase/firestore', () => ({
  addMemberKey: jest.fn(),
  removeMemberKey: jest.fn(),
  migrateProjectToDEK: jest.fn(),
  clearProjectCryptoCache: jest.fn(),
}));

jest.mock('../../lib/crypto', () => ({ clearPublicKeyLedgerCache: jest.fn() }));

jest.mock('../../i18n/config', () => ({ t: jest.fn((key: string) => key) }));

jest.mock('../../constants/AppConstants', () => ({
  FUNC_ENCRYPTION: true,
  CREATE_DEK_PROJECTS: false,
  ENABLE_DEK_MIGRATION: false,
}));

const mockInitializeUser = initializeUser as jest.MockedFunction<typeof initializeUser>;
const mockClearPublicKeyCache = clearPublicKeyCache as jest.MockedFunction<typeof clearPublicKeyCache>;
const mockClearLedgerCache = clearPublicKeyLedgerCache as jest.MockedFunction<typeof clearPublicKeyLedgerCache>;
const mockAddMemberKey = addMemberKey as jest.MockedFunction<typeof addMemberKey>;
const mockClearProjectCryptoCache = clearProjectCryptoCache as jest.MockedFunction<typeof clearProjectCryptoCache>;
const mockAddGroupMembers = addGroupMembers as jest.MockedFunction<typeof addGroupMembers>;
const mockDeleteGroupMembers = deleteGroupMembers as jest.MockedFunction<typeof deleteGroupMembers>;
const mockRemoveMemberKey = removeMemberKey as jest.MockedFunction<typeof removeMemberKey>;

const dekProject: ProjectType = {
  id: 'project-1',
  name: 'テストプロジェクト',
  members: [
    { uid: 'owner-uid', email: 'owner@example.com', verified: 'OK', role: 'OWNER' },
    { uid: 'member-uid', email: 'member@example.com', verified: 'OK', role: 'MEMBER' },
  ],
  ownerUid: 'owner-uid',
  adminsUid: ['owner-uid'],
  membersUid: ['owner-uid', 'member-uid'],
  abstract: '',
  storage: { count: 0 },
  cryptoScheme: 'dek',
};

const groupProject: ProjectType = { ...dekProject, cryptoScheme: 'group' };

describe('useE3kitGroup.reshareMemberKey', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInitializeUser.mockResolvedValue({ isOK: true, message: '' });
    mockAddMemberKey.mockResolvedValue({ isOK: true, message: '' });
  });

  it('正常系: initializeUser → clearPublicKeyCache → addMemberKey の順で呼ばれ成功する', async () => {
    const { result } = renderHook(() => useE3kitGroup());
    const res = await result.current.reshareMemberKey(dekProject, 'member-uid');

    expect(res).toEqual({ isOK: true, message: '' });
    expect(mockInitializeUser).toHaveBeenCalledWith('owner-uid');
    expect(mockAddMemberKey).toHaveBeenCalledWith('project-1', 'member-uid', { requireCurrentMember: true });
    expect(mockAddMemberKey).toHaveBeenCalledTimes(1);
    // 呼び出し順: initializeUser → clearPublicKeyCache → addMemberKey
    const initOrder = mockInitializeUser.mock.invocationCallOrder[0];
    const clearOrder = mockClearPublicKeyCache.mock.invocationCallOrder[0];
    const addOrder = mockAddMemberKey.mock.invocationCallOrder[0];
    expect(initOrder).toBeLessThan(clearOrder);
    expect(clearOrder).toBeLessThan(addOrder);
  });

  it('initializeUser 失敗時はそのメッセージで失敗し、後続は呼ばれない', async () => {
    mockInitializeUser.mockResolvedValue({ isOK: false, message: 'not-backup' });
    const { result } = renderHook(() => useE3kitGroup());
    const res = await result.current.reshareMemberKey(dekProject, 'member-uid');

    expect(res).toEqual({ isOK: false, message: 'not-backup' });
    expect(mockClearPublicKeyCache).not.toHaveBeenCalled();
    expect(mockAddMemberKey).not.toHaveBeenCalled();
  });

  it('addMemberKey 1回目失敗時は clearProjectCryptoCache 後に再試行して成功する', async () => {
    mockAddMemberKey
      .mockResolvedValueOnce({ isOK: false, message: 'hooks.message.failGetDekForReshare' })
      .mockResolvedValueOnce({ isOK: true, message: '' });
    const { result } = renderHook(() => useE3kitGroup());
    const res = await result.current.reshareMemberKey(dekProject, 'member-uid');

    expect(res).toEqual({ isOK: true, message: '' });
    expect(mockAddMemberKey).toHaveBeenCalledTimes(2);
    // 再試行も在籍確認つきで呼ぶ
    expect(mockAddMemberKey).toHaveBeenNthCalledWith(2, 'project-1', 'member-uid', { requireCurrentMember: true });
    expect(mockClearProjectCryptoCache).toHaveBeenCalledTimes(1);
    // クリアは1回目の失敗後、2回目の試行前
    const clearOrder = mockClearProjectCryptoCache.mock.invocationCallOrder[0];
    expect(clearOrder).toBeGreaterThan(mockAddMemberKey.mock.invocationCallOrder[0]);
    expect(clearOrder).toBeLessThan(mockAddMemberKey.mock.invocationCallOrder[1]);
  });

  it('addMemberKey が2回とも失敗したら res.message を優先して失敗する', async () => {
    mockAddMemberKey.mockResolvedValue({ isOK: false, message: 'hooks.message.failGetDekForReshare' });
    const { result } = renderHook(() => useE3kitGroup());
    const res = await result.current.reshareMemberKey(dekProject, 'member-uid');

    expect(res).toEqual({ isOK: false, message: 'hooks.message.failGetDekForReshare' });
    expect(mockAddMemberKey).toHaveBeenCalledTimes(2);
  });

  it('addMemberKey 失敗時に message が空ならデフォルトメッセージで失敗する', async () => {
    mockAddMemberKey.mockResolvedValue({ isOK: false, message: '' });
    const { result } = renderHook(() => useE3kitGroup());
    const res = await result.current.reshareMemberKey(dekProject, 'member-uid');

    expect(res).toEqual({ isOK: false, message: 'hooks.message.failReshareKey' });
  });

  it.each([['group', groupProject] as const, ['undefined', { ...dekProject, cryptoScheme: undefined }] as const])(
    '非DEKプロジェクト（cryptoScheme=%s）は即失敗し、e3kit系は呼ばれない',
    async (_label, project) => {
      const { result } = renderHook(() => useE3kitGroup());
      const res = await result.current.reshareMemberKey(project, 'member-uid');

      expect(res).toEqual({ isOK: false, message: 'hooks.message.failReshareKey' });
      expect(mockInitializeUser).not.toHaveBeenCalled();
      expect(mockClearPublicKeyCache).not.toHaveBeenCalled();
      expect(mockAddMemberKey).not.toHaveBeenCalled();
    }
  );

  it('loadE3kitGroup はDEKキャッシュをクリアしてから初期化する（開き直しで復号が回復する）', async () => {
    const { result } = renderHook(() => useE3kitGroup());
    const res = await result.current.loadE3kitGroup(dekProject);

    expect(res).toEqual({ isOK: true, message: '' });
    expect(mockClearProjectCryptoCache).toHaveBeenCalledTimes(1);
    expect(
      mockClearProjectCryptoCache.mock.invocationCallOrder[0]
    ).toBeLessThan(mockInitializeUser.mock.invocationCallOrder[0]);
  });

  it('updateE3kitGroupMembers の既存動作に影響しない（group方式の回帰確認）', async () => {
    mockAddGroupMembers.mockResolvedValue({ isOK: true });
    mockDeleteGroupMembers.mockResolvedValue({ isOK: true });
    mockRemoveMemberKey.mockResolvedValue({ isOK: true, message: '' });
    const updated: ProjectType = {
      ...groupProject,
      membersUid: ['owner-uid', 'member-uid', 'new-member-uid'],
    };
    const { result } = renderHook(() => useE3kitGroup());
    const res = await result.current.updateE3kitGroupMembers(groupProject, updated);

    expect(res.isOK).toBe(true);
    expect(mockAddGroupMembers).toHaveBeenCalledWith('project-1', 'owner-uid', ['new-member-uid']);
    expect(mockAddMemberKey).not.toHaveBeenCalled();
  });

  it('DEK方式のメンバー追加は在籍確認なしで addMemberKey を呼ぶ（プロジェクト保存より先に鍵を作るため）', async () => {
    mockRemoveMemberKey.mockResolvedValue({ isOK: true, message: '' });
    const updated: ProjectType = {
      ...dekProject,
      membersUid: ['owner-uid', 'member-uid', 'new-member-uid'],
    };
    const { result } = renderHook(() => useE3kitGroup());
    const res = await result.current.updateE3kitGroupMembers(dekProject, updated);

    expect(res.isOK).toBe(true);
    expect(mockAddMemberKey.mock.calls).toEqual([['project-1', 'new-member-uid']]);
  });
});

describe('useE3kitGroup 再共有の台帳キャッシュ', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInitializeUser.mockResolvedValue({ isOK: true, message: '' });
    mockAddMemberKey.mockResolvedValue({ isOK: true, message: '' });
  });

  it('単体の再共有でも台帳キャッシュを消してからラップする（旧公開鍵で包み直さないため）', async () => {
    const { result } = renderHook(() => useE3kitGroup());
    await result.current.reshareMemberKey(dekProject, 'member-uid');
    expect(mockClearLedgerCache).toHaveBeenCalledTimes(1);
    expect(mockClearLedgerCache.mock.invocationCallOrder[0]).toBeLessThan(
      mockAddMemberKey.mock.invocationCallOrder[0]
    );
  });
});

describe('useE3kitGroup.reshareMemberKeys', () => {
  const at = new Date('2026-11-18T10:28:06Z');
  const targets = [
    { projectId: 'p1', ownerUid: 'owner-uid', uid: 'm1', keyChangedAt: at },
    { projectId: 'p2', ownerUid: 'owner-uid', uid: 'm1', keyChangedAt: at },
    { projectId: 'p3', ownerUid: 'other-owner', uid: 'm2', keyChangedAt: at },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockInitializeUser.mockResolvedValue({ isOK: true, message: '' });
    mockAddMemberKey.mockResolvedValue({ isOK: true, message: '' });
  });

  it('初期化とキャッシュクリアは1回だけで、全件を順に再共有し進捗を報告する', async () => {
    const { result } = renderHook(() => useE3kitGroup());
    const progress: [number, number][] = [];
    const res = await result.current.reshareMemberKeys(targets, (d, t) => progress.push([d, t]), () => false);

    expect(res.isOK).toBe(true);
    expect(res.succeeded).toHaveLength(3);
    expect(res.failed).toHaveLength(0);
    expect(mockInitializeUser).toHaveBeenCalledTimes(1);
    expect(mockClearPublicKeyCache).toHaveBeenCalledTimes(1);
    expect(mockClearLedgerCache).toHaveBeenCalledTimes(1);
    expect(mockAddMemberKey.mock.calls).toEqual([
      ['p1', 'm1', { requireCurrentMember: true }],
      ['p2', 'm1', { requireCurrentMember: true }],
      ['p3', 'm2', { requireCurrentMember: true }],
    ]);
    expect(progress).toEqual([
      [0, 3],
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it('失敗した件はDEKキャッシュを捨てて1回だけ再試行し、それでも失敗なら failed に入れて続行する', async () => {
    mockAddMemberKey
      .mockResolvedValueOnce({ isOK: true, message: '' })
      .mockResolvedValueOnce({ isOK: false, message: 'x' })
      .mockResolvedValueOnce({ isOK: false, message: 'x' })
      .mockResolvedValueOnce({ isOK: true, message: '' });
    const { result } = renderHook(() => useE3kitGroup());
    const res = await result.current.reshareMemberKeys(targets, () => undefined, () => false);

    expect(res.succeeded.map((r) => r.projectId)).toEqual(['p1', 'p3']);
    expect(res.failed.map((r) => r.projectId)).toEqual(['p2']);
    expect(mockClearProjectCryptoCache).toHaveBeenCalledTimes(1);
    expect(mockAddMemberKey).toHaveBeenCalledTimes(4);
    expect(mockAddMemberKey).toHaveBeenNthCalledWith(3, 'p2', 'm1', { requireCurrentMember: true });
  });

  it('中止されたら残りは処理しない', async () => {
    let cancelled = false;
    mockAddMemberKey.mockImplementation(async () => {
      cancelled = true;
      return { isOK: true, message: '' };
    });
    const { result } = renderHook(() => useE3kitGroup());
    const res = await result.current.reshareMemberKeys(targets, () => undefined, () => cancelled);

    expect(res.succeeded).toHaveLength(1);
    expect(mockAddMemberKey).toHaveBeenCalledTimes(1);
  });

  it('初期化に失敗したら何もしない', async () => {
    mockInitializeUser.mockResolvedValue({ isOK: false, message: 'init failed' });
    const { result } = renderHook(() => useE3kitGroup());
    const res = await result.current.reshareMemberKeys(targets, () => undefined, () => false);

    expect(res).toEqual({ isOK: false, message: 'init failed', succeeded: [], failed: [] });
    expect(mockAddMemberKey).not.toHaveBeenCalled();
  });
});
