import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import dayjs from '../i18n/dayjs';

// Android用: 軌跡写真のフォトピッカー取り込み。
// Playの写真と動画の権限ポリシーによりREAD_MEDIA_IMAGESが使えないため、
// システムのフォトピッカーで選んだ写真をアプリ内へコピーし、EXIFの撮影時刻を索引にして
// プールとして保持する。表示側（useTrackPhotos）はiOSのライブラリ走査と同じく
// 「軌跡の記録時間帯に撮影時刻が入る写真」をプールから照合する。

export interface ImportedTrackPhoto {
  id: string;
  filename: string;
  uri: string;
  timestamp: number;
  width: number;
  height: number;
}

const TRACK_PHOTO_FOLDER = `${FileSystem.documentDirectory}track_photos`;
const INDEX_FILE = `${TRACK_PHOTO_FOLDER}/index.json`;

export const loadImportedTrackPhotos = async (): Promise<ImportedTrackPhoto[]> => {
  try {
    const info = await FileSystem.getInfoAsync(INDEX_FILE);
    if (!info.exists) return [];
    const json = await FileSystem.readAsStringAsync(INDEX_FILE);
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed as ImportedTrackPhoto[];
  } catch {
    return [];
  }
};

const saveIndex = async (photos: ImportedTrackPhoto[]) => {
  await FileSystem.makeDirectoryAsync(TRACK_PHOTO_FOLDER, { intermediates: true });
  await FileSystem.writeAsStringAsync(INDEX_FILE, JSON.stringify(photos));
};

// EXIFの撮影日時（"YYYY:MM:DD HH:mm:ss"・端末ローカル時刻）をエポックmsへ。
// 軌跡のtimestampもエポックmsなのでそのまま照合できる
const parseExifTimestamp = (exif: Record<string, any> | undefined): number | undefined => {
  const value = exif?.DateTimeOriginal ?? exif?.DateTimeDigitized ?? exif?.DateTime;
  if (typeof value !== 'string') return undefined;
  const parsed = dayjs(value, 'YYYY:MM:DD HH:mm:ss');
  return parsed.isValid() ? parsed.valueOf() : undefined;
};

// フォトピッカーで選んだ写真をプールへ取り込む。キャンセル時はundefined。
// 撮影時刻がEXIFから取れない写真は照合できないためスキップして数を返す
export const importTrackPhotosFromPicker = async (): Promise<
  { imported: number; skipped: number } | undefined
> => {
  if (Platform.OS !== 'android') return undefined;
  // Android 13以降はシステムのフォトピッカーが使われるため権限は不要
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsMultipleSelection: true,
    selectionLimit: 0,
    quality: 1,
    exif: true,
  });
  if (result.canceled) return undefined;

  const existing = await loadImportedTrackPhotos();
  const existingKeys = new Set(existing.map((p) => `${p.filename}:${p.timestamp}`));
  await FileSystem.makeDirectoryAsync(TRACK_PHOTO_FOLDER, { intermediates: true });

  let imported = 0;
  let skipped = 0;
  const added: ImportedTrackPhoto[] = [];
  for (const asset of result.assets) {
    const timestamp = parseExifTimestamp(asset.exif ?? undefined);
    if (timestamp === undefined) {
      skipped += 1;
      continue;
    }
    const filename = asset.fileName ?? asset.uri.split('/').pop() ?? `photo_${timestamp}`;
    const key = `${filename}:${timestamp}`;
    if (existingKeys.has(key)) continue;
    const id = `${timestamp}_${filename}`;
    const destUri = `${TRACK_PHOTO_FOLDER}/${id}`;
    try {
      await FileSystem.copyAsync({ from: asset.uri, to: destUri });
    } catch {
      skipped += 1;
      continue;
    }
    existingKeys.add(key);
    added.push({
      id,
      filename,
      uri: destUri,
      timestamp,
      width: asset.width,
      height: asset.height,
    });
    imported += 1;
  }
  if (added.length > 0) {
    const merged = [...existing, ...added].sort((a, b) => a.timestamp - b.timestamp);
    await saveIndex(merged);
  }
  return { imported, skipped };
};

// 取り込んだ写真をすべて削除する（実ファイルごと消す）
export const clearImportedTrackPhotos = async (): Promise<void> => {
  try {
    await FileSystem.deleteAsync(TRACK_PHOTO_FOLDER, { idempotent: true });
  } catch {
    // 削除失敗は無視（次回取り込み時に上書きされる）
  }
};
