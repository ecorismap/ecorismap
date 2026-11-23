/**
 * アカウント監査 A-L15（メールの大文字小文字・同じ uid の重複）と A-L17（保存前に追加した行は管理者も直せる）
 */
import { renderHook, act } from '@testing-library/react-hooks';
import { useProjectEdit } from '../useProjectEdit';
import { getUidsByEmails } from '../../lib/firebase/firestore';
import { hasRegisterdUser } from '../../lib/virgilsecurity/e3kit';
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

const OWNER = { uid: 'owner', email: 'owner@example.com', verified: 'OK', role: 'OWNER' } as const;
const ADMIN = { uid: 'admin', email: 'admin@example.com', verified: 'OK', role: 'ADMIN' } as const;
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

const setUser = (uid: string) => {
  mockState = {
    user: { uid, email: `${uid}@example.com`, displayName: uid, photoURL: null },
    settings: { projectRegion: undefined, projectId: undefined },
    projects: [],
  };
};

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  jest.clearAllMocks();
  setUser('owner');
  mockHasRegisterdUser.mockResolvedValue(true);
});

describe('A-L15: メールの大文字小文字', () => {
  it('addMembers は小文字にそろえ、大文字小文字だけ違う既存メンバーは足さない', () => {
    const project = makeProject([OWNER, MEMBER]);
    const { result } = renderHook(() => useProjectEdit(project, false));
    act(() => result.current.addMembers('Member@Example.com New@Example.COM new@example.com'));
    expect(result.current.targetProject.members.map((m) => m.email)).toEqual([
      'owner@example.com',
      'member@example.com',
      'new@example.com',
    ]);
  });

  it('大文字小文字だけ違う行は重複として保存前に止める', async () => {
    const project = makeProject([OWNER, MEMBER]);
    const { result } = renderHook(() => useProjectEdit(project, false));
    act(() => result.current.addMembers('other@example.com'));
    act(() => result.current.changeMemberText('MEMBER@example.com', 2));
    let res: Awaited<ReturnType<typeof result.current.checkedProject>> | undefined;
    await act(async () => {
      res = await result.current.checkedProject();
    });
    expect(res).toMatchObject({ isOK: false, message: 'hooks.message.duplicateMembers' });
    expect(mockGetUidsByEmails).not.toHaveBeenCalled();
  });

  it('照会と保存は小文字のメールで行う', async () => {
    const project = makeProject([{ ...OWNER, email: 'Owner@Example.com' }, MEMBER]);
    const { result } = renderHook(() => useProjectEdit(project, false));
    mockGetUidsByEmails.mockResolvedValueOnce(['owner', 'member']);
    let res: Awaited<ReturnType<typeof result.current.checkedProject>> | undefined;
    await act(async () => {
      res = await result.current.checkedProject();
    });
    expect(mockGetUidsByEmails).toHaveBeenCalledWith(['owner@example.com', 'member@example.com']);
    expect(res?.project?.members[0].email).toBe('owner@example.com');
  });

  it('別のメールが同じアカウントに解決されたら保存前にエラーにする', async () => {
    const project = makeProject([OWNER, MEMBER]);
    const { result } = renderHook(() => useProjectEdit(project, false));
    act(() => result.current.addMembers('alias@example.com'));
    mockGetUidsByEmails.mockResolvedValueOnce(['owner', 'member', 'member']);
    let res: Awaited<ReturnType<typeof result.current.checkedProject>> | undefined;
    await act(async () => {
      res = await result.current.checkedProject();
    });
    expect(res).toMatchObject({ isOK: false, message: 'hooks.message.duplicateMemberAccounts' });
  });

  it('保留メンバーの再チェックは大文字小文字を区別せずに照合する', async () => {
    const project = makeProject([OWNER, { ...PENDING, email: 'Pending@Example.com' }]);
    mockGetUidsByEmails.mockResolvedValueOnce(['pending-uid']);
    const { result } = renderHook(() => useProjectEdit(project, false));
    await act(flush);
    expect(result.current.targetProject.members[1]).toMatchObject({ uid: 'pending-uid', verified: 'HOLD' });
  });
});

describe('A-L17: 保存前に追加した行', () => {
  it('追加した行だけが isAddedMember になり、削除しても並びがずれない', () => {
    setUser('admin');
    const project = makeProject([OWNER, ADMIN, MEMBER]);
    const { result } = renderHook(() => useProjectEdit(project, false));
    act(() => result.current.addMembers('typo@example.con second@example.com'));
    expect([0, 1, 2, 3, 4].map((i) => result.current.isAddedMember(i))).toEqual([false, false, false, true, true]);

    act(() => result.current.deleteMember(3));
    expect(result.current.targetProject.members.map((m) => m.email)).toEqual([
      'owner@example.com',
      'admin@example.com',
      'member@example.com',
      'second@example.com',
    ]);
    expect([0, 1, 2, 3].map((i) => result.current.isAddedMember(i))).toEqual([false, false, false, true]);
  });

  it('メールを書き換えても追加した行のまま（入力途中に既存と同じ文字列になっても変わらない）', () => {
    const project = makeProject([OWNER, MEMBER]);
    const { result } = renderHook(() => useProjectEdit(project, false));
    act(() => result.current.addMembers('x@example.com'));
    act(() => result.current.changeMemberText('member@example.com', 2));
    expect(result.current.isAddedMember(2)).toBe(true);
  });

  it('保存したら追加した行ではなくなる', () => {
    const project = makeProject([OWNER]);
    const { result } = renderHook(() => useProjectEdit(project, false));
    act(() => result.current.addMembers('x@example.com'));
    act(() => result.current.saveProject(result.current.targetProject));
    expect(result.current.isAddedMember(1)).toBe(false);
  });
});
