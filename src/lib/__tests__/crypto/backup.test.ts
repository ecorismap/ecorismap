import { createKeyBackup, restoreKeyBackup } from '../../crypto/backup';
import { httpsCallable } from '../../firebase/firebase';

jest.mock('../../firebase/firebase', () => ({
  functions: {},
  httpsCallable: jest.fn(),
  firebaseReady: Promise.resolve(),
}));
jest.mock('../../crypto/kdf', () => ({
  deriveKB64: jest.fn().mockResolvedValue('K_B64'),
  generateSaltB64: jest.fn().mockReturnValue('SALT_B64'),
  DEFAULT_KDF_ITERATIONS: 1000,
}));
jest.mock('../../crypto/identity', () => ({
  encryptWithKeyMaterial: jest.fn().mockResolvedValue('ENC'),
  decryptWithKeyMaterial: jest.fn().mockResolvedValue('PRIV'),
}));

const mockHttpsCallable = httpsCallable as unknown as jest.Mock;

// callable名ごとの振る舞いを差し替える
const setCallables = (handlers: Record<string, () => Promise<unknown>>) => {
  mockHttpsCallable.mockImplementation((_functions: unknown, name: string) => handlers[name]);
};
const httpsError = (code: string, message: string) => Object.assign(new Error(message), { code });

beforeEach(() => {
  jest.clearAllMocks();
});

describe('createKeyBackup のエラー識別', () => {
  it('世代不一致（failed-precondition key-version-mismatch）はロックと区別する', async () => {
    setCallables({
      beginKeyBackup: () => Promise.resolve({ data: { kek: 'KEK' } }),
      commitKeyBackup: () => Promise.reject(httpsError('functions/failed-precondition', 'key-version-mismatch')),
    });
    const result = await createKeyBackup('123789', 'PRIV', 2);
    expect(result).toEqual({ isOK: false, message: 'backup-key-version-mismatch' });
  });

  it('permission-denied はメール未検証として誤PINと区別する', async () => {
    setCallables({
      beginKeyBackup: () =>
        Promise.reject(httpsError('functions/permission-denied', 'The function must be called by a verified user.')),
    });
    const result = await createKeyBackup('123789', 'PRIV', 1);
    expect(result).toEqual({ isOK: false, message: 'backup-email-not-verified' });
  });

  it('その他の失敗は従来どおり正規化する', async () => {
    setCallables({
      beginKeyBackup: () => Promise.reject(httpsError('functions/resource-exhausted', 'too-many-requests')),
    });
    const result = await createKeyBackup('123789', 'PRIV', 1);
    expect(result).toEqual({ isOK: false, message: 'backup-too-many-requests' });
  });

  it('成功時は isOK', async () => {
    setCallables({
      beginKeyBackup: () => Promise.resolve({ data: { kek: 'KEK' } }),
      commitKeyBackup: () => Promise.resolve({ data: { isOK: true } }),
    });
    const result = await createKeyBackup('123789', 'PRIV', 1);
    expect(result).toEqual({ isOK: true, message: '' });
  });
});

describe('restoreKeyBackup のエラー識別（従来どおり）', () => {
  it('復元側の permission-denied は誤PIN', async () => {
    setCallables({
      getKeyBackupStatus: () =>
        Promise.resolve({ data: { exists: true, salt: 'S', kdfParams: { iterations: 1000 }, lockedUntil: null } }),
      restoreKeyBackup: () => Promise.reject(httpsError('functions/permission-denied', 'wrong-pin')),
    });
    const result = await restoreKeyBackup('123789');
    expect(result).toEqual({ isOK: false, message: 'backup-wrong-pin', lockedUntil: undefined });
  });
});
