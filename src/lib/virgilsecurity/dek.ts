import { virgilCrypto } from 'react-native-virgil-crypto';
import { Buffer } from 'buffer';
import { splitStringsIntoChunksOfLen } from '../../utils/General';

/**
 * DEK（Data Encryption Key）= プロジェクト毎のデータ暗号鍵ペア。
 *
 * 設計（Option A: エンベロープ暗号）:
 * - プロジェクトのデータは DEK の「公開鍵」で暗号化する（誰でも書ける）。
 * - DEK の「秘密鍵」を各メンバーの公開鍵でラップして `projects/{id}/keys/{uid}` に保存する
 *   （ラップ/アンラップは eThree.authEncrypt/authDecrypt を使うため e3kit.ts 側に置く）。
 * - メンバーは自分宛てのラップ済み秘密鍵を開封し、その秘密鍵でデータを復号する。
 *
 * この方式により「グループのオーナーだけが参加者を追加できる」という Virgil グループの制約を外し、
 * 任意の管理者が新メンバーの公開鍵で DEK 秘密鍵をラップするだけでメンバー追加できる。
 *
 * 本モジュールは eThree に依存しない純粋な暗号関数のみを置く（DEK 自体の生成とデータの暗復号）。
 * Web 版（dek.web.ts）は wasm 初期化があるため async。シグネチャを揃えるため native も async にする。
 */

// e3kit のグループ暗号は1チャンク30000バイト制限があったが、virgilCrypto には無い。
// 既存の encdata: string[] 形状を保ちつつ、安全のため文字列を分割して暗号化する。
const CHUNK_LEN = 20000;

export type ExportedDEK = {
  /** base64 でエクスポートした DEK 公開鍵（平文保存可。データ暗号化に使う） */
  publicKey: string;
  /** base64 でエクスポートした DEK 秘密鍵（メンバー公開鍵でラップして保存する） */
  privateKey: string;
};

/** プロジェクト用の DEK 鍵ペアを新規生成して base64 でエクスポートする。 */
export const createProjectDEK = async (): Promise<ExportedDEK> => {
  const keyPair = virgilCrypto.generateKeys();
  return {
    publicKey: virgilCrypto.exportPublicKey(keyPair.publicKey).toString('base64'),
    privateKey: virgilCrypto.exportPrivateKey(keyPair.privateKey).toString('base64'),
  };
};

/**
 * 任意の JSON シリアライズ可能なデータを DEK 公開鍵で暗号化する。
 * 戻り値は base64 文字列の配列（既存 encdata: string[] と同形状）。
 */
export const encryptWithDEK = async (data: unknown, dekPublicKeyB64: string): Promise<string[]> => {
  const publicKey = virgilCrypto.importPublicKey(Buffer.from(dekPublicKeyB64, 'base64'));
  const dataString = JSON.stringify(data);
  const chunks = splitStringsIntoChunksOfLen(dataString, CHUNK_LEN);
  return chunks.map((chunk) => virgilCrypto.encrypt(chunk, publicKey).toString('base64'));
};

/**
 * encryptWithDEK で暗号化されたデータを DEK 秘密鍵で復号して元のオブジェクトに戻す。
 * dekPrivateKeyB64 はメンバーが自分宛てのラップ済み秘密鍵を開封して得たもの。
 */
export const decryptWithDEK = async <T = unknown>(encdata: string[], dekPrivateKeyB64: string): Promise<T> => {
  const privateKey = virgilCrypto.importPrivateKey(Buffer.from(dekPrivateKeyB64, 'base64'));
  const parts = encdata.map((chunk) =>
    virgilCrypto.decrypt(Buffer.from(chunk, 'base64'), privateKey).toString('utf8')
  );
  return JSON.parse(parts.join('')) as T;
};
