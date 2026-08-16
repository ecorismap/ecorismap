import { Buffer } from 'buffer';

/**
 * kdf.ts の Web 版。WebCrypto（SubtleCrypto）の PBKDF2 を使う。
 * 出力は native 版（純JS pbkdf2）と完全一致する（ユニットテストで検証）。
 * 役割と反復回数の設計判断は kdf.ts のコメントを参照。
 */

export const KDF_NAME = 'pbkdf2-sha256';
export const DEFAULT_KDF_ITERATIONS = 10000;
const KDF_OUTPUT_BITS = 256;

export const deriveKB64 = async (pin: string, saltB64: string, iterations: number): Promise<string> => {
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: new Uint8Array(Buffer.from(saltB64, 'base64')), iterations, hash: 'SHA-256' },
    keyMaterial,
    KDF_OUTPUT_BITS
  );
  return Buffer.from(bits).toString('base64');
};

/** バックアップ作成時のsalt（16バイト）を生成する。 */
export const generateSaltB64 = (): string => {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return Buffer.from(salt).toString('base64');
};
