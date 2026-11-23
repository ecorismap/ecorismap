import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { storage, ref, uploadBytes, getDownloadURL, deleteObject, listAll, getMetadata } from './firebase';
import { t } from '../../i18n/config';
import {
  encryptFileEThreeRN as encFileRN,
  decryptFileEThreeRN as decFileRN,
  encryptFileEThree as encFile,
  decryptFileEThree as decFile,
} from '../virgilsecurity/e3kit';
import { db } from '../../utils/db';
import { blobToBase64 } from '../../utils/blob';
import { isSafePathSegment } from '../../utils/safePath';
import { convertToUploadableJpeg, deletePhotoFile } from '../../utils/Photo';
import { photoContentTypeFromName } from '../../utils/General';
import { isCollisionFreePhotoFilename, photoIdFromUrl } from '../../utils/photoDownloadPath';
import { ulid } from 'ulid';

/**
 * 辞書ファイルの保存先。version は設定のレイヤに持たせる dictionaryVersion。
 * version が無いのは旧形式で、保存のたびに同じ dictionary.sqlite を上書きしていた。上書きのあとで設定の保存が
 * 失敗すると、ファイルの鍵と設定の dictionaryKey が食い違い、メンバーの辞書候補が黙って空になるため、
 * 新しい保存は版ごとに別のファイルへ書き、設定の書き込みに成功してから古い版を消す
 */
export const dictionaryStoragePath = (projectId: string, layerId: string, version?: string) =>
  version === undefined
    ? `projects/${projectId}/DICTIONARY/${layerId}/dictionary.sqlite`
    : `projects/${projectId}/DICTIONARY/${layerId}/dictionary_${version}.sqlite`;

const isObjectNotFound = (error: unknown) => {
  const message = error instanceof Error ? error.message : '';
  const code = (error as { code?: unknown } | null)?.code;
  return message.includes('object-not-found') || code === 'storage/object-not-found';
};

/**
 * 辞書を版付きのパスへ書く（旧形式のファイルや他の版には触れない）。
 * encdata は、設定の保存に成功したあとで旧形式のパスへ同じ内容を写す（uploadDictionaryLegacyCopy）ために返す
 */
export const uploadDictionary = async (projectId: string, layerId: string, dictionaryData: string, version: string) => {
  try {
    const { encdata, key } = await encFile(dictionaryData);
    if (encdata === undefined || key === undefined) {
      return { isOK: false, message: t('firebase.message.failEncryptDictionary'), key: undefined, encdata: undefined };
    }
    const storageRef = ref(storage, dictionaryStoragePath(projectId, layerId, version));
    await uploadBytes(storageRef, encdata as Blob);
    return { isOK: true, message: '', key, encdata: encdata as Blob };
  } catch (error) {
    console.error('uploadDictionary Error:', error);
    return { isOK: false, message: t('firebase.message.failUploadDictionary'), key: undefined, encdata: undefined };
  }
};

/**
 * 旧形式のパス（dictionary.sqlite）へ、版付きのパスと同じ暗号文を写す。
 * 更新前のアプリは設定の dictionaryVersion を知らず、常に旧形式のパスを設定の dictionaryKey で読むため、
 * 設定の保存に成功したあとで写しておかないと、更新前のアプリを使うメンバーの辞書候補が空になる
 */
export const uploadDictionaryLegacyCopy = async (projectId: string, layerId: string, encdata: Blob) => {
  try {
    await uploadBytes(ref(storage, dictionaryStoragePath(projectId, layerId)), encdata);
    return { isOK: true, message: '' };
  } catch (error) {
    console.error('uploadDictionaryLegacyCopy Error:', error);
    return { isOK: false, message: t('firebase.message.failUploadDictionary') };
  }
};

/** 版付きの辞書ファイルを1つ消す。無ければ成功とみなす（消し直し・他の端末が先に消した場合） */
export const deleteDictionaryFile = async (projectId: string, layerId: string, version: string) => {
  try {
    await deleteObject(ref(storage, dictionaryStoragePath(projectId, layerId, version)));
    return { isOK: true, message: '' };
  } catch (error) {
    if (isObjectNotFound(error)) return { isOK: true, message: '' };
    console.error('deleteDictionaryFile Error:', error);
    return { isOK: false, message: t('firebase.message.failUploadDictionary') };
  }
};

