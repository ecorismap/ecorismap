import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { storage, ref, uploadBytes, getDownloadURL, deleteObject, listAll } from './firebase';
import { t } from '../../i18n/config';
import {
  encryptFileEThreeRN as encFileRN,
  decryptFileEThreeRN as decFileRN,
  encryptFileEThree as encFile,
  decryptFileEThree as decFile,
} from '../virgilsecurity/e3kit';
import { db } from '../../utils/db';
import { blobToBase64 } from '../../utils/blob';

export const uploadDictionary = async (projectId: string, layerId: string, dictionaryData: string) => {
  try {
    const { encdata, key } = await encFile(dictionaryData);
    if (encdata === undefined || key === undefined) {
      return { isOK: false, message: t('firebase.message.failEncryptDictionary'), key: undefined };
    }
    const storageRef = ref(storage, `projects/${projectId}/DICTIONARY/${layerId}/dictionary.sqlite`);
    await uploadBytes(storageRef, encdata as Blob);
    return { isOK: true, message: '', key };
  } catch (error) {
    console.error('uploadDictionary Error:', error);
    return { isOK: false, message: t('firebase.message.failUploadDictionary'), key: undefined };
  }
};

export const downloadDictionary = async (projectId: string, layerId: string, key: string) => {
  try {
    const storageRef = ref(storage, `projects/${projectId}/DICTIONARY/${layerId}/dictionary.sqlite`);
    const url = await getDownloadURL(storageRef);

    if (url === undefined) {
      return { isOK: false, message: t('firebase.message.failGetDictionary') };
    }
    if (Platform.OS === 'web') {
      const response = await fetch(url);
      if (response.status !== 200) {
        return { isOK: false, message: t('firebase.message.failGetDictionary') };
      } else {
        const blob = await response.blob();
        const { decdata } = await decFile(blob, key);
        if (decdata === undefined) {
          return { isOK: false, message: t('firebase.message.failGetDictionary') };
        }
        //blobをarrayBufferに変換
        const arrayBuffer = await new Response(decdata).arrayBuffer();
        return { isOK: true, message: '', data: arrayBuffer };
      }
    } else {
      const { uri, status } = await FileSystem.downloadAsync(url, FileSystem.cacheDirectory + 'temp.sqlite');
      if (status !== 200) {
        await FileSystem.deleteAsync(uri);
        return { isOK: false, message: t('firebase.message.failGetDictionary') };
      } else {
        const { decUri } = await decFileRN(uri, key);
        if (decUri === undefined) {
          await FileSystem.deleteAsync(uri);
          return { isOK: false, message: t('firebase.message.failGetDictionary') };
        }
        const dbPath = `${FileSystem.documentDirectory}SQLite/temp.sqlite`;
        await FileSystem.copyAsync({ from: 'file://' + decUri, to: dbPath });
        return { isOK: true, message: '', data: '' };
      }
    }
  } catch (error) {
    console.log('downloadDictionary Error:', error);
    return { isOK: false, message: t('firebase.message.failGetDictionary') };
  }
};
export const uploadPDF = async (projectId: string, tileMapId: string) => {
  try {
    const uri = (await db.geotiff.get(tileMapId))?.pdf;
    if (uri === undefined) {
      return { isOK: false, message: t('firebase.message.failUploadPDF'), url: null, key: null };
    }
    const { encdata, key } = await encFile(uri);
    if (encdata === undefined || key === undefined) {
      return { isOK: false, message: t('firebase.message.failEncryptPDF'), url: null, key: null };
    }
    const storageRef = ref(storage, `projects/${projectId}/PDF/${tileMapId}`);
    await uploadBytes(storageRef, encdata as Blob);
    const url = await getDownloadURL(storageRef);
    return { isOK: true, message: '', url: 'pdf://' + url, key };
  } catch (error) {
    console.error('uploadPDF Error:', error);
    return { isOK: false, message: t('firebase.message.failUploadPDF'), url: null, key: null };
  }
};

