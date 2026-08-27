import { useEffect, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import { LocationType, TrackPhotoType } from '../types';
import { createThumbnail } from '../utils/Photo';
import {
  TRACK_PHOTO_TIME_MARGIN_MS,
  interpolateTrackPositionAtTime,
  parseImgDirectionFromExif,
  toTrueDirection,
} from '../utils/trackPhoto';
import { magneticDeclination } from '../utils/geomag/wmm';

// 端末の写真ライブラリを軌跡の記録時間帯で照合し、軌跡上に表示する写真を返す（スーパー地形方式）。
// 写真はアプリ内にコピーせず、ライブラリから都度読み出す。Webは写真ライブラリがないため常に空。

// ライブラリスキャンの上限（1回のクエリはページング200件ずつ）
const QUERY_PAGE_SIZE = 200;
const QUERY_MAX_ASSETS = 500;

interface CachedPhotoInfo {
  thumbnail: string | null;
  direction: number | null;
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

export type UseTrackPhotosReturnType = {
  trackPhotos: TrackPhotoType[];
  isLimitedAccess: boolean;
  presentLimitedPicker: () => Promise<void>;
};

export const useTrackPhotos = (coords: LocationType[] | undefined, enabled: boolean): UseTrackPhotosReturnType => {
  const [trackPhotos, setTrackPhotos] = useState<TrackPhotoType[]>([]);
  const [isLimitedAccess, setIsLimitedAccess] = useState(false);

  const presentLimitedPicker = useCallback(async () => {
    if (Platform.OS === 'web') return;
    const MediaLibrary = requireMediaLibrary();
    await MediaLibrary.presentPermissionsPickerAsync(['photo']);
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' || !enabled || coords === undefined || coords.length < 2) {
      setTrackPhotos([]);
      return;
    }
    const timestamps = coords.map((c) => c.timestamp).filter((t): t is number => t !== undefined);
    if (timestamps.length < 2) {
      setTrackPhotos([]);
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
        setTrackPhotos([]);
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

      // EXIF・サムネイルを1枚ずつ取得し、逐次stateへ反映して漸進表示する
      const results: TrackPhotoType[] = [];
      for (const { asset, position } of positioned) {
        if (isCancelled) return;
        const cacheKey = `${asset.id}:${asset.modificationTime}`;
        let info = photoInfoCache.get(cacheKey);
        if (info === undefined) {
          info = await loadPhotoInfo(MediaLibrary, asset, position);
          cacheSet(cacheKey, info);
        }
        if (isCancelled) return;
        results.push({
          assetId: asset.id,
          timestamp: asset.creationTime,
          latitude: position.latitude,
          longitude: position.longitude,
          thumbnail: info.thumbnail,
          direction: info.direction,
          uri: asset.uri,
          localUri: info.localUri,
        });
        setTrackPhotos([...results]);
      }
      if (!isCancelled && results.length === 0) setTrackPhotos([]);
    })();

    return () => {
      isCancelled = true;
      setTrackPhotos([]);
    };
  }, [coords, enabled]);

  return { trackPhotos, isLimitedAccess, presentLimitedPicker };
};

const loadPhotoInfo = async (
  MediaLibrary: typeof import('expo-media-library/legacy'),
  asset: import('expo-media-library/legacy').Asset,
  position: { latitude: number; longitude: number }
): Promise<CachedPhotoInfo> => {
  let localUri: string | undefined;
  let direction: number | null = null;
  try {
    // shouldDownloadFromNetwork:false でiCloud未ダウンロード写真の巨大DLを避ける。
    // その場合はexif/localUriが欠けることがあり、方向なし・サムネイルなしの劣化表示になる
    const info = await MediaLibrary.getAssetInfoAsync(asset, { shouldDownloadFromNetwork: false });
    localUri = info.localUri;
    const parsed = parseImgDirectionFromExif(info.exif);
    if (parsed !== null) {
      const declination =
        parsed.ref === 'M' ? magneticDeclination(position.latitude, position.longitude, asset.creationTime) : 0;
      direction = toTrueDirection(parsed.direction, parsed.ref, declination);
    }
  } catch {
    // 情報取得に失敗しても位置だけで表示する
  }

  let thumbnail: string | null = null;
  try {
    thumbnail = await createThumbnail(localUri ?? asset.uri);
  } catch {
    thumbnail = null;
  }
  return { thumbnail, direction, localUri };
};
