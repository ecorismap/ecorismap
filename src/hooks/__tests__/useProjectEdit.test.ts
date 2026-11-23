/**
 * アカウント・プロジェクト監査（ACCOUNT_AUDIT_2026-11）の useProjectEdit 修正分。
 * A-H1 設定モードを開くときに解除 / A-H2 今開いているプロジェクトの基準値も捨てる /
 * A-H3 一般メンバーは再チェックで変更ありにしない / A-M6 キー未登録は HOLD にしない /
 * A-L14 保存済みの有効メンバーは OK のまま / A-L16 メールを書き換えた行は未確認に戻す
 */
import { renderHook, act } from '@testing-library/react-hooks';
import { useProjectEdit } from '../useProjectEdit';
import { getUidsByEmails } from '../../lib/firebase/firestore';
import { hasRegisterdUser } from '../../lib/virgilsecurity/e3kit';
import { ConfirmAsync } from '../../components/molecules/AlertAsync';
import { ProjectType } from '../../types';

const mockDispatch = jest.fn();
let mockState: Record<string, unknown>;

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: (selector: (state: unknown) => unknown) => selector(mockState),
  shallowEqual: jest.fn(),
}));
jest.mock('../../lib/firebase/firestore', () => ({ getUidsByEmails: jest.fn() }));
jest.mock('../../lib/virgilsecurity/e3kit', () => ({ hasRegisterdUser: jest.fn() }));
jest.mock('../../components/molecules/AlertAsync', () => ({ ConfirmAsync: jest.fn() }));
jest.mock('../../i18n/config', () => ({ t: jest.fn((key: string) => key) }));

const mockGetUidsByEmails = getUidsByEmails as jest.MockedFunction<typeof getUidsByEmails>;
const mockHasRegisterdUser = hasRegisterdUser as jest.MockedFunction<typeof hasRegisterdUser>;
const mockConfirmAsync = ConfirmAsync as jest.MockedFunction<typeof ConfirmAsync>;

const OWNER = { uid: 'owner', email: 'owner@example.com', verified: 'OK', role: 'OWNER' } as const;
const MEMBER = { uid: 'member', email: 'member@example.com', verified: 'OK', role: 'MEMBER' } as const;
const PENDING = { uid: null, email: 'pending@example.com', verified: 'NO_ACCOUNT', role: 'MEMBER' } as const;

const makeProject = (members: ProjectType['members']): ProjectType => ({
  id: 'project-b',
  name: 'B',
  members,
  ownerUid: 'owner',
  adminsUid: ['owner'],
  membersUid: members.map((m) => m.uid).filter((uid): uid is string => !!uid),
  abstract: '',
  storage: { count: 0 },
});

const setUser = (uid: string, projectId?: string) => {
  mockState = {
    user: { uid, email: `${uid}@example.com`, displayName: uid, photoURL: null },
    settings: { projectRegion: undefined, projectId },
    projects: [],
  };
};

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  jest.clearAllMocks();
  setUser('owner');
  mockHasRegisterdUser.mockResolvedValue(true);
});

describe('A-H1: openProject は設定モードを解除する', () => {
  it('isSettingProject:false を書く', () => {
    const project = makeProject([OWNER, MEMBER]);
    const { result } = renderHook(() => useProjectEdit(project, false));
    act(() => result.current.openProject());
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ projectId: 'project-b', role: 'OWNER', isSettingProject: false }),
      })
    );
  });
});

describe('A-H2: discardSyncBaselines', () => {
  const clearedIds = () =>
    mockDispatch.mock.calls
      .map(([action]) => action)
      .filter((action) => action.type === 'dataSync/clearDataSyncProjectAction')
      .map((action) => action.payload);

  it('開く先に加えて今開いているプロジェクトの基準値も捨てる', () => {
    setUser('owner', 'project-a');
    const project = makeProject([OWNER]);
    const { result } = renderHook(() => useProjectEdit(project, false));
    act(() => result.current.discardSyncBaselines());
    expect(clearedIds()).toEqual(['project-b', 'project-a']);
  });

  it('同じプロジェクトを開き直すときと閉じているときは開く先だけ', () => {
    setUser('owner', 'project-b');
    const project = makeProject([OWNER]);
    const { result, unmount } = renderHook(() => useProjectEdit(project, false));
    act(() => result.current.discardSyncBaselines());
    expect(clearedIds()).toEqual(['project-b']);
    unmount();

    mockDispatch.mockClear();
    setUser('owner', undefined);
    const { result: closed } = renderHook(() => useProjectEdit(project, false));
    act(() => closed.current.discardSyncBaselines());
    expect(clearedIds()).toEqual(['project-b']);
  });
});