export const downloadPDF = async (url: string, key: string, onProgress?: (progressRatio: number) => void) => {
  try {
    if (Platform.OS === 'web') {
      const response = await fetch(url);
      if (response.status !== 200) {
        return { isOK: false };
      } else {
        let blob: Blob;
        const contentLengthHeader = response.headers.get('content-length');
        if (response.body && contentLengthHeader) {
          const totalBytes = parseInt(contentLengthHeader, 10);
          if (Number.isFinite(totalBytes) && totalBytes > 0) {
            const reader = response.body.getReader();
            const chunks: Uint8Array[] = [];
            let loaded = 0;
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) {
                chunks.push(value);
                loaded += value.length;
                if (onProgress) {
                  const ratio = loaded / totalBytes;
                  onProgress(Math.min(Math.max(ratio, 0), 1));
                }
              }
            }
            blob = new Blob(chunks as BlobPart[], { type: 'application/pdf' });
          } else {
            blob = await response.blob();
          }
        } else {
          blob = await response.blob();
        }
        onProgress?.(1);
        const { decdata } = await decFile(blob, key);
        if (decdata === undefined) {
          return { isOK: false };
        }
        const base64 = await blobToBase64(decdata);
        const dataUri = `data:application/pdf;base64,${base64}`;
        return { isOK: true, data: dataUri };
      }
    } else {
      const download = FileSystem.createDownloadResumable(
        url,
        FileSystem.cacheDirectory + 'temp.pdf',
        {},
        (progressData) => {
          const { totalBytesExpectedToWrite, totalBytesWritten } = progressData;
          if (!totalBytesExpectedToWrite) return;
          if (onProgress) {
            const ratio = totalBytesWritten / totalBytesExpectedToWrite;
            onProgress(Math.min(Math.max(ratio, 0), 1));
          }
        }
      );
      const result = await download.downloadAsync();
      if (!result || result.status !== 200) {
        if (result?.uri) {
          await FileSystem.deleteAsync(result.uri).catch(() => undefined);
        }
        return { isOK: false };
      } else {
        onProgress?.(1);
        const { decUri } = await decFileRN(result.uri, key);
        if (decUri === undefined) {
          await FileSystem.deleteAsync(result.uri).catch(() => undefined);
          return { isOK: false };
        }
        return { isOK: true, data: 'file://' + decUri };
      }
    }
  } catch (error) {
    //console.log('dowanloadPhoto Error:', error);
    return { isOK: false };
  }
};

export const deleteProjectPDF = async (projectId: string, excludeItems: string[]) => {
  try {
    const pdfFolderRef = ref(storage, `projects/${projectId}/PDF`);
    const listResult = await listAll(pdfFolderRef);
    await Promise.all(
      listResult.items.map((itemRef) =>
        excludeItems.includes(itemRef.name) ? Promise.resolve() : deleteObject(itemRef)
      )
    );
    return { isOK: true, message: '' };
  } catch (error) {
    console.error('deleteProjectPDF Error:', error);
    return { isOK: false, message: t('firebase.message.failDeleteProjectPDF') };
  }
};

export const uploadPhoto = async (projectId: string, layerId: string, userId: string, photoId: string, uri: string) => {
  const path = `projects/${projectId}/PHOTO/${layerId}/${userId}/${photoId}`;
  const storageRef = ref(storage, path);
  try {
    let payload: Blob | string | undefined;
    let key: string | undefined;

    if (Platform.OS === 'web') {
      const { encdata, key: k } = await encFile(uri);
      payload = encdata as Blob | undefined;
      key = k;
    } else {
      const { encUri, key: k } = await encFileRN(uri);
      payload = encUri;
      key = k;
    }
    if (!payload || !key) {
      return { isOK: false, message: t('firebase.message.failEncryptPhoto'), url: null, key: null };
    }
    if (Platform.OS === 'web') {
      await uploadBytes(storageRef, payload as Blob);
    } else {
      await storageRef.putFile(payload as string);
    }
    const url = await getDownloadURL(storageRef);
    return { isOK: true, message: '', url, key };
  } catch (error) {
    console.error('uploadPhoto Error:', error);
    return { isOK: false, message: t('firebase.message.failUploadPhoto'), url: null, key: null };
  }
};

const hasProjectImage = async (localFile: string) => {
  try {
    if (Platform.OS === 'web') {
      //ToDo ローカルファイルのチェック
      return false;
    } else {
      const { exists } = await FileSystem.getInfoAsync(localFile);
      return exists;
    }
  } catch (e) {
    console.log(e);
    return false;
  }
};

export const fetchPhoto = async (url: string, key: string) => {
  try {
    if (Platform.OS === 'web') {
      const response = await fetch(url);
      if (response.status !== 200) {
        return { isOK: false, message: t('firebase.message.failGetPhoto') };
      } else {
        const blob = await response.blob();
        const { decdata } = await decFile(blob, key);
        if (decdata === undefined) {
          return { isOK: false, message: t('firebase.message.failGetPhoto') };
        }
        const uri = URL.createObjectURL(decdata);
        return { isOK: true, message: '', data: uri };
      }
    } else {
      const { uri, status } = await FileSystem.downloadAsync(url, FileSystem.cacheDirectory + 'temp');
      if (status !== 200) {
        await FileSystem.deleteAsync(uri);
        return { isOK: false, message: t('firebase.message.failGetPhoto') };
      } else {
        const { decUri } = await decFileRN(uri, key);
        if (decUri === undefined) {
          await FileSystem.deleteAsync(uri);
          return { isOK: false, message: t('firebase.message.failDecryptPhoto') };
        }
        return { isOK: true, message: '', data: 'file://' + decUri };
      }
    }
  } catch (error) {
    console.error('fetchPhoto Error:', error);
    return { isOK: false, message: t('firebase.message.failGetPhoto') };
  }
};

