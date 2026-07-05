// JSZipのモック（コンストラクタ経由で利用されるため、jest.fnで差し替え）
const mockZipFile = jest.fn();
const mockGenerateAsync = jest.fn();
jest.mock('jszip', () => {
  return jest.fn().mockImplementation(() => ({
    file: (...args: unknown[]) => mockZipFile(...args),
    generateAsync: (...args: unknown[]) => mockGenerateAsync(...args),
  }));
});

// expo-sharingのモック
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
  shareAsync: jest.fn(() => Promise.resolve()),
}));

// File.tsのモック（共有ダイアログの起動を避ける）
jest.mock('../File', () => ({
  exportFileFromUri: jest.fn(() => Promise.resolve()),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as RNFS from 'react-native-fs';
import * as Sharing from 'expo-sharing';
import { storage } from '../mmkvStorage';
import { exportFileFromUri } from '../File';
import {
  checkAsyncStorageData,
  isMigrationCompleted,
  isMigrationSkipped,
  isMigrationPostponed,
  exportAsyncStorageData,
  migrateToMMKV,
  skipMigration,
  postponeMigration,
  resetMigrationStatus,
  formatDataSize,
} from '../storageMigration';

// jestSetupFile.jsでモック済みのAsyncStorage / mmkvStorage(storage) / RNFSを利用する
const mockStorageSet = storage.set as jest.Mock;
const mockStorageGetString = storage.getString as jest.Mock;
const mockStorageRemove = storage.remove as jest.Mock;
const mockExportFileFromUri = exportFileFromUri as jest.Mock;
const mockIsAvailableAsync = Sharing.isAvailableAsync as jest.Mock;
const mockShareAsync = Sharing.shareAsync as jest.Mock;
const mockMkdir = RNFS.mkdir as jest.Mock;
const mockWriteFile = RNFS.writeFile as jest.Mock;
const mockUnlink = RNFS.unlink as jest.Mock;

const setPersistRoot = async (value: string) => {
  await AsyncStorage.setItem('persist:root', value);
};

const validPersistRoot = JSON.stringify({
  dataSet: JSON.stringify([{ layerId: 'layer1', userId: 'user1', data: [] }]),
  layers: JSON.stringify([{ id: 'layer1', name: 'test' }]),
  settings: JSON.stringify({ mapType: 'standard' }),
  tileMaps: JSON.stringify([{ id: 'map1' }]),
});

describe('storageMigration', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockStorageGetString.mockReturnValue(undefined);
    mockGenerateAsync.mockResolvedValue('base64-zip-content');
    mockIsAvailableAsync.mockResolvedValue(true);
  });

  describe('checkAsyncStorageData', () => {
    it('persist:rootが存在する場合はhasData=trueとサイズ・キーを返す', async () => {
      await setPersistRoot(validPersistRoot);

      const info = await checkAsyncStorageData();

      expect(info.hasData).toBe(true);
      expect(info.dataSize).toBe(validPersistRoot.length);
      expect(info.keys).toEqual(['persist:root']);
    });

    it('persist:root以外のpersist:キーもサイズ・キーに含める', async () => {
      await setPersistRoot(validPersistRoot);
      await AsyncStorage.setItem('persist:other', 'abc');
      await AsyncStorage.setItem('unrelated', 'xyz');

      const info = await checkAsyncStorageData();

      expect(info.dataSize).toBe(validPersistRoot.length + 3);
      expect(info.keys).toContain('persist:root');
      expect(info.keys).toContain('persist:other');
      expect(info.keys).not.toContain('unrelated');
    });

    it('persist:rootが無い場合はhasData=falseを返す', async () => {
      await AsyncStorage.setItem('unrelated', 'xyz');

      const info = await checkAsyncStorageData();

      expect(info).toEqual({ hasData: false, dataSize: 0, keys: [] });
    });

    it('AsyncStorageのアクセスに失敗した場合はhasData=falseを返す', async () => {
      (AsyncStorage.getAllKeys as jest.Mock).mockRejectedValueOnce(new Error('storage error'));

      const info = await checkAsyncStorageData();

      expect(info).toEqual({ hasData: false, dataSize: 0, keys: [] });
    });
  });

  describe('移行状態フラグ', () => {
    it('isMigrationCompleted: フラグが"true"ならtrue、未設定ならfalse', () => {
      expect(isMigrationCompleted()).toBe(false);
      mockStorageGetString.mockReturnValue('true');
      expect(isMigrationCompleted()).toBe(true);
    });

    it('isMigrationCompleted: storageアクセスが例外を投げたらfalse', () => {
      mockStorageGetString.mockImplementation(() => {
        throw new Error('mmkv error');
      });
      expect(isMigrationCompleted()).toBe(false);
    });

    it('isMigrationSkipped / isMigrationPostponed も同様に判定する', () => {
      expect(isMigrationSkipped()).toBe(false);
      expect(isMigrationPostponed()).toBe(false);
      mockStorageGetString.mockReturnValue('true');
      expect(isMigrationSkipped()).toBe(true);
      expect(isMigrationPostponed()).toBe(true);
    });
  });

  describe('exportAsyncStorageData', () => {
    it('正常データをZIP(.ecorismap)としてエクスポートし共有する', async () => {
      await setPersistRoot(validPersistRoot);

      const result = await exportAsyncStorageData();

      expect(result).toMatch(/\/export\/local_.*\.ecorismap$/);
      // local.jsonがZIPに追加されている
      expect(mockZipFile).toHaveBeenCalledWith('local.json', expect.stringContaining('"dataSet"'));
      expect(mockGenerateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'base64', compression: 'DEFLATE' })
      );
      // ZIPが共有され、一時ファイルが削除されている
      expect(mockExportFileFromUri).toHaveBeenCalledWith(result, expect.stringMatching(/local_.*\.ecorismap$/));
      expect(mockUnlink).toHaveBeenCalledTimes(2);
    });

    it('エクスポート対象データが無い場合はエラーを投げる', async () => {
      await expect(exportAsyncStorageData()).rejects.toThrow('No data to export');
    });

    it('persist:root自体が壊れたJSONの場合はエラーを投げる', async () => {
      await setPersistRoot('{ this is broken json');

      await expect(exportAsyncStorageData()).rejects.toThrow();
    });

    it('各reducerのデータが壊れている場合はデフォルト値で出力する', async () => {
      await setPersistRoot(
        JSON.stringify({
          dataSet: '{broken',
          layers: '{broken',
          settings: '{broken',
          tileMaps: '{broken',
        })
      );

      await exportAsyncStorageData();

      const jsonString = mockZipFile.mock.calls[0][1] as string;
      const exported = JSON.parse(jsonString);
      expect(exported.dataSet).toEqual([]);
      expect(exported.layers).toEqual([]);
      expect(exported.settings).toEqual({});
      expect(exported.maps).toEqual([]);
    });

    it('ZIP作成に失敗した場合はJSONファイルにフォールバックして共有する', async () => {
      await setPersistRoot(validPersistRoot);
      mockMkdir.mockRejectedValueOnce(new Error('mkdir failed'));

      const result = await exportAsyncStorageData();

      expect(result).toMatch(/local_.*\.json$/);
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringMatching(/local_.*\.json$/),
        expect.stringContaining('"dataSet"'),
        'utf8'
      );
      expect(mockShareAsync).toHaveBeenCalledWith(
        expect.stringContaining('file://'),
        expect.objectContaining({ mimeType: 'application/json' })
      );
      // フォールバックファイルも削除される
      expect(mockUnlink).toHaveBeenCalledWith(expect.stringMatching(/local_.*\.json$/));
    });
  });

  describe('migrateToMMKV', () => {
    it('既に移行済みの場合は何もせずに成功を返す', async () => {
      mockStorageGetString.mockImplementation((key: string) =>
        key === 'migration_completed_v2' ? 'true' : undefined
      );

      const result = await migrateToMMKV({ backup: false, clearOldData: false });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Migration already completed');
      expect(mockStorageSet).not.toHaveBeenCalled();
    });

    it('移行対象データが無い場合は完了フラグのみ設定して成功を返す', async () => {
      const result = await migrateToMMKV({ backup: false, clearOldData: false });

      expect(result.success).toBe(true);
      expect(result.message).toBe('No data to migrate');
      expect(mockStorageSet).toHaveBeenCalledWith('migration_completed_v2', 'true');
    });

    it('正常移行: データをMMKVへコピーしフラグを設定する', async () => {
      await setPersistRoot(validPersistRoot);

      const result = await migrateToMMKV({ backup: false, clearOldData: false });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Successfully migrated 1 keys to MMKV');
      expect(mockStorageSet).toHaveBeenCalledWith('persist:root', validPersistRoot);
      expect(mockStorageSet).toHaveBeenCalledWith('migration_completed_v2', 'true');
      expect(mockStorageSet).toHaveBeenCalledWith('migrated_keys_count', '1');
      expect(mockStorageRemove).toHaveBeenCalledWith('migration_postponed');
      expect(mockStorageRemove).toHaveBeenCalledWith('migration_postpone_date');
      // clearOldData=falseなので元データは残る
      expect(await AsyncStorage.getItem('persist:root')).toBe(validPersistRoot);
    });

    it('backup=trueの場合はバックアップパスを返す', async () => {
      await setPersistRoot(validPersistRoot);

      const result = await migrateToMMKV({ backup: true, clearOldData: false });

      expect(result.success).toBe(true);
      expect(result.backupPath).toMatch(/\.ecorismap$/);
      expect(mockExportFileFromUri).toHaveBeenCalled();
    });

    it('バックアップが失敗しても移行自体は継続して成功する', async () => {
      await setPersistRoot(validPersistRoot);
      // ZIP作成もJSONフォールバックも失敗させる
      mockMkdir.mockRejectedValueOnce(new Error('mkdir failed'));
      mockWriteFile.mockRejectedValueOnce(new Error('write failed'));

      const result = await migrateToMMKV({ backup: true, clearOldData: false });

      expect(result.success).toBe(true);
      expect(result.backupPath).toBeUndefined();
      expect(mockStorageSet).toHaveBeenCalledWith('persist:root', validPersistRoot);
      expect(mockStorageSet).toHaveBeenCalledWith('migration_completed_v2', 'true');
    });

    it('clearOldData=trueの場合は移行後にAsyncStorageのデータを削除する', async () => {
      await setPersistRoot(validPersistRoot);

      const result = await migrateToMMKV({ backup: false, clearOldData: true });

      expect(result.success).toBe(true);
      expect(await AsyncStorage.getItem('persist:root')).toBeNull();
    });

    it('移行中にAsyncStorageの読み込みが失敗した場合はsuccess=falseを返す', async () => {
      await setPersistRoot(validPersistRoot);
      // 1回目(checkAsyncStorageData)は成功し、2回目(移行ループ)で失敗させる
      (AsyncStorage.getItem as jest.Mock)
        .mockResolvedValueOnce(validPersistRoot)
        .mockRejectedValueOnce(new Error('read failed'));

      const result = await migrateToMMKV({ backup: false, clearOldData: false });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Migration failed');
      expect(result.error).toBeInstanceOf(Error);
    });
  });

  describe('skip / postpone / reset', () => {
    it('skipMigration: スキップフラグと日時を保存する', () => {
      skipMigration();

      expect(mockStorageSet).toHaveBeenCalledWith('migration_skipped', 'true');
      expect(mockStorageSet).toHaveBeenCalledWith('migration_skip_date', expect.any(String));
    });

    it('postponeMigration: 初回のみフラグを保存する', () => {
      postponeMigration();
      expect(mockStorageSet).toHaveBeenCalledWith('migration_postponed', 'true');

      // 既にpostponed済みの場合は上書きしない
      mockStorageSet.mockClear();
      mockStorageGetString.mockReturnValue('true');
      postponeMigration();
      expect(mockStorageSet).not.toHaveBeenCalled();
    });

    it('resetMigrationStatus: すべての移行関連キーを削除する', () => {
      resetMigrationStatus();

      const removedKeys = mockStorageRemove.mock.calls.map((call) => call[0]);
      expect(removedKeys).toEqual([
        'migration_completed_v2',
        'migration_skipped',
        'migration_postponed',
        'migration_date',
        'migrated_keys_count',
        'migration_skip_date',
        'migration_postpone_date',
      ]);
    });
  });

  describe('formatDataSize', () => {
    it('0バイトは"0 B"を返す', () => {
      expect(formatDataSize(0)).toBe('0 B');
    });

    it('バイト/KB/MB/GBを適切に変換する', () => {
      expect(formatDataSize(500)).toBe('500.00 B');
      expect(formatDataSize(1024)).toBe('1.00 KB');
      expect(formatDataSize(1536)).toBe('1.50 KB');
      expect(formatDataSize(1048576)).toBe('1.00 MB');
      expect(formatDataSize(1073741824)).toBe('1.00 GB');
    });
  });
});
