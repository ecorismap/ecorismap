import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';
import 'react-native';
import 'expo-localization';
import { jest } from '@jest/globals';

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
