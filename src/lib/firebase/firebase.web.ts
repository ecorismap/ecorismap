import { initializeApp } from 'firebase/app';
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

import { FUNC_LOGIN } from '../../constants/AppConstants';
import { firebaseConfig, reCaptureSiteKey } from '../../constants/APIKeys';

export let firestore: Firestore;
export let functions: ReturnType<typeof getFunctions>;
export let storage: ReturnType<typeof getStorage>;

export let auth: ReturnType<typeof getAuth>;

const initialize = (isEmulating = false) => {
  const firebaseApp = initializeApp(firebaseConfig);
  //userがキャッシュになってimmerでエラーになる?からNONEにした
  auth = getAuth(firebaseApp);
  auth.setPersistence(browserSessionPersistence);

  firestore = getFirestore(firebaseApp);
  functions = getFunctions(firebaseApp, 'asia-northeast1');
  storage = getStorage(firebaseApp);

  // App Checkの初期化
  // デバッグモードの判定（開発環境またはlocalhost）
  const isDebugMode = process.env.NODE_ENV === 'development' || window.location.hostname === 'localhost' || isEmulating;

  if (isDebugMode) {
    // デバッグモード時はwindowにDEBUG_TOKENを設定
    // コンソールに表示されるデバッグトークンをFirebaseコンソールに登録する必要がある
    (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
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

if (FUNC_LOGIN) {
  const isEmulating = false;
  initialize(isEmulating);
}
