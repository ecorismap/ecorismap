// アカウント監査（docs/ACCOUNT_AUDIT_2026-11.md）A-M4・A-L3・A-L5・A-L6 の回帰テスト
let mockUser: { uid: string | undefined; email: string | null; displayName: string | null; photoURL: string | null } = {
  uid: undefined,
  email: null,
  displayName: null,
  photoURL: null,
};
const mockDispatch = jest.fn();
const mockCallOrder: string[] = [];

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: (selector: (state: unknown) => unknown) => selector({ user: mockUser }),
}));

jest.mock('../../constants/AppConstants', () => ({
  ...jest.requireActual('../../constants/AppConstants'),
  ENABLE_KEY_LEDGER: true,
  FUNC_ENCRYPTION: true,
}));

jest.mock('../../lib/firebase/sign-in', () => ({
  signInWithEmail: jest.fn(),
  signUpWithEmail: jest.fn(),
  confirmEmail: jest.fn(),
  checkPassword: jest.fn(),
  changePassword: jest.fn(),
  deleteUserAccount: jest.fn(),
  FBsignOut: jest.fn(),
  FBsendPasswordResetEmail: jest.fn(),
  FBupdateProfile: jest.fn(),
  initFirebaseAuth: jest.fn(),
}));

jest.mock('../../lib/virgilsecurity/e3kit', () => ({
  deleteEncryptKey: jest.fn(),
  deleteGroup: jest.fn(),
  deleteGroupMembers: jest.fn(),
  clearPublicKeyCache: jest.fn(),
}));
jest.mock('../../lib/crypto', () => ({ clearPublicKeyLedgerCache: jest.fn() }));
jest.mock('../../lib/crypto/migration', () => ({ clearMigratedMarker: jest.fn() }));
jest.mock('../../lib/crypto/backup', () => ({ deleteKeyData: jest.fn() }));
jest.mock('../../lib/crypto/keyStorage', () => ({
  deleteIdentityPrivateKey: jest.fn(),
  saveIdentityPrivateKey: jest.fn(),
}));
jest.mock('../../lib/firebase/firestore', () => ({
  getAllProjects: jest.fn(),
  getOwnedProjectIds: jest.fn(),
  deleteAllProjects: jest.fn(),
  clearProjectCryptoCache: jest.fn(),
}));
jest.mock('../../lib/firebase/storage', () => ({ deleteAllProjectStorageData: jest.fn() }));
jest.mock('../../components/molecules/AlertAsync', () => ({
  AlertAsync: jest.fn(),
  ConfirmAsync: jest.fn(),
}));

import { renderHook, act } from '@testing-library/react-hooks';
import { authErrorMessage, useAccount } from '../useAccount';
import * as firebase from '../../lib/firebase/sign-in';
import * as e3kit from '../../lib/virgilsecurity/e3kit';
import * as keyBackup from '../../lib/crypto/backup';
import * as projectStore from '../../lib/firebase/firestore';
import * as projectStorage from '../../lib/firebase/storage';
import { AlertAsync, ConfirmAsync } from '../../components/molecules/AlertAsync';

const mocked = <T extends (...args: never[]) => unknown>(fn: T) => fn as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockCallOrder.length = 0;
  mockUser = { uid: undefined, email: null, displayName: null, photoURL: null };
});

describe('authErrorMessage', () => {
  test('通信エラーと回数制限だけ専用の文言にし、それ以外は既定の文言に任せる', () => {
    expect(authErrorMessage('auth/network-request-failed')).toBe('hooks.message.authNetworkError');
    expect(authErrorMessage('auth/too-many-requests')).toBe('hooks.message.authTooManyRequests');
    expect(authErrorMessage('auth/invalid-credential')).toBeUndefined();
    expect(authErrorMessage(undefined)).toBeUndefined();
  });
});

