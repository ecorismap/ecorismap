//import firebaseRN from '@react-native-firebase/app';
import { firebase as firebaseRN } from '@react-native-firebase/app-check';
import authRN from '@react-native-firebase/auth';
import firestoreRN, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { FirebaseFunctionsTypes } from '@react-native-firebase/functions';
import storageRN, { FirebaseStorageTypes } from '@react-native-firebase/storage';

import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import 'firebase/compat/storage';
import 'firebase/compat/functions';
import 'firebase/compat/app-check';

import { Platform } from 'react-native';
import { FUNC_LOGIN } from '../../constants/AppConstants';
import { firebaseConfig, reCaptureSiteKey } from '../../constants/APIKeys';

export default firebase;
export let firestore: FirebaseFirestoreTypes.Module | firebase.firestore.Firestore;
export let functions: FirebaseFunctionsTypes.Module | firebase.functions.Functions;
export let storage: FirebaseStorageTypes.Module | firebase.storage.Storage;

const initialize = (isEmulating = false) => {
  if (isEmulating) {
    authRN().useEmulator('http://localhost:9099');
    firebaseRN.app().functions('asia-northeast1').useEmulator('localhost', 5001);
    try {
      firestoreRN().useEmulator('localhost', 8080);
    } catch (e) {
      console.log(e);
    }
    storageRN().useEmulator('localhost', 9199);
  }

  firestore = firestoreRN();
  functions = firebaseRN.app().functions('asia-northeast1');
  storage = storageRN();
  const appCheck = firebaseRN.appCheck();
  appCheck.activate('ignored', true);
};

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
  if (Platform.OS === 'web') {
    const isEmulating = false;
    initializeWeb(isEmulating);
  } else {
    const isEmulating = false;
    initialize(isEmulating);
  }
}
