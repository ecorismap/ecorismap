// アカウント監査（docs/ACCOUNT_AUDIT_2026-11.md）A-M1: 別の人が入るときの確認とキャッシュの破棄
let mockUser: { uid: string | undefined; email: string | null; displayName: string | null; photoURL: string | null } = {
  uid: undefined,
  email: null,
  displayName: null,
  photoURL: null,
};
const mockDispatch = jest.fn();

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
import { useAccount } from '../useAccount';
import * as firebase from '../../lib/firebase/sign-in';
import * as e3kit from '../../lib/virgilsecurity/e3kit';
import * as projectStore from '../../lib/firebase/firestore';
import { clearPublicKeyLedgerCache } from '../../lib/crypto';

const mocked = <T extends (...args: never[]) => unknown>(fn: T) => fn as unknown as jest.Mock;

const verifiedUser = (uid: string) => ({ uid, emailVerified: true, email: `${uid}@example.com`, displayName: uid, photoURL: null });

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { uid: undefined, email: null, displayName: null, photoURL: null };
});

const dispatchedTypes = () => mockDispatch.mock.calls.map((call) => (call[0] as { type: string }).type);

describe('login: beforeSwitchUser（A-M1）', () => {
  test('false なら Redux の user を差し替えずにサインアウトして取りやめる', async () => {
    mocked(firebase.signInWithEmail).mockResolvedValue({ isOK: true, message: '', authUser: verifiedUser('b') });
    const beforeSwitchUser = jest.fn(async () => false);
    const { result } = renderHook(() => useAccount());
    let ret: { isOK: boolean } | undefined;
    await act(async () => {
      ret = await result.current.login('b@example.com', 'pw', { beforeSwitchUser });
    });
    expect(beforeSwitchUser).toHaveBeenCalledWith('b');
    expect(ret?.isOK).toBe(false);
    expect(firebase.FBsignOut).toHaveBeenCalledTimes(1);
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(result.current.accountMessage).toBe('hooks.message.loginCancelledProjectOpen');
  });

  test('true なら user を差し替える。確認は差し替えより前', async () => {
    mocked(firebase.signInWithEmail).mockResolvedValue({ isOK: true, message: '', authUser: verifiedUser('b') });
    const beforeSwitchUser = jest.fn(async () => {
      expect(mockDispatch).not.toHaveBeenCalled();
      return true;
    });
    const { result } = renderHook(() => useAccount());
    let ret: { isOK: boolean } | undefined;
    await act(async () => {
      ret = await result.current.login('b@example.com', 'pw', { beforeSwitchUser });
    });
    expect(ret?.isOK).toBe(true);
    expect(dispatchedTypes()).toContain('user/setUserAction');
  });
});

describe('login: Redux に前の人が残ったまま別の人が入る（セッション切れ、A-L4）', () => {
  test('前の人の公開鍵・DEK のキャッシュとプロジェクト一覧を捨てる', async () => {
    mockUser = { uid: 'a', email: 'a@example.com', displayName: 'a', photoURL: null };
    mocked(firebase.signInWithEmail).mockResolvedValue({ isOK: true, message: '', authUser: verifiedUser('b') });
    const { result } = renderHook(() => useAccount());
    await act(async () => {
      await result.current.login('b@example.com', 'pw');
    });
    expect(e3kit.clearPublicKeyCache).toHaveBeenCalled();
    expect(clearPublicKeyLedgerCache).toHaveBeenCalled();
    expect(projectStore.clearProjectCryptoCache).toHaveBeenCalled();
    expect(dispatchedTypes()).toContain('projects/setProjectsAction');
  });

  test('同じ人が入り直すならキャッシュは残す', async () => {
    mockUser = { uid: 'a', email: 'a@example.com', displayName: 'a', photoURL: null };
    mocked(firebase.signInWithEmail).mockResolvedValue({ isOK: true, message: '', authUser: verifiedUser('a') });
    const { result } = renderHook(() => useAccount());
    await act(async () => {
      await result.current.login('a@example.com', 'pw');
    });
    expect(e3kit.clearPublicKeyCache).not.toHaveBeenCalled();
    expect(dispatchedTypes()).not.toContain('projects/setProjectsAction');
  });
});
