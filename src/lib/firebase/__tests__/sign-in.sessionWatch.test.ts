// A-L4: auth の状態変化の購読と、アプリ自身のサインアウトの区別
const mockAuth = { currentUser: null };
let mockAuthListener: ((user: { uid: string } | null) => void) | undefined;
const mockOnAuthStateChanged = jest.fn((_auth: unknown, listener: (user: { uid: string } | null) => void) => {
  mockAuthListener = listener;
  return () => undefined;
});

jest.mock('../../../i18n/config', () => ({ t: jest.fn((key: string) => key) }));
jest.mock('../firebase', () => ({
  auth: mockAuth,
  firebaseReady: Promise.resolve(),
  onAuthStateChanged: (auth: unknown, listener: (user: { uid: string } | null) => void) =>
    mockOnAuthStateChanged(auth, listener),
  createUserWithEmailAndPassword: jest.fn(),
  EmailAuthProvider: { credential: jest.fn() },
  getIdTokenResult: jest.fn(),
  reauthenticateWithCredential: jest.fn(),
  sendEmailVerification: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(async () => undefined),
  updateProfile: jest.fn(),
}));

import { FBsignOut, getLostSessionUid, startAuthSessionWatch } from '../sign-in';

describe('startAuthSessionWatch', () => {
  it('1回だけ購読し、外からの切断は記録し、FBsignOut による切断は記録しない', async () => {
    await startAuthSessionWatch();
    await startAuthSessionWatch();
    expect(mockOnAuthStateChanged).toHaveBeenCalledTimes(1);

    mockAuthListener?.({ uid: 'a' });
    await FBsignOut();
    mockAuthListener?.(null);
    expect(getLostSessionUid()).toBeUndefined();

    mockAuthListener?.({ uid: 'a' });
    mockAuthListener?.(null);
    expect(getLostSessionUid()).toBe('a');
  });
});