export const downloadPhoto = async (url: string, key: string, filename: string, folder: string) => {
  let newUri;
  const localFile = `${folder}/${filename}`;

  if (await hasProjectImage(localFile)) {
    //すでにある
    return { isOK: true, message: '', uri: localFile };
  } else {
    const { isOK, message, data } = await fetchPhoto(url, key);
    if (!isOK || data === undefined) {
      return { isOK: false, message, uri: null };
    }
    if (Platform.OS === 'web') {
      newUri = data;
      //FileSaver.saveAs(data, filename);
    } else {
      await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
      await FileSystem.copyAsync({ from: data as string, to: localFile });
      newUri = localFile;
    }
    return { isOK: true, message: '', uri: newUri };
  }
};

export const deleteProjectStorageData = async (projectId: string) => {
  try {
    const folderRef = ref(storage, `projects/${projectId}`);
    const listResult = await listAll(folderRef);
    await Promise.all(listResult.items.map((itemRef) => deleteObject(itemRef)));
    return { isOK: true, message: '' };
  } catch (error) {
    console.error('deleteProjectStorageData Error:', error);
    return { isOK: false, message: t('firebase.message.failDeleteProjectPhoto') };
  }
};

export const deleteStoragePhoto = async (projectId: string, layerId: string, userId: string, photoId: string) => {
  try {
    const photoRef = ref(storage, `projects/${projectId}/PHOTO/${layerId}/${userId}/${photoId}`);
    await deleteObject(photoRef);
    return { isOK: true, message: '' };
  } catch (error) {
    console.error('deleteStoragePhoto Error:', error);
    return { isOK: false, message: t('firebase.message.failDeletePhoto') };
  }
};

export const deleteAllProjectStorageData = async (projectIds: string[]) => {
  for (const projectId of projectIds) {
    const { isOK, message } = await deleteProjectStorageData(projectId);
    if (!isOK) {
      return { isOK: false, message };
    }
  }
  return { isOK: true, message: '' };
};

export const uploadStyle = async (projectId: string, tileMapId: string) => {
  try {
    const styleData = (await db.pmtiles.get(tileMapId))?.style;
    if (styleData === undefined) {
      return { isOK: false, message: t('firebase.message.failUploadStyle'), url: null, key: null };
    }
    const styleUri = `data:application/json;charset=utf-8,${encodeURIComponent(styleData)}`;

    const { encdata, key } = await encFile(styleUri);
    if (encdata === undefined || key === undefined) {
      return { isOK: false, message: t('firebase.message.failEncryptStyle'), url: null, key: null };
    }
    const storageRef = ref(storage, `projects/${projectId}/STYLE/${tileMapId}`);
    await uploadBytes(storageRef, encdata as Blob);
    const url = await getDownloadURL(storageRef);
    return { isOK: true, message: '', url: 'style://' + url, key };
  } catch (error) {
    console.error('uploadStyle Error:', error);
    return { isOK: false, message: t('firebase.message.failUploadStyle'), url: null, key: null };
  }
};

export const downloadStyle = async (url: string, key: string) => {
  try {
    if (Platform.OS === 'web') {
      const response = await fetch(url);
      if (response.status !== 200) {
        return { isOK: false };
      } else {
        const blob = await response.blob();
        const { decdata } = await decFile(blob, key);
        if (decdata === undefined) {
          return { isOK: false };
        }
        const json = await decdata.text();
        return { isOK: true, styleJson: json };
      }
    } else {
      const { uri, status } = await FileSystem.downloadAsync(url, FileSystem.cacheDirectory + 'temp_style.json');
      if (status !== 200) {
        await FileSystem.deleteAsync(uri);
        return { isOK: false };
      } else {
        const { decUri } = await decFileRN(uri, key);
        if (decUri === undefined) {
          await FileSystem.deleteAsync(uri);
          return { isOK: false };
        }
        return { isOK: true, styleJson: 'file://' + decUri };
      }
    }
  } catch (error) {
    console.error('downloadStyle Error:', error);
    return { isOK: false };
  }
};

export const deleteProjectStyle = async (projectId: string, excludeItems: string[]) => {
  try {
    const styleFolderRef = ref(storage, `projects/${projectId}/STYLE`);
    const listResult = await listAll(styleFolderRef);
    await Promise.all(
      listResult.items.map((itemRef) =>
        excludeItems.includes(itemRef.name) ? Promise.resolve() : deleteObject(itemRef)
      )
    );
    return { isOK: true, message: '' };
  } catch (error) {
    console.error('deleteProjectStyle Error:', error);
    return { isOK: false, message: t('hooks.message.failDeleteFile') };
  }
};
