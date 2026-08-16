/**
 * KDF（PIN→k導出）のテスト。
 * 最重要は native（純JS pbkdf2）と web（WebCrypto）の出力一致:
 * Webで作成したPINバックアップをモバイルで復元する（またはその逆）ために必須。
 */
import { deriveKB64 as deriveNative, DEFAULT_KDF_ITERATIONS } from '../../crypto/kdf';
import { deriveKB64 as deriveWeb, generateSaltB64 } from '../../crypto/kdf.web';
import { Buffer } from 'buffer';
 
const nodeCrypto = require('crypto');

beforeAll(() => {
  // jest環境にはWebCryptoが無いためNodeの実装を注入（kdf.web.ts用）
  if (!(global as any).crypto?.subtle) {
    Object.defineProperty(global, 'crypto', { value: nodeCrypto.webcrypto, configurable: true });
  }
});

describe('kdf', () => {
  test('native(純JS pbkdf2)とweb(WebCrypto)の出力が一致する', async () => {
    const salt = generateSaltB64();
    const nativeK = await deriveNative('123456', salt, DEFAULT_KDF_ITERATIONS);
    const webK = await deriveWeb('123456', salt, DEFAULT_KDF_ITERATIONS);
    expect(nativeK).toBe(webK);
  });

  test('RFCテストベクタ相当: Node標準pbkdf2Syncとも一致する', async () => {
    const salt = Buffer.from('fixed-salt-16byte').toString('base64');
    const expected = nodeCrypto.pbkdf2Sync('123456', Buffer.from(salt, 'base64'), 10000, 32, 'sha256');
    expect(await deriveNative('123456', salt, 10000)).toBe(expected.toString('base64'));
    expect(await deriveWeb('123456', salt, 10000)).toBe(expected.toString('base64'));
  });

  test('出力は32バイト・PINやsaltが違えば変わる', async () => {
    const salt = generateSaltB64();
    const k1 = await deriveNative('123456', salt, DEFAULT_KDF_ITERATIONS);
    expect(Buffer.from(k1, 'base64').length).toBe(32);
    expect(await deriveNative('654321', salt, DEFAULT_KDF_ITERATIONS)).not.toBe(k1);
    expect(await deriveNative('123456', generateSaltB64(), DEFAULT_KDF_ITERATIONS)).not.toBe(k1);
  });

  test('generateSaltB64は16バイトで毎回異なる', () => {
    const a = generateSaltB64();
    const b = generateSaltB64();
    expect(Buffer.from(a, 'base64').length).toBe(16);
    expect(a).not.toBe(b);
  });
});

describe('blob暗号化（KEK→鍵素材）', () => {
   
  const nodeUtil = require('util');

  test('encryptWithKeyMaterial→decryptWithKeyMaterialのラウンドトリップ（同一KEKで復号可）', async () => {
    (global as any).TextDecoder = nodeUtil.TextDecoder;
    (global as any).TextEncoder = nodeUtil.TextEncoder;
     
    const identity = require('../../crypto/identity.web');

    const kek = nodeCrypto.randomBytes(32).toString('base64');
    const privateKey = (await identity.generateIdentityKeyPair()).privateKey;

    const encrypted = await identity.encryptWithKeyMaterial(privateKey, kek);
    expect(await identity.decryptWithKeyMaterial(encrypted, kek)).toBe(privateKey);

    // 異なるKEKでは復号できない
    const wrongKek = nodeCrypto.randomBytes(32).toString('base64');
    await expect(identity.decryptWithKeyMaterial(encrypted, wrongKek)).rejects.toThrow();
  });
});
