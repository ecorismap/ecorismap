import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';
import 'react-native';
import 'expo-localization';
import { jest } from '@jest/globals';
//import * as FileSystem from 'expo-file-system';

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);

jest.mock('i18next', () => ({
  use: () => {
    return {
      init: () => {},
    };
  },
  t: (k) => k,
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
