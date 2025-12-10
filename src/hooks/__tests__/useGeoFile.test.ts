// Firebaseのモック（最初に定義する必要がある）
jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({})),
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  sendEmailVerification: jest.fn(),
  signOut: jest.fn(),
  onAuthStateChanged: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
}));

jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({})),
  collection: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  getDocs: jest.fn(),
  onSnapshot: jest.fn(),
  serverTimestamp: jest.fn(),
}));

jest.mock('firebase/storage', () => ({
  getStorage: jest.fn(() => ({})),
  ref: jest.fn(),
  uploadBytes: jest.fn(),
  getDownloadURL: jest.fn(),
  deleteObject: jest.fn(),
}));

jest.mock('firebase/app-check', () => ({
  initializeAppCheck: jest.fn(),
  ReCaptchaV3Provider: jest.fn(),
  ReCaptchaEnterpriseProvider: jest.fn(),
}));

jest.mock('firebase/app', () => ({
  getApp: jest.fn(() => ({})),
  initializeApp: jest.fn(() => ({})),
}));

jest.mock('firebase/functions', () => ({
  getFunctions: jest.fn(() => ({})),
  httpsCallable: jest.fn(),
}));

jest.mock('../../lib/firebase/firebase', () => ({
  auth: {},
  db: {},
  storage: {},
  firestore: {},
  functions: {},
  initialize: jest.fn(),
}));

jest.mock('../../lib/firebase/storage', () => ({
  uploadPhoto: jest.fn(),
  downloadFile: jest.fn(),
  deletePhoto: jest.fn(),
}));

import { renderHook, act } from '@testing-library/react-hooks';
import { useGeoFile } from '../useGeoFile';
import { UserType } from '../../types';
import { Buffer } from 'buffer';

let mockDispatch = jest.fn();
let mockSelector = jest.fn();

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: () => mockSelector(),
}));

jest.mock('ulid', () => ({ ulid: () => '123456789' }));

// Mock expo-file-system
jest.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: jest.fn(() => Promise.resolve('')),
}));

// Set Platform.OS to 'web' for this test
const { Platform } = require('react-native');
Platform.OS = 'web';

const user: UserType = {
  uid: '0',
  email: 'mizutani.takayuki@gmail.com',
  displayName: 'Takayuki Mizutani',
  photoURL: 'https://www.dummy.com/test.jpg',
};

const projectId: string | undefined = '0';

describe('useGeoFile', () => {
  beforeEach(() => {
    mockDispatch = jest.fn();
    mockSelector = jest.fn().mockReturnValueOnce(projectId).mockReturnValueOnce(user);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('web環境でgeojsonを読み込む', async () => {
    const name = 'test.geojson';
    const geojsonData = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            name: 'Tokyo Tower',
          },
          geometry: {
            type: 'Point',
            coordinates: [139.7455, 35.6586],
          },
        },
      ],
    };

    const jsonString = JSON.stringify(geojsonData);
    const base64String = Buffer.from(jsonString).toString('base64');
    const uri = `data:application/json;base64,${base64String}`;
    const { result } = renderHook(() => useGeoFile());
    let ret;
    await act(async () => {
      ret = await result.current.importGeoFile(uri, name);
    });
    //expect(result.current.isLoading).toBe(true);
    //await waitForNextUpdate();
    //expect(result.current.isLoading).toStrictEqual(false);
    expect(mockDispatch).toHaveBeenCalledTimes(2);
    expect(ret).toStrictEqual({ isOK: true, message: 'hooks.message.receiveFile' });
    expect(mockDispatch.mock.calls[0][0]).toEqual({
      type: 'layers/addLayerAction',
      payload: {
        active: false,
        colorStyle: {
          color: '#ff0000',
          colorList: [],
          colorRamp: 'RANDOM',
          colorType: 'SINGLE',
          customFieldValue: '',
          fieldName: '',
          lineWidth: 1.5,
          transparency: 0.8,
        },
        field: [{ format: 'STRING', id: '123456789', name: 'name' }],
        id: '123456789',
        label: '',
        name: 'test.geojson',
        permission: 'COMMON',
        type: 'POINT',
        visible: true,
      },
    });
    expect(mockDispatch.mock.calls[1][0]).toEqual({
      type: 'dataSet/addDataAction',
      payload: [
        {
          data: [
            {
              coords: { latitude: 35.6586, longitude: 139.7455 },
              displayName: 'Takayuki Mizutani',
              field: { name: 'Tokyo Tower' },
              id: '123456789',
              redraw: false,
              userId: '0',
              visible: true,
            },
          ],
          layerId: '123456789',
          userId: '0',
        },
      ],
    });
  });
});
