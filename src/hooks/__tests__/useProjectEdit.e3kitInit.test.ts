/**
 * 起動し直したあと、プロジェクトを開かず一覧の「更新」もしないままプロジェクト設定を保存すると、
 * 暗号化（E3Kit）が未初期化のままメンバーの登録確認に入り
 * 「Cannot read property 'findUsers' of undefined」で保存できなかった（2026-11-24 Pixel 実機 3611）。
 * 一覧は永続化から表示されるので取得（＝初期化）が走らない。登録確認の前に初期化を済ませる。
 */
import { renderHook, act } from '@testing-library/react-hooks';
import { useProjectEdit } from '../useProjectEdit';
import { getUidsByEmails } from '../../lib/firebase/firestore';
import { hasRegisterdUser, initializeUser, isInitialized } from '../../lib/virgilsecurity/e3kit';
import { ConfirmAsync } from '../../components/molecules/AlertAsync';
import { ProjectType } from '../../types';

let mockState: Record<string, unknown>;

jest.mock('react-redux', () => ({
  useDispatch: () => jest.fn(),
  useSelector: (selector: (state: unknown) => unknown) => selector(mockState),
  shallowEqual: jest.fn(),
}));
jest.mock('../../lib/firebase/firestore', () => ({ getUidsByEmails: jest.fn() }));
jest.mock('../../lib/virgilsecurity/e3kit', () => ({
  hasRegisterdUser: jest.fn(),
  isInitialized: jest.fn(),
  initializeUser: jest.fn(),
}));
jest.mock('../../components/molecules/AlertAsync', () => ({ ConfirmAsync: jest.fn() }));
jest.mock('../../i18n/config', () => ({ t: jest.fn((key: string) => key) }));

const mockGetUidsByEmails = getUidsByEmails as jest.MockedFunction<typeof getUidsByEmails>;
const mockHasRegisterdUser = hasRegisterdUser as jest.MockedFunction<typeof hasRegisterdUser>;
const mockIsInitialized = isInitialized as jest.MockedFunction<typeof isInitialized>;
const mockInitializeUser = initializeUser as jest.MockedFunction<typeof initializeUser>;
const mockConfirmAsync = ConfirmAsync as jest.MockedFunction<typeof ConfirmAsync>;

const OWNER = { uid: 'owner', email: 'owner@example.com', verified: 'OK', role: 'OWNER' } as const;
const PENDING = { uid: null, email: 'pending@example.com', verified: 'NO_ACCOUNT', role: 'MEMBER' } as const;

const project: ProjectType = {
  id: 'p',
  name: 'P',
  members: [OWNER],
  ownerUid: 'owner',
  adminsUid: ['owner'],
  membersUid: ['owner'],
  abstract: '',
  storage: { count: 0 },
};

const projectWithPending: ProjectType = { ...project, members: [OWNER, PENDING] };

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  jest.clearAllMocks();
  mockState = {
    user: { uid: 'owner', email: 'owner@example.com', displayName: 'owner', photoURL: null },
    settings: { projectRegion: undefined, projectId: undefined },
    projects: [],
  };
  mockGetUidsByEmails.mockResolvedValue(['owner', 'new-uid']);
  mockHasRegisterdUser.mockResolvedValue(true);
  mockConfirmAsync.mockResolvedValue(true);
});

const addAndCheck = async () => {
  const { result } = renderHook(() => useProjectEdit(project, false));
  act(() => result.current.addMembers('new@example.com'));
  let checked: Awaited<ReturnType<typeof result.current.checkedProject>> | undefined;
  await act(async () => {
    checked = await result.current.checkedProject();
  });
  return checked!;
};

describe('保存前のメンバー確認で暗号化を初期化する', () => {
  it('未初期化なら現ユーザーで初期化してから登録確認する', async () => {
    mockIsInitialized.mockReturnValue(false);
    mockInitializeUser.mockImplementation(async () => {
      mockIsInitialized.mockReturnValue(true);
      return { isOK: true, message: '' };
    });
    const checked = await addAndCheck();
    expect(mockInitializeUser).toHaveBeenCalledWith('owner');
    expect(mockInitializeUser.mock.invocationCallOrder[0]).toBeLessThan(
      mockHasRegisterdUser.mock.invocationCallOrder[0]
    );
    expect(checked.isOK).toBe(true);
  });

  it('初期化済みなら初期化し直さない', async () => {
    mockIsInitialized.mockReturnValue(true);
    const checked = await addAndCheck();
    expect(mockInitializeUser).not.toHaveBeenCalled();
    expect(checked.isOK).toBe(true);
  });

  it('初期化に失敗したら登録確認に進まず、例外ではなくメッセージで返す', async () => {
    mockIsInitialized.mockReturnValue(false);
    mockInitializeUser.mockResolvedValue({ isOK: false, message: 'E3Kit initialization timeout' });
    const checked = await addAndCheck();
    expect(mockHasRegisterdUser).not.toHaveBeenCalled();
    expect(checked).toMatchObject({ isOK: false, message: 'hooks.message.failedInitializeEncrypt' });
  });
});

describe('画面表示時の保留メンバー再チェック', () => {
  it('未初期化なら初期化してから確認する', async () => {
    mockIsInitialized.mockReturnValue(false);
    mockInitializeUser.mockImplementation(async () => {
      mockIsInitialized.mockReturnValue(true);
      return { isOK: true, message: '' };
    });
    mockGetUidsByEmails.mockResolvedValue(['pending-uid']);
    const { result } = renderHook(() => useProjectEdit(projectWithPending, false));
    await act(flush);
    expect(mockInitializeUser).toHaveBeenCalledWith('owner');
    const pending = result.current.targetProject.members.find((m) => m.email === PENDING.email);
    expect(pending).toMatchObject({ uid: 'pending-uid', verified: 'HOLD' });
  });

  it('初期化に失敗したら保留表示のまま（登録確認しない）', async () => {
    mockIsInitialized.mockReturnValue(false);
    mockInitializeUser.mockResolvedValue({ isOK: false, message: 'x' });
    mockGetUidsByEmails.mockResolvedValue(['pending-uid']);
    const { result } = renderHook(() => useProjectEdit(projectWithPending, false));
    await act(flush);
    expect(mockHasRegisterdUser).not.toHaveBeenCalled();
    const pending = result.current.targetProject.members.find((m) => m.email === PENDING.email);
    expect(pending).toMatchObject({ uid: null, verified: 'NO_ACCOUNT' });
  });
});
