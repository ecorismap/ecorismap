import JSZip from 'jszip';
import { Platform } from 'react-native';
import sanitize from 'sanitize-filename';
import { ExportType } from '../types';
//@ts-ignore
import Base64 from 'Base64';
import jschardet from 'jschardet';
import iconv from 'iconv-lite';

//bugのため以下の記述が必要。https://github.com/eligrey/FileSaver.js/pull/533
let FileSaver: { saveAs: (arg0: any, arg1: string) => void };
if (Platform.OS === 'web') {
  FileSaver = require('file-saver');
}

export const exportFile = async (data: string, fileName: string) => {
  const blob = new Blob([data], { type: 'text/plain;charset=utf-8' });
  FileSaver.saveAs(blob, fileName);
};

export const exportGeoFile = async (
  exportData: {
    data: string;
    name: string;
    folder: string;
    type: ExportType | 'PHOTO';
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
      if (d.type === 'PHOTO') {
        //console.log(d.data);
        const res = await fetch(d.data);
        const blob = await res.blob();
        const imageData = new File([blob], sanitize(d.name));
        folder.file(`${folderName}${sanitize(d.name)}`, imageData, { base64: true });
      } else {
        folder.file(`${folderName}${sanitize(d.name)}`, d.data);
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

export async function importDropedFile(acceptedFiles: any) {
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
}

export function decodeUri(uri: string) {
  const arr = uri.split(',');
  const base64 = arr[arr.length - 1];
  //return decodeURIComponent(escape(Base64.atob(base64)));
  const buffer = Buffer.from(Base64.atob(base64), 'binary');
  const encoding = jschardet.detect(buffer).encoding;
  return iconv.decode(buffer, encoding);
}

export async function deleteReceivedFiles() {}
export async function getReceivedFiles() {}

export async function customShareAsync() {}

export async function moveFile() {}
export async function unlink() {}

export function saveAs(fileBytes: Uint8Array | Blob, fileName: string): void {
  const blob = fileBytes instanceof Blob ? fileBytes : new Blob([fileBytes]);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
}

export function blobToBase64(blob: Blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    //@ts-ignore
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
