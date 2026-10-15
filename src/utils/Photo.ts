import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
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

// 端末ライブラリの写真（iOSのph:// URI）は、New ArchitectureのRNのImageでは読めない
// （ph://を扱うRCTImageURLLoaderがコード生成の登録対象外）。PhotoKitから直接読める
// expo-image-manipulatorで拡大表示用のJPEGを一時ファイルへ書き出して肩代わりする。
// ズームしても粗くならないよう縮小はせず、原画の解像度のまま書き出す
export const createPreviewImage = async (uri: string) => {
  const preview = await manipulateAsync(uri, [], {
    compress: 0.9,
    format: SaveFormat.JPEG,
  });
  return preview.uri;
};

// HEIC/HEIFはGoogle Earth・QGIS等で表示できないため、エクスポート時にJPEGへ変換する。
// 変換した場合はisConverted=trueを返すので、呼び出し側は一時ファイルを後始末すること。
// JPEG等はそのまま返す（再圧縮による劣化と処理時間を避ける）
export const convertPhotoForExport = async (
  uri: string,
  filename: string
): Promise<{ uri: string; filename: string; isConverted: boolean }> => {
  if (!/\.(heic|heif)$/i.test(filename)) return { uri, filename, isConverted: false };
  try {
    const converted = await manipulateAsync(uri, [], { compress: 0.9, format: SaveFormat.JPEG });
    return {
      uri: converted.uri,
      filename: filename.replace(/\.(heic|heif)$/i, '.jpg'),
      isConverted: true,
    };
  } catch (e) {
    // 変換に失敗したら元のファイルをそのまま使う（表示できない可能性は残るが出力はされる）
    return { uri, filename, isConverted: false };
  }
};

// 一時ファイルの削除（存在しなくてもエラーにしない）
export const deletePhotoFile = async (uri: string) => {
  if (Platform.OS === 'web') return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // 後片付けの失敗は無視する
  }
};

export const saveToStorage = async (fileUri: string, fileName: string, folder: string, options?: { copy: boolean }) => {
  await FileSystem.makeDirectoryAsync(folder, {
    intermediates: true,
  });
  const newUri = folder + '/' + fileName;
  await FileSystem.copyAsync({ from: fileUri, to: newUri });
  if (options && options.copy && Platform.OS !== 'web') {
    // SDK 56: expo-media-library eagerly requires the native ExpoMediaLibraryNext module at
    // import time, which throws on web. Require it lazily and only on native (camera-roll save
    // is native-only anyway); the module factory then never runs in the web bundle.
    // ルートの"expo-media-library"が返すcreateAssetAsync等は非推奨スタブで、呼ぶと例外を投げる
    // （SDK 56）。従来の関数APIは"/legacy"から読み込む。
    // カメラロールへのコピーは付加的な処理なので、失敗してもアプリ内保存した写真は捨てない
    try {
      const MediaLibrary = require('expo-media-library/legacy') as typeof import('expo-media-library/legacy');
      const res = await MediaLibrary.requestPermissionsAsync();
      if (res.status === 'granted') {
        await MediaLibrary.createAssetAsync(newUri);
      }
    } catch (e) {
      console.log('saveToStorage: failed to save to camera roll', e);
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

// カメラが返した画像をアプリ内フォルダへ保存し、カメラロールにもコピーしてサムネイルを作る。
// takePhoto（通常の流れ）と、Androidでカメラ起動中にActivityが破棄された後に
// getPendingResultAsyncで回収した結果の両方から使う
export const saveCapturedPhoto = async (asset: ImagePicker.ImagePickerAsset, photoFolder: string) => {
  const extension = asset.uri.split('.').pop();
  const name = `EMAP_${dayjs().format('YYYYMMDD_HHmmss')}.${extension}`;
  const uri = await saveToStorage(asset.uri, name, photoFolder, { copy: true });
  const thumbnail = await createThumbnail(uri);
  return { uri, thumbnail, name, width: asset.width, height: asset.height };
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
    return await saveCapturedPhoto(result.assets[0], photoFolder);
  } catch (e) {
    console.log(e);
  }
};

// Androidでは、カメラ起動中にシステムがMainActivityを破棄することがある（メモリ不足や
// 開発者オプション「アクティビティを保持しない」）。この場合、launchCameraAsyncのPromiseは
// 戻ってこず、結果はexpo-image-picker側に保留される。復帰後にここで回収する。
// 結果がない（未発生・キャンセル・プロセス終了）場合はundefinedを返す
export const takePendingPhoto = async (photoFolder: string) => {
  if (Platform.OS !== 'android') return;
  try {
    const result = await ImagePicker.getPendingResultAsync();
    if (result === null || !('assets' in result) || result.canceled || result.assets.length === 0) return;
    return await saveCapturedPhoto(result.assets[0], photoFolder);
  } catch (e) {
    console.log(e);
  }
};
