import { getApp } from '@react-native-firebase/app';

import { initializeAppCheck, ReactNativeFirebaseAppCheckProvider } from '@react-native-firebase/app-check';
import { FirebaseAuthTypes, getAuth } from '@react-native-firebase/auth';
import { getFirestore, FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { getFunctions, FirebaseFunctionsTypes } from '@react-native-firebase/functions';
import { getStorage, FirebaseStorageTypes } from '@react-native-firebase/storage';

import { FUNC_LOGIN } from '../../constants/AppConstants';
//import { Alert } from 'react-native';

let isFirebaseInitialized = false;
let firebaseInitializationPromise: Promise<void> | null = null;

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
  // ❶ 最初に App Check を初期化（これより前に他の Firebase モジュールを触らない）
  const rnfbProvider = new ReactNativeFirebaseAppCheckProvider();
  rnfbProvider.configure({
    android: {
      provider: __DEV__ ? 'debug' : 'playIntegrity',
      // debug は dev のみ有効。release/playIntegrity では無視される
      debugToken: '80DDE922-1624-49D9-9AAD-0AE776C91BCE',
    },
    apple: {
      provider: __DEV__ ? 'debug' : 'appAttest',
      debugToken: '80DDE922-1624-49D9-9AAD-0AE776C91BCE',
    },
  });

  try {
    await initializeAppCheck(getApp(), {
      provider: rnfbProvider,
      isTokenAutoRefreshEnabled: true,
    });
  } catch (e) {
    // ここで落ちる場合は設定（リンク、SHA、端末のPlay環境）が未整備の可能性大
    console.warn('[AppCheck] initialize failed:', e);
  }

  // ❷ App Check 初期化後に各サービスを取得
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

  isFirebaseInitialized = true;
};

// Firebase初期化が完了するまで待つヘルパー関数
export const waitForFirebaseInitialization = async (): Promise<void> => {
  if (isFirebaseInitialized) {
    return;
  }

  if (firebaseInitializationPromise) {
    await firebaseInitializationPromise;
    return;
  }

  // 初期化がまだ開始されていない場合は待機
  let attempts = 0;
  while (!isFirebaseInitialized && attempts < 50) {
    // 最大5秒待機
    await new Promise((resolve) => setTimeout(resolve, 100));
    attempts++;
  }

  if (!isFirebaseInitialized) {
    throw new Error('Firebase initialization timeout');
  }
};

if (FUNC_LOGIN) {
  const isEmulating = false;
  firebaseInitializationPromise = initialize(isEmulating);
}
