import { getApp } from '@react-native-firebase/app';

import {
  initializeAppCheck,
  ReactNativeFirebaseAppCheckProvider,
} from '@react-native-firebase/app-check';
import { FirebaseAuthTypes, getAuth } from '@react-native-firebase/auth';
import { getFirestore, FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { getFunctions, FirebaseFunctionsTypes } from '@react-native-firebase/functions';
import { getStorage, FirebaseStorageTypes } from '@react-native-firebase/storage';

import { FUNC_LOGIN } from '../../constants/AppConstants';
//import { Alert } from 'react-native';

export {
  //@ts-ignore
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  updateProfile,
  getIdTokenResult,
} from '@react-native-firebase/auth';
export {
  Timestamp,
  query,
  collection,
  where,
  getDocs,
  getDoc,
  orderBy,
  doc,
  deleteDoc,
  writeBatch,
  onSnapshot,
  setDoc,
  getDocsFromServer,
  updateDoc,
} from '@react-native-firebase/firestore';
export { httpsCallable } from '@react-native-firebase/functions';
export { ref, uploadBytes, uploadString, getDownloadURL, deleteObject, listAll } from '@react-native-firebase/storage';

export let firestore: FirebaseFirestoreTypes.Module;
export let functions: FirebaseFunctionsTypes.Module;
export let storage: FirebaseStorageTypes.Module;
export let auth: FirebaseAuthTypes.Module;

const initialize = async (isEmulating = false) => {
  //Alert.alert('', __DEV__ ? 'DEVモードです' : '本番モードです');
  const rnfbProvider = new ReactNativeFirebaseAppCheckProvider();
  rnfbProvider.configure({
    android: {
      provider: __DEV__ ? 'debug' : 'playIntegrity',
    },
    apple: {
      provider: __DEV__ ? 'debug' : 'appAttest',
      debugToken: '80DDE922-1624-49D9-9AAD-0AE776C91BCE',
    },
    isTokenAutoRefreshEnabled: true,
  });
  await initializeAppCheck(getApp(), { provider: rnfbProvider });

  auth = getAuth();
  firestore = getFirestore();
  // @ts-ignore
  functions = getFunctions(getApp(), 'asia-northeast1');
  storage = getStorage();

  if (isEmulating) {
    auth.useEmulator('http://localhost:9099');
    functions.useEmulator('localhost', 5001);
    firestore.useEmulator('localhost', 8080);
    storage.useEmulator('localhost', 9199);
  }
};

if (FUNC_LOGIN) {
  const isEmulating = false;
  (async () => {
    await initialize(isEmulating);
  })();
}
