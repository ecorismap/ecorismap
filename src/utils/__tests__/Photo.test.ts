// Mock dependencies first
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 1 },
}));
jest.mock('expo-media-library/legacy', () => ({
  requestPermissionsAsync: jest.fn(),
  createAssetAsync: jest.fn(),
  MediaTypeValue: { photo: 'photo' },
}));
jest.mock('expo-file-system/legacy', () => ({
  makeDirectoryAsync: jest.fn(),
  copyAsync: jest.fn(),
  deleteAsync: jest.fn(),
  getInfoAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  EncodingType: { UTF8: 'UTF8', Base64: 'base64' },
  documentDirectory: 'file:///docs/',
  cacheDirectory: 'file:///cache/',
}));
const mockConverter = { available: false, convert: jest.fn() };
jest.mock('../../../modules/photo-converter/src', () => ({
  isPhotoConverterAvailable: () => mockConverter.available,
  convertPhotoToJpeg: (...args: unknown[]) => mockConverter.convert(...args),
}));
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));
jest.mock('../Layer', () => ({
  getPhotoFields: jest.fn(),
}));

import * as Photo from '../Photo';
import { manipulateAsync } from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { LayerType, PhotoType, RecordType } from '../../types';
import { getPhotoFields } from '../Layer';

const mockManipulateAsync = manipulateAsync as jest.MockedFunction<typeof manipulateAsync>;
const mockMediaLibrary = MediaLibrary as jest.Mocked<typeof MediaLibrary>;
const mockFileSystem = FileSystem as jest.Mocked<typeof FileSystem>;
const mockGetPhotoFields = getPhotoFields as jest.MockedFunction<typeof getPhotoFields>;

