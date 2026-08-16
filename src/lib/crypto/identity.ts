import { virgilCrypto } from 'react-native-virgil-crypto';
import { Buffer } from 'buffer';

/**
 * 識別鍵（ユーザーごとの鍵ペア）による DEK のラップ/アンラップ（脱Virgil後継実装）。
 *
 * e3kit の authEncrypt/authDecrypt と完全互換の呼び出し列:
 * - authEncrypt = signAndEncrypt(data, 自分の秘密鍵, [相手の公開鍵, 自分の公開鍵], enablePadding=true)
 * - authDecrypt = decryptAndVerify(data, 自分の秘密鍵, 送信者の公開鍵)
 * したがって既存の projects/{id}/keys/{uid}（eThree.authEncrypt で作成）はそのまま開封でき、
 * 本実装で作成したラップは旧バージョンのアプリ（e3kit）でも開封できる。
 * 互換性の根拠と検証は src/lib/__tests__/crypto/identityCrypto.compat.test.ts を参照。
 *
 * 本モジュールは eThree（Virgilサービス）に依存しない純粋な暗号関数のみを置く。
 * Web 版（identity.web.ts）は wasm 初期化があるため async。シグネチャを揃えるため native も async にする。
 */

export type ExportedIdentityKeyPair = {
  /** base64 でエクスポートした公開鍵（publicKeys/{uid} 台帳に置く） */
  publicKey: string;
  /** base64 でエクスポートした秘密鍵（ローカル保管＋PINバックアップ対象） */
  privateKey: string;
};

/** 識別鍵ペアを新規生成して base64 でエクスポートする（新規ユーザー登録・鍵リセット用）。 */
export const generateIdentityKeyPair = async (): Promise<ExportedIdentityKeyPair> => {
  const keyPair = virgilCrypto.generateKeys();
  return {
    publicKey: virgilCrypto.exportPublicKey(keyPair.publicKey).toString('base64'),
    privateKey: virgilCrypto.exportPrivateKey(keyPair.privateKey).toString('base64'),
  };
};

/** 秘密鍵から公開鍵を導出する（台帳publish時の整合確認用）。 */
export const extractPublicKeyB64 = async (privateKeyB64: string): Promise<string> => {
  const privateKey = virgilCrypto.importPrivateKey(Buffer.from(privateKeyB64, 'base64'));
  const publicKey = virgilCrypto.extractPublicKey(privateKey);
  return virgilCrypto.exportPublicKey(publicKey).toString('base64');
};

/**
 * KEK等の鍵素材から決定的に導出した鍵でペイロードを暗号化する（PINバックアップのblob用）。
 * generateKeysFromKeyMaterial は同一シードから常に同一の鍵ペアを生成するため、
 * 同じKEKを再導出できれば復号できる。
 */
export const encryptWithKeyMaterial = async (payload: string, keyMaterialB64: string): Promise<string> => {
  const keyPair = virgilCrypto.generateKeysFromKeyMaterial(Buffer.from(keyMaterialB64, 'base64'));
  return virgilCrypto.encrypt(payload, keyPair.publicKey).toString('base64');
};

/** encryptWithKeyMaterial で暗号化したペイロードを復号する。 */
export const decryptWithKeyMaterial = async (encB64: string, keyMaterialB64: string): Promise<string> => {
  const keyPair = virgilCrypto.generateKeysFromKeyMaterial(Buffer.from(keyMaterialB64, 'base64'));
  return virgilCrypto.decrypt(Buffer.from(encB64, 'base64'), keyPair.privateKey).toString('utf8');
};

/**
 * eThree.authEncrypt と互換のラップ。DEK秘密鍵等を相手の公開鍵でラップし、自分の秘密鍵で署名する。
 * @returns base64 のラップ済み文字列（ProjectKeyFS.encDek と同形式）
 */
export const authEncryptWithKeys = async (
  payload: string,
  myPrivateKeyB64: string,
  recipientPublicKeyB64: string
): Promise<string> => {
  const myPrivateKey = virgilCrypto.importPrivateKey(Buffer.from(myPrivateKeyB64, 'base64'));
  const myPublicKey = virgilCrypto.extractPublicKey(myPrivateKey);
  const recipientPublicKey = virgilCrypto.importPublicKey(Buffer.from(recipientPublicKeyB64, 'base64'));
  // e3kit の getPublicKeysForEncryption は [相手, 自分] の順で自分の公開鍵を末尾に追加する
  return virgilCrypto
    .signAndEncrypt(payload, myPrivateKey, [recipientPublicKey, myPublicKey], true)
    .toString('base64');
};

/**
 * eThree.authDecrypt と互換のアンラップ。自分宛てのラップを開封し、ラッパーの署名を検証する。
 * @param wrapperPublicKeyB64s ラッパーの公開鍵（複数可）。鍵ローテーション対応のため
 *   [現行鍵, ...旧世代] を渡すと、いずれかの鍵の署名で検証が通れば開封できる
 *   （e3kit がカードチェーンで当時の鍵を選ぶのと同等の互換動作）。
 * @throws 復号失敗・署名不一致時（呼び出し側で catch して undefined 化する）
 */
export const authDecryptWithKeys = async (
  wrapped: string,
  myPrivateKeyB64: string,
  wrapperPublicKeyB64s: string[]
): Promise<string> => {
  const myPrivateKey = virgilCrypto.importPrivateKey(Buffer.from(myPrivateKeyB64, 'base64'));
  const wrapperPublicKeys = wrapperPublicKeyB64s.map((b64) =>
    virgilCrypto.importPublicKey(Buffer.from(b64, 'base64'))
  );
  return virgilCrypto
    .decryptAndVerify(Buffer.from(wrapped, 'base64'), myPrivateKey, wrapperPublicKeys)
    .toString('utf8');
};
