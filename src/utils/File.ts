import * as RNFS from 'react-native-fs';
import * as Sharing from 'expo-sharing';
import { ExportType } from '../types';
import { zip } from 'react-native-zip-archive';
import sanitize from 'sanitize-filename';
import { getExt } from './General';
import { AppID } from '../constants/AppConstants';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { fetchPhoto } from '../lib/firebase/storage';

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
  ext: 'zip' | 'ecorismap'
) => {
  const fileName = sanitize(exportFileName);
  const sourcePath = `${RNFS.CachesDirectoryPath}/export/${fileName}`;
  const targetPath = `${RNFS.CachesDirectoryPath}/export/${fileName}.${ext}`;
  // console.log(sourcePath);
  // console.log(targetPath);
  try {
    await RNFS.mkdir(sourcePath);
    //データ、写真を出力フォルダにコピー
    for (const d of exportData) {
      const folder = sanitize(d.folder) === '' ? '.' : sanitize(d.folder);
      await RNFS.mkdir(`${sourcePath}/${folder}`);
      if (d.type === 'PHOTO' || d.type === 'SQLITE') {
        console.log(d);
        
        // ローカルファイルが存在するかチェック
        let fileToSave = d.data;
        
        // 写真の場合の処理
        if (d.type === 'PHOTO') {
          // ローカルファイルが存在するかチェック
          if (d.data && d.data !== '') {
            try {
              const exists = await RNFS.exists(d.data);
              if (!exists) {
                console.log(`Local file not found: ${d.data}, trying to fetch from Firebase`);
                fileToSave = ''; // ローカルファイルが存在しない
              }
            } catch (e) {
              fileToSave = ''; // エラーの場合も存在しないとみなす
            }
          }
          
          // ローカルファイルがない場合、Firebase Storageから取得
          if (!fileToSave && d.url && d.key) {
            const result = await fetchPhoto(d.url, d.key);
            if (result.isOK && result.data) {
              fileToSave = result.data;
            } else {
              console.warn(`Failed to fetch photo ${d.name}:`, result.message);
              continue; // この写真をスキップ
            }
          }
        }
        
        // ファイルが存在することを確認してからコピー
        if (fileToSave && fileToSave !== '') {
          try {
            await RNFS.copyFile(fileToSave, `${sourcePath}/${folder}/${sanitize(d.name)}`);
          } catch (error) {
            console.warn(`Failed to copy file ${d.name}:`, error);
            // Firebase Storageから再度取得を試みる
            if (d.type === 'PHOTO' && d.url && d.key) {
              const result = await fetchPhoto(d.url, d.key);
              if (result.isOK && result.data) {
                try {
                  await RNFS.copyFile(result.data, `${sourcePath}/${folder}/${sanitize(d.name)}`);
                } catch (retryError) {
                  console.warn(`Failed to copy file after retry ${d.name}:`, retryError);
                }
              }
            }
          }
        }
      } else {
        await RNFS.writeFile(`${sourcePath}/${folder}/${sanitize(d.name)}`, d.data, 'utf8');
      }
    }

    //ファイルを出力フォルダに書き出し

    const path = await zip(sourcePath, targetPath);
    if (path !== undefined) {
      await exportFileFromUri(path, `${fileName}.${ext}`);
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

export async function exportFileFromUri(uri: string, fileName: string, options?: Sharing.SharingOptions) {
  if (Platform.OS === 'android') {
    await RNFS.copyFile(uri, `${RNFS.DownloadDirectoryPath}/${sanitize(fileName)}`);
  }
  await Sharing.shareAsync(`file://${encodeURI(uri)}`, options);

  return true;
}

export const exportFileFromData = async (data: string, fileName: string) => {
  if (Platform.OS === 'android') {
    await RNFS.writeFile(`${RNFS.DownloadDirectoryPath}/${sanitize(fileName)}`, data, 'utf8');
  }
  const sourcePath = `${RNFS.CachesDirectoryPath}/${sanitize(fileName)}`;
  await RNFS.writeFile(sourcePath, data, 'utf8');
  await Sharing.shareAsync(`file://${encodeURI(sourcePath)}`, { mimeType: 'text/plain' });
  await RNFS.unlink(sourcePath);

  return true;
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

export async function getReceivedFiles() {
  try {
    const dirPath = FileSystem.cacheDirectory + '';
    if (Platform.OS === 'ios') await copyFromInbox(dirPath);

    const files = await FileSystem.readDirectoryAsync(dirPath);
    const filesPromise = files.map(async (name) => {
      const uri = dirPath + encodeURI(name);
      const info = await FileSystem.getInfoAsync(uri);
      const size = info.exists ? info.size : -1;
      return { name, uri, size };
    });
    return await Promise.all(filesPromise);
  } catch (e: any) {
    console.log(e);
    await clearCacheData();
    return undefined;
  }

  async function copyFromInbox(dirPath: string) {
    const inboxPath = FileSystem.documentDirectory + `../tmp/${AppID}-Inbox/`;
    const dirInfo = await FileSystem.getInfoAsync(inboxPath).catch(() => {
      return;
    });
    if (dirInfo === undefined || !dirInfo.exists) {
      //console.log('No Inbox');
      return;
    }
    const dir = await FileSystem.readDirectoryAsync(inboxPath);

    for (const fileName of dir) {
      //console.log('!!!!', fileName);
      const ext = getExt(fileName)?.toLowerCase();
      if (ext === 'geojson' || ext === 'gpx' || ext === 'kml' || ext === 'kmz') {
        //console.log('#', inboxPath + encodeURI(fileName));
        await FileSystem.copyAsync({ from: inboxPath + encodeURI(fileName), to: dirPath + encodeURI(fileName) });
        await FileSystem.deleteAsync(inboxPath);
      }
    }
  }
}

export async function deleteReceivedFiles(
  files: {
    name: string;
    uri: string;
    size: number | undefined;
  }[]
) {
  for (const file of files) {
    await FileSystem.deleteAsync(file.uri);
  }
}

export async function moveFile(uri: any, destPath: string) {
  await RNFS.moveFile(uri, destPath);
}

export async function unlink(uri: string) {
  if (await RNFS.exists(uri)) {
    await RNFS.unlink(uri);
  }
}
