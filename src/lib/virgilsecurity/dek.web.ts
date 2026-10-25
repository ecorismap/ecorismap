import { VirgilCrypto, initCrypto } from 'virgil-crypto';
import { Buffer } from 'buffer';
import { splitStringsIntoChunksOfLen } from '../../utils/General';

/**
 * dek.ts の Web 版。virgil-crypto（wasm）を使う。
 * wasm 初期化が非同期のため、各関数は初期化を待ってから実行する。
 * API・形状は native 版（dek.ts）と同一。
 */

const CHUNK_LEN = 20000;

export type ExportedDEK = {
  publicKey: string;
  privateKey: string;
};

let cryptoInstance: VirgilCrypto | undefined;
const getCrypto = async (): Promise<VirgilCrypto> => {
  if (!cryptoInstance) {
    await initCrypto();
    cryptoInstance = new VirgilCrypto();
  }
  return cryptoInstance;
};

export const createProjectDEK = async (): Promise<ExportedDEK> => {
  const vc = await getCrypto();
  const keyPair = vc.generateKeys();
  return {
    publicKey: vc.exportPublicKey(keyPair.publicKey).toString('base64'),
    privateKey: vc.exportPrivateKey(keyPair.privateKey).toString('base64'),
  };
};

/**
 * DEK秘密鍵が、プロジェクトに平文で公開されているDEK公開鍵と対になっているか。
 * keys/{uid} はメンバーも書けるため、開封できた（＝署名検証が通った）だけでは中身が本物のDEKとは限らない。
 */
export const isDEKKeyPair = async (dekPrivateKeyB64: string, dekPublicKeyB64: string): Promise<boolean> => {
  try {
    const vc = await getCrypto();
    const privateKey = vc.importPrivateKey(Buffer.from(dekPrivateKeyB64, 'base64'));
    const derived = vc.exportPublicKey(vc.extractPublicKey(privateKey));
    // 公開鍵側もデコード→再エンコードして表記揺れ（改行・パディング差）を吸収してから比べる
    return derived.toString('base64') === Buffer.from(dekPublicKeyB64, 'base64').toString('base64');
  } catch {
    return false;
  }
};

export const encryptWithDEK = async (data: unknown, dekPublicKeyB64: string): Promise<string[]> => {
  const vc = await getCrypto();
  const publicKey = vc.importPublicKey(Buffer.from(dekPublicKeyB64, 'base64'));
  const dataString = JSON.stringify(data);
  const chunks = splitStringsIntoChunksOfLen(dataString, CHUNK_LEN);
  return chunks.map((chunk) => vc.encrypt(chunk, publicKey).toString('base64'));
};

export const decryptWithDEK = async <T = unknown>(encdata: string[], dekPrivateKeyB64: string): Promise<T> => {
  const vc = await getCrypto();
  const privateKey = vc.importPrivateKey(Buffer.from(dekPrivateKeyB64, 'base64'));
  const parts = encdata.map((chunk) =>
    vc.decrypt(Buffer.from(chunk, 'base64'), privateKey).toString('utf8')
  );
  return JSON.parse(parts.join('')) as T;
};
