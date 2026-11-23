import { changePassword, checkPassword, signInWithEmail, signUpWithEmail } from '../sign-in';
import {
  auth,
  createUserWithEmailAndPassword,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from '../firebase';

jest.mock('../../../i18n/config', () => ({ t: jest.fn((key: string) => key) }));

jest.mock('../firebase', () => ({
  auth: { currentUser: null },
  createUserWithEmailAndPassword: jest.fn(),
  EmailAuthProvider: { credential: jest.fn() },
  getIdTokenResult: jest.fn(),
  reauthenticateWithCredential: jest.fn(),
  sendEmailVerification: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  updateProfile: jest.fn(),
}));

const mockedSignIn = signInWithEmailAndPassword as jest.Mock;
const mockedCreateUser = createUserWithEmailAndPassword as jest.Mock;

// blocking functionの拒否はSDKがinternal-errorに丸め、サーバー応答が
// BLOCKING_FUNCTION_ERROR_RESPONSEとしてmessageに残る（beforeUserCreated/beforeSignIn共通）
const blockingFunctionError = (serverMessage: string) => ({
  code: 'auth/internal-error',
  message: `Firebase: Error (auth/internal-error). {"error":{"code":400,"message":"BLOCKING_FUNCTION_ERROR_RESPONSE : HTTP Cloud Function returned an error: {\\"error\\":{\\"message\\":\\"${serverMessage}\\"}}"}}`,
});

describe('signInWithEmail', () => {
  beforeEach(() => jest.clearAllMocks());

  it('beforeSignInによる拒否をauth/signin-restrictedへ正規化する', async () => {
    mockedSignIn.mockRejectedValueOnce(blockingFunctionError('Sign-in is restricted.'));
    const result = await signInWithEmail('user@example.com', 'password');
    expect(result).toEqual({ isOK: false, message: 'auth/signin-restricted', authUser: undefined });
  });

  it('通常の認証エラーはerror.codeをそのまま返す', async () => {
    mockedSignIn.mockRejectedValueOnce({ code: 'auth/wrong-password', message: 'wrong password' });
    const result = await signInWithEmail('user@example.com', 'password');
    expect(result).toEqual({ isOK: false, message: 'auth/wrong-password', authUser: undefined });
  });
});

describe('signUpWithEmail', () => {
  beforeEach(() => jest.clearAllMocks());

  it('beforeUserCreatedによる拒否をauth/signup-restrictedへ正規化する', async () => {
    mockedCreateUser.mockRejectedValueOnce(blockingFunctionError('Signup is restricted to organization accounts.'));
    const result = await signUpWithEmail('user@example.com', 'password', 'user');
    expect(result).toEqual({ isOK: false, message: 'auth/signup-restricted', authUser: undefined });
  });

  it('通常の登録エラーはerror.codeをそのまま返す', async () => {
    mockedCreateUser.mockRejectedValueOnce({ code: 'auth/email-already-in-use', message: 'in use' });
    const result = await signUpWithEmail('user@example.com', 'password', 'user');
    expect(result).toEqual({ isOK: false, message: 'auth/email-already-in-use', authUser: undefined });
  });
});

describe('signUpWithEmail のセッション後始末（A-L3）', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => {
    (auth as { currentUser: unknown }).currentUser = null;
  });

  it('作成後のプロフィール更新に失敗したら、未確認アカウントのセッションを残さない', async () => {
    mockedCreateUser.mockResolvedValueOnce({});
    (auth as { currentUser: unknown }).currentUser = { uid: 'u1' };
    (updateProfile as jest.Mock).mockRejectedValueOnce({ code: 'auth/network-request-failed' });
    const result = await signUpWithEmail('user@example.com', 'password', 'user');
    expect(result.isOK).toBe(false);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('アカウント作成自体が失敗したときは signOut しない', async () => {
    mockedCreateUser.mockRejectedValueOnce({ code: 'auth/email-already-in-use', message: 'in use' });
    await signUpWithEmail('user@example.com', 'password', 'user');
    expect(signOut).not.toHaveBeenCalled();
  });
});

describe('checkPassword / changePassword のエラーコード（A-L5）', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (auth as { currentUser: unknown }).currentUser = {
      email: 'user@example.com',
      reauthenticateWithCredential: jest.fn().mockRejectedValue({ code: 'auth/too-many-requests' }),
      updatePassword: jest.fn(),
    };
  });
  afterEach(() => {
    (auth as { currentUser: unknown }).currentUser = null;
  });

  it('checkPassword は失敗時に error.code を message で返す', async () => {
    (reauthenticateWithCredential as jest.Mock).mockRejectedValueOnce({ code: 'auth/network-request-failed' });
    const result = await checkPassword('password');
    expect(result).toEqual({ isOK: false, message: 'auth/network-request-failed' });
  });

  it('changePassword は失敗時に error.code を message で返す', async () => {
    const result = await changePassword('old', 'new');
    expect(result).toEqual({ isOK: false, message: 'auth/too-many-requests' });
  });

  it('コードの無い例外は空文字にする', async () => {
    (reauthenticateWithCredential as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    const result = await checkPassword('password');
    expect(result).toEqual({ isOK: false, message: '' });
  });
});
