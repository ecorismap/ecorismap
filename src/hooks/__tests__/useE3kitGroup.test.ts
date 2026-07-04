import { renderHook } from '@testing-library/react-hooks';
import { useE3kitGroup } from '../useE3kitGroup';
import {
  initializeUser,
  clearPublicKeyCache,
  addGroupMembers,
  deleteGroupMembers,
} from '../../lib/virgilsecurity/e3kit';
import { addMemberKey, clearProjectCryptoCache, removeMemberKey } from '../../lib/firebase/firestore';
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

jest.mock('../../i18n/config', () => ({ t: jest.fn((key: string) => key) }));

jest.mock('../../constants/AppConstants', () => ({
  FUNC_ENCRYPTION: true,
  CREATE_DEK_PROJECTS: false,
  ENABLE_DEK_MIGRATION: false,
}));

const mockInitializeUser = initializeUser as jest.MockedFunction<typeof initializeUser>;
const mockClearPublicKeyCache = clearPublicKeyCache as jest.MockedFunction<typeof clearPublicKeyCache>;
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
  license: 'Free',
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
    expect(mockAddMemberKey).toHaveBeenCalledWith('project-1', 'member-uid');
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
});
