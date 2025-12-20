import { jest } from '@jest/globals';
import { Buffer } from 'buffer';

// Make Buffer available globally  
global.Buffer = Buffer;

// Reset module registry before mocking
jest.resetModules();

// Mock redux-persist to prevent timeout issues in tests
jest.mock('redux-persist', () => {
  const real = jest.requireActual('redux-persist');
  return {
    ...real,
    persistStore: jest.fn(() => ({
      pause: jest.fn(),
      persist: jest.fn(),
      purge: jest.fn(),
      flush: jest.fn(),
      dispatch: jest.fn(),
      getState: jest.fn(),
      subscribe: jest.fn(() => jest.fn()),
    })),
  };
});

// Mock AppConstants FIRST to set FUNC_LOGIN to false in tests
jest.mock('./src/constants/AppConstants.tsx', () => ({
  ...jest.requireActual('./src/constants/AppConstants.tsx'),
  FUNC_LOGIN: false,
}));

// Mock Firebase modules FIRST before anything else imports them
jest.mock('@react-native-firebase/app', () => ({
  __esModule: true,
  default: () => ({
    name: '[DEFAULT]',
  }),
  getApp: jest.fn(() => ({
    name: '[DEFAULT]',
  })),
  initializeApp: jest.fn(),
  getApps: jest.fn(() => []),
  deleteApp: jest.fn(),
}));

jest.mock('@react-native-firebase/app-check', () => {
  const mockProvider = {
    configure: jest.fn(),
  };
  
  const mockAppCheck = {
    activate: jest.fn(),
    initializeAppCheck: jest.fn(() => Promise.resolve()),
    getToken: jest.fn(() => Promise.resolve({ token: 'test-token' })),
    newReactNativeFirebaseAppCheckProvider: jest.fn(() => mockProvider),
  };
  
  return {
    __esModule: true,
    default: jest.fn(() => mockAppCheck),
    initializeAppCheck: jest.fn(() => Promise.resolve()),
    getAppCheck: jest.fn(() => mockAppCheck),
    ReactNativeFirebaseAppCheckProvider: jest.fn().mockImplementation(() => mockProvider),
  };
});

// Mock react-native-mmkv
jest.mock('react-native-mmkv', () => {
  const storage = new Map();
  return {
    __esModule: true,
    MMKV: jest.fn().mockImplementation(() => ({
      set: jest.fn((key, value) => storage.set(key, value)),
      getString: jest.fn((key) => storage.get(key)),
      getNumber: jest.fn((key) => storage.get(key)),
      getBoolean: jest.fn((key) => storage.get(key)),
      delete: jest.fn((key) => storage.delete(key)),
      contains: jest.fn((key) => storage.has(key)),
      clearAll: jest.fn(() => storage.clear()),
      getAllKeys: jest.fn(() => Array.from(storage.keys())),
    })),
    createMMKV: jest.fn(() => ({
      set: jest.fn((key, value) => storage.set(key, value)),
      getString: jest.fn((key) => storage.get(key)),
      getNumber: jest.fn((key) => storage.get(key)),
      getBoolean: jest.fn((key) => storage.get(key)),
      delete: jest.fn((key) => storage.delete(key)),
      contains: jest.fn((key) => storage.has(key)),
      clearAll: jest.fn(() => storage.clear()),
      getAllKeys: jest.fn(() => Array.from(storage.keys())),
    })),
  };
});