describe('Photo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createPhotoName（写真監査 P-L15）', () => {
    it('同じ秒に作っても名前が重ならず、一意な名前として判定される', () => {
      const { isUniquePhotoName } = require('../photoDownloadPath');
      jest.useFakeTimers().setSystemTime(new Date('2026-11-23T10:00:00Z'));
      try {
        const names = Array.from({ length: 50 }, () => Photo.createPhotoName('jpg'));
        expect(new Set(names).size).toBe(50);
        names.forEach((name) => {
          expect(name).toMatch(/^EMAP_\d{8}_\d{6}_[0-9A-HJKMNP-TV-Z]{6}\.jpg$/);
          expect(isUniquePhotoName(name)).toBe(true);
        });
        //名前は短く保つ（ZIP内のパス長、Windows の MAX_PATH）
        expect(names[0].length).toBe('EMAP_20261123_100000_ABCDEF.jpg'.length);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('createThumbnail', () => {
    it('should create a thumbnail with base64 encoding', async () => {
      mockManipulateAsync.mockResolvedValue({
        uri: 'mock://thumbnail.jpg',
        width: 150,
        height: 150,
        base64: 'mockBase64String',
      });

      const result = await Photo.createThumbnail('mock://original.jpg');

      expect(mockManipulateAsync).toHaveBeenCalledWith('mock://original.jpg', [{ resize: { height: 150 } }], {
        compress: 0.7,
        format: 1, // SaveFormat.JPEG
        base64: true,
      });
      expect(result).toBe('data:image/jpeg;base64,mockBase64String');
    });

    it('should return null if base64 is not available', async () => {
      mockManipulateAsync.mockResolvedValue({
        uri: 'mock://thumbnail.jpg',
        width: 150,
        height: 150,
      });

      const result = await Photo.createThumbnail('mock://original.jpg');

      expect(result).toBeNull();
    });
  });

  describe('saveToStorage', () => {
    it('should save file to storage without copying to media library', async () => {
      mockFileSystem.makeDirectoryAsync.mockResolvedValue(undefined);
      mockFileSystem.copyAsync.mockResolvedValue(undefined);

      const result = await Photo.saveToStorage('mock://source.jpg', 'photo.jpg', 'mock://folder');

      expect(mockFileSystem.makeDirectoryAsync).toHaveBeenCalledWith('mock://folder', { intermediates: true });
      expect(mockFileSystem.copyAsync).toHaveBeenCalledWith({
        from: 'mock://source.jpg',
        to: 'mock://folder/photo.jpg',
      });
      expect(result).toBe('mock://folder/photo.jpg');
    });

    it('should save file to storage and copy to media library when requested', async () => {
      mockFileSystem.makeDirectoryAsync.mockResolvedValue(undefined);
      mockFileSystem.copyAsync.mockResolvedValue(undefined);
      mockMediaLibrary.requestPermissionsAsync.mockResolvedValue({
        status: 'granted' as any,
        granted: true,
        canAskAgain: true,
        expires: 'never',
      });
      mockMediaLibrary.createAssetAsync.mockResolvedValue({
        id: 'asset-id',
        filename: 'photo.jpg',
        uri: 'mock://asset.jpg',
        mediaType: 'photo' as any,
        width: 100,
        height: 100,
        creationTime: 0,
        modificationTime: 0,
        duration: 0,
        albumId: 'album-id',
      });

      const result = await Photo.saveToStorage('mock://source.jpg', 'photo.jpg', 'mock://folder', { copy: true });

      expect(mockMediaLibrary.requestPermissionsAsync).toHaveBeenCalled();
      expect(mockMediaLibrary.createAssetAsync).toHaveBeenCalledWith('mock://folder/photo.jpg');
      expect(result).toBe('mock://folder/photo.jpg');
    });

    it('should keep the app-side copy even when saving to the camera roll fails', async () => {
      mockFileSystem.makeDirectoryAsync.mockResolvedValue(undefined);
      mockFileSystem.copyAsync.mockResolvedValue(undefined);
      mockMediaLibrary.requestPermissionsAsync.mockResolvedValue({ status: 'granted' } as any);
      mockMediaLibrary.createAssetAsync.mockRejectedValue(new Error('deprecated'));

      const result = await Photo.saveToStorage('mock://source.jpg', 'photo.jpg', 'mock://folder', { copy: true });

      expect(mockFileSystem.copyAsync).toHaveBeenCalledWith({ from: 'mock://source.jpg', to: 'mock://folder/photo.jpg' });
      expect(result).toBe('mock://folder/photo.jpg');
    });

    it('should not copy to media library if permission is denied', async () => {
      mockFileSystem.makeDirectoryAsync.mockResolvedValue(undefined);
      mockFileSystem.copyAsync.mockResolvedValue(undefined);
      mockMediaLibrary.requestPermissionsAsync.mockResolvedValue({
        status: 'denied' as any,
        granted: false,
        canAskAgain: false,
        expires: 'never',
      });

      await Photo.saveToStorage('mock://source.jpg', 'photo.jpg', 'mock://folder', { copy: true });

      expect(mockMediaLibrary.createAssetAsync).not.toHaveBeenCalled();
    });
  });

  describe('takePendingPhoto', () => {
    const ImagePicker = require('expo-image-picker');
    const originalOS = Platform.OS;
    afterEach(() => {
      (Platform as { OS: string }).OS = originalOS;
    });

    it('returns undefined on iOS without asking the picker', async () => {
      (Platform as { OS: string }).OS = 'ios';
      const result = await Photo.takePendingPhoto('mock://folder');
      expect(result).toBeUndefined();
      expect(ImagePicker.getPendingResultAsync).not.toHaveBeenCalled();
    });

    it('returns undefined when the picker has no pending result', async () => {
      (Platform as { OS: string }).OS = 'android';
      ImagePicker.getPendingResultAsync.mockResolvedValue(null);
      const result = await Photo.takePendingPhoto('mock://folder');
      expect(result).toBeUndefined();
    });

    it('saves the pending camera result like a normal capture', async () => {
      (Platform as { OS: string }).OS = 'android';
      ImagePicker.getPendingResultAsync.mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'mock://cache/img.jpg', width: 640, height: 480 }],
      });
      mockFileSystem.makeDirectoryAsync.mockResolvedValue(undefined);
      mockFileSystem.copyAsync.mockResolvedValue(undefined);
      mockMediaLibrary.requestPermissionsAsync.mockResolvedValue({ status: 'granted' } as any);
      mockMediaLibrary.createAssetAsync.mockResolvedValue({} as any);
      mockManipulateAsync.mockResolvedValue({ uri: 'mock://thumb.jpg', width: 150, height: 100, base64: 'abc' });

      const result = await Photo.takePendingPhoto('mock://folder');

      expect(result).toMatchObject({ width: 640, height: 480, thumbnail: 'data:image/jpeg;base64,abc' });
      expect(result?.name).toMatch(/^EMAP_\d{8}_\d{6}_[0-9A-HJKMNP-TV-Z]{6}\.jpg$/);
      expect(result?.uri).toBe(`mock://folder/${result?.name}`);
      expect(mockMediaLibrary.createAssetAsync).toHaveBeenCalledWith(result?.uri);
    });
  });

  describe('JPEG/PNG以外の写真（写真監査 P-H1）', () => {
    const ImagePicker = require('expo-image-picker');
    const originalOS = Platform.OS;
    beforeEach(() => {
      (Platform as { OS: string }).OS = 'ios';
      mockFileSystem.makeDirectoryAsync.mockResolvedValue(undefined);
      mockFileSystem.copyAsync.mockResolvedValue(undefined);
      mockFileSystem.deleteAsync.mockResolvedValue(undefined);
    });
    afterEach(() => {
      (Platform as { OS: string }).OS = originalOS;
      mockConverter.available = false;
    });

    it('ネイティブ変換が使えればそれで変換し、image-manipulatorは使わない（EXIFを残す）', async () => {
      mockConverter.available = true;
      mockConverter.convert.mockResolvedValueOnce(undefined);
      const result = await Photo.convertToUploadableJpeg('file:///a/x.heic');
      expect(result.isConverted).toBe(true);
      expect(result.uri).toMatch(/^file:\/\/\/cache\/photo_.+\.jpg$/);
      expect(mockConverter.convert).toHaveBeenCalledWith('file:///a/x.heic', result.uri, 0.9);
      expect(mockManipulateAsync).not.toHaveBeenCalled();
    });

    it('ネイティブ変換に失敗したらimage-manipulatorで変換する', async () => {
      mockConverter.available = true;
      mockConverter.convert.mockRejectedValueOnce(new Error('cannot read'));
      mockManipulateAsync.mockResolvedValueOnce({ uri: 'file:///cache/conv.jpg', width: 1, height: 1 });
      const result = await Photo.convertToUploadableJpeg('ph://ABC');
      expect(result).toEqual({ uri: 'file:///cache/conv.jpg', isConverted: true });
      //書きかけの出力は消す
      expect(mockFileSystem.deleteAsync).toHaveBeenCalledWith(expect.stringMatching(/^file:\/\/\/cache\/photo_/), {
        idempotent: true,
      });
    });

    it('書き出し時のHEIC変換もネイティブ変換を使う', async () => {
      mockConverter.available = true;
      mockConverter.convert.mockResolvedValueOnce(undefined);
      const result = await Photo.convertPhotoForExport('file:///a/IMG_1.HEIC', 'IMG_1.HEIC');
      expect(result.isConverted).toBe(true);
      expect(result.filename).toBe('IMG_1.jpg');
      expect(mockManipulateAsync).not.toHaveBeenCalled();
    });

    it('中身がHEIFなら名前が.jpegでも変換する（AndroidのライブラリはHEIFを.jpegで返す）', async () => {
      //HEIF: 先頭4バイトのあとに ftyp
      mockFileSystem.readAsStringAsync.mockResolvedValueOnce(Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]).toString('base64'));
      mockManipulateAsync.mockResolvedValueOnce({ uri: 'file:///cache/conv.jpg', width: 1, height: 1 });
      const result = await Photo.convertToUploadableJpeg('file:///cache/ImagePicker/x.jpeg');
      expect(result).toEqual({ uri: 'file:///cache/conv.jpg', isConverted: true });
    });

    it('中身がJPEGなら変換しない', async () => {
      mockFileSystem.readAsStringAsync.mockResolvedValueOnce(Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0, 0, 0, 0]).toString('base64'));
      const result = await Photo.convertToUploadableJpeg('file:///a/x.jpg');
      expect(result).toEqual({ uri: 'file:///a/x.jpg', isConverted: false });
      expect(mockManipulateAsync).not.toHaveBeenCalled();
    });

    it('アップロードできる拡張子はjpg/jpeg/pngだけ', () => {
      expect(Photo.isUploadablePhotoPath('file:///a/EMAP_1.jpg')).toBe(true);
      expect(Photo.isUploadablePhotoPath('file:///a/EMAP_1.JPEG')).toBe(true);
      expect(Photo.isUploadablePhotoPath('file:///a/EMAP_1.png')).toBe(true);
      expect(Photo.isUploadablePhotoPath('file:///a/EMAP_1.heic')).toBe(false);
      expect(Photo.isUploadablePhotoPath('file:///a/EMAP_1.webp')).toBe(false);
      expect(Photo.isUploadablePhotoPath('file:///a/EMAP_1')).toBe(false);
    });

    it('JPEGはそのまま返し、変換しない', async () => {
      const result = await Photo.convertToUploadableJpeg('file:///a/x.jpg');
      expect(result).toEqual({ uri: 'file:///a/x.jpg', isConverted: false });
      expect(mockManipulateAsync).not.toHaveBeenCalled();
    });

    it('HEICはJPEGの一時ファイルに変換する', async () => {
      mockManipulateAsync.mockResolvedValueOnce({ uri: 'file:///cache/conv.jpg', width: 1, height: 1 });
      const result = await Photo.convertToUploadableJpeg('file:///a/x.heic');
      expect(result).toEqual({ uri: 'file:///cache/conv.jpg', isConverted: true });
      expect(mockManipulateAsync).toHaveBeenCalledWith('file:///a/x.heic', [], { compress: 0.9, format: 1 });
    });

    it('変換に失敗したら元のまま返す（写真は捨てない）', async () => {
      mockManipulateAsync.mockRejectedValueOnce(new Error('decode failed'));
      const result = await Photo.convertToUploadableJpeg('file:///a/x.heic');
      expect(result).toEqual({ uri: 'file:///a/x.heic', isConverted: false });
    });

    it('ライブラリのHEICは.jpgとして保存し、変換の一時ファイルを消す', async () => {
      ImagePicker.launchImageLibraryAsync.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: 'file:///picker/IMG_1.heic', width: 400, height: 300 }],
      });
      mockManipulateAsync
        .mockResolvedValueOnce({ uri: 'file:///cache/conv.jpg', width: 400, height: 300 })
        .mockResolvedValueOnce({ uri: 'file:///cache/thumb.jpg', width: 150, height: 100, base64: 'abc' });

      const result = await Photo.pickImage('file:///photos');

      expect(result?.name).toMatch(/^EMAP_\d{8}_\d{6}_[0-9A-HJKMNP-TV-Z]{6}\.jpg$/);
      expect(mockFileSystem.copyAsync).toHaveBeenCalledWith({ from: 'file:///cache/conv.jpg', to: `file:///photos/${result?.name}` });
      expect(mockFileSystem.deleteAsync).toHaveBeenCalledWith('file:///cache/conv.jpg', { idempotent: true });
      expect(result?.uri).toBe(`file:///photos/${result?.name}`);
    });

    it('ライブラリのJPEGは再圧縮せずそのまま保存する', async () => {
      ImagePicker.launchImageLibraryAsync.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: 'file:///picker/IMG_2.jpg', width: 400, height: 300 }],
      });
      mockManipulateAsync.mockResolvedValueOnce({ uri: 'file:///cache/thumb.jpg', width: 150, height: 100, base64: 'abc' });

      const result = await Photo.pickImage('file:///photos');

      expect(result?.name).toMatch(/\.jpg$/);
      expect(mockFileSystem.copyAsync).toHaveBeenCalledWith({ from: 'file:///picker/IMG_2.jpg', to: `file:///photos/${result?.name}` });
      //サムネイル作成の1回だけ
      expect(mockManipulateAsync).toHaveBeenCalledTimes(1);
    });
  });

  describe('撮影・選択の権限（写真監査 P-M2）', () => {
    const ImagePicker = require('expo-image-picker');
    const originalOS = Platform.OS;
    beforeEach(() => {
      (Platform as { OS: string }).OS = 'ios';
      mockFileSystem.makeDirectoryAsync.mockResolvedValue(undefined);
      mockFileSystem.copyAsync.mockResolvedValue(undefined);
      mockMediaLibrary.requestPermissionsAsync.mockResolvedValue({ status: 'denied' } as any);
      mockManipulateAsync.mockResolvedValue({ uri: 'file:///cache/thumb.jpg', width: 150, height: 100, base64: 'abc' });
    });
    afterEach(() => {
      (Platform as { OS: string }).OS = originalOS;
      ImagePicker.requestCameraPermissionsAsync.mockImplementation(() => Promise.resolve({ status: 'granted' }));
    });

    it('撮影は写真ライブラリの権限を求めず、カメラの権限だけで撮れる', async () => {
      ImagePicker.launchCameraAsync.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: 'file:///cache/cam.jpg', width: 640, height: 480 }],
      });
      const result = await Photo.takePhoto('file:///photos');
      expect(ImagePicker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
      expect(ImagePicker.requestCameraPermissionsAsync).toHaveBeenCalledTimes(1);
      expect(Photo.isPhotoPermissionDenied(result)).toBe(false);
      expect(result).toMatchObject({ width: 640, height: 480 });
    });

    it('カメラの権限が拒否されたら理由を返し、カメラは起動しない', async () => {
      ImagePicker.requestCameraPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });
      const result = await Photo.takePhoto('file:///photos');
      expect(result).toEqual({ permissionDenied: 'camera' });
      expect(Photo.isPhotoPermissionDenied(result)).toBe(true);
      expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
    });

    it('ネイティブが権限なしで撮影を断った例外（Android 9以下のストレージなど）も理由を返す', async () => {
      ImagePicker.launchCameraAsync.mockRejectedValueOnce(
        Object.assign(new Error('User rejected permissions'), { code: 'ERR_USER_REJECTED_PERMISSIONS' })
      );
      const result = await Photo.takePhoto('file:///photos');
      expect(result).toEqual({ permissionDenied: 'camera' });
    });

    it('権限以外の失敗は従来どおりundefined', async () => {
      ImagePicker.launchCameraAsync.mockRejectedValueOnce(new Error('boom'));
      const result = await Photo.takePhoto('file:///photos');
      expect(result).toBeUndefined();
    });

    it('ライブラリからの選択は写真ライブラリの権限を求めない', async () => {
      ImagePicker.launchImageLibraryAsync.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: 'file:///picker/IMG_3.jpg', width: 400, height: 300 }],
      });
      const result = await Photo.pickImage('file:///photos');
      expect(ImagePicker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
      expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1);
      expect(result?.uri).toBe(`file:///photos/${result?.name}`);
    });
  });

  describe('deleteLocalPhoto', () => {
    it('should delete local photo on mobile', async () => {
      mockFileSystem.deleteAsync.mockResolvedValue(undefined);

      await Photo.deleteLocalPhoto('file:///docs/projects/P1/L1/U1/photo.jpg');

      expect(mockFileSystem.deleteAsync).toHaveBeenCalledWith('file:///docs/projects/P1/L1/U1/photo.jpg', {
        idempotent: true,
      });
    });

    it('写真フォルダの外を指すuri（他メンバーのレコード由来）は削除しない', async () => {
      await Photo.deleteLocalPhoto('file:///docs/SQLite/dictionary.db');
      await Photo.deleteLocalPhoto('file:///docs/projects/../mmkv/state');
      await Photo.deleteLocalPhoto('file:///docs/projects/%2e%2e/mmkv/state');
      await Photo.deleteLocalPhoto('file:///docs/projects');

      expect(mockFileSystem.deleteAsync).not.toHaveBeenCalled();
    });

    it('should not delete photo on web platform', async () => {
      (Platform as any).OS = 'web';

      await Photo.deleteLocalPhoto('mock://photo.jpg');

      expect(mockFileSystem.deleteAsync).not.toHaveBeenCalled();

      // Restore platform
      (Platform as any).OS = 'ios';
    });
  });

  describe('deleteRecordPhotos', () => {
    it('should delete all photos in record', async () => {
      const mockLayer: LayerType = {
        id: 'layer-1',
        name: 'Test Layer',
        type: 'POINT',
        permission: 'PRIVATE',
        colorStyle: {
          colorType: 'SINGLE',
          transparency: 0.8,
          color: '#FF0000',
          fieldName: '',
          customFieldValue: '',
          colorRamp: 'RANDOM',
          colorList: [],
        },
        label: '',
        visible: true,
        active: true,
        field: [],
      };

      const mockPhotos: PhotoType[] = [
        {
          id: 'photo-1',
          uri: 'file:///docs/projects/P1/L1/U1/photo1.jpg',
          url: null,
          key: null,
          thumbnail: 'data:image/jpeg;base64,thumb1',
          name: 'photo1.jpg',
          width: 100,
          height: 100,
        },
        {
          id: 'photo-2',
          uri: 'file:///docs/projects/P1/L1/U1/photo2.jpg',
          url: null,
          key: null,
          thumbnail: 'data:image/jpeg;base64,thumb2',
          name: 'photo2.jpg',
          width: 200,
          height: 200,
        },
      ];

      const mockRecord: RecordType = {
        id: 'record-1',
        userId: 'user-1',
        displayName: 'Test User',
        visible: true,
        redraw: false,
        coords: { latitude: 35, longitude: 135 },
        field: {
          photos: mockPhotos,
        },
      };

      mockGetPhotoFields.mockReturnValue([{ id: 'photos', name: 'photos', format: 'PHOTO' as any }]);
      mockFileSystem.deleteAsync.mockResolvedValue(undefined);

      Photo.deleteRecordPhotos(mockLayer, mockRecord);

      expect(mockGetPhotoFields).toHaveBeenCalledWith(mockLayer);
      expect(mockFileSystem.deleteAsync).toHaveBeenCalledTimes(2);
      expect(mockFileSystem.deleteAsync).toHaveBeenCalledWith('file:///docs/projects/P1/L1/U1/photo1.jpg', { idempotent: true });
      expect(mockFileSystem.deleteAsync).toHaveBeenCalledWith('file:///docs/projects/P1/L1/U1/photo2.jpg', { idempotent: true });
    });

    it('should handle empty photo fields', () => {
      const mockLayer: LayerType = {
        id: 'layer-1',
        name: 'Test Layer',
        type: 'POINT',
        permission: 'PRIVATE',
        colorStyle: {
          colorType: 'SINGLE',
          transparency: 0.8,
          color: '#FF0000',
          fieldName: '',
          customFieldValue: '',
          colorRamp: 'RANDOM',
          colorList: [],
        },
        label: '',
        visible: true,
        active: true,
        field: [],
      };

      const mockRecord: RecordType = {
        id: 'record-1',
        userId: 'user-1',
        displayName: 'Test User',
        visible: true,
        redraw: false,
        coords: { latitude: 35, longitude: 135 },
        field: {},
      };

      mockGetPhotoFields.mockReturnValue([]);

      Photo.deleteRecordPhotos(mockLayer, mockRecord);

      expect(mockFileSystem.deleteAsync).not.toHaveBeenCalled();
    });
  });
  describe('hasLocalPhotoFile', () => {
    it('uriが無ければfalse', async () => {
      expect(await Photo.hasLocalPhotoFile(null)).toBe(false);
      expect(await Photo.hasLocalPhotoFile(undefined)).toBe(false);
      expect(mockFileSystem.getInfoAsync).not.toHaveBeenCalled();
    });

    it('ファイルが存在すればtrue', async () => {
      mockFileSystem.getInfoAsync.mockResolvedValue({ exists: true } as any);
      expect(await Photo.hasLocalPhotoFile('file:///photos/a.jpg')).toBe(true);
      expect(mockFileSystem.getInfoAsync).toHaveBeenCalledWith('file:///photos/a.jpg');
    });

    it('ファイルが無い・確認に失敗した場合はfalse', async () => {
      mockFileSystem.getInfoAsync.mockResolvedValueOnce({ exists: false } as any);
      expect(await Photo.hasLocalPhotoFile('file:///photos/gone.jpg')).toBe(false);
      mockFileSystem.getInfoAsync.mockRejectedValueOnce(new Error('boom'));
      expect(await Photo.hasLocalPhotoFile('file:///photos/err.jpg')).toBe(false);
    });
  });
});
