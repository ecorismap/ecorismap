// Mock dependencies first
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 1 },
}));
jest.mock('expo-media-library', () => ({
  requestPermissionsAsync: jest.fn(),
  createAssetAsync: jest.fn(),
  MediaTypeValue: { photo: 'photo' },
}));
jest.mock('expo-file-system/legacy', () => ({
  makeDirectoryAsync: jest.fn(),
  copyAsync: jest.fn(),
  deleteAsync: jest.fn(),
  EncodingType: { UTF8: 'UTF8' },
}));
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));
jest.mock('../Layer', () => ({
  getPhotoFields: jest.fn(),
}));

import * as Photo from '../Photo';
import { manipulateAsync } from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library';
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

  describe('deleteLocalPhoto', () => {
    it('should delete local photo on mobile', async () => {
      mockFileSystem.deleteAsync.mockResolvedValue(undefined);

      await Photo.deleteLocalPhoto('mock://photo.jpg');

      expect(mockFileSystem.deleteAsync).toHaveBeenCalledWith('mock://photo.jpg', { idempotent: true });
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
          uri: 'mock://photo1.jpg',
          url: null,
          key: null,
          thumbnail: 'data:image/jpeg;base64,thumb1',
          name: 'photo1.jpg',
          width: 100,
          height: 100,
        },
        {
          id: 'photo-2',
          uri: 'mock://photo2.jpg',
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
      expect(mockFileSystem.deleteAsync).toHaveBeenCalledWith('mock://photo1.jpg', { idempotent: true });
      expect(mockFileSystem.deleteAsync).toHaveBeenCalledWith('mock://photo2.jpg', { idempotent: true });
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
});
