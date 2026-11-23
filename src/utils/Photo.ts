import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import dayjs from '../i18n/dayjs';
import { getPhotoFields } from './Layer';
import { LayerType, PhotoType, RecordType } from '../types';
import { PHOTO_FOLDER } from '../constants/AppConstants';
import { isUriInsideFolder } from './safePath';
import { convertPhotoToJpeg, isPhotoConverterAvailable } from '../../modules/photo-converter/src';
import { ulid } from 'ulid';
import { PHOTO_NAME_UNIQUE_LENGTH } from './photoDownloadPath';

/**
 * 撮影・選択した写真の名前。秒単位の日時だけだと、同じアカウントの2台で同じ秒に撮った写真が同じ名前・同じ保存先になり、
 * 取得したときに片方の原画を指してしまう（写真監査 P-L15）。ULID の乱数部の末尾を足して重ならないようにする。
 * ZIP に入れるパスが長いと Windows で解凍できないので、足すのは数文字にとどめる
 */
export const createPhotoName = (extension: string | undefined): string =>
  `EMAP_${dayjs().format('YYYYMMDD_HHmmss')}_${ulid().slice(-PHOTO_NAME_UNIQUE_LENGTH)}.${extension ?? 'jpg'}`;

// 写真の実ファイルが端末（Webではブラウザ）に存在するか。
// クラウドから取得したレコードは未ダウンロードだとuriがnull、ダウンロード済みでも
// 端末を変えるとファイルが無いことがあるため、表示前に確認する
export const hasLocalPhotoFile = async (uri: string | null | undefined): Promise<boolean> => {
  if (!uri) return false;
  if (Platform.OS === 'web') {
    if (!uri.startsWith('blob:')) return false;
    try {
      const response = await fetch(uri);
      return response.ok;
    } catch (error) {
      return false;
    }
  }
  try {
    const fileInfo = await FileSystem.getInfoAsync(uri);
    return fileInfo.exists;
  } catch (error) {
    return false;
  }
};

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
    const converted = await convertToJpegFile(uri);
    return {
      uri: converted,
      filename: filename.replace(/\.(heic|heif)$/i, '.jpg'),
      isConverted: true,
    };
  } catch (e) {
    // 変換に失敗したら元のファイルをそのまま使う（表示できない可能性は残るが出力はされる）
    return { uri, filename, isConverted: false };
  }
};

// Storage Rules（isValidPhotoContentType）が通すのは image/jpeg と image/png だけ。
// ネイティブの putFile は拡張子から contentType を決めるので、拡張子で判定する
const UPLOADABLE_PHOTO_EXT = /\.(jpe?g|png)$/i;
export const isUploadablePhotoPath = (pathOrName: string) => UPLOADABLE_PHOTO_EXT.test(pathOrName.split('?')[0]);

/**
 * 画像をJPEGの一時ファイルに変換する。ネイティブでは元のEXIF（撮影位置・撮影日時・機種・向き）を
 * 引き継ぐ（photo-converter）。expo-image-manipulatorはEXIFを落とすので、ネイティブモジュールが無い
 * 環境（Web・モジュールを含まない古いビルド）でだけ使う
 */
const convertToJpegFile = async (uri: string): Promise<string> => {
  if (Platform.OS !== 'web' && isPhotoConverterAvailable()) {
    const id = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const dst = `${FileSystem.cacheDirectory}photo_${id}.jpg`;
    try {
      await convertPhotoToJpeg(uri, dst, 0.9);
      return dst;
    } catch (e) {
      //ファイルとして読めないuri（iOSのph://など）はimage-manipulatorで変換する（EXIFは落ちる）
      console.log('convertToJpegFile: native conversion failed, falling back', e);
      await deletePhotoFile(dst);
    }
  }
  const converted = await manipulateAsync(uri, [], { compress: 0.9, format: SaveFormat.JPEG });
  return converted.uri;
};

/**
 * ファイルの先頭のバイトがJPEGかPNGか。分からないとき（読めない・Web）はundefined。
 * AndroidのライブラリはHEIFを中身のまま「.jpeg」の名前で返すので、拡張子だけでは判断できない
 */
const isJpegOrPngContent = async (uri: string): Promise<boolean | undefined> => {
  if (Platform.OS === 'web' || !uri.startsWith('file:')) return undefined;
  try {
    const head = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
      position: 0,
      length: 8,
    });
    const bytes = Uint8Array.from(atob(head), (c) => c.charCodeAt(0));
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    return isJpeg || isPng;
  } catch {
    return undefined;
  }
};

/**
 * JPEG/PNG以外（iPhoneのHEIC、AndroidのHEIF、WebP、GIFなど）をJPEGに変換する。
 * そのままではアップロードがRulesで拒否されるか（拡張子がheic等）、jpegの名前でHEIFが上がって
 * Web等で表示できない（写真監査 P-H1・P-L1）。中身で判断し、読めないときは拡張子で判断する。
 * 変換した場合はisConverted=trueで、uriは一時ファイル。呼び出し側が後始末する。
 * 変換できなければ元のまま返す（端末内では使えるので、写真自体は捨てない）
 */