// Mock mmkvStorage - use module path relative from src directory
jest.mock('./src/utils/mmkvStorage.ts', () => {
  const trackLogData = new Map();
  return {
    __esModule: true,
    storage: {
      set: jest.fn(),
      getString: jest.fn(),
      getNumber: jest.fn(),
      getBoolean: jest.fn(),
      delete: jest.fn(),
      remove: jest.fn(),
      contains: jest.fn(),
      clearAll: jest.fn(),
      getAllKeys: jest.fn(() => []),
    },
    trackLogStorage: {
      set: jest.fn((key, value) => trackLogData.set(key, value)),
      getString: jest.fn((key) => trackLogData.get(key)),
      remove: jest.fn((key) => trackLogData.delete(key)),
      clearAll: jest.fn(() => trackLogData.clear()),
      getAllKeys: jest.fn(() => Array.from(trackLogData.keys())),
    },
    reduxMMKVStorage: {
      setItem: jest.fn(() => Promise.resolve(true)),
      getItem: jest.fn(() => Promise.resolve(null)),
      removeItem: jest.fn(() => Promise.resolve()),
    },
    MMKVAsyncStorageCompat: {
      setItem: jest.fn(() => Promise.resolve()),
      getItem: jest.fn(() => Promise.resolve(null)),
      removeItem: jest.fn(() => Promise.resolve()),
      clear: jest.fn(() => Promise.resolve()),
      getAllKeys: jest.fn(() => Promise.resolve([])),
    },
    trackLogMMKV: {
      setTrackLog: jest.fn(),
      getTrackLog: jest.fn(() => null),
      clearTrackLog: jest.fn(),
      getSize: jest.fn(() => 0),
      setCurrentLocation: jest.fn(),
      getCurrentLocation: jest.fn(() => null),
      setTrackingState: jest.fn(),
      getTrackingState: jest.fn(() => 'off'),
      setChunk: jest.fn(),
      getChunk: jest.fn(() => null),
      removeChunk: jest.fn(),
      setMetadata: jest.fn(),
      getMetadata: jest.fn(() => null),
    },
    migrateFromAsyncStorage: jest.fn(() => Promise.resolve()),
  };
});

jest.mock('@react-native-firebase/auth', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    currentUser: null,
    signInWithEmailAndPassword: jest.fn(),
    createUserWithEmailAndPassword: jest.fn(),
    signOut: jest.fn(),
    onAuthStateChanged: jest.fn(() => jest.fn()),
    sendPasswordResetEmail: jest.fn(),
    confirmPasswordReset: jest.fn(),
    applyActionCode: jest.fn(),
    sendEmailVerification: jest.fn(),
    updateProfile: jest.fn(),
    updateEmail: jest.fn(),
    updatePassword: jest.fn(),
    reauthenticateWithCredential: jest.fn(),
    deleteUser: jest.fn(),
    useEmulator: jest.fn(),
  })),
}));

jest.mock('@react-native-firebase/firestore', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(() => Promise.resolve({ exists: false })),
        set: jest.fn(() => Promise.resolve()),
        update: jest.fn(() => Promise.resolve()),
        delete: jest.fn(() => Promise.resolve()),
        onSnapshot: jest.fn(() => jest.fn()),
      })),
      get: jest.fn(() => Promise.resolve({ docs: [] })),
      add: jest.fn(() => Promise.resolve({ id: 'test-id' })),
      where: jest.fn(() => ({
        get: jest.fn(() => Promise.resolve({ docs: [] })),
        onSnapshot: jest.fn(() => jest.fn()),
      })),
      onSnapshot: jest.fn(() => jest.fn()),
    })),
    doc: jest.fn(() => ({
      get: jest.fn(() => Promise.resolve({ exists: false })),
      set: jest.fn(() => Promise.resolve()),
      update: jest.fn(() => Promise.resolve()),
      delete: jest.fn(() => Promise.resolve()),
      onSnapshot: jest.fn(() => jest.fn()),
    })),
    batch: jest.fn(() => ({
      set: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      commit: jest.fn(() => Promise.resolve()),
    })),
    runTransaction: jest.fn(),
    useEmulator: jest.fn(),
  })),
  Timestamp: {
    now: jest.fn(() => ({ toDate: () => new Date() })),
    fromDate: jest.fn(date => ({ toDate: () => date })),
  },
  FieldValue: {
    serverTimestamp: jest.fn(),
    delete: jest.fn(),
    increment: jest.fn(),
  },
}));

