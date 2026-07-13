import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported as isAnalyticsSupported } from 'firebase/analytics';
import { getFirestore, Firestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getAuth, browserSessionPersistence, connectAuthEmulator } from 'firebase/auth';

export {
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  onAuthStateChanged,
  updatePassword,
} from 'firebase/auth';
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
} from 'firebase/firestore';

export { httpsCallable } from 'firebase/functions';
export { ref, uploadBytes, uploadString, getDownloadURL, deleteObject, listAll } from 'firebase/storage';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

import { firebaseConfig, reCaptureSiteKey } from '../../constants/APIKeys';

export let firestore: Firestore;
export let functions: ReturnType<typeof getFunctions>;
export let storage: ReturnType<typeof getStorage>;

export let auth: ReturnType<typeof getAuth>;

export const firebaseReady: Promise<void> = Promise.resolve();

const initialize = (isEmulating = false) => {
  const firebaseApp = initializeApp(firebaseConfig);
  //userがキャッシュになってimmerでエラーになる?からNONEにした
  auth = getAuth(firebaseApp);
  auth.setPersistence(browserSessionPersistence);

  firestore = getFirestore(firebaseApp);
  functions = getFunctions(firebaseApp, 'asia-northeast1');
  storage = getStorage(firebaseApp);

  // アクセス解析（GA4）。開発・エミュレータ時のノイズを避けるため本番ビルドのみ初期化
  if (process.env.NODE_ENV === 'production' && !isEmulating) {
    isAnalyticsSupported()
      .then((supported) => {
        if (supported) getAnalytics(firebaseApp);
      })
      .catch(() => undefined);
  }

  // App Checkの初期化
  // デバッグモードの判定（開発環境またはlocalhost）
  const isDebugMode = process.env.NODE_ENV === 'development' || window.location.hostname === 'localhost' || isEmulating;

  if (isDebugMode) {
    // デバッグトークンは.env（EXPO_PUBLIC_APPCHECK_DEBUG_TOKEN）から注入する。
    // ネイティブ(firebase.ts apple.debugToken)と同じ値を使い、リロードごとの再登録を避ける。
    // 未設定の場合はtrueを設定し、コンソールに表示される新規トークンを登録する標準フロー。
    (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = process.env.EXPO_PUBLIC_APPCHECK_DEBUG_TOKEN || true;
    console.log('🔧 Firebase App Check: Debug mode enabled');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const appCheck = initializeAppCheck(firebaseApp, {
    provider: new ReCaptchaV3Provider(reCaptureSiteKey),
    isTokenAutoRefreshEnabled: true,
  });

  if (isEmulating) {
    connectAuthEmulator(getAuth(firebaseApp), 'http://localhost:9099');
    connectFunctionsEmulator(functions, 'localhost', 5001);
    connectFirestoreEmulator(firestore, 'localhost', 8080);
    connectStorageEmulator(storage, 'localhost', 9199);
  }
};

const isEmulating = false;
initialize(isEmulating);
