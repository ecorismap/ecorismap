import {
  getKeyMigrationState,
  migrateIdentityKey,
  restoreIdentityKeyV2,
  registerIdentityV2,
  markMigrated,
  clearMigratedMarker,
  markKeyResetPending,
  isKeyResetPending,
  findLocalKeyMatchingLedger,
} from '../../crypto/migration';
import * as e3kit from '../../virgilsecurity/e3kit';
import * as publicKeys from '../../firebase/publicKeys';
import * as backup from '../../crypto/backup';
import * as keyStorage from '../../crypto/keyStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('../../virgilsecurity/e3kit', () => ({
  exportLocalIdentityKey: jest.fn(),
  exportOwnCard: jest.fn(),
  importLocalIdentityKey: jest.fn(),
  registEncrypt: jest.fn(),
  isInitialized: jest.fn(),
}));
jest.mock('../../firebase/publicKeys', () => ({
  publishPublicKeyToLedger: jest.fn(),
  getPublicKeyFromLedger: jest.fn(),
  fetchPublicKeyHistoryFromLedger: jest.fn(),
}));
jest.mock('../../crypto/identity', () => ({
  extractPublicKeyB64: jest.fn(),
}));
jest.mock('../../crypto/backup', () => ({
  getKeyBackupStatus: jest.fn(),
  createKeyBackup: jest.fn(),
  restoreKeyBackup: jest.fn(),
}));
jest.mock('../../crypto/keyStorage', () => ({
  loadIdentityPrivateKey: jest.fn(),
  saveIdentityPrivateKey: jest.fn(),
  deleteIdentityPrivateKey: jest.fn(),
}));

const mockExportLocalIdentityKey = e3kit.exportLocalIdentityKey as jest.MockedFunction<
  typeof e3kit.exportLocalIdentityKey
>;
const mockExportOwnCard = e3kit.exportOwnCard as jest.MockedFunction<typeof e3kit.exportOwnCard>;
const mockImportLocalIdentityKey = e3kit.importLocalIdentityKey as jest.MockedFunction<
  typeof e3kit.importLocalIdentityKey
>;
const mockRegistEncrypt = e3kit.registEncrypt as jest.MockedFunction<typeof e3kit.registEncrypt>;
const mockPublish = publicKeys.publishPublicKeyToLedger as jest.MockedFunction<
  typeof publicKeys.publishPublicKeyToLedger
>;
const mockGetLedger = publicKeys.getPublicKeyFromLedger as jest.MockedFunction<
  typeof publicKeys.getPublicKeyFromLedger
>;
const mockFetchHistory = publicKeys.fetchPublicKeyHistoryFromLedger as jest.MockedFunction<
  typeof publicKeys.fetchPublicKeyHistoryFromLedger
>;
const mockIsInitialized = e3kit.isInitialized as jest.MockedFunction<typeof e3kit.isInitialized>;

const identityMock = require('../../crypto/identity');
const mockExtractPublicKey = identityMock.extractPublicKeyB64 as jest.Mock;
const mockGetStatus = backup.getKeyBackupStatus as jest.MockedFunction<typeof backup.getKeyBackupStatus>;
const mockCreateBackup = backup.createKeyBackup as jest.MockedFunction<typeof backup.createKeyBackup>;
const mockRestoreBackup = backup.restoreKeyBackup as jest.MockedFunction<typeof backup.restoreKeyBackup>;
const mockLoadKey = keyStorage.loadIdentityPrivateKey as jest.MockedFunction<typeof keyStorage.loadIdentityPrivateKey>;
const mockSaveKey = keyStorage.saveIdentityPrivateKey as jest.MockedFunction<typeof keyStorage.saveIdentityPrivateKey>;

const UID = 'testUid1';
const KEY_PAIR = { privateKey: 'PRIV_B64', publicKey: 'PUB_B64' };
const NEW_KEY_PAIR = { privateKey: 'NEW_PRIV_B64', publicKey: 'NEW_PUB_B64' };
// テストでは秘密鍵文字列の PRIV→PUB 置換を公開鍵の導出とみなす
const derivePublicKey = (privateKey: string) => Promise.resolve(privateKey.replace('PRIV', 'PUB'));
// createdAt は判定に使わないため空のダミーで足りる
const ledgerOf = (publicKey: string, keyVersion: number): publicKeys.LedgerPublicKey => ({
  publicKey,
  keyVersion,
  createdAt: {} as unknown as publicKeys.LedgerPublicKey['createdAt'],
});

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockExtractPublicKey.mockImplementation(derivePublicKey);
  mockGetLedger.mockResolvedValue(undefined);
  mockFetchHistory.mockResolvedValue({ isOK: true, history: [] });
  mockIsInitialized.mockReturnValue(true);
  mockLoadKey.mockResolvedValue(undefined);
  mockExportLocalIdentityKey.mockResolvedValue(undefined);
});

