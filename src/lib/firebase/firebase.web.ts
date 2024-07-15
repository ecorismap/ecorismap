import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import 'firebase/compat/storage';
import 'firebase/compat/functions';
import 'firebase/compat/app-check';

import { FUNC_LOGIN } from '../../constants/AppConstants';
import { firebaseConfig, reCaptureSiteKey } from '../../constants/APIKeys';

export default firebase;
export let firestore: firebase.firestore.Firestore;
export let functions: firebase.functions.Functions;
export let storage: firebase.storage.Storage;

const initializeWeb = (isEmulating = false) => {
  firebase.initializeApp(firebaseConfig);
  //userがキャッシュになってimmerでエラーになる?からNONEにした
  firebase.auth().setPersistence(firebase.auth.Auth.Persistence.SESSION);

  if (isEmulating) {
    firebase.auth().useEmulator('http://localhost:9099');
    firebase.app().functions('asia-northeast1').useEmulator('localhost', 5001);
    firebase.firestore().useEmulator('localhost', 8080);
    firebase.storage().useEmulator('localhost', 9199);
  }

  firestore = firebase.firestore();
  functions = firebase.app().functions('asia-northeast1');
  storage = firebase.storage();
  const appCheck = firebase.appCheck();
  appCheck.activate(reCaptureSiteKey, true);
};

if (FUNC_LOGIN) {
  const isEmulating = false;
  initializeWeb(isEmulating);
}
