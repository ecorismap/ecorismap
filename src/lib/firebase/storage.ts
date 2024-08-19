import * as FileSystem from 'expo-file-system';
// let FileSaver: { saveAs: (arg0: any, arg1: string) => void };
// if (Platform.OS === 'web') {
//   FileSaver = require('file-saver');
// }

import { Platform } from 'react-native';
import { t } from '../../i18n/config';
import {
  encryptFileEThreeRN as encFileRN,
  decryptFileEThreeRN as decFileRN,
  encryptFileEThree as encFile,
  decryptFileEThree as decFile,
} from '../virgilsecurity/e3kit';
import { storage } from './firebase';
import { db } from '../../utils/db';
import { blobToBase64 } from '../../utils/File.web';

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
    const reference = storage.ref().child(`projects/${projectId}/PDF/${tileMapId}`);
    await reference.put(encdata as Blob);
    const url = await storage.ref(`projects/${projectId}/PDF/${tileMapId}`).getDownloadURL();
    return { isOK: true, message: '', url: 'pdf://' + url, key };
  } catch (error) {
    console.log('uploadPDF Error:', error);
    return { isOK: false, message: t('firebase.message.failUploadPDF'), url: null, key: null };
  }
};

export const downloadPDF = async (url: string, key: string) => {
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
        const base64 = await blobToBase64(decdata);
        const dataUri = `data:application/pdf;base64,${base64}`;
        return { isOK: true, data: dataUri };
      }
    } else {
      const { uri, status } = await FileSystem.downloadAsync(url, FileSystem.cacheDirectory + 'temp.pdf');
      if (status !== 200) {
        await FileSystem.deleteAsync(uri);
        return { isOK: false };
      } else {
        const { decUri } = await decFileRN(uri, key);
        if (decUri === undefined) {
          await FileSystem.deleteAsync(uri);
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

export const deleteProjectPDF = async (projectId: string) => {
  try {
    const reference = storage.ref(`projects/${projectId}/PDF`);
    reference.listAll().then(async (listResults) => {
      const promises = listResults.items.map((item) => {
        return item.delete();
      });
      await Promise.all(promises);
    });
    return { isOK: true, message: '' };
  } catch (error) {
    console.log('deleteProjecPDF Error:', error);
    return { isOK: false, message: t('firebase.message.failDeleteProjectPDF') };
  }
};

export const uploadPhoto = async (projectId: string, layerId: string, userId: string, photoId: string, uri: string) => {
  try {
    if (Platform.OS === 'web') {
      const { encdata, key } = await encFile(uri);
      if (encdata === undefined || key === undefined) {
        return { isOK: false, message: t('firebase.message.failEncryptPhoto'), url: null, key: null };
      }
      const reference = storage.ref().child(`projects/${projectId}/${layerId}/${userId}/PHOTO/${photoId}`);
      await reference.put(encdata as Blob);
      const url = await storage.ref(`projects/${projectId}/${layerId}/${userId}/PHOTO/${photoId}`).getDownloadURL();
      return { isOK: true, message: '', url, key };
    } else {
      const { encUri, key } = await encFileRN(uri);
      if (encUri === undefined || key === undefined) {
        return { isOK: false, message: t('firebase.message.failEncryptPhoto'), url: null, key: null };
      }
      const reference = storage.ref(`projects/${projectId}/${layerId}/${userId}/PHOTO/${photoId}`);
      //@ts-ignore
      await reference.putFile(encUri);
      const url = await storage.ref(`projects/${projectId}/${layerId}/${userId}/PHOTO/${photoId}`).getDownloadURL();
      return { isOK: true, message: '', url, key };
    }
  } catch (error) {
    console.log('uploadPhoto Error:', error);
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
    console.log('dowanloadPhoto Error:', error);
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
    const reference = storage.ref(`projects/${projectId}`);
    reference.listAll().then((listResults) => {
      const promises = listResults.items.map((item) => {
        return item.delete();
      });
      Promise.all(promises);
    });
    return { isOK: true, message: '' };
  } catch (error) {
    console.log('deleteProjecStorageData Error:', error);
    return { isOK: false, message: t('firebase.message.failDeleteProjectPhoto') };
  }
};

export const deleteStoragePhoto = async (projectId: string, layerId: string, userId: string, photoId: string) => {
  try {
    const reference = storage.ref(`projects/${projectId}/${layerId}/${userId}/PHOTO/${photoId}`);
    await reference.delete();
    return { isOK: true, message: '' };
  } catch (error) {
    console.log('deletePhoto Error:', error);
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
