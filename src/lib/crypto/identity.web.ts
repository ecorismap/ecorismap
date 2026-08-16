import { VirgilCrypto, initCrypto } from 'virgil-crypto';
import { Buffer } from 'buffer';

/**
 * identity.ts の Web 版。virgil-crypto（wasm）を使う。
 * API・形状・互換性の根拠は native 版（identity.ts）のコメントを参照。
 */

export type ExportedIdentityKeyPair = {
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

export const generateIdentityKeyPair = async (): Promise<ExportedIdentityKeyPair> => {
  const vc = await getCrypto();
  const keyPair = vc.generateKeys();
  return {
    publicKey: vc.exportPublicKey(keyPair.publicKey).toString('base64'),
    privateKey: vc.exportPrivateKey(keyPair.privateKey).toString('base64'),
  };
};

export const extractPublicKeyB64 = async (privateKeyB64: string): Promise<string> => {
  const vc = await getCrypto();
  const privateKey = vc.importPrivateKey(Buffer.from(privateKeyB64, 'base64'));
  const publicKey = vc.extractPublicKey(privateKey);
  return vc.exportPublicKey(publicKey).toString('base64');
};

export const authEncryptWithKeys = async (
  payload: string,
  myPrivateKeyB64: string,
  recipientPublicKeyB64: string
): Promise<string> => {
  const vc = await getCrypto();
  const myPrivateKey = vc.importPrivateKey(Buffer.from(myPrivateKeyB64, 'base64'));
  const myPublicKey = vc.extractPublicKey(myPrivateKey);
  const recipientPublicKey = vc.importPublicKey(Buffer.from(recipientPublicKeyB64, 'base64'));
  return vc.signAndEncrypt(payload, myPrivateKey, [recipientPublicKey, myPublicKey], true).toString('base64');
};

export const authDecryptWithKeys = async (
  wrapped: string,
  myPrivateKeyB64: string,
  wrapperPublicKeyB64s: string[]
): Promise<string> => {
  const vc = await getCrypto();
  const myPrivateKey = vc.importPrivateKey(Buffer.from(myPrivateKeyB64, 'base64'));
  const wrapperPublicKeys = wrapperPublicKeyB64s.map((b64) => vc.importPublicKey(Buffer.from(b64, 'base64')));
  return vc.decryptAndVerify(Buffer.from(wrapped, 'base64'), myPrivateKey, wrapperPublicKeys).toString('utf8');
};