describe('保留メンバーの再チェック', () => {
  it('A-H3: 一般メンバーには HOLD を表示するが変更ありにしない（「開く」を無効にしない）', async () => {
    setUser('member');
    mockGetUidsByEmails.mockResolvedValue(['pending-uid']);
    const project = makeProject([OWNER, MEMBER, PENDING]);
    const { result } = renderHook(() => useProjectEdit(project, false));
    await act(flush);
    const pending = result.current.targetProject.members.find((m) => m.email === PENDING.email);
    expect(pending).toMatchObject({ uid: 'pending-uid', verified: 'HOLD' });
    expect(result.current.isEdited).toBe(false);
  });

  it('A-H3: オーナー・管理者は従来どおり変更ありにする', async () => {
    mockGetUidsByEmails.mockResolvedValue(['pending-uid']);
    const project = makeProject([OWNER, MEMBER, PENDING]);
    const { result } = renderHook(() => useProjectEdit(project, false));
    await act(flush);
    expect(result.current.isEdited).toBe(true);
  });

  it('A-M6: Firebase に居ても暗号化キー未登録なら NO_ACCOUNT のまま', async () => {
    mockGetUidsByEmails.mockResolvedValue(['pending-uid']);
    mockHasRegisterdUser.mockResolvedValue(false);
    const project = makeProject([OWNER, PENDING]);
    const { result } = renderHook(() => useProjectEdit(project, false));
    await act(flush);
    expect(mockHasRegisterdUser).toHaveBeenCalledWith('pending-uid');
    const pending = result.current.targetProject.members.find((m) => m.email === PENDING.email);
    expect(pending).toMatchObject({ uid: null, verified: 'NO_ACCOUNT' });
    expect(result.current.isEdited).toBe(false);
  });

  it('照会に失敗しても未処理の拒否にせず保留表示のまま', async () => {
    mockGetUidsByEmails.mockRejectedValue(new Error('offline'));
    const project = makeProject([OWNER, PENDING]);
    const { result } = renderHook(() => useProjectEdit(project, false));
    await act(flush);
    const pending = result.current.targetProject.members.find((m) => m.email === PENDING.email);
    expect(pending).toMatchObject({ uid: null, verified: 'NO_ACCOUNT' });
    expect(result.current.isEdited).toBe(false);
  });
});

describe('A-L14: 保留の確認でキャンセルしても既存の有効メンバーは OK のまま', () => {
  it('既存プロジェクトでは保存済みの OK メンバーを HOLD にしない', async () => {
    const project = makeProject([OWNER, MEMBER, PENDING]);
    mockGetUidsByEmails.mockResolvedValueOnce([null]); // 画面表示時の再チェック
    const { result } = renderHook(() => useProjectEdit(project, false));
    await act(flush);

    mockGetUidsByEmails.mockResolvedValueOnce(['owner', 'member', null]);
    mockHasRegisterdUser.mockImplementation(async (uid) => uid !== null);
    mockConfirmAsync.mockResolvedValue(false);
    let res: Awaited<ReturnType<typeof result.current.checkedProject>> | undefined;
    await act(async () => {
      res = await result.current.checkedProject();
    });
    expect(res?.isOK).toBe(false);
    const verified = result.current.targetProject.members.map((m) => [m.email, m.verified]);
    expect(verified).toEqual([
      [OWNER.email, 'OK'],
      [MEMBER.email, 'OK'],
      [PENDING.email, 'NO_ACCOUNT'],
    ]);
  });

  it('新しく解決できた人は HOLD、新規作成では全員 HOLD（createE3kitGroup が参加者の抽出に使う）', async () => {
    const existing = makeProject([OWNER, PENDING]);
    mockGetUidsByEmails.mockResolvedValueOnce([null]);
    const { result } = renderHook(() => useProjectEdit(existing, false));
    await act(flush);
    mockGetUidsByEmails.mockResolvedValueOnce(['owner', 'pending-uid']);
    let res: Awaited<ReturnType<typeof result.current.checkedProject>> | undefined;
    await act(async () => {
      res = await result.current.checkedProject();
    });
    expect(res?.project?.members.map((m) => m.verified)).toEqual(['OK', 'HOLD']);

    const created = makeProject([{ ...OWNER, verified: 'HOLD' }, { ...MEMBER, uid: '', verified: 'NO_ACCOUNT' }]);
    const { result: newResult } = renderHook(() => useProjectEdit(created, true));
    mockGetUidsByEmails.mockResolvedValueOnce(['owner', 'member']);
    await act(async () => {
      res = await newResult.current.checkedProject();
    });
    expect(res?.project?.members.map((m) => m.verified)).toEqual(['HOLD', 'HOLD']);
  });
});

describe('A-L16: changeMemberText', () => {
  it('メールを書き換えた行は uid を外して NO_ACCOUNT にする', () => {
    const project = makeProject([OWNER, MEMBER]);
    const { result } = renderHook(() => useProjectEdit(project, false));
    act(() => result.current.changeMemberText('other@example.com', 1));
    expect(result.current.targetProject.members[1]).toMatchObject({
      email: 'other@example.com',
      uid: null,
      verified: 'NO_ACCOUNT',
      role: 'MEMBER',
    });
    expect(result.current.isEdited).toBe(true);
  });

  it('同じ値なら行を変えない', () => {
    const project = makeProject([OWNER, MEMBER]);
    const { result } = renderHook(() => useProjectEdit(project, false));
    act(() => result.current.changeMemberText(MEMBER.email, 1));
    expect(result.current.targetProject.members[1]).toMatchObject({ uid: 'member', verified: 'OK' });
  });
});
