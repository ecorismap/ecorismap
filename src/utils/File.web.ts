import JSZip from 'jszip';
import { Platform } from 'react-native';
import sanitize from 'sanitize-filename';
import { ExportType } from '../types';
import { Buffer } from 'buffer';
import { fetchPhoto } from '../lib/firebase/storage';
// //@ts-ignore
// import Base64 from 'Base64';
// import jschardet from 'jschardet';
// import iconv from 'iconv-lite';

//bugのため以下の記述が必要。https://github.com/eligrey/FileSaver.js/pull/533
let FileSaver: { saveAs: (arg0: any, arg1: string) => void };
if (Platform.OS === 'web') {
  FileSaver = require('file-saver');
}

export const exportFileFromData = async (data: string, fileName: string) => {
  const blob = new Blob([data], { type: 'text/plain;charset=utf-8' } as BlobPropertyBag);
  FileSaver.saveAs(blob, sanitize(fileName));
};

export const exportGeoFile = async (
  exportData: {
    data: string;
    name: string;
    folder: string;
    type: ExportType;
    url?: string | null;
    key?: string | null;
  }[],
  exportFileName: string,
  ext: string
) => {
  try {
    const targetPath = `${sanitize(exportFileName)}.${ext}`;
    const zip = new JSZip();
    const folder = zip.folder('');
    if (folder == null) return;
    for (const d of exportData) {
      const folderName = sanitize(d.folder) === '' ? '' : sanitize(d.folder) + '/';
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

    const zipFile = await zip.generateAsync({ type: 'blob' });
    FileSaver.saveAs(zipFile, targetPath);
    return true;
  } catch (e) {
    console.log(e);
    return false;
  }
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

// export function decodeUri(uri: string) {
//   const arr = uri.split(',');
//   const base64 = arr[arr.length - 1];
//   //return decodeURIComponent(escape(Base64.atob(base64)));
//   const buffer = Buffer.from(Base64.atob(base64), 'binary');
//   const encoding = jschardet.detect(buffer).encoding;
//   return iconv.decode(buffer, encoding);
// }

export async function decodeUri(uri: string): Promise<string> {
  try {
    // blob URLまたはhttp(s) URLの場合
    if (uri.startsWith('blob:') || uri.startsWith('http')) {
      const response = await fetch(uri);
      return await response.text();
    }
    // data URIの場合
    if (uri.includes(',')) {
      const base64 = uri.split(',').pop() || '';
      return Buffer.from(base64, 'base64').toString('utf-8');
    }
    // その他はbase64として扱う
    return Buffer.from(uri, 'base64').toString('utf-8');
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


export async function exportFileFromUri() {}
