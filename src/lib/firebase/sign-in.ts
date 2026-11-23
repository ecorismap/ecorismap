import {
  auth,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  firebaseReady,
  getIdTokenResult,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from './firebase';
import { t } from '../../i18n/config';
import { createAuthSessionTracker } from '../../utils/authSessionTracker';

// 外からのセッション切れ（A-L4）を見分ける。FBsignOut が「アプリ自身のサインアウト」の印を付ける
const sessionTracker = createAuthSessionTracker();

export const signInWithEmail = async (email: string, password: string) => {
  try {
    const response = await signInWithEmailAndPassword(auth, email, password);
    return { isOK: true, message: '', authUser: response.user };
  } catch (error: any) {
    const message = isBlockingFunctionError(error) ? 'auth/signin-restricted' : error.code;
    return { isOK: false, message, authUser: undefined };
  }
};

// blocking function（組織アカウント制限）による拒否かどうか。
// SDKはコードをinternal-error等に丸めるため、サーバー応答のBLOCKING_FUNCTION_ERROR_RESPONSEで判定する。
// サインイン経路で発火するのはbeforeSignIn（契約終了・停止など）のみ。
const isBlockingFunctionError = (error: any): boolean => {
  const text = `${error?.code ?? ''} ${error?.message ?? ''}`;
  return text.includes('BLOCKING_FUNCTION_ERROR_RESPONSE');
};

const isSignupRestrictedError = (error: any): boolean =>
  isBlockingFunctionError(error) || `${error?.message ?? ''}`.includes('Signup is restricted');

export const signUpWithEmail = async (email: string, password: string, displayName: string) => {
  try {
    await createUserWithEmailAndPassword(auth, email, password);
    const { isOK, message, authUser } = await FBupdateProfile(displayName, '');
    if (!isOK || authUser === undefined) {
      // 作成済みの未確認アカウントのセッションを残さない（未ログイン表示のまま getAuthUid が返してしまう）
      await FBsignOut();
      return { isOK: false, message, authUser: undefined };
    }
    return { isOK: true, message: '', authUser };
  } catch (error: any) {
    console.log(error);
    const message = isSignupRestrictedError(error) ? 'auth/signup-restricted' : error.code;
    return { isOK: false, message, authUser: undefined };
  }
};

export const getCustomClaims = async () => {
  const user = auth.currentUser;
  if (user === null) {
    return { isOK: false, message: t('firebase.message.unknownUser'), claims: undefined };
  }
  const result = await getIdTokenResult(user, true);
  return { isOK: true, message: '', claims: result.claims };
};

export const FBupdateProfile = async (displayName: string, photoURL: string) => {
  try {
    const user = auth.currentUser;
    if (user === null) {
      return { isOK: false, message: t('firebase.message.unknownUser'), authUser: undefined };
    }
    await updateProfile(user, { displayName, photoURL: photoURL });
    const updatedUser = auth.currentUser;
    if (updatedUser === null) {
      return { isOK: false, message: t('firebase.message.failUpdateUser'), authUser: undefined };
    }
    return { isOK: true, message: '', authUser: updatedUser };
  } catch (error: any) {
    console.log(error);
    return { isOK: false, message: error.code, authUser: undefined };
  }
};

export const changePassword = async (oldPassword: string, password: string) => {
  try {
    const user = auth.currentUser;
    if (user === null || user.email === null) {
      return { isOK: false, message: t('firebase.message.unknownUser') };
    }
    const authCred = EmailAuthProvider.credential(user.email, oldPassword);
    await user.reauthenticateWithCredential(authCred);
    await user.updatePassword(password);
    return { isOK: true, message: '' };
  } catch (error: any) {
    console.log(error);
    // 呼び出し側が通信エラー・回数制限をパスワード違いと区別できるよう、コードを返す
    return { isOK: false, message: typeof error?.code === 'string' ? (error.code as string) : '' };
  }
};

export const checkPassword = async (password: string) => {
  try {
    const user = auth.currentUser;
    //console.log(user);
    if (user === null || user.email === null) {
      return { isOK: false, message: t('firebase.message.unknownUser') };
    }
    const authCred = EmailAuthProvider.credential(user.email, password);
    await reauthenticateWithCredential(user, authCred);
    return { isOK: true, message: '' };
  } catch (error: any) {
    console.log(error);
    // 呼び出し側が通信エラー・回数制限をパスワード違いと区別できるよう、コードを返す
    return { isOK: false, message: typeof error?.code === 'string' ? (error.code as string) : '' };
  }
};

export const deleteUserAccount = async (password: string) => {
  try {
    const user = auth.currentUser;
    if (user !== null && user.email !== null) {
      const authCred = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, authCred);
      await user.delete();
      return { isOK: true };
    }
    return { isOK: false };
  } catch (error: any) {
    console.log(error);
    return { isOK: false };
  }
};

export const confirmEmail = async () => {
  try {
    const user = auth.currentUser;
    if (user) {
      return await sendEmailVerification(user);
    } else {
      return 'error';
    }
  } catch (error) {
    return 'error';
    //console.error(error);
  }
};

export const FBsendPasswordResetEmail = async (email: string) => {
  try {
    return await sendPasswordResetEmail(auth, email);
  } catch (error: any) {
    return error.code;
  }
};

export const FBsignOut = async () => {
  try {
    sessionTracker.markIntentionalSignOut();
    await signOut(auth);
  } catch (error) {
    //console.log(error);
  }
};

//Firebase認証セッションが生きているか（ログアウト後にバックアップ復元した場合はfalseになる）
export const hasAuthSession = () => auth.currentUser !== null;

//現在の認証セッションのuid（未ログインならundefined）
export const getAuthUid = (): string | undefined => auth.currentUser?.uid ?? undefined;

export const initFirebaseAuth = async () => {};

let isWatchingAuthSession = false;

/** auth の状態変化の購読を始める（何度呼んでも1回だけ）。アプリが動いている間は外さない */
export const startAuthSessionWatch = async (): Promise<void> => {
  if (isWatchingAuthSession) return;
  isWatchingAuthSession = true;
  await firebaseReady;
  onAuthStateChanged(auth, (authUser) => sessionTracker.handleAuthUser(authUser?.uid ?? null));
};

/** 外からセッションが切れた uid。切れていなければ undefined */
export const getLostSessionUid = (): string | undefined => sessionTracker.getLostUid();
export const clearLostSession = (): void => sessionTracker.clearLost();
export const consumeLostSessionPrompt = (): boolean => sessionTracker.consumePrompt();
export const subscribeAuthSessionLost = (listener: (uid: string) => void): (() => void) =>
  sessionTracker.subscribe(listener);