/** レイヤの辞書ファイルを、旧形式・全ての版ともに消す（レイヤを削除したとき） */
export const deleteLayerDictionaries = async (projectId: string, layerId: string) => {
  try {
    await deleteStorageFolderRecursive(ref(storage, `projects/${projectId}/DICTIONARY/${layerId}`));
    return { isOK: true, message: '' };
  } catch (error) {
    if (isObjectNotFound(error)) return { isOK: true, message: '' };
    console.error('deleteLayerDictionaries Error:', error);
    return { isOK: false, message: t('firebase.message.failUploadDictionary') };
  }
};

const downloadDictionaryAt = async (path: string, key: string) => {
  const storageRef = ref(storage, path);
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
};

/**
 * 辞書を取得する。version があれば版付きのパスを読み、読めなければ旧形式のパスを試す。
 * 更新前のアプリの管理者が保存すると、旧形式のパスと dictionaryKey だけが新しくなり、設定には古い
 * dictionaryVersion が残る（そのアプリはこの項目を知らないので書き換えない）。その場合も読めるようにする
 */
export const downloadDictionary = async (
  projectId: string,
  layerId: string,
  key: string,
  version?: string
): Promise<{ isOK: boolean; message: string; data?: ArrayBuffer | string }> => {
  const fail = { isOK: false, message: t('firebase.message.failGetDictionary') };
  // 版は管理者が書き込める設定から来るので、パスの区切りを作れる値は使わない
  if (version !== undefined && !isSafePathSegment(version)) return fail;
  if (version !== undefined) {
    try {
      const res = await downloadDictionaryAt(dictionaryStoragePath(projectId, layerId, version), key);
      if (res.isOK) return res;
    } catch (error) {
      console.log('downloadDictionary Error:', error);
    }
  }
  try {
    return await downloadDictionaryAt(dictionaryStoragePath(projectId, layerId), key);
  } catch (error) {
    console.log('downloadDictionary Error:', error);
    return fail;
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

/**
 * @param photoName 写真名（photo.name）。Webで送る種類（contentType）を決めるのに使う
 */
export const uploadPhoto = async (
  projectId: string,
  layerId: string,
  userId: string,
  photoId: string,
  uri: string,
  photoName?: string
) => {
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
      //以前にHEIC等のまま保存した写真は、送る直前にJPEGにする。拡張子がそのままだと
      //contentTypeがimage/heic等になり、Rulesで拒否されて一度も上がらない（写真監査 P-H1）
      const source = await convertToUploadableJpeg(uri);
      try {
        const { encUri, key: k } = await encFileRN(source.uri);
        payload = encUri;
        key = k;
      } finally {
        if (source.isConverted) await deletePhotoFile(source.uri);
      }
    }
    if (!payload || !key) {
      return { isOK: false, message: t('firebase.message.failEncryptPhoto'), url: null, key: null };
    }
    if (Platform.OS === 'web') {
      //暗号文のBlobは元のBlobの種類を引き継ぐだけなので、ZIPから取り込んだ写真（種類なしのBlob）は
      //application/octet-streamで送られ、Rulesに拒否されていた（写真監査 P-M5）。種類を明示して送る。
      //名前から分からなければBlobの種類、それも画像でなければJPEGとみなす
      const blob = payload as Blob;
      const blobType = blob.type === 'image/jpeg' || blob.type === 'image/png' ? blob.type : undefined;
      const contentType = photoContentTypeFromName(photoName) ?? blobType ?? 'image/jpeg';
      await uploadBytes(storageRef, blob, { contentType });
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

/** 一時ファイルを消す。消せなくても本来の結果は変えない */
const deleteTempFile = async (path: string) => {
  try {
    await FileSystem.deleteAsync(path, { idempotent: true });
  } catch {
    // 一時ファイルが残るだけなので無視する
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
      // 暗号文の一時ファイルは1回ごとに別の名前にする。レイヤの写真はまとめて同時に取得するので、
      // 固定名だと別の写真の暗号文や書きかけのファイルを読んで復号に失敗し、失敗した側が消すことで
      // まだ読んでいない写真まで巻き込む（写真監査 P-M11）
      const encPath = `${FileSystem.cacheDirectory}photo_${ulid()}`;
      try {
        const { status } = await FileSystem.downloadAsync(url, encPath);
        if (status !== 200) {
          return { isOK: false, message: t('firebase.message.failGetPhoto') };
        }
        const { decUri } = await decFileRN(encPath, key);
        if (decUri === undefined) {
          return { isOK: false, message: t('firebase.message.failDecryptPhoto') };
        }
        return { isOK: true, message: '', data: 'file://' + decUri };
      } finally {
        // 成功・失敗とも、消すのは自分が書いた暗号文だけ（復号済みファイルは呼び出し側が使う）
        await deleteTempFile(encPath);
      }
    }
  } catch (error) {
    console.error('fetchPhoto Error:', error);
    return { isOK: false, message: t('firebase.message.failGetPhoto') };
  }
};

/**
 * 写真を folder/filename に取得する。同名のファイルが既にあれば取得せずに使う。
 * ただし以前の秒単位の写真名は、同じアカウントの別の端末で同じ秒に撮った写真と重なる（写真監査 P-L15）。
 * 同じ写真のファイルだと確かめられない（reuseExisting でない）ときは、既にあるファイルを使い回さず上書きもせず、
 * 写真 id を前に付けた名前に置く。写真 id は options か Storage のパスから読む
 */
export const downloadPhoto = async (
  url: string,
  key: string,
  filename: string,
  folder: string,
  options: { photoId?: string; reuseExisting?: boolean } = {}
) => {
  let newUri;
  // 写真名は他メンバーのレコード由来。パス区切りや`..`でフォルダの外に書き込ませない
  if (!isSafePathSegment(filename)) {
    return { isOK: false, message: t('firebase.message.failGetPhoto'), uri: null };
  }
  let localFile = `${folder}/${filename}`;
  let exists = await hasProjectImage(localFile);
  const photoId = options.photoId ?? photoIdFromUrl(url);
  if (
    exists &&
    options.reuseExisting !== true &&
    photoId !== undefined &&
    isSafePathSegment(photoId) &&
    !isCollisionFreePhotoFilename(filename, photoId)
  ) {
    localFile = `${folder}/${photoId}_${filename}`;
    exists = await hasProjectImage(localFile);
  }

  if (exists) {
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
      try {
        await FileSystem.copyAsync({ from: data as string, to: localFile });
      } finally {
        // 写し終えた復号済みの一時ファイルは要らない（キャッシュに溜めない）
        await deleteTempFile(data as string);
      }
      newUri = localFile;
    }
    return { isOK: true, message: '', uri: newUri };
  }
};

/**
 * プロジェクトの Storage（PHOTO/・PDF/・STYLE/・DICTIONARY/ のサブフォルダ）をすべて消す。
 * 実体はすべてサブフォルダにあるので、直下の items だけを消すと何も消えない。project doc を消した後は
 * Rules の isMember/isAdmin が成り立たずアプリから二度と消せないため、doc より先にここで再帰的に消す（写真監査 P-M7）
 */
export const deleteProjectStorageData = async (projectId: string) => {
  try {
    if (!isSafePathSegment(projectId)) {
      return { isOK: false, message: t('firebase.message.failDeleteProjectPhoto') };
    }
    await deleteStorageFolderRecursive(ref(storage, `projects/${projectId}`), { ignoreNotFound: true });
    return { isOK: true, message: '' };
  } catch (error) {
    // 既に消えているものは消せたのと同じ
    if (isObjectNotFound(error)) return { isOK: true, message: '' };
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
    // どの地図のスタイル取得で失敗したか分かるようURLも出す
    // （エミュレータで保存されたlocalhost:9199のURLが本番接続で残っているケース等の切り分け用）
    console.error('downloadStyle Error:', url, error);
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

/**
 * フォルダを再帰的に削除
 */
const deleteStorageFolderRecursive = async (
  folderRef: ReturnType<typeof ref>,
  options: { ignoreNotFound?: boolean } = {}
): Promise<void> => {
  const listResult = await listAll(folderRef);

  // ファイルを削除。ignoreNotFound のときは、一覧の後に他から消された1件で残りの削除を止めない
  await Promise.all(
    listResult.items.map((itemRef) =>
      options.ignoreNotFound
        ? deleteObject(itemRef).catch((error) => {
            if (!isObjectNotFound(error)) throw error;
          })
        : deleteObject(itemRef)
    )
  );

  // サブフォルダを再帰削除
  await Promise.all(listResult.prefixes.map((subFolderRef) => deleteStorageFolderRecursive(subFolderRef, options)));
};

const listStorageFolderRecursive = async (folderRef: ReturnType<typeof ref>): Promise<string[]> => {
  const listResult = await listAll(folderRef);
  const nested = await Promise.all(listResult.prefixes.map((sub) => listStorageFolderRecursive(sub)));
  return [...listResult.items.map((item) => item.fullPath), ...nested.flat()];
};

/** 写真フォルダ（projects/{p}/PHOTO/{layer}/{uid}）にある写真のパス一覧。フォルダが無ければ空 */
export const listLayerPhotoPaths = async (projectId: string, layerId: string, userId: string): Promise<string[]> => {
  if (![projectId, layerId, userId].every(isSafePathSegment)) return [];
  return listStorageFolderRecursive(ref(storage, `projects/${projectId}/PHOTO/${layerId}/${userId}`));
};

/**
 * 写真をパスを指定して消す。写真フォルダの外は消さない。消せなかった件数を返す。
 * createdBefore を渡すと、それより後に上がった写真は消さない（照合した後に、書き込み途中のデータが
 * 参照する写真が上がっていることがある。照合に入っていない写真は残す）
 */
export const deletePhotoPaths = async (projectId: string, paths: string[], createdBefore?: number): Promise<number> => {
  const prefix = `projects/${projectId}/PHOTO/`;
  const results = await Promise.all(
    paths
      .filter((path) => path.startsWith(prefix) && !path.split('/').includes('..'))
      .map(async (path) => {
        const fileRef = ref(storage, path);
        try {
          if (createdBefore !== undefined) {
            const meta = await getMetadata(fileRef);
            const created = Date.parse(meta.timeCreated);
            if (!Number.isFinite(created) || created >= createdBefore) return true;
          }
          await deleteObject(fileRef);
          return true;
        } catch (error) {
          return (error as { code?: string })?.code === 'storage/object-not-found';
        }
      })
  );
  return results.filter((ok) => !ok).length;
};

/**
 * 指定レイヤ・ユーザーの写真を全て削除
 * クラウドデータ管理画面で使用
 */
export const deleteLayerPhotos = async (
  projectId: string,
  layerId: string,
  userId?: string
): Promise<{ isOK: boolean; message: string }> => {
  try {
    // パス構造: projects/{projectId}/PHOTO/{layerId}/{userId}/...
    const basePath = userId
      ? `projects/${projectId}/PHOTO/${layerId}/${userId}`
      : `projects/${projectId}/PHOTO/${layerId}`;

    const folderRef = ref(storage, basePath);

    // 再帰的に全ファイルを取得して削除
    await deleteStorageFolderRecursive(folderRef);

    return { isOK: true, message: '' };
  } catch (error) {
    // フォルダが存在しない場合はエラーにしない
    const errorMessage = error instanceof Error ? error.message : '';
    if (errorMessage.includes('object-not-found') || errorMessage.includes('storage/object-not-found')) {
      return { isOK: true, message: '' };
    }
    console.error('deleteLayerPhotos Error:', error);
    return { isOK: false, message: t('firebase.message.failDeletePhoto') };
  }
};
