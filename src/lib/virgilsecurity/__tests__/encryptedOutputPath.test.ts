jest.mock('@virgilsecurity/e3kit-native', () => ({ EThree: jest.fn() }));
jest.mock('react-native-virgil-crypto', () => ({ virgilCrypto: {} }));
jest.mock('react-native-keychain', () => ({}));
jest.mock('../../firebase/firebase', () => ({ functions: {}, httpsCallable: jest.fn(), firebaseReady: Promise.resolve() }));
jest.mock('expo-file-system/legacy', () => ({ cacheDirectory: 'file:///cache/' }));

import { Platform } from 'react-native';
import { encryptedOutputPath } from '../e3kit';

describe('encryptedOutputPath', () => {
  const originalOS = Platform.OS;
  afterEach(() => {
    Platform.OS = originalOS;
  });

  test('iOSは入力の拡張子を付けた出力先を返す（RNFBが拡張子からcontentTypeを決めるため）', () => {
    Platform.OS = 'ios';
    expect(encryptedOutputPath('file:///doc/projects/EMAP_20261121_120000.jpg')).toMatch(/^file:\/\/\/cache\/enc_[a-z0-9_]+\.jpg$/);
    expect(encryptedOutputPath('/doc/a.PNG')).toMatch(/\.PNG$/);
  });

  test('iOSで拡張子が無い・不正な入力は拡張子なし', () => {
    Platform.OS = 'ios';
    expect(encryptedOutputPath('/doc/noext')).toMatch(/^file:\/\/\/cache\/enc_[a-z0-9_]+$/);
    expect(encryptedOutputPath('/doc.dir/noext')).toMatch(/enc_[a-z0-9_]+$/);
  });

  test('呼ぶたびに別の出力先になる', () => {
    Platform.OS = 'ios';
    expect(encryptedOutputPath('/a.jpg')).not.toBe(encryptedOutputPath('/a.jpg'));
  });

  test('iOS以外はライブラリの既定（入力の拡張子を引き継ぐ）に任せる', () => {
    Platform.OS = 'android';
    expect(encryptedOutputPath('/doc/a.jpg')).toBeUndefined();
  });
});
