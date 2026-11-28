import JSZip from 'jszip';
import { Platform } from 'react-native';
import sanitize from 'sanitize-filename';
import { ExportResultType, ExportType } from '../types';
import { Buffer } from 'buffer';
import { fetchPhoto } from '../lib/firebase/storage';
import { ExportCancelledError, ExportZipOptions, generateZipCancellable, throwIfExportCancelled } from './zipProgress';
import iconv from 'iconv-lite';

//bugのため以下の記述が必要。https://github.com/eligrey/FileSaver.js/pull/533
let FileSaver: { saveAs: (arg0: any, arg1: string) => void };
if (Platform.OS === 'web') {
  FileSaver = require('file-saver');
}

export const exportFileFromData = async (data: string, fileName: string): Promise<ExportResultType> => {
  const blob = new Blob([data], { type: 'text/plain;charset=utf-8' } as BlobPropertyBag);
  FileSaver.saveAs(blob, sanitize(fileName));
  return 'saved';
};

// KMZは写真同梱のためネイティブ専用（Webは写真ライブラリを扱わないので常にundefined）
export const generateKMZFile = async (
  _kml: string,
  _photos: { name: string; uri: string }[],
  _exportFileName: string,
  _options?: ExportZipOptions
): Promise<string | undefined> => undefined;

export const generateZipBlob = async (
  exportData: {
    data: string;
    name: string;
    folder: string;
    type: ExportType;
    url?: string | null;
    key?: string | null;
    photoId?: string;
  }[],
  // 中止されたらExportCancelledErrorを投げる
  options?: ExportZipOptions
): Promise<Blob | undefined> => {
  try {
    const zip = new JSZip();
    const folder = zip.folder('');
    if (folder == null) return;
    for (const d of exportData) {
      throwIfExportCancelled(options);
      const baseFolder = sanitize(d.folder) === '' ? '' : sanitize(d.folder) + '/';
      // 写真名は秒単位の自動命名で別レコードと重なりうるため、photo.idのフォルダに分けて上書きし合わないようにする。
      // サニタイズで形が変わるidは取り込み側で照合できないので使わない（ネイティブのFile.tsと同じ規則）
      const photoDir =
        d.type === 'PHOTO' && d.photoId !== undefined && d.photoId !== '' && sanitize(d.photoId) === d.photoId
          ? `${d.photoId}/`
          : '';
      const folderName = baseFolder + photoDir;
      try {
        if (d.type === 'PHOTO' || d.type === 'SQLITE') {
          let blob: Blob | undefined;
          
          // 写真の場合の処理
          if (d.type === 'PHOTO') {
            // ローカルデータが有効なURLかチェック
            let hasValidLocalData = false;
            if (d.data && d.data !== '') {
              // blob:, data:, http/httpsで始まる場合は有効なURL
              if (d.data.startsWith('blob:') || d.data.startsWith('data:') || d.data.startsWith('http')) {
                try {
                  const res = await fetch(d.data);
                  blob = await res.blob();
                  hasValidLocalData = true;
                } catch (e) {
                  console.log(`Failed to fetch local data: ${d.data}, trying Firebase Storage`);
                  hasValidLocalData = false;
                }
              }
            }
            
            // ローカルデータがない場合、Firebase Storageから取得
            if (!hasValidLocalData && d.url && d.key) {
              const result = await fetchPhoto(d.url, d.key);
              if (result.isOK && result.data) {
                // fetchPhotoはObjectURLを返すので、それをblobに変換
                const res = await fetch(result.data);
                blob = await res.blob();
              } else {
                console.warn(`Failed to fetch photo ${d.name}:`, result.message);
                continue; // この写真をスキップ
              }
            }
            
            // どちらの方法でも取得できなかった場合
            if (!blob) {
              console.warn(`Could not fetch photo ${d.name}`);
              continue;
            }
          } else if (d.type === 'SQLITE') {
            // SQLiteファイルの場合
            if (d.data && d.data !== '') {
              try {
                const res = await fetch(d.data);
                blob = await res.blob();
              } catch (e) {
                console.warn(`Failed to fetch SQLite file ${d.name}:`, e);
                continue;
              }
            }
          }
          
          if (blob) {
            const imageData = new File([blob], sanitize(d.name));
            folder.file(`${folderName}${sanitize(d.name)}`, imageData, { base64: true });
          }
        } else {
          folder.file(`${folderName}${sanitize(d.name)}`, d.data);
        }
      } catch (error) {
        console.warn(`Failed to process file ${d.name}:`, error);
        // Continue processing other files even if one fails
      }
    }

    // generateAsyncは途中で止められないため、中止・進捗に対応した共通ヘルパーでbase64を作ってからBlobへ戻す
    const base64 = await generateZipCancellable(zip, { type: 'base64' }, options);
    return new Blob([new Uint8Array(Buffer.from(base64, 'base64'))], { type: 'application/zip' });
  } catch (e) {
    if (e instanceof ExportCancelledError) throw e;
    console.log(e);
    return undefined;
  }
};

export const exportGeoFile = async (
  exportData: {
    data: string;
    name: string;
    folder: string;
    type: ExportType;
    url?: string | null;
    key?: string | null;
    photoId?: string;
  }[],
  exportFileName: string,
  ext: string,
  // Webはブラウザダウンロード固定のため未使用（ネイティブ版とのシグネチャ互換用）
  _destination?: 'save' | 'share',
  // 中止されたらExportCancelledErrorを投げる
  options?: ExportZipOptions
): Promise<ExportResultType> => {
  const zipFile = await generateZipBlob(exportData, options);
  if (zipFile === undefined) return 'error';
  FileSaver.saveAs(zipFile, `${sanitize(exportFileName)}.${ext}`);
  return 'saved';
};

