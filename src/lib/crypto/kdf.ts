import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { Buffer } from 'buffer';

/**
 * PINから k（サーバーへ送るKDF出力）を導出する（native版）。
 *
 * 実装は @noble/hashes（依存ゼロ・監査済み・純JS）。
 * ※Node系の 'pbkdf2' パッケージは依存の readable-stream が process.version を参照して
 *   RN/Hermes で起動時クラッシュするため使えない。
 *
 * 総当たり防御の主柱はサーバー側のKMS（エクスポート不能鍵によるKEK導出）とレート制限であり、
 * クライアントKDFは「PINを平文のままサーバーへ送らない」ための衛生策。
 * このため反復回数はモバイルの純JS性能を考慮した控えめな値にしている。
 *
 * 出力はWeb版（kdf.web.ts / WebCrypto）と完全一致する必要がある（Webで作成した
 * バックアップをモバイルで復元するため）。一致はユニットテストで検証している。
 */

export const KDF_NAME = 'pbkdf2-sha256';
export const DEFAULT_KDF_ITERATIONS = 10000;
const KDF_OUTPUT_BYTES = 32;

export const deriveKB64 = async (pin: string, saltB64: string, iterations: number): Promise<string> => {
  const derived = await pbkdf2Async(sha256, pin, new Uint8Array(Buffer.from(saltB64, 'base64')), {
    c: iterations,
    dkLen: KDF_OUTPUT_BYTES,
  });
  return Buffer.from(derived).toString('base64');
};

/** バックアップ作成時のsalt（16バイト）を生成する。 */
export const generateSaltB64 = (): string => {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return Buffer.from(salt).toString('base64');
};