describe('getKeyMigrationState', () => {
  it('マーカー+ローカル鍵あり: サーバー照会せず migrated', async () => {
    await markMigrated(UID);
    mockLoadKey.mockResolvedValue('PRIV_B64');
    const result = await getKeyMigrationState(UID);
    expect(result.state).toBe('migrated');
    expect(mockGetStatus).not.toHaveBeenCalled();
  });

  it('マーカーがあってもローカル鍵が無ければサーバー照会からやり直す', async () => {
    await markMigrated(UID);
    mockLoadKey.mockResolvedValue(undefined);
    mockGetStatus.mockResolvedValue({ isOK: true, status: { exists: false } });
    mockExportLocalIdentityKey.mockResolvedValue(undefined);
    const result = await getKeyMigrationState(UID);
    expect(result.state).toBe('needs-migration');
    expect(mockGetStatus).toHaveBeenCalled();
  });

  it('サーバー未移行: needs-migration', async () => {
    mockLoadKey.mockResolvedValue(undefined);
    mockGetStatus.mockResolvedValue({ isOK: true, status: { exists: false } });
    const result = await getKeyMigrationState(UID);
    expect(result.state).toBe('needs-migration');
  });

  it('サーバー移行済み+ローカル鍵あり: migrated になりマーカーが書かれる', async () => {
    mockLoadKey.mockResolvedValue('PRIV_B64');
    mockGetStatus.mockResolvedValue({ isOK: true, status: { exists: true } });
    const result = await getKeyMigrationState(UID);
    expect(result.state).toBe('migrated');
    expect(await AsyncStorage.getItem(`keyMigrated:${UID}`)).toBe('true');
  });

  it('サーバー移行済み+新ストレージ鍵なし+e3kit鍵あり(台帳と一致): コピーして migrated', async () => {
    mockLoadKey.mockResolvedValue(undefined);
    mockGetStatus.mockResolvedValue({ isOK: true, status: { exists: true } });
    mockExportLocalIdentityKey.mockResolvedValue(KEY_PAIR);
    mockGetLedger.mockResolvedValue(ledgerOf('PUB_B64', 1));
    mockExtractPublicKey.mockResolvedValue('PUB_B64');
    const result = await getKeyMigrationState(UID);
    expect(result.state).toBe('migrated');
    expect(mockSaveKey).toHaveBeenCalledWith(UID, 'PRIV_B64');
  });

  it('サーバー移行済み+e3kit鍵ありでも台帳と不一致(古い鍵): コピーせず migrated-need-restore', async () => {
    mockLoadKey.mockResolvedValue(undefined);
    mockGetStatus.mockResolvedValue({ isOK: true, status: { exists: true } });
    mockExportLocalIdentityKey.mockResolvedValue(KEY_PAIR);
    // 台帳の現行鍵はローテーション後の別の鍵
    mockGetLedger.mockResolvedValue(ledgerOf('NEW_PUB_B64', 2));
    mockExtractPublicKey.mockResolvedValue('PUB_B64');
    const result = await getKeyMigrationState(UID);
    expect(result.state).toBe('migrated-need-restore');
    expect(mockSaveKey).not.toHaveBeenCalled();
  });

  it('サーバー移行済み+どこにも鍵なし: migrated-need-restore（lockedUntil付き）', async () => {
    mockLoadKey.mockResolvedValue(undefined);
    mockGetStatus.mockResolvedValue({ isOK: true, status: { exists: true, lockedUntil: 12345 } });
    mockExportLocalIdentityKey.mockResolvedValue(undefined);
    const result = await getKeyMigrationState(UID);
    expect(result).toEqual({ state: 'migrated-need-restore', lockedUntil: 12345 });
  });

  it('サーバー照会失敗: error', async () => {
    mockLoadKey.mockResolvedValue(undefined);
    mockGetStatus.mockResolvedValue({ isOK: false, message: 'backup-error' });
    const result = await getKeyMigrationState(UID);
    expect(result.state).toBe('error');
  });

  it('マーカーがあってもローカル鍵が台帳と違えば（他端末でリセット済み）復元へ誘導する', async () => {
    await markMigrated(UID);
    mockLoadKey.mockResolvedValue('PRIV_B64');
    mockGetLedger.mockResolvedValue(ledgerOf('NEW_PUB_B64', 2));
    const result = await getKeyMigrationState(UID);
    expect(result).toEqual({ state: 'migrated-need-restore', reason: 'stale-local-key' });
  });

  it('マーカー+鍵が台帳と一致+この世代のバックアップ確認済みならサーバー照会しない', async () => {
    await markMigrated(UID);
    await AsyncStorage.setItem(`keyBackupVerified:${UID}`, '2');
    mockLoadKey.mockResolvedValue('PRIV_B64');
    mockGetLedger.mockResolvedValue(ledgerOf('PUB_B64', 2));
    const result = await getKeyMigrationState(UID);
    expect(result.state).toBe('migrated');
    expect(mockGetStatus).not.toHaveBeenCalled();
  });

  it('マーカー+鍵が台帳と一致でも、バックアップ世代が台帳より古ければ再バックアップを促す', async () => {
    await markMigrated(UID);
    mockLoadKey.mockResolvedValue('PRIV_B64');
    mockGetLedger.mockResolvedValue(ledgerOf('PUB_B64', 2));
    mockGetStatus.mockResolvedValue({ isOK: true, status: { exists: true, keyVersion: 1 } });
    const result = await getKeyMigrationState(UID);
    expect(result).toEqual({ state: 'needs-backup', reason: 'backup-stale' });
  });

  it('バックアップ世代が台帳と一致すれば確認済みとして記録し、次回はサーバー照会しない', async () => {
    await markMigrated(UID);
    mockLoadKey.mockResolvedValue('PRIV_B64');
    mockGetLedger.mockResolvedValue(ledgerOf('PUB_B64', 2));
    mockGetStatus.mockResolvedValue({ isOK: true, status: { exists: true, keyVersion: 2 } });
    expect((await getKeyMigrationState(UID)).state).toBe('migrated');
    expect(await AsyncStorage.getItem(`keyBackupVerified:${UID}`)).toBe('2');
    mockGetStatus.mockClear();
    expect((await getKeyMigrationState(UID)).state).toBe('migrated');
    expect(mockGetStatus).not.toHaveBeenCalled();
  });

  it('バックアップ世代が台帳より新しい（他端末が更新途中）なら上書きを促さない', async () => {
    mockLoadKey.mockResolvedValue('PRIV_B64');
    mockGetLedger.mockResolvedValue(ledgerOf('PUB_B64', 2));
    mockGetStatus.mockResolvedValue({ isOK: true, status: { exists: true, keyVersion: 3 } });
    const result = await getKeyMigrationState(UID);
    expect(result.state).toBe('migrated');
    expect(await AsyncStorage.getItem(`keyBackupVerified:${UID}`)).toBeNull();
  });

  it('マーカー+鍵ありで台帳を取得できない（オフライン）ときは締め出さず migrated', async () => {
    await markMigrated(UID);
    mockLoadKey.mockResolvedValue('PRIV_B64');
    mockGetLedger.mockRejectedValue(new Error('offline'));
    const result = await getKeyMigrationState(UID);
    expect(result.state).toBe('migrated');
    expect(mockGetStatus).not.toHaveBeenCalled();
  });

  it('マーカー+鍵が台帳と一致・世代未確認でサーバー照会に失敗しても締め出さず migrated', async () => {
    await markMigrated(UID);
    mockLoadKey.mockResolvedValue('PRIV_B64');
    mockGetLedger.mockResolvedValue(ledgerOf('PUB_B64', 2));
    mockGetStatus.mockResolvedValue({ isOK: false, message: 'backup-error' });
    const result = await getKeyMigrationState(UID);
    expect(result.state).toBe('migrated');
  });

  it('e3kitの鍵をコピーした場合もバックアップ世代の古さを検知する（publish後にバックアップだけ失敗）', async () => {
    mockLoadKey.mockResolvedValue(undefined);
    mockExportLocalIdentityKey.mockResolvedValue(KEY_PAIR);
    mockGetLedger.mockResolvedValue(ledgerOf('PUB_B64', 2));
    mockGetStatus.mockResolvedValue({ isOK: true, status: { exists: true, keyVersion: 1 } });
    const result = await getKeyMigrationState(UID);
    expect(result).toEqual({ state: 'needs-backup', reason: 'backup-stale' });
    expect(mockSaveKey).toHaveBeenCalledWith(UID, 'PRIV_B64');
  });

  describe('鍵リセットの中断', () => {
    it('リセット中でe3kitに台帳と違う新鍵があれば、旧鍵の復元ではなくバックアップ再開へ', async () => {
      await markKeyResetPending(UID);
      mockExportLocalIdentityKey.mockResolvedValue(NEW_KEY_PAIR);
      mockGetLedger.mockResolvedValue(ledgerOf('PUB_B64', 1));
      mockGetStatus.mockResolvedValue({ isOK: true, status: { exists: true, keyVersion: 1 } });
      const result = await getKeyMigrationState(UID);
      expect(result).toEqual({ state: 'needs-backup', reason: 'reset-pending' });
      expect(await isKeyResetPending(UID)).toBe(true);
    });

    it('e3kit未初期化で新鍵を確かめられないときもマーカーを消さずリセット中のまま', async () => {
      await markKeyResetPending(UID);
      mockIsInitialized.mockReturnValue(false);
      const result = await getKeyMigrationState(UID);
      expect(result).toEqual({ state: 'needs-backup', reason: 'reset-pending' });
      expect(await isKeyResetPending(UID)).toBe(true);
    });

    it('台帳publishまで済みでもKMSの世代が古ければリセット中のまま', async () => {
      await markKeyResetPending(UID);
      mockExportLocalIdentityKey.mockResolvedValue(NEW_KEY_PAIR);
      mockGetLedger.mockResolvedValue(ledgerOf('NEW_PUB_B64', 2));
      mockGetStatus.mockResolvedValue({ isOK: true, status: { exists: true, keyVersion: 1 } });
      const result = await getKeyMigrationState(UID);
      expect(result).toEqual({ state: 'needs-backup', reason: 'reset-pending' });
    });

    it('台帳・KMSとも新鍵で済んでいればマーカーを消して通常判定へ', async () => {
      await markKeyResetPending(UID);
      mockExportLocalIdentityKey.mockResolvedValue(NEW_KEY_PAIR);
      mockLoadKey.mockResolvedValue(undefined);
      mockGetLedger.mockResolvedValue(ledgerOf('NEW_PUB_B64', 2));
      mockGetStatus.mockResolvedValue({ isOK: true, status: { exists: true, keyVersion: 2 } });
      const result = await getKeyMigrationState(UID);
      expect(result.state).toBe('migrated');
      expect(await isKeyResetPending(UID)).toBe(false);
    });

    it('端末から新鍵が失われていればマーカーを消して通常判定（旧鍵の復元）へ', async () => {
      await markKeyResetPending(UID);
      mockExportLocalIdentityKey.mockResolvedValue(undefined);
      mockLoadKey.mockResolvedValue(undefined);
      mockGetStatus.mockResolvedValue({ isOK: true, status: { exists: true, keyVersion: 1 } });
      const result = await getKeyMigrationState(UID);
      expect(result.state).toBe('migrated-need-restore');
      expect(await isKeyResetPending(UID)).toBe(false);
    });
  });
});

