/***
 * ブラウザで一時的なkeypairでファイルを暗号化するために以下を参考に修正
 * https://github.com/VirgilSecurity/virgil-e3kit-js/blob/22e867b5efe3057274640e817da09572f275023c/packages/e3kit-browser/src/EThree.ts
 */
import { VirgilCrypto, initCrypto } from 'virgil-crypto';
import { Buffer } from 'buffer';
import { processFile, onChunkCallback } from './processFile';

// virgil-cryptoの初期化状態を管理
let isVirgilCryptoInitialized = false;

// virgil-cryptoを初期化する関数
async function ensureVirgilCryptoInitialized() {
  if (!isVirgilCryptoInitialized) {
    try {
      await initCrypto();
      isVirgilCryptoInitialized = true;
      console.log('VirgilCrypto initialized successfully');
    } catch (error) {
      console.error('Failed to initialize VirgilCrypto:', error);
      // 既に初期化されている場合のエラーは無視
      if (error && typeof error === 'object' && 'message' in error) {
        const message = (error as any).message;
        if (message?.includes('already initialized') || message?.includes('global instances')) {
          isVirgilCryptoInitialized = true;
        } else {
          throw error;
        }
      }
    }
  }
}

export type NodeBuffer = import('@virgilsecurity/e3kit-base').NodeBuffer;
export type Data = import('@virgilsecurity/e3kit-base').Data;
const toData = (value: ArrayBuffer | string): Data => {
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  return value;
};

export const encryptSharedFile = async (file: File | Blob) => {
  //if (!FUNC_ENCRYPTION) return { encryptedSharedFile: file, fileKey: '' };
  const chunkSize = 64 * 1024;
  
  // virgil-cryptoを初期化
  await ensureVirgilCryptoInitialized();
  
  const virgilCrypto = new VirgilCrypto();
  const keypair = virgilCrypto.generateKeys();
  const streamCipher = virgilCrypto.createStreamCipher(keypair.publicKey);

  const encryptedChunksPromise = new Promise<NodeBuffer[]>((resolve, reject) => {
    const encryptedChunks: NodeBuffer[] = [];
    encryptedChunks.push(streamCipher.start());

    const onChunkCallback: onChunkCallback = (chunk) => {
      encryptedChunks.push(streamCipher.update(toData(chunk)));
    };

    const onFinishCallback = () => {
      encryptedChunks.push(streamCipher.final());
      resolve(encryptedChunks);
    };

    const onErrorCallback = (err: Error) => {
      reject(err);
      streamCipher.dispose();
    };

    processFile({
      file,
      chunkSize,
      onChunkCallback,
      onFinishCallback,
      onErrorCallback,
    });
  });

  const encryptedChunks = await encryptedChunksPromise;
  const encryptedSharedFile = new Blob(encryptedChunks, { type: file.type });

  return {
    encryptedSharedFile,
    fileKey: Buffer.from(virgilCrypto.exportPrivateKey(keypair.privateKey)).toString('base64'),
  };
};

export const decryptSharedFile = async (file: File | Blob, fileKey: string) => {
  //if (!FUNC_ENCRYPTION) return file;
  
  // virgil-cryptoを初期化
  await ensureVirgilCryptoInitialized();
  
  const virgilCrypto = new VirgilCrypto();
  const chunkSize = 64 * 1024;

  const privateKey = virgilCrypto.importPrivateKey(fileKey);
  const streamDecipher = virgilCrypto.createStreamDecipher(privateKey);

  const decryptedChunksPromise = new Promise<NodeBuffer[]>((resolve, reject) => {
    const decryptedChunks: NodeBuffer[] = [];

    const onChunkCallback: onChunkCallback = (chunk) => {
      decryptedChunks.push(streamDecipher.update(toData(chunk)));
    };

    const onFinishCallback = () => {
      decryptedChunks.push(streamDecipher.final());
      streamDecipher.dispose();
      resolve(decryptedChunks);
    };

    const onErrorCallback = (err: Error) => {
      streamDecipher.dispose();
      reject(err);
    };

    processFile({
      file,
      chunkSize,
      onChunkCallback,
      onFinishCallback,
      onErrorCallback,
    });
  });

  const decryptedFile = await decryptedChunksPromise;

  return new Blob(decryptedFile, { type: file.type });
};
