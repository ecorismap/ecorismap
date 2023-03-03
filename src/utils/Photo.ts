import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';

export const createThumbnail = async (uri: string) => {
  const thumbnail = await manipulateAsync(uri, [{ resize: { height: 150 } }], {
    compress: 0.7,
    format: SaveFormat.JPEG,
    base64: true,
  });

  return thumbnail.base64 ? `data:image/jpeg;base64,${thumbnail.base64}` : null;
};

export const saveToStorage = async (fileUri: string, fileName: string, folder: string, options?: { copy: boolean }) => {
  await FileSystem.makeDirectoryAsync(folder, {
    intermediates: true,
  });
  const newUri = folder + '/' + fileName;
  await FileSystem.copyAsync({ from: fileUri, to: newUri });
  if (options && options.copy) {
    await MediaLibrary.createAssetAsync(newUri);
  }

  return newUri;
};