describe('findLocalKeyMatchingLedger', () => {
  it('台帳と一致する新ストレージの鍵と台帳の世代を返す', async () => {
    mockLoadKey.mockResolvedValue('PRIV_B64');
    mockGetLedger.mockResolvedValue(ledgerOf('PUB_B64', 4));
    expect(await findLocalKeyMatchingLedger(UID)).toEqual({ privateKey: 'PRIV_B64', keyVersion: 4 });
  });

  it('一致する鍵が無ければ undefined（古い鍵で再バックアップさせない）', async () => {
    mockLoadKey.mockResolvedValue('PRIV_B64');
    mockExportLocalIdentityKey.mockResolvedValue(KEY_PAIR);
    mockGetLedger.mockResolvedValue(ledgerOf('NEW_PUB_B64', 2));
    expect(await findLocalKeyMatchingLedger(UID)).toBeUndefined();
  });
});

describe('migrateIdentityKey', () => {
  it('正常系: 鍵取り出し→KMSバックアップ→台帳publish→保存→マーカーの順で完了する', async () => {
    mockExportLocalIdentityKey.mockResolvedValue(KEY_PAIR);
    mockExportOwnCard.mockResolvedValue('CARD_STR');
    mockGetLedger.mockResolvedValue(ledgerOf('OLD_PUB_B64', 1));
    mockPublish.mockResolvedValue({ isOK: true, message: '', keyVersion: 2 });
    mockCreateBackup.mockResolvedValue({ isOK: true, message: '' });

    const result = await migrateIdentityKey(UID, '123789');
    expect(result.isOK).toBe(true);
    expect(mockPublish).toHaveBeenCalledWith(UID, 'PUB_B64', 'CARD_STR');
    // 台帳で次に付く世代を先に決めてバックアップし、その後にpublishする
    expect(mockCreateBackup).toHaveBeenCalledWith('123789', 'PRIV_B64', 2);
    expect(mockCreateBackup.mock.invocationCallOrder[0]).toBeLessThan(mockPublish.mock.invocationCallOrder[0]);
    expect(mockSaveKey).toHaveBeenCalledWith(UID, 'PRIV_B64');
    expect(await AsyncStorage.getItem(`keyMigrated:${UID}`)).toBe('true');
  });

  it('ローカル鍵が無ければ失敗する（マーカーは書かれない）', async () => {
    mockExportLocalIdentityKey.mockResolvedValue(undefined);
    const result = await migrateIdentityKey(UID, '123789');
    expect(result.isOK).toBe(false);
    expect(mockPublish).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(`keyMigrated:${UID}`)).toBeNull();
  });

  it('台帳publish失敗で中断する（マーカーは書かれない）', async () => {
    mockExportLocalIdentityKey.mockResolvedValue(KEY_PAIR);
    mockExportOwnCard.mockResolvedValue(undefined);
    mockCreateBackup.mockResolvedValue({ isOK: true, message: '' });
    mockPublish.mockResolvedValue({ isOK: false, message: 'failPublishPublicKey' });
    const result = await migrateIdentityKey(UID, '123789');
    expect(result.isOK).toBe(false);
    expect(await AsyncStorage.getItem(`keyMigrated:${UID}`)).toBeNull();
  });

  it('KMSバックアップ失敗で中断し、台帳は更新しない（マーカーは書かれない）', async () => {
    mockExportLocalIdentityKey.mockResolvedValue(KEY_PAIR);
    mockExportOwnCard.mockResolvedValue(undefined);
    mockCreateBackup.mockResolvedValue({ isOK: false, message: 'backup-error' });
    const result = await migrateIdentityKey(UID, '123789');
    expect(result.isOK).toBe(false);
    expect(mockPublish).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(`keyMigrated:${UID}`)).toBeNull();
  });

  it('台帳を読めないと keyVersion を決められないので何もせず失敗する', async () => {
    mockExportLocalIdentityKey.mockResolvedValue(KEY_PAIR);
    mockGetLedger.mockRejectedValue(new Error('offline'));
    const result = await migrateIdentityKey(UID, '123789');
    expect(result.isOK).toBe(false);
    expect(mockCreateBackup).not.toHaveBeenCalled();
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('台帳と同じ鍵なら現行世代のままバックアップし直す（再バックアップ）', async () => {
    mockExportLocalIdentityKey.mockResolvedValue(KEY_PAIR);
    mockGetLedger.mockResolvedValue(ledgerOf('PUB_B64', 3));
    mockCreateBackup.mockResolvedValue({ isOK: true, message: '' });
    mockPublish.mockResolvedValue({ isOK: true, message: '', keyVersion: 3 });
    const result = await migrateIdentityKey(UID, '123789');
    expect(result.isOK).toBe(true);
    expect(mockCreateBackup).toHaveBeenCalledTimes(1);
    expect(mockCreateBackup).toHaveBeenCalledWith('123789', 'PRIV_B64', 3);
  });

  it('publish後の世代が予測と違えば、その世代でバックアップし直す', async () => {
    mockExportLocalIdentityKey.mockResolvedValue(KEY_PAIR);
    mockGetLedger.mockResolvedValue(ledgerOf('OLD_PUB_B64', 1));
    mockCreateBackup.mockResolvedValue({ isOK: true, message: '' });
    mockPublish.mockResolvedValue({ isOK: true, message: '', keyVersion: 3 });
    const result = await migrateIdentityKey(UID, '123789');
    expect(result.isOK).toBe(true);
    expect(mockCreateBackup).toHaveBeenNthCalledWith(1, '123789', 'PRIV_B64', 2);
    expect(mockCreateBackup).toHaveBeenNthCalledWith(2, '123789', 'PRIV_B64', 3);
  });

  it('e3kitの鍵が台帳の旧世代なら、台帳を巻き戻さないよう拒否する', async () => {
    mockExportLocalIdentityKey.mockResolvedValue(KEY_PAIR);
    mockGetLedger.mockResolvedValue(ledgerOf('NEW_PUB_B64', 2));
    mockFetchHistory.mockResolvedValue({ isOK: true, history: ['PUB_B64'] });
    const result = await migrateIdentityKey(UID, '123789');
    expect(result).toEqual({ isOK: false, message: 'migrate-stale-local-key' });
    expect(mockCreateBackup).not.toHaveBeenCalled();
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('台帳の履歴を取得できなければ、旧世代かどうか分からないので巻き戻し防止のため中断する', async () => {
    mockExportLocalIdentityKey.mockResolvedValue(KEY_PAIR);
    mockGetLedger.mockResolvedValue(ledgerOf('NEW_PUB_B64', 2));
    mockFetchHistory.mockResolvedValue({ isOK: false });
    const result = await migrateIdentityKey(UID, '123789');
    expect(result).toEqual({ isOK: false, message: 'failPublishPublicKey' });
    expect(mockCreateBackup).not.toHaveBeenCalled();
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('履歴が空（取得成功）なら旧世代ではないので e3kit の鍵で台帳を更新する', async () => {
    mockExportLocalIdentityKey.mockResolvedValue(KEY_PAIR);
    mockGetLedger.mockResolvedValue(ledgerOf('NEW_PUB_B64', 2));
    mockFetchHistory.mockResolvedValue({ isOK: true, history: [] });
    mockCreateBackup.mockResolvedValue({ isOK: true, message: '' });
    mockPublish.mockResolvedValue({ isOK: true, message: '', keyVersion: 3 });
    const result = await migrateIdentityKey(UID, '123789');
    expect(result.isOK).toBe(true);
    expect(mockCreateBackup).toHaveBeenCalledWith('123789', 'PRIV_B64', 3);
  });

  it('新ストレージの鍵が台帳と一致し、e3kitに古い鍵が残っていても新ストレージの鍵を使う', async () => {
    mockExportLocalIdentityKey.mockResolvedValue(KEY_PAIR);
    mockLoadKey.mockResolvedValue('NEW_PRIV_B64');
    mockGetLedger.mockResolvedValue(ledgerOf('NEW_PUB_B64', 2));
    mockCreateBackup.mockResolvedValue({ isOK: true, message: '' });
    mockPublish.mockResolvedValue({ isOK: true, message: '', keyVersion: 2 });
    const result = await migrateIdentityKey(UID, '123789');
    expect(result.isOK).toBe(true);
    expect(mockCreateBackup).toHaveBeenCalledWith('123789', 'NEW_PRIV_B64', 2);
    expect(mockPublish).toHaveBeenCalledWith(UID, 'NEW_PUB_B64', undefined);
  });

  it('鍵リセット中は新ストレージの旧鍵を使わず e3kit の新鍵を載せ、完了でリセット中マーカーを消す', async () => {
    await markKeyResetPending(UID);
    mockExportLocalIdentityKey.mockResolvedValue(NEW_KEY_PAIR);
    mockLoadKey.mockResolvedValue('PRIV_B64');
    mockGetLedger.mockResolvedValue(ledgerOf('PUB_B64', 1));
    mockCreateBackup.mockResolvedValue({ isOK: true, message: '' });
    mockPublish.mockResolvedValue({ isOK: true, message: '', keyVersion: 2 });
    const result = await migrateIdentityKey(UID, '123789');
    expect(result.isOK).toBe(true);
    expect(mockCreateBackup).toHaveBeenCalledWith('123789', 'NEW_PRIV_B64', 2);
    expect(mockPublish).toHaveBeenCalledWith(UID, 'NEW_PUB_B64', undefined);
    expect(await isKeyResetPending(UID)).toBe(false);
  });

  it('鍵リセット中にe3kitの新鍵が見えなければ、旧鍵で代用せず失敗する', async () => {
    await markKeyResetPending(UID);
    mockExportLocalIdentityKey.mockResolvedValue(undefined);
    mockLoadKey.mockResolvedValue('PRIV_B64');
    const result = await migrateIdentityKey(UID, '123789');
    expect(result).toEqual({ isOK: false, message: 'migrate-no-local-key' });
    expect(mockCreateBackup).not.toHaveBeenCalled();
    expect(await isKeyResetPending(UID)).toBe(true);
  });

  it('バックアップ後にpublishが失敗したらリセット中マーカーは残る（次回やり直させる）', async () => {
    await markKeyResetPending(UID);
    mockExportLocalIdentityKey.mockResolvedValue(NEW_KEY_PAIR);
    mockGetLedger.mockResolvedValue(ledgerOf('PUB_B64', 1));
    mockCreateBackup.mockResolvedValue({ isOK: true, message: '' });
    mockPublish.mockResolvedValue({ isOK: false, message: 'failPublishPublicKey' });
    const result = await migrateIdentityKey(UID, '123789');
    expect(result.isOK).toBe(false);
    expect(await isKeyResetPending(UID)).toBe(true);
  });
});

describe('restoreIdentityKeyV2', () => {
  it('正常系: 台帳と一致する鍵を復元→新旧両ストレージへ保存→マーカー', async () => {
    mockRestoreBackup.mockResolvedValue({ isOK: true, privateKey: 'PRIV_B64', keyVersion: 1 });
    mockGetLedger.mockResolvedValue(ledgerOf('PUB_B64', 1));
    const result = await restoreIdentityKeyV2(UID, '123789');
    expect(result.isOK).toBe(true);
    expect(mockSaveKey).toHaveBeenCalledWith(UID, 'PRIV_B64');
    expect(mockImportLocalIdentityKey).toHaveBeenCalledWith(UID, 'PRIV_B64');
    expect(await AsyncStorage.getItem(`keyMigrated:${UID}`)).toBe('true');
  });

  it('鍵として読めないblobは backup-error で保存しない', async () => {
    mockRestoreBackup.mockResolvedValue({ isOK: true, privateKey: 'BROKEN', keyVersion: 1 });
    mockExtractPublicKey.mockRejectedValue(new Error('invalid key'));
    const result = await restoreIdentityKeyV2(UID, '123789');
    expect(result).toEqual({ isOK: false, message: 'backup-error' });
    expect(mockSaveKey).not.toHaveBeenCalled();
  });

  it('復元した鍵が台帳の現行鍵と違えば backup-stale で、保存もマーカーもしない', async () => {
    mockRestoreBackup.mockResolvedValue({ isOK: true, privateKey: 'PRIV_B64', keyVersion: 1 });
    mockGetLedger.mockResolvedValue(ledgerOf('NEW_PUB_B64', 2));
    const result = await restoreIdentityKeyV2(UID, '123789');
    expect(result).toEqual({ isOK: false, message: 'backup-stale' });
    expect(mockSaveKey).not.toHaveBeenCalled();
    expect(mockImportLocalIdentityKey).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(`keyMigrated:${UID}`)).toBeNull();
  });

  it('バックアップが台帳より1世代新しい（publish前に中断）なら台帳へpublishして完了させる', async () => {
    mockRestoreBackup.mockResolvedValue({ isOK: true, privateKey: 'NEW_PRIV_B64', keyVersion: 3 });
    mockGetLedger.mockResolvedValue(ledgerOf('PUB_B64', 2));
    mockPublish.mockResolvedValue({ isOK: true, message: '', keyVersion: 3 });
    const result = await restoreIdentityKeyV2(UID, '123789');
    expect(result).toEqual({ isOK: true, message: '' });
    expect(mockPublish).toHaveBeenCalledWith(UID, 'NEW_PUB_B64', undefined, 3);
    expect(mockSaveKey).toHaveBeenCalledWith(UID, 'NEW_PRIV_B64');
    expect(mockImportLocalIdentityKey).toHaveBeenCalledWith(UID, 'NEW_PRIV_B64');
    expect(await AsyncStorage.getItem(`keyMigrated:${UID}`)).toBe('true');
    expect(await AsyncStorage.getItem(`keyBackupVerified:${UID}`)).toBe('3');
  });

  it('1世代新しいバックアップでも台帳publishに失敗したら保存せず再試行用のメッセージを返す', async () => {
    mockRestoreBackup.mockResolvedValue({ isOK: true, privateKey: 'NEW_PRIV_B64', keyVersion: 3 });
    mockGetLedger.mockResolvedValue(ledgerOf('PUB_B64', 2));
    mockPublish.mockResolvedValue({ isOK: false, message: 'failPublishPublicKey' });
    const result = await restoreIdentityKeyV2(UID, '123789');
    expect(result).toEqual({ isOK: false, message: 'backup-ledger-publish-failed' });
    expect(mockSaveKey).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(`keyMigrated:${UID}`)).toBeNull();
  });

  it('1世代新しいバックアップでも台帳の世代が並行して進んでいたら backup-stale', async () => {
    mockRestoreBackup.mockResolvedValue({ isOK: true, privateKey: 'NEW_PRIV_B64', keyVersion: 3 });
    mockGetLedger.mockResolvedValue(ledgerOf('PUB_B64', 2));
    mockPublish.mockResolvedValue({ isOK: false, message: 'ledger-version-conflict' });
    const result = await restoreIdentityKeyV2(UID, '123789');
    expect(result).toEqual({ isOK: false, message: 'backup-stale' });
    expect(mockSaveKey).not.toHaveBeenCalled();
  });

  it('1世代新しくても履歴にある（退避済みの旧鍵）なら台帳を巻き戻さず backup-stale', async () => {
    mockRestoreBackup.mockResolvedValue({ isOK: true, privateKey: 'NEW_PRIV_B64', keyVersion: 3 });
    mockGetLedger.mockResolvedValue(ledgerOf('PUB_B64', 2));
    mockFetchHistory.mockResolvedValue({ isOK: true, history: ['NEW_PUB_B64'] });
    const result = await restoreIdentityKeyV2(UID, '123789');
    expect(result).toEqual({ isOK: false, message: 'backup-stale' });
    expect(mockPublish).not.toHaveBeenCalled();
    expect(mockSaveKey).not.toHaveBeenCalled();
  });

  it('1世代新しくても履歴を取得できなければpublishせず再試行させる', async () => {
    mockRestoreBackup.mockResolvedValue({ isOK: true, privateKey: 'NEW_PRIV_B64', keyVersion: 3 });
    mockGetLedger.mockResolvedValue(ledgerOf('PUB_B64', 2));
    mockFetchHistory.mockResolvedValue({ isOK: false });
    const result = await restoreIdentityKeyV2(UID, '123789');
    expect(result).toEqual({ isOK: false, message: 'backup-ledger-publish-failed' });
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('2世代以上新しいバックアップは台帳とつながらないので backup-stale', async () => {
    mockRestoreBackup.mockResolvedValue({ isOK: true, privateKey: 'NEW_PRIV_B64', keyVersion: 4 });
    mockGetLedger.mockResolvedValue(ledgerOf('PUB_B64', 2));
    const result = await restoreIdentityKeyV2(UID, '123789');
    expect(result).toEqual({ isOK: false, message: 'backup-stale' });
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('台帳未登録でバックアップが世代1なら台帳を作成して完了する', async () => {
    mockRestoreBackup.mockResolvedValue({ isOK: true, privateKey: 'PRIV_B64', keyVersion: 1 });
    mockGetLedger.mockResolvedValue(undefined);
    mockPublish.mockResolvedValue({ isOK: true, message: '', keyVersion: 1 });
    const result = await restoreIdentityKeyV2(UID, '123789');
    expect(result.isOK).toBe(true);
    expect(mockPublish).toHaveBeenCalledWith(UID, 'PUB_B64', undefined, 1);
    expect(await AsyncStorage.getItem(`keyBackupVerified:${UID}`)).toBe('1');
  });

  it('台帳未登録で台帳作成に失敗しても従来どおり復元は成功扱い（確認済みにはしない）', async () => {
    mockRestoreBackup.mockResolvedValue({ isOK: true, privateKey: 'PRIV_B64', keyVersion: 1 });
    mockGetLedger.mockResolvedValue(undefined);
    mockPublish.mockResolvedValue({ isOK: false, message: 'failPublishPublicKey' });
    const result = await restoreIdentityKeyV2(UID, '123789');
    expect(result.isOK).toBe(true);
    expect(mockSaveKey).toHaveBeenCalledWith(UID, 'PRIV_B64');
    expect(await AsyncStorage.getItem(`keyBackupVerified:${UID}`)).toBeNull();
  });

  it('台帳を取得できない（オフライン）ときは従来どおり復元し、確認済みにはしない', async () => {
    mockRestoreBackup.mockResolvedValue({ isOK: true, privateKey: 'PRIV_B64', keyVersion: 1 });
    mockGetLedger.mockRejectedValue(new Error('offline'));
    const result = await restoreIdentityKeyV2(UID, '123789');
    expect(result.isOK).toBe(true);
    expect(mockSaveKey).toHaveBeenCalledWith(UID, 'PRIV_B64');
    expect(await AsyncStorage.getItem(`keyBackupVerified:${UID}`)).toBeNull();
  });

  it('誤PIN: メッセージとlockedUntilを伝搬する', async () => {
    mockRestoreBackup.mockResolvedValue({ isOK: false, message: 'backup-locked', lockedUntil: 999 });
    const result = await restoreIdentityKeyV2(UID, '123789');
    expect(result).toEqual({ isOK: false, message: 'backup-locked', lockedUntil: 999 });
    expect(mockSaveKey).not.toHaveBeenCalled();
  });
});

describe('registerIdentityV2', () => {
  it('e3kit登録失敗で中断する', async () => {
    mockRegistEncrypt.mockResolvedValue({ isOK: false });
    const result = await registerIdentityV2(UID, '123789');
    expect(result.isOK).toBe(false);
    expect(mockExportLocalIdentityKey).not.toHaveBeenCalled();
  });

  it('e3kit登録成功後は移行処理（バックアップ+台帳publish）に続く', async () => {
    mockRegistEncrypt.mockResolvedValue({ isOK: true });
    mockExportLocalIdentityKey.mockResolvedValue(KEY_PAIR);
    mockExportOwnCard.mockResolvedValue('CARD_STR');
    mockPublish.mockResolvedValue({ isOK: true, message: '', keyVersion: 1 });
    mockCreateBackup.mockResolvedValue({ isOK: true, message: '' });
    const result = await registerIdentityV2(UID, '123789');
    expect(result.isOK).toBe(true);
    expect(mockCreateBackup).toHaveBeenCalledWith('123789', 'PRIV_B64', 1);
  });
});

describe('マーカー管理', () => {
  it('markMigrated/clearMigratedMarkerが対で機能する', async () => {
    await markMigrated(UID);
    expect(await AsyncStorage.getItem(`keyMigrated:${UID}`)).toBe('true');
    await clearMigratedMarker(UID);
    expect(await AsyncStorage.getItem(`keyMigrated:${UID}`)).toBeNull();
  });
});
