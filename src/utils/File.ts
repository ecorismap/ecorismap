import * as RNFS from 'react-native-fs';
import * as Sharing from 'expo-sharing';
import { ExportType } from '../types';
import { zip } from 'react-native-zip-archive';
import sanitize from 'sanitize-filename';
import { getExt } from './General';
import { AppID } from '../constants/AppConstants';

export const exportDataAndPhoto = async (
  exportData: {
    data: string;
    name: string;
    folder: string;
    type: ExportType | 'JSON' | 'PHOTO';
  }[],
  exportDataName: string,
  ext: string
) => {
  const fileName = sanitize(exportDataName);
  const sourcePath = `${RNFS.CachesDirectoryPath}/${fileName}`;
  const targetPath = `${RNFS.CachesDirectoryPath}/${fileName}.${ext}`;
  // console.log(sourcePath);
  // console.log(targetPath);
  try {
    await RNFS.mkdir(sourcePath);
    //データ、写真を出力フォルダにコピー
    for (const d of exportData) {
      const folder = sanitize(d.folder) === '' ? '.' : sanitize(d.folder);
      await RNFS.mkdir(`${sourcePath}/${folder}`);
      if (d.type === 'PHOTO') {
        await RNFS.copyFile(d.data, `${sourcePath}/${folder}/${sanitize(d.name)}`);
      } else {
        await RNFS.writeFile(`${sourcePath}/${folder}/${sanitize(d.name)}`, d.data, 'utf8');
      }
    }

    //ファイルを出力フォルダに書き出し

    const path = await zip(sourcePath, targetPath);
    if (path !== undefined) {
      await Sharing.shareAsync(`file://${encodeURI(path)}`);
      await RNFS.unlink(sourcePath);
      await RNFS.unlink(targetPath);
    }
    return true;
  } catch (e) {
    console.log(e);
    return false;
  }
  //Memo: expoのSharingはキャンセルしたかどうか値を返さない.objectは常に{}
};

export const clearCacheData = async () => {
  const dirPath = RNFS.CachesDirectoryPath;
  //console.log(dirPath);
  const dirItems = await RNFS.readDir(dirPath);
  for (const dirItem of dirItems) {
    //console.log(dirItem.name);
    if (dirItem.isDirectory()) {
      //zip作成失敗のディレクトリは削除したいが、それ以外は消さない。
      //とりあえず何もしない
      //await RNFS.unlink(dirItem.path);
    } else {
      const ext = getExt(dirItem.name)?.toLowerCase();
      if (
        ext === 'jpg' ||
        ext === 'png' ||
        ext === 'zip' ||
        ext === 'geojson' ||
        ext === 'gpx' ||
        ext === 'kml' ||
        ext === 'kmz' ||
        (ext === 'ecorismap' && dirItem.name !== AppID)
      ) {
        await RNFS.unlink(dirItem.path);
      }
    }
  }
};
