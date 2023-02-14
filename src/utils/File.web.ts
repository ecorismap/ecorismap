import JSZip from 'jszip';
import { Platform } from 'react-native';
import sanitize from 'sanitize-filename';
import { ExportType } from '../types';

//bugのため以下の記述が必要。https://github.com/eligrey/FileSaver.js/pull/533
let FileSaver: { saveAs: (arg0: any, arg1: string) => void };
if (Platform.OS === 'web') {
  FileSaver = require('file-saver');
}

export const exportFile = async (data: string, fileName: string) => {
  const blob = new Blob([data], { type: 'text/plain;charset=utf-8' });
  FileSaver.saveAs(blob, fileName);
};

export const exportDataAndPhoto = async (
  exportData: {
    data: string;
    name: string;
    folder: string;
    type: ExportType | 'PHOTO';
  }[],
  exportDataName: string,
  ext: string
) => {
  try {
    const targetPath = `${sanitize(exportDataName)}.${ext}`;
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
