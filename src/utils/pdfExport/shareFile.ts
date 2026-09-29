import * as FileSystem from 'expo-file-system/legacy';
import sanitize from 'sanitize-filename';

const SHARE_DIR = `${FileSystem.cacheDirectory}pdf-export/`;

/**
 * 作成したPDFを、共有シートに出したい名前（ecorismap_map_日時.pdf）の一時ファイルにしてから渡し、終わったら消す。
 * 作成直後のPDFはexpo-printが付けた番号の名前（4A1EC5E9-…_out.pdf）のため、iOSの共有シートや
 * 「ファイルに保存」でその名前のまま保存されてしまう。
 * 元のファイルも使い終わったら消す（A0では1回で数十MBになり、キャッシュに溜まり続けるため）
 */
export const shareWithFileName = async <T>(
  uri: string,
  fileName: string,
  share: (namedUri: string) => Promise<T>
): Promise<T> => {
  const namedUri = `${SHARE_DIR}${sanitize(fileName)}`;
  try {
    await FileSystem.makeDirectoryAsync(SHARE_DIR, { intermediates: true }).catch(() => undefined);
    await FileSystem.deleteAsync(namedUri, { idempotent: true });
    await FileSystem.moveAsync({ from: uri, to: namedUri });
    return await share(namedUri);
  } finally {
    await FileSystem.deleteAsync(namedUri, { idempotent: true }).catch(() => undefined);
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
  }
};