jest.mock('@react-native-firebase/storage', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    ref: jest.fn(() => ({
      child: jest.fn(() => ({
        put: jest.fn(() => ({
          on: jest.fn(),
          then: jest.fn(() => Promise.resolve()),
          catch: jest.fn(),
        })),
        putFile: jest.fn(() => ({
          on: jest.fn(),
          then: jest.fn(() => Promise.resolve()),
          catch: jest.fn(),
        })),
        getDownloadURL: jest.fn(() => Promise.resolve('https://example.com/file.jpg')),
        delete: jest.fn(() => Promise.resolve()),
        getMetadata: jest.fn(() => Promise.resolve({})),
        updateMetadata: jest.fn(() => Promise.resolve({})),
      })),
    })),
    useEmulator: jest.fn(),
  })),
}));

jest.mock('@react-native-firebase/functions', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    httpsCallable: jest.fn(() => jest.fn(() => Promise.resolve({ data: {} }))),
    useEmulator: jest.fn(),
  })),
}));

// Mock LogBox before importing react-native
jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  RN.LogBox = {
    ignoreLogs: jest.fn(),
    ignoreAllLogs: jest.fn(),
  };
  // Set Platform.OS to 'ios' by default, but allow tests to override
  RN.Platform = {
    ...RN.Platform,
    OS: 'ios',
    select: jest.fn((obj) => obj[RN.Platform.OS] || obj.default),
  };
  return RN;
});

// Also mock LogBox globally
global.LogBox = {
  ignoreLogs: jest.fn(),
  ignoreAllLogs: jest.fn(),
};

import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';
import 'react-native';
import 'expo-localization';
//import * as FileSystem from 'expo-file-system';

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);

jest.mock('i18next', () => ({
  use: () => {
    return {
      init: () => {},
    };
  },
  t: (k) => k,
  language: 'en',
  changeLanguage: jest.fn(),
  languages: ['en', 'ja'],
  isInitialized: true,
}));

jest.mock('uuid', () => ({
  v4: () => 'uuid',
}));

// Mock Base64
jest.mock('Base64', () => ({
  btoa: (str) => {
    const Buffer = require('buffer').Buffer;
    return Buffer.from(str).toString('base64');
  },
  atob: (str) => {
    const Buffer = require('buffer').Buffer;
    return Buffer.from(str, 'base64').toString();
  },
}));

// Mock react-native-reanimated
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return Reanimated;
});

// Mock react-native-gesture-handler
jest.mock('react-native-gesture-handler', () => {
  const View = require('react-native').View;
  return {
    Swipeable: View,
    DrawerLayout: View,
    State: {},
    ScrollView: View,
    Slider: View,
    Switch: View,
    TextInput: View,
    ToolbarAndroid: View,
    ViewPagerAndroid: View,
    WebView: View,
    NativeViewGestureHandler: View,
    TapGestureHandler: View,
    FlingGestureHandler: View,
    ForceTouchGestureHandler: View,
    LongPressGestureHandler: View,
    PanGestureHandler: View,
    PinchGestureHandler: View,
    RotationGestureHandler: View,
    RawButton: View,
    BaseButton: View,
    RectButton: View,
    BorderlessButton: View,
    FlatList: View,
    gestureHandlerRootHOC: jest.fn(component => component),
    GestureHandlerRootView: View,
    Directions: {},
  };
});

// Mock expo-task-manager
jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn(() => Promise.resolve(false)),
  registerTaskAsync: jest.fn(() => Promise.resolve()),
  unregisterTaskAsync: jest.fn(() => Promise.resolve()),
  getTaskOptionsAsync: jest.fn(() => Promise.resolve({})),
  getRegisteredTasksAsync: jest.fn(() => Promise.resolve([])),
  unregisterAllTasksAsync: jest.fn(() => Promise.resolve()),
  isTaskDefined: jest.fn(() => false),
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
}));