describe('login（A-L3・A-L5・A-L6）', () => {
  test('通信エラーはパスワード違いと区別して表示する', async () => {
    mocked(firebase.signInWithEmail).mockResolvedValue({
      isOK: false,
      message: 'auth/network-request-failed',
      authUser: undefined,
    });
    const { result } = renderHook(() => useAccount());
    await act(async () => {
      await result.current.login('a@example.com', 'pw');
    });
    expect(result.current.accountMessage).toBe('hooks.message.authNetworkError');
  });

  test('パスワード違いは従来どおり（列挙対策のため区別しない）', async () => {
    mocked(firebase.signInWithEmail).mockResolvedValue({
      isOK: false,
      message: 'auth/invalid-credential',
      authUser: undefined,
    });
    const { result } = renderHook(() => useAccount());
    await act(async () => {
      await result.current.login('a@example.com', 'pw');
    });
    expect(result.current.accountMessage).toBe('hooks.message.invalidEmailOrPassword');
  });

  test('未確認アカウントは確認メールを送った後に signOut する', async () => {
    mocked(firebase.signInWithEmail).mockResolvedValue({
      isOK: true,
      message: '',
      authUser: { uid: 'u1', emailVerified: false },
    });
    mocked(ConfirmAsync).mockResolvedValue(true);
    mocked(firebase.confirmEmail).mockImplementation(async () => {
      mockCallOrder.push('confirmEmail');
    });
    mocked(firebase.FBsignOut).mockImplementation(async () => {
      mockCallOrder.push('signOut');
    });
    const { result } = renderHook(() => useAccount());
    let ret: { isOK: boolean } | undefined;
    await act(async () => {
      ret = await result.current.login('a@example.com', 'pw');
    });
    expect(ret?.isOK).toBe(false);
    expect(mockCallOrder).toEqual(['confirmEmail', 'signOut']);
    expect(AlertAsync).toHaveBeenCalledWith('hooks.alert.pleaseActivate');
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  test('未確認アカウントで送信を断っても signOut する', async () => {
    mocked(firebase.signInWithEmail).mockResolvedValue({
      isOK: true,
      message: '',
      authUser: { uid: 'u1', emailVerified: false },
    });
    mocked(ConfirmAsync).mockResolvedValue(false);
    const { result } = renderHook(() => useAccount());
    await act(async () => {
      await result.current.login('a@example.com', 'pw');
    });
    expect(firebase.confirmEmail).not.toHaveBeenCalled();
    expect(firebase.FBsignOut).toHaveBeenCalledTimes(1);
  });

  test('確認メールの送信に失敗したら「確認してください」を出さずに失敗を伝える', async () => {
    mocked(firebase.signInWithEmail).mockResolvedValue({
      isOK: true,
      message: '',
      authUser: { uid: 'u1', emailVerified: false },
    });
    mocked(ConfirmAsync).mockResolvedValue(true);
    mocked(firebase.confirmEmail).mockResolvedValue('error');
    const { result } = renderHook(() => useAccount());
    await act(async () => {
      await result.current.login('a@example.com', 'pw');
    });
    expect(AlertAsync).not.toHaveBeenCalled();
    expect(result.current.accountMessage).toBe('hooks.message.failSendActivationMail');
    expect(firebase.FBsignOut).toHaveBeenCalledTimes(1);
  });
});

describe('sendConfirmEMail（A-L3）', () => {
  test('送信に成功しても失敗しても未確認のセッションを残さない', async () => {
    const { result } = renderHook(() => useAccount());
    mocked(firebase.confirmEmail).mockResolvedValueOnce(undefined);
    await act(async () => {
      expect((await result.current.sendConfirmEMail()).isOK).toBe(true);
    });
    mocked(firebase.confirmEmail).mockResolvedValueOnce('error');
    await act(async () => {
      expect((await result.current.sendConfirmEMail()).isOK).toBe(false);
    });
    expect(firebase.FBsignOut).toHaveBeenCalledTimes(2);
  });
});

describe('resetUserPassword（A-L6）', () => {
  test('通信エラー・回数制限のときだけ失敗としてフォームに留める', async () => {
    const { result } = renderHook(() => useAccount());
    mocked(firebase.FBsendPasswordResetEmail).mockResolvedValueOnce('auth/too-many-requests');
    await act(async () => {
      expect((await result.current.resetUserPassword('a@example.com')).isOK).toBe(false);
    });
    expect(result.current.accountMessage).toBe('hooks.message.authTooManyRequests');
  });

  test('それ以外の結果は登録の有無を問わず成功扱い（列挙対策）', async () => {
    const { result } = renderHook(() => useAccount());
    mocked(firebase.FBsendPasswordResetEmail).mockResolvedValueOnce(undefined);
    await act(async () => {
      expect((await result.current.resetUserPassword('a@example.com')).isOK).toBe(true);
    });
    mocked(firebase.FBsendPasswordResetEmail).mockResolvedValueOnce('auth/user-not-found');
    await act(async () => {
      expect((await result.current.resetUserPassword('a@example.com')).isOK).toBe(true);
    });
  });
});

describe('checkUserPassword / changeUserPassword（A-L5）', () => {
  test('checkUserPassword: 回数制限は専用の文言、パスワード違いは従来の文言', async () => {
    const { result } = renderHook(() => useAccount());
    mocked(firebase.checkPassword).mockResolvedValueOnce({ isOK: false, message: 'auth/too-many-requests' });
    await act(async () => {
      await result.current.checkUserPassword('pw');
    });
    expect(result.current.accountMessage).toBe('hooks.message.authTooManyRequests');
    mocked(firebase.checkPassword).mockResolvedValueOnce({ isOK: false, message: 'auth/invalid-credential' });
    await act(async () => {
      await result.current.checkUserPassword('pw');
    });
    expect(result.current.accountMessage).toBe('hooks.message.wrongPassword');
  });

  test('changeUserPassword: 通信エラーは専用の文言', async () => {
    const { result } = renderHook(() => useAccount());
    mocked(firebase.changePassword).mockResolvedValueOnce({ isOK: false, message: 'auth/network-request-failed' });
    await act(async () => {
      await result.current.changeUserPassword('old', 'new');
    });
    expect(result.current.accountMessage).toBe('hooks.message.authNetworkError');
  });
});

describe('deleteUserAccount の順序（A-M4）', () => {
  beforeEach(() => {
    mockUser = { uid: 'u1', email: 'a@example.com', displayName: 'a', photoURL: null };
    mocked(projectStore.getAllProjects).mockImplementation(async () => {
      mockCallOrder.push('getAllProjects');
      return { isOK: true, message: '', projects: [{ id: 'P1', ownerUid: 'u1', membersUid: ['u1'] }] };
    });
    mocked(e3kit.deleteGroup).mockImplementation(async () => {
      mockCallOrder.push('deleteGroup');
      return { isOK: true };
    });
    mocked(projectStore.getOwnedProjectIds).mockResolvedValue({ isOK: true, message: '', ids: ['P1'] });
    mocked(projectStorage.deleteAllProjectStorageData).mockResolvedValue({ isOK: true, message: '' });
    mocked(projectStore.deleteAllProjects).mockImplementation(async () => {
      mockCallOrder.push('deleteProjects');
      return { isOK: true, message: '', deletedIds: ['P1'] };
    });
    mocked(e3kit.deleteEncryptKey).mockImplementation(async () => {
      mockCallOrder.push('deleteEncryptKey');
      return { isOK: true };
    });
    mocked(keyBackup.deleteKeyData).mockImplementation(async () => {
      mockCallOrder.push('deleteKeyData');
    });
    mocked(firebase.deleteUserAccount).mockImplementation(async () => {
      mockCallOrder.push('deleteAccount');
      return { isOK: true };
    });
  });

  test('プロジェクト（グループ含む）→ 鍵 → アカウントの順で消す', async () => {
    const { result } = renderHook(() => useAccount());
    await act(async () => {
      expect((await result.current.deleteUserAccount('pw')).isOK).toBe(true);
    });
    expect(mockCallOrder).toEqual([
      'getAllProjects',
      'deleteGroup',
      'deleteProjects',
      'deleteEncryptKey',
      'deleteKeyData',
      'deleteAccount',
    ]);
  });

  test('プロジェクトの削除に失敗したら鍵に触れずに中止する', async () => {
    mocked(projectStore.deleteAllProjects).mockResolvedValue({ isOK: false, message: 'network', deletedIds: undefined });
    const { result } = renderHook(() => useAccount());
    await act(async () => {
      expect((await result.current.deleteUserAccount('pw')).isOK).toBe(false);
    });
    expect(e3kit.deleteEncryptKey).not.toHaveBeenCalled();
    expect(keyBackup.deleteKeyData).not.toHaveBeenCalled();
    expect(firebase.deleteUserAccount).not.toHaveBeenCalled();
    expect(result.current.accountMessage).toBe('hooks.message.failDeleteProject');
  });
});
