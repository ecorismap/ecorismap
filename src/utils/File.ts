import * as RNFS from 'react-native-fs';
import * as Sharing from 'expo-sharing';
import { ExportType } from '../types';
import JSZip from 'jszip';
import sanitize from 'sanitize-filename';
import { getExt } from './General';
import { AppID } from '../constants/AppConstants';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { fetchPhoto } from '../lib/firebase/storage';

/**
 * ファイルパスのUnicode正規化を行う関数
 * iOSではNFC（合成済み文字）に統一し、Windowsとの互換性を保つ
 * @param path ファイルパス
 * @returns 正規化されたファイルパス
 */
export function normalizeFilePath(path: string): string {
  // iOSの場合のみNFCに正規化（Androidは通常問題なし）
  return Platform.OS === 'ios' ? path.normalize('NFC') : path;
}

/**
 * JSZipを使用してZIPファイルを作成する（Web版と同じ方式）
 * ファイルシステムを経由せず直接メモリ上でZIPを作成
 * Unicode正規化を適切に処理し、プラットフォーム間の互換性を確保
 */
async function createZipWithJSZipDirect(
  exportData: {
    data: string;
    name: string;
    folder: string;
    type: ExportType;
  }[],
  sourcePath: string,
  targetPath: string
): Promise<string | undefined> {
  try {
    const jszip = new JSZip();
    
    for (const d of exportData) {
      // フォルダ名を正規化（空の場合は空文字列）
      const folderName = sanitize(d.folder) === '' ? '' : 
                        sanitize(d.folder).normalize('NFC') + '/';
      
      // ファイル名を正規化
      const fileName = sanitize(d.name).normalize('NFC');
      const fullPath = folderName + fileName;
      
      if (d.type === 'PHOTO' || d.type === 'SQLITE') {
        // 実際のファイルパスを構築（exportGeoFileで作成されたもの）
        // 空のフォルダの場合は'.'を使わない
        const folder = sanitize(d.folder).normalize('NFC');
        const filePath = folder === '' 
          ? `${sourcePath}/${sanitize(d.name).normalize('NFC')}`
          : `${sourcePath}/${folder}/${sanitize(d.name).normalize('NFC')}`;
        
        try {
          // ファイルが存在する場合のみ追加
          if (await RNFS.exists(filePath)) {
            const fileContent = await RNFS.readFile(filePath, 'base64');
            jszip.file(fullPath, fileContent, { base64: true });
          }
        } catch (e) {
          console.warn(`Failed to read file for ZIP: ${filePath}`, e);
        }
      } else {
        // テキストデータの場合は直接追加
        jszip.file(fullPath, d.data);
      }
    }
    
    // ZIPファイルを生成
    const zipContent = await jszip.generateAsync({ 
      type: 'base64',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 }
    });
    
    // ZIPファイルを保存
    await RNFS.writeFile(targetPath, zipContent, 'base64');
    
    return targetPath;
  } catch (error) {
    console.error('Error creating ZIP with JSZip:', error);
    return undefined;
  }
}

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
  const fileName = sanitize(exportFileName.normalize('NFC'));
  const sourcePath = `${RNFS.CachesDirectoryPath}/export/${fileName}`;
  const targetPath = `${RNFS.CachesDirectoryPath}/export/${fileName}.${ext}`;
  // console.log(sourcePath);
  // console.log(targetPath);
  try {
    await RNFS.mkdir(sourcePath);
    //データ、写真を出力フォルダにコピー
    for (const d of exportData) {
      // フォルダ名もUnicode正規化を適用（空の場合は空文字列のまま）
      const folder = sanitize(d.folder).normalize('NFC');
      if (folder !== '') {
        await RNFS.mkdir(`${sourcePath}/${folder}`);
      }
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
            // ファイル名もNFC正規化
            const destPath = folder === '' 
              ? normalizeFilePath(`${sourcePath}/${sanitize(d.name).normalize('NFC')}`)
              : normalizeFilePath(`${sourcePath}/${folder}/${sanitize(d.name).normalize('NFC')}`);
            await RNFS.copyFile(fileToSave, destPath);
          } catch (error) {
            console.warn(`Failed to copy file ${d.name}:`, error);
            // Firebase Storageから再度取得を試みる
            if (d.type === 'PHOTO' && d.url && d.key) {
              const result = await fetchPhoto(d.url, d.key);
              if (result.isOK && result.data) {
                try {
                  // ファイル名もNFC正規化
                  const destPath = folder === '' 
                    ? normalizeFilePath(`${sourcePath}/${sanitize(d.name).normalize('NFC')}`)
                    : normalizeFilePath(`${sourcePath}/${folder}/${sanitize(d.name).normalize('NFC')}`);
                  await RNFS.copyFile(result.data, destPath);
                } catch (retryError) {
                  console.warn(`Failed to copy file after retry ${d.name}:`, retryError);
                }
              }
            }
          }
        }
      } else {
        // ファイル名もNFC正規化
        const filePath = folder === ''
          ? normalizeFilePath(`${sourcePath}/${sanitize(d.name).normalize('NFC')}`)
          : normalizeFilePath(`${sourcePath}/${folder}/${sanitize(d.name).normalize('NFC')}`);
        await RNFS.writeFile(filePath, d.data, 'utf8');
      }
    }

    //ファイルを出力フォルダに書き出し

    // すべてのプラットフォームでJSZipを使用（Web版と同じ方式）
    const path = await createZipWithJSZipDirect(exportData, sourcePath, targetPath);
    
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
