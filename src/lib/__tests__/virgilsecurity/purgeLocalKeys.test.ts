import * as Keychain from 'react-native-keychain';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { purgeLocalKeys } from '../../virgilsecurity/e3kit';

jest.mock('react-native-keychain', () => ({
  resetGenericPassword: jest.fn(),
}));
jest.mock('@virgilsecurity/e3kit-native', () => ({
  EThree: { initialize: jest.fn() },
}));
jest.mock('react-native-virgil-crypto', () => ({
  virgilCrypto: {},
}));

const mockResetGenericPassword = Keychain.resetGenericPassword as jest.MockedFunction<
  typeof Keychain.resetGenericPassword
>;

describe('purgeLocalKeys', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('e3kit-nativeの保存実体(Keychainのservice)を削除する', async () => {
    await purgeLocalKeys();
    expect(mockResetGenericPassword).toHaveBeenCalledWith({ service: 'com.virgilsecurity.keys' });
  });

  it('グループチケットのキーのみ削除し他のキーは残す', async () => {
    await AsyncStorage.setItem('!.virgil-group-storage!ticket1', 'data1');
    await AsyncStorage.setItem('!.virgil-group-storage!ticket2', 'data2');
    await AsyncStorage.setItem('keyMigrated:user1', 'true');
    await purgeLocalKeys();
    const keys = await AsyncStorage.getAllKeys();
    expect(keys).toContain('keyMigrated:user1');
    expect(keys.filter((k) => k.includes('.virgil-group-storage'))).toHaveLength(0);
  });

  it('Keychainの削除が失敗してもグループチケットの削除は実行され例外も漏れない', async () => {
    mockResetGenericPassword.mockRejectedValueOnce(new Error('keychain error'));
    await AsyncStorage.setItem('!.virgil-group-storage!ticket1', 'data1');
    await expect(purgeLocalKeys()).resolves.toBeUndefined();
    const keys = await AsyncStorage.getAllKeys();
    expect(keys.filter((k) => k.includes('.virgil-group-storage'))).toHaveLength(0);
  });

  it('グループチケットが無い場合はmultiRemoveを呼ばない', async () => {
    const multiRemoveSpy = jest.spyOn(AsyncStorage, 'multiRemove');
    await AsyncStorage.setItem('keyMigrated:user1', 'true');
    await purgeLocalKeys();
    expect(multiRemoveSpy).not.toHaveBeenCalled();
    multiRemoveSpy.mockRestore();
  });
});
