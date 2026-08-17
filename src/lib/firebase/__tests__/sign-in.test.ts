import { signInWithEmail, signUpWithEmail } from '../sign-in';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from '../firebase';

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
