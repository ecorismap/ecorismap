import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import dayjs from '../i18n/dayjs';
import { getPhotoFields } from './Layer';
import { LayerType, PhotoType, RecordType } from '../types';

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
    const res = await MediaLibrary.requestPermissionsAsync();
    if (res.status === 'granted') {
      await MediaLibrary.createAssetAsync(newUri);
    }
  }

  return newUri;
};

export const deleteLocalPhoto = async (uri: string) => {
  if (Platform.OS === 'web') return;
  await FileSystem.deleteAsync(uri, { idempotent: true });
};

export const deleteRecordPhotos = (layer: LayerType, record: RecordType) => {
  const photoFields = getPhotoFields(layer);

  for (const { name } of photoFields) {
    (record.field[name] as PhotoType[]).forEach((photo) => {
      if (photo.uri) deleteLocalPhoto(photo.uri);
    });
  }
};

export const pickImage = async (photoFolder: string) => {
  try {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      //aspect: [4, 3],
      quality: 1,
    });
    if (result.canceled) return;

    let extension;
    let name;
    let uri;
    //ImagePickerのバグのためwebに処理を追加
    //https://github.com/expo/expo/issues/9984
    uri = result.assets[0].uri;
    if (Platform.OS === 'web') {
      extension = uri.split(';')[0].split('/')[1];
      name = `EMAP_${dayjs().format('YYYYMMDD_HHmmss')}.${extension}`;
      const res = await fetch(uri);
      const blob = await res.blob();
      uri = URL.createObjectURL(blob);
      //写真のデータそのもの。変更可能？
    } else {
      extension = uri.split('.').pop();
      name = `EMAP_${dayjs().format('YYYYMMDD_HHmmss')}.${extension}`;
      uri = await saveToStorage(uri, name, photoFolder);
    }
    const thumbnail = await createThumbnail(uri);
    const width = result.assets[0].width;
    const height = result.assets[0].height;
    return { uri, thumbnail, name, width, height };
  } catch (error) {
    console.log(error);
  }
};

export const takePhoto = async (photoFolder: string) => {
  try {
    let res = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (res.status !== 'granted') return;
    res = await ImagePicker.requestCameraPermissionsAsync();
    if (res.status !== 'granted') return;
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      exif: true,
    });
    if (result.canceled) return;
    let uri = result.assets[0].uri;
    const extension = uri.split('.').pop();
    const name = `EMAP_${dayjs().format('YYYYMMDD_HHmmss')}.${extension}`;
    uri = await saveToStorage(uri, name, photoFolder, { copy: true });
    const width = result.assets[0].width;
    const height = result.assets[0].height;
    const thumbnail = await createThumbnail(uri);
    return { uri, thumbnail, name, width, height };
  } catch (e) {
    console.log(e);
  }
};
