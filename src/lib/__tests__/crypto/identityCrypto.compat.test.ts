/**
 * 脱Virgil互換性検証: e3kit の authEncrypt/authDecrypt を virgil-crypto の
 * signAndEncrypt/decryptAndVerify で自前実装しても既存データと互換であることの恒久テスト。
 *
 * 根拠（e3kit-base 2.5.1 のソース確認済み）:
 * - authEncrypt(data, card) = virgilCrypto.signAndEncrypt(data, 自分の秘密鍵, [相手公開鍵, 自分公開鍵], enablePadding=true)
 *   （AbstractEThree.authEncrypt → getPublicKeysForEncryption が自分の公開鍵を末尾に追加する）
 * - authDecrypt(data, card, encryptedAt) = virgilCrypto.decryptAndVerify(data, 自分の秘密鍵, 送信者公開鍵)
 *   （getPublicKeyForVerification は encryptedAt でカードチェーンから当時の鍵を選ぶ）
 *
 * native(react-native-virgil-crypto)⇔web(virgil-crypto wasm)のエンベロープ互換は、
 * 本番の keys/{uid}（web作成→モバイル開封）で実証済みのため、ここでは wasm 単体で
 * 呼び出し列の正しさとローテーションフォールバックの挙動を固定する。
 */
import { initCrypto, VirgilCrypto } from 'virgil-crypto';
import { Buffer } from 'buffer';
 
const nodeUtil = require('util');

let vc: VirgilCrypto;

beforeAll(async () => {
  // jest-expo が注入する expo/winter の TextDecoder は utf-16le 非対応で
  // virgil-crypto(wasm) の初期化に失敗するため、Node 標準実装へ差し替える
  (global as any).TextDecoder = nodeUtil.TextDecoder;
  (global as any).TextEncoder = nodeUtil.TextEncoder;
  await initCrypto();
  vc = new VirgilCrypto();
});

/** eThree.authEncrypt と同一の呼び出し列 */
const authEncryptEquivalent = (data: string, myPrivB64: string, recipientPubB64: string): string => {
  const myPriv = vc.importPrivateKey(Buffer.from(myPrivB64, 'base64'));
  const myPub = vc.extractPublicKey(myPriv);
  const recipientPub = vc.importPublicKey(Buffer.from(recipientPubB64, 'base64'));
  // getPublicKeysForEncryption: [相手, 自分] の順で自分の公開鍵を追加する
  return vc.signAndEncrypt(data, myPriv, [recipientPub, myPub], true).toString('base64');
};

/** eThree.authDecrypt と同一の呼び出し列 */
const authDecryptEquivalent = (encB64: string, myPrivB64: string, senderPubB64s: string[]): string => {
  const myPriv = vc.importPrivateKey(Buffer.from(myPrivB64, 'base64'));
  const senderPubs = senderPubB64s.map((b64) => vc.importPublicKey(Buffer.from(b64, 'base64')));
  return vc.decryptAndVerify(Buffer.from(encB64, 'base64'), myPriv, senderPubs).toString('utf8');
};

const generateExportedKeyPair = () => {
  const keyPair = vc.generateKeys();
  return {
    publicKey: vc.exportPublicKey(keyPair.publicKey).toString('base64'),
    privateKey: vc.exportPrivateKey(keyPair.privateKey).toString('base64'),
  };
};

describe('authEncrypt/authDecrypt 互換実装', () => {
  test('ラップ→開封のラウンドトリップ（管理者→メンバー）', () => {
    const admin = generateExportedKeyPair();
    const member = generateExportedKeyPair();
    const dekPrivateKeyB64 = generateExportedKeyPair().privateKey; // ラップ対象のDEK秘密鍵

    const wrapped = authEncryptEquivalent(dekPrivateKeyB64, admin.privateKey, member.publicKey);
    const unwrapped = authDecryptEquivalent(wrapped, member.privateKey, [admin.publicKey]);

    expect(unwrapped).toBe(dekPrivateKeyB64);
  });

  test('自分宛てラップ（オーナーが自分にDEKを配る）も開封できる', () => {
    const owner = generateExportedKeyPair();
    const dek = 'dek-private-key-payload';
    const wrapped = authEncryptEquivalent(dek, owner.privateKey, owner.publicKey);
    expect(authDecryptEquivalent(wrapped, owner.privateKey, [owner.publicKey])).toBe(dek);
  });

  test('署名検証: ラッパー以外の公開鍵では開封に失敗する（なりすまし防止）', () => {
    const admin = generateExportedKeyPair();
    const member = generateExportedKeyPair();
    const attacker = generateExportedKeyPair();

    const wrapped = authEncryptEquivalent('secret', admin.privateKey, member.publicKey);
    expect(() => authDecryptEquivalent(wrapped, member.privateKey, [attacker.publicKey])).toThrow();
  });

  test('ローテーションフォールバック: [現行鍵, 旧鍵] のリスト検証で旧鍵署名のラップも開封できる', () => {
    // e3kit は encryptedAt でカードチェーンから当時の鍵を選ぶ。
    // 台帳方式では [現行, ...history] を渡すことで同等の互換を保つ。
    const adminOld = generateExportedKeyPair(); // ローテーション前の鍵
    const adminNew = generateExportedKeyPair(); // ローテーション後の鍵
    const member = generateExportedKeyPair();

    const wrappedByOldKey = authEncryptEquivalent('secret', adminOld.privateKey, member.publicKey);
    const unwrapped = authDecryptEquivalent(wrappedByOldKey, member.privateKey, [
      adminNew.publicKey,
      adminOld.publicKey,
    ]);
    expect(unwrapped).toBe('secret');
  });

  test('チャンクなし平文でもバイナリセーフ（base64 DEK鍵素材）', () => {
    const a = generateExportedKeyPair();
    const b = generateExportedKeyPair();
    // 実際のDEK秘密鍵はDERのbase64文字列なのでその形で確認
    const payload = generateExportedKeyPair().privateKey;
    const wrapped = authEncryptEquivalent(payload, a.privateKey, b.publicKey);
    expect(authDecryptEquivalent(wrapped, b.privateKey, [a.publicKey])).toBe(payload);
  });
});

describe('generateKeysFromKeyMaterial の決定性（PINバックアップのKEK導出で使用）', () => {
  test('同一シードから同一の鍵ペアが再現される', () => {
    const seed = Buffer.alloc(32, 7); // 32バイトの固定シード
    const kp1 = vc.generateKeysFromKeyMaterial(seed);
    const kp2 = vc.generateKeysFromKeyMaterial(seed);
    expect(vc.exportPrivateKey(kp1.privateKey).toString('base64')).toBe(
      vc.exportPrivateKey(kp2.privateKey).toString('base64')
    );
    expect(vc.exportPublicKey(kp1.publicKey).toString('base64')).toBe(
      vc.exportPublicKey(kp2.publicKey).toString('base64')
    );
  });

  test('異なるシードからは異なる鍵ペア', () => {
    const kpA = vc.generateKeysFromKeyMaterial(Buffer.alloc(32, 1));
    const kpB = vc.generateKeysFromKeyMaterial(Buffer.alloc(32, 2));
    expect(vc.exportPublicKey(kpA.publicKey).toString('base64')).not.toBe(
      vc.exportPublicKey(kpB.publicKey).toString('base64')
    );
  });
});
