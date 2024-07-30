//import firebaseRN from '@react-native-firebase/app';
import { firebase as firebaseRN } from '@react-native-firebase/app-check';
import authRN from '@react-native-firebase/auth';
import firestoreRN, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { FirebaseFunctionsTypes } from '@react-native-firebase/functions';
import storageRN, { FirebaseStorageTypes } from '@react-native-firebase/storage';

import { FUNC_LOGIN } from '../../constants/AppConstants';

export default firebaseRN;
export let firestore: FirebaseFirestoreTypes.Module;
export let functions: FirebaseFunctionsTypes.Module;
export let storage: FirebaseStorageTypes.Module;

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

if (FUNC_LOGIN) {
  const isEmulating = false;
  initialize(isEmulating);
}
