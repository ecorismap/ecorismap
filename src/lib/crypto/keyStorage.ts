import * as Keychain from 'react-native-keychain';

/**
 * 識別秘密鍵のローカル保管（native版）。react-native-keychain（OSのキーチェーン/Keystore）を使う。
 * e3kit の keyEntryStorage の後継。値は base64 エクスポート済み秘密鍵で、
 * e3kit が保存している形式（exportPrivateKey().toString('base64')）と同一。
 *
 * サービス名を uid ごとに分けることで、同一端末での複数アカウント利用に対応する。
 */

const serviceFor = (uid: string) => `ecorismap.identity.${uid}`;

export const saveIdentityPrivateKey = async (uid: string, privateKeyB64: string): Promise<void> => {
  await Keychain.setGenericPassword(uid, privateKeyB64, { service: serviceFor(uid) });
};

export const loadIdentityPrivateKey = async (uid: string): Promise<string | undefined> => {
  try {
    const credentials = await Keychain.getGenericPassword({ service: serviceFor(uid) });
    if (credentials === false) return undefined;
    return credentials.password;
  } catch (e) {
    console.log('[loadIdentityPrivateKey] error', e);
    return undefined;
  }
};

export const deleteIdentityPrivateKey = async (uid: string): Promise<void> => {
  await Keychain.resetGenericPassword({ service: serviceFor(uid) });
};