// Google Driveアップロード等、ダウンロードUIを介さずzipの実体が必要な場合に使う。
// native: cache内のファイルパス / web: Blob を返す（シグネチャは両プラットフォーム共通）
export const generateEcorisMapZip = async (
  exportData: {
    data: string;
    name: string;
    folder: string;
    type: ExportType;
    url?: string | null;
    key?: string | null;
    photoId?: string;
  }[],
  _exportFileName: string
): Promise<{ source: string | Blob; size: number } | undefined> => {
  const blob = await generateZipBlob(exportData);
  if (blob === undefined) return undefined;
  return { source: blob, size: blob.size };
};

export const clearCacheData = async () => {};

export async function getDropedFile(acceptedFiles: any) {
  try {
    const filePromises = acceptedFiles.map((f: any) => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onabort = (error) => reject(error);
        reader.onerror = (error) => reject(error);
        reader.onload = async () => {
          try {
            const uri = reader.result;
            if (typeof uri === 'string') {
              resolve({ uri, name: f.name, size: f.size });
            }
          } catch (error) {
            reject(error);
          }
        };
        reader.readAsDataURL(f);
        //console.log(f);
      });
    });
    return (await Promise.all(filePromises)) as { uri: string; name: string; size: number | undefined }[];
  } catch (error) {
    console.error('Error getting dropped file:', error);
    return [];
  }
}

// TextDecoderのfatalオプションは実行環境（Hermes等）で対応がまちまちなため、UTF-8の妥当性は自前で判定する
const isValidUtf8 = (bytes: Uint8Array): boolean => {
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b < 0x80) {
      i += 1;
      continue;
    }
    let need: number;
    let min: number;
    if (b >= 0xc2 && b <= 0xdf) {
      need = 1;
      min = 0x80;
    } else if (b >= 0xe0 && b <= 0xef) {
      need = 2;
      min = 0x800;
    } else if (b >= 0xf0 && b <= 0xf4) {
      need = 3;
      min = 0x10000;
    } else {
      return false;
    }
    if (i + need >= bytes.length) return false;
    let cp = b & (need === 1 ? 0x1f : need === 2 ? 0x0f : 0x07);
    for (let k = 1; k <= need; k++) {
      const c = bytes[i + k];
      if ((c & 0xc0) !== 0x80) return false;
      cp = (cp << 6) | (c & 0x3f);
    }
    // 冗長表現・サロゲート領域・U+10FFFF超は不正なUTF-8
    if (cp < min || (cp >= 0xd800 && cp <= 0xdfff) || cp > 0x10ffff) return false;
    i += need + 1;
  }
  return true;
};

// TextDecoder('shift_jis')はブラウザでは使えるが、Expoの組み込みTextDecoder（ネイティブ・jest）はUTF-8のみのため、
// 全プラットフォームで同じ結果になるようiconv-liteで読む。Excelが書くのはWindowsの拡張文字（①・㈱等）を含むCP932。
const decodeShiftJis = (bytes: Uint8Array): string | undefined => {
  try {
    return iconv.decode(bytes, 'cp932');
  } catch {
    return undefined;
  }
};

// 日本語版ExcelのCSVはShift_JISで保存されるため、BOM → UTF-8として妥当か → Shift_JIS の順に判定する。
// 正しいUTF-8を誤ってSJISで読まないよう、SJISは「UTF-8として不正」なときだけ試す。
export const decodeTextBytes = (bytes: Uint8Array): string => {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return buf.subarray(2).toString('utf16le');
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    // BOMは取り除いて返す（旧実装の response.text() と同じ挙動）。
    // 残すと BOM 付き GeoJSON/JSON の JSON.parse が先頭の U+FEFF で失敗する
    return buf.subarray(3).toString('utf-8');
  }
  if (isValidUtf8(bytes)) return buf.toString('utf-8');
  const sjis = decodeShiftJis(bytes);
  const text = sjis ?? buf.toString('utf-8');
  if (text.includes('�')) {
    console.warn('decodeTextBytes: 文字コードを判定できず、一部の文字が置換文字(U+FFFD)になりました');
  }
  return text;
};

export async function decodeUri(uri: string): Promise<string> {
  try {
    // blob URLまたはhttp(s) URLの場合
    if (uri.startsWith('blob:') || uri.startsWith('http')) {
      const response = await fetch(uri);
      return decodeTextBytes(new Uint8Array(await response.arrayBuffer()));
    }
    // data URIの場合
    if (uri.includes(',')) {
      const base64 = uri.split(',').pop() || '';
      return decodeTextBytes(new Uint8Array(Buffer.from(base64, 'base64')));
    }
    // その他はbase64として扱う
    return decodeTextBytes(new Uint8Array(Buffer.from(uri, 'base64')));
  } catch (error) {
    console.error('Error decoding URI:', error);
    return '';
  }
}

export async function deleteReceivedFiles() {}
export async function getReceivedFiles() {}

export async function customShareAsync() {}

export async function moveFile() {}
export async function unlink() {}

export function saveAs(fileBytes: Uint8Array | Blob, fileName: string): void {
  const blob = fileBytes instanceof Blob ? fileBytes : new Blob([fileBytes] as BlobPart[]);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
}


export async function exportFileFromUri(): Promise<ExportResultType> {
  return 'saved';
}

/** iOSのファイル選択が残す写しを消す（File.ts）。Webには無いので何もしない */
export async function clearPickerInbox() {}
