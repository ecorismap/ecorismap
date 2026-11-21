/**
 * iOSでアプリのデータコンテナが変わったあと、保存済みの写真uriを現在の写真フォルダへ付け替える。
 *
 * 写真のuriは絶対パス（…/Data/Application/{UUID}/Documents/projects/…）でレコードに保存している。
 * iOSはアプリの更新・再インストールのたびに{UUID}を新しくし、ファイルだけを新しいコンテナへ引き継ぐため、
 * 保存済みのuriは古いコンテナを指したままになる。そのままだと原画が「無い」扱いになり（サムネイル代用）、
 * エクスポートから写真が落ち、未アップロードの写真は同期に失敗し、削除してもファイルが残る。
 *
 * Androidはアプリ領域のパスが変わらないので対象外。Webはuriがblob:なので対象外。
 */
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { PHOTO_FOLDER } from '../constants/AppConstants';
import { setDataSetAction } from '../modules/dataSet';
import type { AppDispatch, RootState } from '../store';
import { DataType, PhotoType } from '../types';
import { isUriInsideFolder } from './safePath';

export type StoreLike = { getState: () => RootState; dispatch: AppDispatch };

/** iOSの写真フォルダ（{コンテナ}/Documents/projects）を示す目印。これより後ろがコンテナに依らない相対部分 */
const IOS_PHOTO_FOLDER_MARKER = '/Documents/projects/';

/**
 * 別のコンテナの写真フォルダを指すuriを、photoFolder配下の同じ相対パスへ付け替えた値を返す。
 * 対象外（すでにphotoFolder配下・iOSの写真フォルダ形式でない・付け替え後がフォルダ外）はundefined。
 */
export const rebasePhotoUri = (uri: string | null | undefined, photoFolder: string): string | undefined => {
  if (typeof uri !== 'string' || !uri.startsWith('file://')) return undefined;
  // isUriInsideFolderは型ガードのため、直接ifに入れると以降のuriがneverに絞られる
  const isInside: boolean = isUriInsideFolder(uri, photoFolder);
  if (isInside) return undefined;
  const markerIndex = uri.indexOf(IOS_PHOTO_FOLDER_MARKER);
  if (markerIndex < 0) return undefined;
  const relativePath = uri.slice(markerIndex + IOS_PHOTO_FOLDER_MARKER.length);
  const rebased = `${photoFolder.replace(/\/+$/, '')}/${relativePath}`;
  // 相対部分に`..`等が入っていてもフォルダ外を指さないことを確かめる
  return isUriInsideFolder(rebased, photoFolder) ? rebased : undefined;
};

const mapPhotoUris = (dataSet: DataType[], convert: (uri: string) => string | undefined): DataType[] => {
  let changed = false;
  const result = dataSet.map((data) => {
    let dataChanged = false;
    const records = data.data.map((record) => {
      let field: typeof record.field | undefined;
      for (const [name, value] of Object.entries(record.field)) {
        if (!Array.isArray(value)) continue;
        let photosChanged = false;
        const photos = (value as PhotoType[]).map((photo) => {
          const uri = typeof photo?.uri === 'string' ? convert(photo.uri) : undefined;
          if (uri === undefined) return photo;
          photosChanged = true;
          return { ...photo, uri };
        });
        if (photosChanged) field = { ...(field ?? record.field), [name]: photos };
      }
      if (field === undefined) return record;
      dataChanged = true;
      return { ...record, field };
    });
    if (!dataChanged) return data;
    changed = true;
    return { ...data, data: records };
  });
  return changed ? result : dataSet;
};

/** dataSet内の、付け替え候補（旧uri→新uri）を集める */
export const collectRebaseCandidates = (dataSet: DataType[], photoFolder: string): Map<string, string> => {
  const candidates = new Map<string, string>();
  mapPhotoUris(dataSet, (uri) => {
    const rebased = rebasePhotoUri(uri, photoFolder);
    if (rebased !== undefined) candidates.set(uri, rebased);
    return undefined;
  });
  return candidates;
};

/** 旧uri→新uriの対応に従ってdataSetの写真uriを書き換える。変更が無ければ同じ参照を返す */
export const applyPhotoUriRebase = (dataSet: DataType[], rebased: Map<string, string>): DataType[] =>
  rebased.size === 0 ? dataSet : mapPhotoUris(dataSet, (uri) => rebased.get(uri));

/**
 * 付け替え先に実ファイルがある写真だけ、uriを現在の写真フォルダへ付け替える。
 * 他メンバーのレコードのuri（送り手の端末のパス）は、自分の端末に同じ写真が無ければそのまま残る。
 */
export const runPhotoUriRebaseWith = async (
  store: StoreLike,
  photoFolder: string,
  exists: (uri: string) => Promise<boolean>
): Promise<number> => {
  const candidates = collectRebaseCandidates(store.getState().dataSet, photoFolder);
  if (candidates.size === 0) return 0;
  const confirmed = new Map<string, string>();
  await Promise.all(
    [...candidates].map(async ([from, to]) => {
      if (await exists(to).catch(() => false)) confirmed.set(from, to);
    })
  );
  if (confirmed.size === 0) return 0;
  // 存在確認の間にdataSetが変わっていても取りこぼさないよう、書き換えは最新のstateに対して行う
  const current = store.getState().dataSet;
  const updated = applyPhotoUriRebase(current, confirmed);
  if (updated !== current) store.dispatch(setDataSetAction(updated));
  return confirmed.size;
};

/** 起動時（永続化の復元後）に呼ぶ。iOS以外では何もしない */
export const runPhotoUriRebase = (store: StoreLike): void => {
  if (Platform.OS !== 'ios') return;
  runPhotoUriRebaseWith(store, PHOTO_FOLDER, async (uri) => (await FileSystem.getInfoAsync(uri)).exists).catch((e) =>
    console.log('[photoUriRebase] error:', e)
  );
};
