/**
 * A-L8（ACCOUNT_AUDIT_2026-11）: 「すべてのプロジェクトを削除」は実行中ずっと Loading で画面を覆う。
 * 出ていない間は「次へ」を重ねて押せ、同じ削除が並行して走る。
 */
import { renderHook, act } from '@testing-library/react-hooks';
import { useAccount } from '../useAccount';
import * as projectStore from '../../lib/firebase/firestore';

const mockUser = { uid: 'owner', email: 'owner@example.com', displayName: 'owner', photoURL: null };

jest.mock('react-redux', () => ({
  useDispatch: () => jest.fn(),
  useSelector: (selector: (state: unknown) => unknown) => selector({ user: mockUser }),
}));
jest.mock('../../lib/firebase/sign-in', () => ({
  FBsignOut: jest.fn(),
  initFirebaseAuth: jest.fn(),
  FBsendPasswordResetEmail: jest.fn(),
  FBupdateProfile: jest.fn(),
  checkPassword: jest.fn(),
  deleteUserAccount: jest.fn(),
}));
jest.mock('../../lib/virgilsecurity/e3kit', () => ({
  deleteGroupMembers: jest.fn(async () => ({ isOK: true })),
  deleteGroup: jest.fn(async () => ({ isOK: true })),
}));
jest.mock('../../lib/crypto', () => ({ clearPublicKeyLedgerCache: jest.fn() }));
jest.mock('../../lib/crypto/migration', () => ({}));
jest.mock('../../lib/crypto/backup', () => ({}));
jest.mock('../../lib/crypto/keyStorage', () => ({ deleteIdentityPrivateKey: jest.fn(), saveIdentityPrivateKey: jest.fn() }));
jest.mock('../../constants/AppConstants', () => ({
  ...jest.requireActual('../../constants/AppConstants'),
  ENABLE_KEY_LEDGER: false,
  FUNC_ENCRYPTION: false,
}));
jest.mock('../../components/molecules/AlertAsync', () => ({ AlertAsync: jest.fn(), ConfirmAsync: jest.fn() }));
jest.mock('../../lib/firebase/firestore', () => ({
  getAllProjects: jest.fn(),
  getOwnedProjectIds: jest.fn(),
  deleteAllProjects: jest.fn(),
}));
jest.mock('../../lib/firebase/storage', () => ({ deleteAllProjectStorageData: jest.fn(async () => ({ isOK: true })) }));
jest.mock('../../i18n/config', () => ({ t: jest.fn((key: string) => key) }));
jest.mock('@react-native-firebase/auth', () => ({}));

const mockGetAllProjects = projectStore.getAllProjects as jest.Mock;
const mockGetOwnedProjectIds = projectStore.getOwnedProjectIds as jest.Mock;
const mockDeleteAllProjects = projectStore.deleteAllProjects as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetOwnedProjectIds.mockResolvedValue({ isOK: true, message: '', ids: ['p1'] });
  mockDeleteAllProjects.mockResolvedValue({ isOK: true, message: '', deletedIds: ['p1'] });
});

describe('A-L8: deleteAllProjects の Loading', () => {
  it('削除の間ずっと isLoading=true で、終わったら false に戻す', async () => {
    let release: () => void = () => undefined;
    mockGetAllProjects.mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve({ isOK: true, message: '', projects: [] });
      })
    );
    const { result } = renderHook(() => useAccount());
    let pending: Promise<{ isOK: boolean; message: string }> | undefined;
    act(() => {
      pending = result.current.deleteAllProjects('password');
    });
    expect(result.current.isLoading).toBe(true);
    await act(async () => {
      release();
      await pending;
    });
    expect(result.current.isLoading).toBe(false);
    await expect(pending).resolves.toEqual({ isOK: true, message: '' });
  });

  it('途中で例外になっても Loading を戻す', async () => {
    mockGetAllProjects.mockRejectedValue(new Error('common.message.failGetProjects'));
    const { result } = renderHook(() => useAccount());
    await act(async () => {
      await expect(result.current.deleteAllProjects('password')).rejects.toThrow('common.message.failGetProjects');
    });
    expect(result.current.isLoading).toBe(false);
  });
});