// Mock @gorhom/bottom-sheet
jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  
  const BottomSheet = React.forwardRef((props, ref) => {
    return React.createElement(View, { ...props, ref });
  });
  
  return {
    __esModule: true,
    default: BottomSheet,
    BottomSheetView: View,
    BottomSheetModal: View,
    BottomSheetModalProvider: ({ children }) => children,
    BottomSheetBackdrop: View,
    BottomSheetScrollView: View,
    BottomSheetFlatList: View,
    BottomSheetSectionList: View,
    BottomSheetTextInput: View,
    useBottomSheetModal: () => ({
      dismiss: jest.fn(),
      present: jest.fn(),
    }),
    useBottomSheetDynamicSnapPoints: () => ({
      animatedHandleHeight: { value: 0 },
      animatedSnapPoints: { value: [] },
      animatedContentHeight: { value: 0 },
      handleContentLayout: jest.fn(),
    }),
  };
});

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => {
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }) => children,
    SafeAreaView: require('react-native').View,
    useSafeAreaInsets: () => inset,
    initialWindowMetrics: {
      insets: inset,
      frame: { x: 0, y: 0, width: 0, height: 0 },
    },
  };
});

// Mock react-native-device-info
jest.mock('react-native-device-info', () => ({
  isTablet: jest.fn(() => false),
  getDeviceId: jest.fn(() => 'test-device-id'),
  getSystemName: jest.fn(() => 'iOS'),
  getSystemVersion: jest.fn(() => '14.0'),
  getVersion: jest.fn(() => '1.0.0'),
  getBuildNumber: jest.fn(() => '1'),
  getApplicationName: jest.fn(() => 'ecorismap'),
  getBundleId: jest.fn(() => 'com.ecorismap'),
  hasNotch: jest.fn(() => false),
  hasDynamicIsland: jest.fn(() => false),
  isPinOrFingerprintSet: jest.fn(() => Promise.resolve(false)),
}));

// Mock react-native-fs
jest.mock('react-native-fs', () => ({
  mkdir: jest.fn(() => Promise.resolve()),
  moveFile: jest.fn(() => Promise.resolve()),
  copyFile: jest.fn(() => Promise.resolve()),
  pathForBundle: jest.fn(() => Promise.resolve('')),
  pathForGroup: jest.fn(() => Promise.resolve('')),
  getFSInfo: jest.fn(() => Promise.resolve({})),
  getAllExternalFilesDirs: jest.fn(() => Promise.resolve([])),
  unlink: jest.fn(() => Promise.resolve()),
  exists: jest.fn(() => Promise.resolve(true)),
  stopDownload: jest.fn(() => Promise.resolve()),
  resumeDownload: jest.fn(() => Promise.resolve()),
  isResumable: jest.fn(() => Promise.resolve(true)),
  stopUpload: jest.fn(() => Promise.resolve()),
  completeHandlerIOS: jest.fn(() => Promise.resolve()),
  readDir: jest.fn(() => Promise.resolve([])),
  readDirAssets: jest.fn(() => Promise.resolve([])),
  existsAssets: jest.fn(() => Promise.resolve(true)),
  readdir: jest.fn(() => Promise.resolve([])),
  setReadable: jest.fn(() => Promise.resolve()),
  stat: jest.fn(() => Promise.resolve({})),
  readFile: jest.fn(() => Promise.resolve('')),
  read: jest.fn(() => Promise.resolve('')),
  readFileAssets: jest.fn(() => Promise.resolve('')),
  hash: jest.fn(() => Promise.resolve('')),
  copyFileAssets: jest.fn(() => Promise.resolve()),
  copyFileAssetsIOS: jest.fn(() => Promise.resolve()),
  copyAssetsVideoIOS: jest.fn(() => Promise.resolve()),
  writeFile: jest.fn(() => Promise.resolve()),
  appendFile: jest.fn(() => Promise.resolve()),
  write: jest.fn(() => Promise.resolve()),
  downloadFile: jest.fn(() => Promise.resolve({ jobId: 1, promise: Promise.resolve() })),
  uploadFiles: jest.fn(() => Promise.resolve()),
  touch: jest.fn(() => Promise.resolve()),
  MainBundlePath: '',
  CachesDirectoryPath: '',
  DocumentDirectoryPath: '',
  ExternalDirectoryPath: '',
  ExternalStorageDirectoryPath: '',
  TemporaryDirectoryPath: '',
  LibraryDirectoryPath: '',
  PicturesDirectoryPath: '',
}));