export const convertToUploadableJpeg = async (uri: string): Promise<{ uri: string; isConverted: boolean }> => {
  const byContent = await isJpegOrPngContent(uri);
  if (byContent ?? isUploadablePhotoPath(uri)) return { uri, isConverted: false };
  try {
    return { uri: await convertToJpegFile(uri), isConverted: true };
  } catch (e) {
    console.log('convertToUploadableJpeg: failed', e);
    return { uri, isConverted: false };
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
      // Android 13+で読み取り権限まで要求すると、「選択した写真のみ許可」の利用者には撮影の
      // たびに写真選択画面（完了ボタン付き）が出る。保存は書き込み権限だけで足りるので書き込み
      // のみを要求する。iOSは軌跡写真の読み取り権限と同じダイアログを共有するため従来どおり
      const res = await MediaLibrary.requestPermissionsAsync(Platform.OS === 'android');
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
  // 他メンバーのレコードのuriは送り手の端末のパスがそのまま届く。写真フォルダの外は消さない
  if (!isUriInsideFolder(uri, PHOTO_FOLDER)) return;
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

// 撮影を権限の拒否で止めたときに返す。呼び出し側が「設定で許可してください」と案内する
export type PhotoPermissionDenied = { permissionDenied: 'camera' };

export const isPhotoPermissionDenied = (value: unknown): value is PhotoPermissionDenied =>
  typeof value === 'object' && value !== null && 'permissionDenied' in value;

// ネイティブがカメラ（Android 9以下はストレージも）の権限なしで撮影を断ったときの例外コード
const CAMERA_PERMISSION_ERROR_CODES = ['ERR_USER_REJECTED_PERMISSIONS', 'ERR_MISSING_CAMERA_PERMISSION'];

// ライブラリからの選択には写真ライブラリの権限を求めない。iOS 14以降はPHPicker、Androidは
// システムの写真選択（PickVisualMedia）を使い、どちらも選んだ写真だけをアプリへ渡すので権限が
// 要らない（expo-image-picker 56のネイティブはlaunchImageLibraryAsyncで権限を確かめない）。
// 以前は権限を求めて拒否されると何も起きず、案内も出なかった（写真監査 P-M2）
export const pickImage = async (photoFolder: string) => {
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      //aspect: [4, 3],
      quality: 1,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    let extension: string | undefined;
    let name;
    let uri = asset.uri;
    if (Platform.OS === 'web') {
      //Webはblob:かdata:のURLで返り、拡張子を持たない。種類はmimeTypeから取る
      extension = (asset.mimeType ?? uri.split(';')[0].split(':')[1] ?? '').split('/')[1];
      if (extension !== 'jpeg' && extension !== 'png') {
        //WebP・GIFなどはJPEGにしないとアップロードがRulesで拒否される（写真監査 P-H1）
        const converted = await manipulateAsync(uri, [], { compress: 0.9, format: SaveFormat.JPEG });
        uri = converted.uri;
        extension = 'jpeg';
      }
      name = createPhotoName(extension);
      const res = await fetch(uri);
      const blob = await res.blob();
      uri = URL.createObjectURL(blob);
    } else {
      //iPhoneのライブラリの写真はHEICのまま返る。JPEG/PNG以外はJPEGにして保存する（写真監査 P-H1）
      const { uri: source, isConverted } = await convertToUploadableJpeg(uri);
      extension = isConverted ? 'jpg' : uri.split('.').pop();
      name = createPhotoName(extension);
      uri = await saveToStorage(source, name, photoFolder);
      if (isConverted) await deletePhotoFile(source);
    }
    const thumbnail = await createThumbnail(uri);
    const width = asset.width;
    const height = asset.height;
    return { uri, thumbnail, name, width, height };
  } catch (error) {
    console.log(error);
  }
};

// カメラが返した画像をアプリ内フォルダへ保存し、カメラロールにもコピーしてサムネイルを作る。
// takePhoto（通常の流れ）と、Androidでカメラ起動中にActivityが破棄された後に
// getPendingResultAsyncで回収した結果の両方から使う
export const saveCapturedPhoto = async (asset: ImagePicker.ImagePickerAsset, photoFolder: string) => {
  //カメラは通常JPEGを返すが、端末の設定でHEIFになることがある。その場合もJPEGにそろえる（写真監査 P-H1）
  const { uri: source, isConverted } = await convertToUploadableJpeg(asset.uri);
  const extension = isConverted ? 'jpg' : asset.uri.split('.').pop();
  const name = createPhotoName(extension);
  const uri = await saveToStorage(source, name, photoFolder, { copy: true });
  if (isConverted) await deletePhotoFile(source);
  const thumbnail = await createThumbnail(uri);
  return { uri, thumbnail, name, width: asset.width, height: asset.height };
};

// 撮影にはカメラの権限だけを求める。カメラロールへのコピーはsaveToStorageが自分で書き込み権限を
// 取り、拒否されてもアプリ内には保存するので、写真ライブラリの権限で撮影を止める理由はない（写真監査 P-M2）。
// 拒否されたときは理由を返し、呼び出し側が設定を促す
export const takePhoto = async (photoFolder: string) => {
  try {
    const res = await ImagePicker.requestCameraPermissionsAsync();
    if (res.status !== 'granted') return { permissionDenied: 'camera' } as PhotoPermissionDenied;
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      exif: true,
    });
    if (result.canceled) return;
    return await saveCapturedPhoto(result.assets[0], photoFolder);
  } catch (e) {
    //Android 9以下はネイティブがストレージの権限も必須にしており、拒否されると例外になる
    const code = (e as { code?: unknown } | null)?.code;
    if (typeof code === 'string' && CAMERA_PERMISSION_ERROR_CODES.includes(code)) {
      return { permissionDenied: 'camera' } as PhotoPermissionDenied;
    }
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
