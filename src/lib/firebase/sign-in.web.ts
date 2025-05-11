import {
  auth,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  updateProfile,
} from './firebase';
import { t } from '../../i18n/config';

export const initFirebaseAuth = () => {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user: import('firebase/auth').User | null) => {
      resolve(user);
      unsubscribe();
    });
  });
};

export const signInWithEmail = async (email: string, password: string) => {
  try {
    const response = await signInWithEmailAndPassword(auth, email, password);
    return { isOK: true, message: '', authUser: response.user };
  } catch (error: any) {
    return { isOK: false, message: error.code, authUser: undefined };
  }
};

export const signUpWithEmail = async (email: string, password: string, displayName: string) => {
  try {
    await createUserWithEmailAndPassword(auth, email, password);
    const { isOK, message, authUser } = await FBupdateProfile(displayName, '');
    if (!isOK || authUser === undefined) {
      return { isOK: false, message, authUser: undefined };
    }
    return { isOK: true, message: '', authUser };
  } catch (error: any) {
    console.log(error);
    return { isOK: false, message: error.code, authUser: undefined };
  }
};

export const getCustomClaims = async () => {
  const user = auth.currentUser;
  if (user === null) {
    return { isOK: false, message: t('firebase.message.unknownUser'), claims: undefined };
  }
  const result = await user.getIdTokenResult(true);
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
    await reauthenticateWithCredential(user, authCred);
    await updatePassword(user, password);
    return { isOK: true, message: '' };
  } catch (error: any) {
    console.log(error);
    return { isOK: false, message: error };
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
    return { isOK: false, message: error };
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
    await signOut(auth);
  } catch (error) {
    //console.log(error);
  }
};
