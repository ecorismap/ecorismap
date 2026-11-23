/**
 * A-M2（ACCOUNT_AUDIT_2026-11）: プロジェクト一覧の再読み込みは、取得に成功したときだけ一覧を置き換える。
 * 取得の前に空にすると、圏外で失敗したとき一覧が空のまま残り、開いているプロジェクトが引けなくなる。
 */
import { renderHook } from '@testing-library/react-hooks';
import { useProjects } from '../useProjects';
import { getAllProjects } from '../../lib/firebase/firestore';
import { isInitialized } from '../../lib/virgilsecurity/e3kit';
import { ProjectType } from '../../types';

const mockDispatch = jest.fn();
const mockUser = { uid: 'user-uid', email: 'user@example.com', displayName: 'user', photoURL: null };
const mockState = {
  user: mockUser,
  projects: [{ id: 'p1', name: 'P1' }],
  favoriteProjects: { projectIds: [], showOnlyFavorites: false },
  projectsUI: undefined,
};

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('../../lib/crypto/migration', () => ({ getKeyMigrationState: jest.fn() }));
jest.mock('../../lib/crypto/backup', () => ({ getKeyBackupStatus: jest.fn() }));
jest.mock('../../lib/firebase/firestore', () => ({ getAllProjects: jest.fn() }));
jest.mock('../../lib/virgilsecurity/e3kit', () => ({ isInitialized: jest.fn(), initializeUser: jest.fn() }));
jest.mock('../../i18n/config', () => ({ t: jest.fn((key: string) => key) }));
jest.mock('../../constants/AppConstants', () => ({
  FUNC_ENCRYPTION: false,
  ENABLE_DEK_MIGRATION: false,
  ENABLE_KEY_LEDGER: false,
}));

const mockGetAllProjects = getAllProjects as jest.MockedFunction<typeof getAllProjects>;
const mockIsInitialized = isInitialized as jest.MockedFunction<typeof isInitialized>;

const setProjectsPayloads = () =>
  mockDispatch.mock.calls
    .map(([action]) => action)
    .filter((action) => action.type === 'projects/setProjectsAction')
    .map((action) => action.payload);

beforeEach(() => {
  jest.clearAllMocks();
  mockIsInitialized.mockReturnValue(true);
});

describe('A-M2: fetchProjects は取得前に一覧を空にしない', () => {
  it('取得に失敗したら前の一覧を残す', async () => {
    mockGetAllProjects.mockRejectedValue(new Error('common.message.failGetProjects'));
    const { result } = renderHook(() => useProjects());
    const res = await result.current.fetchProjects(false);
    expect(res).toEqual({ isOK: false, message: 'common.message.failGetProjects' });
    expect(setProjectsPayloads()).toEqual([]);
  });

  it('取得に成功したら一度だけ置き換える', async () => {
    const fetched = [{ id: 'p2', name: 'B' }, { id: 'p3', name: 'A' }] as ProjectType[];
    mockGetAllProjects.mockResolvedValue({ isOK: true, message: '', projects: fetched });
    const { result } = renderHook(() => useProjects());
    const res = await result.current.fetchProjects(false);
    expect(res.isOK).toBe(true);
    expect(setProjectsPayloads()).toEqual([[{ id: 'p3', name: 'A' }, { id: 'p2', name: 'B' }]]);
  });

  it('復号できないプロジェクトがあるときの案内は isOK:true のまま message で返す（A-M5 の表示元）', async () => {
    mockGetAllProjects.mockResolvedValue({ isOK: true, message: 'common.message.cannotLoadProject', projects: [] });
    const { result } = renderHook(() => useProjects());
    const res = await result.current.fetchProjects(false);
    expect(res).toMatchObject({ isOK: true, message: 'common.message.cannotLoadProject' });
  });
});