// Mock react-native-japanese-text-analyzer
jest.mock('react-native-japanese-text-analyzer', () => ({
  tokenize: jest.fn((text) => [{ surface: text, features: [] }]),
}));

// Mock @react-native-community/image-editor
jest.mock('@react-native-community/image-editor', () => ({
  __esModule: true,
  default: {
    cropImage: jest.fn(() => Promise.resolve('file://test-cropped-image.jpg')),
  },
}));

// Mock react-native-maps
jest.mock('react-native-maps', () => {
  const { View } = require('react-native');
  const MockMapView = (props) => {
    return View(props);
  };
  const MockMarker = (props) => View(props);
  const MockPolyline = (props) => View(props);
  const MockPolygon = (props) => View(props);
  const MockUrlTile = (props) => View(props);
  const MockPMTile = (props) => View(props);
  
  return {
    __esModule: true,
    default: MockMapView,
    MapView: MockMapView,
    Marker: MockMarker,
    Polyline: MockPolyline,
    Polygon: MockPolygon,
    UrlTile: MockUrlTile,
    PMTile: MockPMTile,
    PROVIDER_GOOGLE: 'google',
    PROVIDER_DEFAULT: 'default',
  };
});

// Mock react-native-gdalwarp
jest.mock('react-native-gdalwarp', () => ({
  warp: jest.fn(() => Promise.resolve({ uri: 'file://test-warped.tif' })),
  warpedFileType: 'tif',
}));

// Mock react-native-scale-bar
jest.mock('react-native-scale-bar', () => {
  const { View } = require('react-native');
  return View;
});

// react-native-zip-archiveは使用しなくなったためモック削除
// JSZipを代わりに使用


// Mock expo-sqlite
jest.mock('expo-sqlite', () => ({
  SQLiteDatabase: jest.fn(),
  openDatabaseAsync: jest.fn(() => Promise.resolve({
    execAsync: jest.fn(),
    runAsync: jest.fn(),
    getFirstAsync: jest.fn(),
    getAllAsync: jest.fn(),
    closeAsync: jest.fn(),
  })),
  openDatabaseSync: jest.fn(() => ({
    execSync: jest.fn(),
    runSync: jest.fn(),
    getFirstSync: jest.fn(),
    getAllSync: jest.fn(),
    closeSync: jest.fn(),
  })),
}));


// Mock expo-image-picker
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(() => Promise.resolve({ 
    canceled: false, 
    assets: [{ uri: 'test://image.jpg', width: 100, height: 100 }]
  })),
  launchCameraAsync: jest.fn(() => Promise.resolve({ 
    canceled: false, 
    assets: [{ uri: 'test://image.jpg', width: 100, height: 100 }]
  })),
  requestCameraPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  requestMediaLibraryPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  MediaTypeOptions: {
    Images: 'Images',
    Videos: 'Videos',
    All: 'All',
  },
  ImagePickerResult: {},
  PermissionStatus: {
    GRANTED: 'granted',
    DENIED: 'denied',
    UNDETERMINED: 'undetermined',
  },
}));

//jest.mock('expo', () => require.requireMock('expo'));

// jest.mock('expo-file-system', () => ({
//   downloadAsync: () => Promise.resolve({ md5: 'md5', uri: 'uri' }),
//   getInfoAsync: () => Promise.resolve({ exists: true, md5: 'md5', uri: 'uri' }),
//   readAsStringAsync: () => Promise.resolve(),
//   writeAsStringAsync: () => Promise.resolve(),
//   deleteAsync: () => Promise.resolve(),
//   moveAsync: () => Promise.resolve(),
//   copyAsync: () => Promise.resolve(),
//   makeDirectoryAsync: () => Promise.resolve(),
//   readDirectoryAsync: () => Promise.resolve(),
//   createDownloadResumable: () => Promise.resolve(),
//   cacheDirectory: 'file:///test-directory/',
// }));
