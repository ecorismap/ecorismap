import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import { t } from '../../i18n/config';

export const initFirebaseAuth = (): Promise<firebase.User | null> => {
  return new Promise((resolve) => {
    const unsubscribe = firebase.auth().onAuthStateChanged((user) => {
      resolve(user);
      unsubscribe();
    });
  });
};

export const signInWithEmail = async (email: string, password: string) => {
  try {
    const response = await firebase.auth().signInWithEmailAndPassword(email, password);
    return { isOK: true, message: '', authUser: response.user };
  } catch (error: any) {
    return { isOK: false, message: error.code, authUser: undefined };
  }
};

export const signUpWithEmail = async (email: string, password: string, displayName: string) => {
  try {
    await firebase.auth().createUserWithEmailAndPassword(email, password);
    const { isOK, message, authUser } = await updateProfile(displayName, '');
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
  const user = firebase.auth().currentUser;
  if (user === null) {
    return { isOK: false, message: t('firebase.message.unkownUser'), claims: undefined };
  }
  const result = await user.getIdTokenResult(true);
  return { isOK: true, message: '', claims: result.claims };
};

export const updateProfile = async (displayName: string, photoURL: string) => {
  try {
    const user = firebase.auth().currentUser;
    if (user === null) {
      return { isOK: false, message: t('firebase.message.unkownUser'), authUser: undefined };
    }
    await user.updateProfile({ displayName, photoURL: photoURL });
    const updatedUser = firebase.auth().currentUser;
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
    const user = firebase.auth().currentUser;
    if (user === null || user.email === null) {
      return { isOK: false, message: t('firebase.message.unkownUser') };
    }
    const authCred = firebase.auth.EmailAuthProvider.credential(user.email, oldPassword);
    await user.reauthenticateWithCredential(authCred);
    await user.updatePassword(password);
    return { isOK: true, message: '' };
  } catch (error: any) {
    console.log(error);
    return { isOK: false, message: error };
  }
};

export const checkPassword = async (password: string) => {
  try {
    const user = firebase.auth().currentUser;
    //console.log(user);
    if (user === null || user.email === null) {
      return { isOK: false, message: t('firebase.message.unkownUser') };
    }
    const authCred = firebase.auth.EmailAuthProvider.credential(user.email, password);
    await user.reauthenticateWithCredential(authCred);
    return { isOK: true, message: '' };
  } catch (error: any) {
    console.log(error);
    return { isOK: false, message: error };
  }
};

export const deleteUserAccount = async (password: string) => {
  try {
    const user = firebase.auth().currentUser;
    if (user !== null && user.email !== null) {
      const authCred = firebase.auth.EmailAuthProvider.credential(user.email, password);
      await user.reauthenticateWithCredential(authCred);
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
    const user = firebase.auth().currentUser;
    if (user) {
      return await user.sendEmailVerification();
    } else {
      return 'error';
    }
  } catch (error) {
    return 'error';
    //console.error(error);
  }
};

export const sendPasswordResetEmail = async (email: string) => {
  try {
    return await firebase.auth().sendPasswordResetEmail(email);
  } catch (error: any) {
    return error.code;
  }
};

export const signOut = async () => {
  try {
    await firebase.auth().signOut();
  } catch (error) {
    //console.log(error);
  }
};
