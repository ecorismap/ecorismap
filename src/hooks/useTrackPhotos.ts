import { useEffect, useRef, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import { LocationType, TrackPhotoType } from '../types';
import { createThumbnail } from '../utils/Photo';
import { TRACK_PHOTO_TIME_MARGIN_MS, interpolateTrackPositionAtTime } from '../utils/trackPhoto';

// 端末の写真ライブラリを軌跡の記録時間帯で照合し、軌跡上に表示する写真を返す（スーパー地形方式）。
// 写真はアプリ内にコピーせず、ライブラリから都度読み出す。Webは写真ライブラリがないため常に空。

// ライブラリスキャンの上限（1回のクエリはページング200件ずつ）
const QUERY_PAGE_SIZE = 200;
const QUERY_MAX_ASSETS = 500;

interface CachedPhotoInfo {
  thumbnail: string | null;
  localUri?: string;
}

// 同じ軌跡を開き直したときのサムネイル再生成を避けるセッション内キャッシュ。
// キーにmodificationTimeを含め、編集された写真は取り直す
const photoInfoCache = new Map<string, CachedPhotoInfo>();
const CACHE_MAX_ENTRIES = 200;

const cacheSet = (key: string, value: CachedPhotoInfo) => {
  if (photoInfoCache.size >= CACHE_MAX_ENTRIES) {
    const oldestKey = photoInfoCache.keys().next().value;
    if (oldestKey !== undefined) photoInfoCache.delete(oldestKey);
  }
  photoInfoCache.set(key, value);
};

// SDK 56: expo-media-libraryはimport時にネイティブモジュールを即時requireするためWebで例外になる。
// ネイティブでのみ遅延requireする（Photo.tsと同じパターン）。新クラスAPIではなくlegacy APIを使う
const requireMediaLibrary = () =>
  require('expo-media-library/legacy') as typeof import('expo-media-library/legacy');

// エクスポート等で写真の実ファイル（file:// URI）が必要なときに解決する。
// AndroidのgetAssetInfoAsyncはEXIF読み取りに失敗した写真でlocalUriを返さないが、
// uri自体が常にfile://の実パスなのでそちらへフォールバックする。
// iOSはuriがph://のため使えず、localUri未取得（Live Photo・iCloud未ダウンロード等）の場合は
// ダウンロードを許可して再取得する
export const resolveTrackPhotoFileUri = async (photo: TrackPhotoType): Promise<string | undefined> => {
  if (photo.localUri !== undefined) return photo.localUri;
  if (photo.uri.startsWith('file://')) return photo.uri;
  if (Platform.OS === 'web') return undefined;
  try {
    const MediaLibrary = requireMediaLibrary();
    const info = await MediaLibrary.getAssetInfoAsync(photo.assetId, { shouldDownloadFromNetwork: true });
    return info.localUri;
  } catch {
    return undefined;
  }
};

export type UseTrackPhotosReturnType = {
  trackPhotos: TrackPhotoType[];
  isLimitedAccess: boolean;
  presentLimitedPicker: () => Promise<void>;
};

export const useTrackPhotos = (coords: LocationType[] | undefined, enabled: boolean): UseTrackPhotosReturnType => {
  const [trackPhotos, setTrackPhotos] = useState<TrackPhotoType[]>([]);
  const [isLimitedAccess, setIsLimitedAccess] = useState(false);
  // 再照合（記録中のライブ更新）でのちらつき防止に現在の表示内容を参照するためのref
  const trackPhotosRef = useRef<TrackPhotoType[]>([]);
  const applyTrackPhotos = useCallback((photos: TrackPhotoType[]) => {
    trackPhotosRef.current = photos;
    setTrackPhotos(photos);
  }, []);

  const presentLimitedPicker = useCallback(async () => {
    if (Platform.OS === 'web') return;
    const MediaLibrary = requireMediaLibrary();
    await MediaLibrary.presentPermissionsPickerAsync(['photo']);
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' || !enabled || coords === undefined || coords.length < 2) {
      applyTrackPhotos([]);
      return;
    }
    const timestamps = coords.map((c) => c.timestamp).filter((t): t is number => t !== undefined);
    if (timestamps.length < 2) {
      applyTrackPhotos([]);
      return;
    }
    const trackStart = timestamps[0];
    const trackEnd = timestamps[timestamps.length - 1];

    let isCancelled = false;

    (async () => {
      const MediaLibrary = requireMediaLibrary();

      const permission = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
      if (isCancelled) return;
      if (!permission.granted) {
        applyTrackPhotos([]);
        return;
      }
      setIsLimitedAccess(permission.accessPrivileges === 'limited');

      // 記録時間帯（±マージン）の写真を撮影時刻順に収集
      const assets: import('expo-media-library/legacy').Asset[] = [];
      let after: string | undefined;
      while (assets.length < QUERY_MAX_ASSETS) {
        const page = await MediaLibrary.getAssetsAsync({
          mediaType: 'photo',
          createdAfter: trackStart - TRACK_PHOTO_TIME_MARGIN_MS,
          createdBefore: trackEnd + TRACK_PHOTO_TIME_MARGIN_MS,
          sortBy: [[MediaLibrary.SortBy.creationTime, true]],
          first: QUERY_PAGE_SIZE,
          after,
        });
        if (isCancelled) return;
        assets.push(...page.assets);
        if (!page.hasNextPage || page.endCursor === undefined) break;
        after = page.endCursor;
      }

      // 時刻照合で軌跡上の位置を決める。範囲外はスキップ
      const positioned = assets
        .map((asset) => ({ asset, position: interpolateTrackPositionAtTime(coords, asset.creationTime) }))
        .filter((item): item is { asset: (typeof assets)[number]; position: { latitude: number; longitude: number } } => item.position !== null);

      // サムネイルを1枚ずつ取得する。初回（未表示）は逐次stateへ反映して漸進表示し、
      // 表示中の再照合（記録中のライブ更新）は走査完了時に内容が変わったときだけ
      // 一括で差し替えてマーカーのちらつきを防ぐ
      const progressive = trackPhotosRef.current.length === 0;
      const results: TrackPhotoType[] = [];
      for (const { asset, position } of positioned) {
        if (isCancelled) return;
        const cacheKey = `${asset.id}:${asset.modificationTime}`;
        let info = photoInfoCache.get(cacheKey);
        if (info === undefined) {
          info = await loadPhotoInfo(MediaLibrary, asset);
          cacheSet(cacheKey, info);
        }
        if (isCancelled) return;
        results.push({
          assetId: asset.id,
          timestamp: asset.creationTime,
          latitude: position.latitude,
          longitude: position.longitude,
          thumbnail: info.thumbnail,
          uri: asset.uri,
          localUri: info.localUri,
          filename: asset.filename,
        });
        if (progressive) applyTrackPhotos([...results]);
      }
      if (isCancelled) return;
      if (progressive) {
        if (results.length === 0) applyTrackPhotos([]);
      } else {
        const signature = (list: TrackPhotoType[]) =>
          list.map((p) => `${p.assetId}:${p.latitude}:${p.longitude}:${p.thumbnail !== null ? 1 : 0}`).join('|');
        if (signature(results) !== signature(trackPhotosRef.current)) applyTrackPhotos(results);
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [coords, enabled, applyTrackPhotos]);

  return { trackPhotos, isLimitedAccess, presentLimitedPicker };
};

// mediaSubtypesはiOSのみ返る（Androidはundefined）
const isLivePhoto = (asset: import('expo-media-library/legacy').Asset) =>
  asset.mediaSubtypes?.includes('livePhoto') === true;

const loadPhotoInfo = async (
  MediaLibrary: typeof import('expo-media-library/legacy'),
  asset: import('expo-media-library/legacy').Asset
): Promise<CachedPhotoInfo> => {
  let localUri: string | undefined;
  // Live PhotoのgetAssetInfoAsyncはペアの動画を一時ファイルへ書き出すため非常に重い。
  // 表示に必要なのはサムネイルだけで、これはph:// URIから直接作れるので情報取得ごと省く
  // （実ファイルが必要なエクスポート時だけresolveTrackPhotoFileUriで都度解決する）
  if (!isLivePhoto(asset)) {
    try {
      // shouldDownloadFromNetwork:false でiCloud未ダウンロード写真の巨大DLを避ける。
      // その場合はlocalUriが欠けることがあり、サムネイルなしの劣化表示になる
      const info = await MediaLibrary.getAssetInfoAsync(asset, { shouldDownloadFromNetwork: false });
      localUri = info.localUri;
    } catch {
      // 情報取得に失敗しても位置だけで表示する
    }
  }

  let thumbnail: string | null = null;
  try {
    thumbnail = await createThumbnail(localUri ?? asset.uri);
  } catch {
    thumbnail = null;
  }
  return { thumbnail, localUri };
};
