/**
 * src/lib/crypto/identity.web.ts の実体テスト。
 * （native版 identity.ts は同一の呼び出し列で react-native-virgil-crypto を使うため、
 *  呼び出し列の互換性は identityCrypto.compat.test.ts、実機動作はP1の手動確認で担保する）
 */
import {
  generateIdentityKeyPair,
  extractPublicKeyB64,
  authEncryptWithKeys,
  authDecryptWithKeys,
} from '../../crypto/identity.web';
 
const nodeUtil = require('util');

beforeAll(() => {
  // jest-expo の TextDecoder は utf-16le 非対応のため Node 標準実装へ差し替え（wasm初期化用）
  (global as any).TextDecoder = nodeUtil.TextDecoder;
  (global as any).TextEncoder = nodeUtil.TextEncoder;
});

describe('identity.web', () => {
  test('生成した鍵ペアの公開鍵は秘密鍵から導出したものと一致する', async () => {
    const keyPair = await generateIdentityKeyPair();
    expect(await extractPublicKeyB64(keyPair.privateKey)).toBe(keyPair.publicKey);
  });

  test('ラップ→アンラップのラウンドトリップ', async () => {
    const admin = await generateIdentityKeyPair();
    const member = await generateIdentityKeyPair();
    const dek = (await generateIdentityKeyPair()).privateKey;

    const wrapped = await authEncryptWithKeys(dek, admin.privateKey, member.publicKey);
    const unwrapped = await authDecryptWithKeys(wrapped, member.privateKey, [admin.publicKey]);
    expect(unwrapped).toBe(dek);
  });

  test('ラッパー以外の鍵では署名検証に失敗する', async () => {
    const admin = await generateIdentityKeyPair();
    const member = await generateIdentityKeyPair();
    const other = await generateIdentityKeyPair();

    const wrapped = await authEncryptWithKeys('secret', admin.privateKey, member.publicKey);
    await expect(authDecryptWithKeys(wrapped, member.privateKey, [other.publicKey])).rejects.toThrow();
  });

  test('複数公開鍵（現行+旧世代）での検証フォールバック', async () => {
    const oldKey = await generateIdentityKeyPair();
    const newKey = await generateIdentityKeyPair();
    const member = await generateIdentityKeyPair();

    const wrappedByOld = await authEncryptWithKeys('secret', oldKey.privateKey, member.publicKey);
    const unwrapped = await authDecryptWithKeys(wrappedByOld, member.privateKey, [
      newKey.publicKey,
      oldKey.publicKey,
    ]);
    expect(unwrapped).toBe('secret');
  });
});
