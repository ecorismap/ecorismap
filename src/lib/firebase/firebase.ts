import { getApp } from '@react-native-firebase/app';

import { getAnalytics, setAnalyticsCollectionEnabled } from '@react-native-firebase/analytics';
import { initializeAppCheck, ReactNativeFirebaseAppCheckProvider } from '@react-native-firebase/app-check';
import { getAuth, connectAuthEmulator } from '@react-native-firebase/auth';
import { getFirestore, connectFirestoreEmulator } from '@react-native-firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from '@react-native-firebase/functions';
import { getStorage, connectStorageEmulator } from '@react-native-firebase/storage';

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
  addDoc,
  deleteDoc,
  writeBatch,
  onSnapshot,
  setDoc,
  getDocsFromServer,
  updateDoc,
} from '@react-native-firebase/firestore';
export { httpsCallable } from '@react-native-firebase/functions';
export { ref, uploadBytes, uploadString, getDownloadURL, deleteObject, listAll } from '@react-native-firebase/storage';

// RNFB v24 aligned the modular API types with firebase-js-sdk: getFirestore()/getAuth()/etc.
// now return the modular instance types (Firestore/Auth/...), not the legacy *.Module types.
// Deriving from the getters keeps these in sync with what collection()/doc()/etc. expect.
export let firestore: ReturnType<typeof getFirestore>;
export let functions: ReturnType<typeof getFunctions>;
export let storage: ReturnType<typeof getStorage>;
export let auth: ReturnType<typeof getAuth>;

let resolveFirebaseReady: () => void;
export const firebaseReady: Promise<void> = new Promise((resolve) => {
  resolveFirebaseReady = resolve;
});

const initialize = async (isEmulating = false) => {
  //Alert.alert('', __DEV__ ? 'DEVモードです' : '本番モードです');
  // RNFB v24's index.d.ts re-exports ReactNativeFirebaseAppCheckProvider as a type-only name,
  // shadowing the runtime value from the modular API. The class exists at runtime, so construct it.
  // @ts-ignore -- type-only export upstream; value is present at runtime
  const rnfbProvider = new ReactNativeFirebaseAppCheckProvider();
  // デバッグトークンは.env（EXPO_PUBLIC_APPCHECK_DEBUG_TOKEN）から注入する。
  // 未設定の場合はRNFBが自動生成したトークンをコンソール登録する運用。
  const appCheckDebugToken = process.env.EXPO_PUBLIC_APPCHECK_DEBUG_TOKEN;
  rnfbProvider.configure({
    android: {
      provider: __DEV__ ? 'debug' : 'playIntegrity',
      // iOS/Webと同一トークンに統一（端末ごとのlogcat確認・再登録を不要にする）
      ...(appCheckDebugToken ? { debugToken: appCheckDebugToken } : {}),
    },
    apple: {
      provider: __DEV__ ? 'debug' : 'appAttest',
      ...(appCheckDebugToken ? { debugToken: appCheckDebugToken } : {}),
    },
    isTokenAutoRefreshEnabled: true,
  });
  await initializeAppCheck(getApp(), { provider: rnfbProvider });

  // アクセス解析（GA4）。開発ビルドでは計測を止める（本番は自動収集のみ）
  await setAnalyticsCollectionEnabled(getAnalytics(), !__DEV__).catch(() => undefined);

  auth = getAuth();
  firestore = getFirestore();
  // @ts-ignore
  functions = getFunctions(getApp(), 'asia-northeast1');
  storage = getStorage();

  if (isEmulating) {
    connectAuthEmulator(auth, 'http://localhost:9099');
    connectFunctionsEmulator(functions, 'localhost', 5001);
    connectFirestoreEmulator(firestore, 'localhost', 8080);
    connectStorageEmulator(storage, 'localhost', 9199);
  }

  resolveFirebaseReady();
};

const isEmulating = false;
(async () => {
  await initialize(isEmulating);
})();
