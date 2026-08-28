import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Circle, Line } from 'react-native-svg';
import { COLOR } from '../../constants/AppConstants';
import { MapViewContext } from '../../contexts/MapView';
import { TrackPhotoContext } from '../../contexts/TrackPhoto';
import { useWindow } from '../../hooks/useWindow';
import { TrackPhotoType } from '../../types';
import { latLonToXY } from '../../utils/Coords';
import { MARKER_BAND, TRACK_PHOTO_EXPANDED_ZINDEX, markerZIndex } from '../../utils/markerZIndex';
import { clusterTrackPhotos, spiderOffsets, spiderRadius } from '../../utils/trackPhoto';
import { ViewportBounds, expandBounds, isPointInBounds } from '../../utils/ViewportCulling';

// 軌跡サマリー表示中に、記録時間帯に撮影された写真をサムネイルマーカーで軌跡上に表示する。
// 画面上で重なる写真はグループ化して枚数バッジつきの1マーカーにまとめ、
// タップで引き出し線つきの円形レイアウトに展開する（クラスタリングはタップ判定側と共有）。
// タップ判定はMarkerのonPressではなくcontainers/Home.tsxの画面タップヒットテストで行う
// （native onPressはPanResponderと競合して取りこぼすため）

const MARKER_SIZE = 48;
const THUMBNAIL_SIZE = 36;

// サムネイル（なければカメラアイコンのプレースホルダ）
const PhotoThumbnail = React.memo(
  ({ photo, onLoadEnd }: { photo: TrackPhotoType; onLoadEnd: () => void }) =>
    photo.thumbnail !== null ? (
      <Image source={{ uri: photo.thumbnail }} style={styles.thumbnail} onLoadEnd={onLoadEnd} />
    ) : (
      <View style={styles.placeholder}>
        <MaterialCommunityIcons name="camera" size={20} color={COLOR.GRAY3} selectable={undefined} />
      </View>
    )
);

interface ClusterMarkerProps {
  photos: TrackPhotoType[]; // 先頭が代表（クラスタid=先頭のassetId、マーカー位置も先頭の座標）
  expanded: boolean;
}

const TrackPhotoClusterMarker = React.memo(({ photos, expanded }: ClusterMarkerProps) => {
  const representative = photos[0];
  const zIndex = expanded
    ? TRACK_PHOTO_EXPANDED_ZINDEX
    : markerZIndex(MARKER_BAND.TRACK_PHOTO, representative.assetId);

  // Androidでサムネイル画像の描画完了前にスナップショット化されて空表示になるのを防ぐ。
  // 表示中の全サムネイルの読み込み完了後にfalseへ落として再描画コストを抑える
  const [tracksViewChanges, setTracksViewChanges] = useState(true);
  const loadedCountRef = useRef(0);
  const expectedLoads = expanded
    ? photos.filter((p) => p.thumbnail !== null).length
    : representative.thumbnail !== null
    ? 1
    : 0;

  useEffect(() => {
    loadedCountRef.current = 0;
    setTracksViewChanges(true);
  }, [expanded, photos]);

  useEffect(() => {
    if (!tracksViewChanges || expectedLoads > 0) return;
    const timer = setTimeout(() => setTracksViewChanges(false), 300);
    return () => clearTimeout(timer);
  }, [tracksViewChanges, expectedLoads]);

  const handleThumbnailLoadEnd = useCallback(() => {
    loadedCountRef.current += 1;
    // 画像読み込み直後にスナップショット化すると描画が間に合わないことがあるため少し待つ
    if (loadedCountRef.current >= expectedLoads) setTimeout(() => setTracksViewChanges(false), 300);
  }, [expectedLoads]);

  // 展開時はメンバー数に応じた円形レイアウト分の描画領域を確保する
  const offsets = useMemo(() => spiderOffsets(photos.length), [photos.length]);
  const size = expanded ? (spiderRadius(photos.length) + THUMBNAIL_SIZE / 2 + 2) * 2 : MARKER_SIZE;
  const center = size / 2;

  return (
    <Marker
      coordinate={{ latitude: representative.latitude, longitude: representative.longitude }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracksViewChanges}
      // style.zIndexはGMSMarkerに届かないためiOSはnativeのzIndexプロップを使う
      zIndex={Platform.OS === 'ios' ? zIndex : undefined}
      style={{ zIndex }}
    >
      {expanded ? (
        <View style={{ width: size, height: size }}>
          <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
            {offsets.map((offset, i) => (
              <React.Fragment key={photos[i].assetId}>
                <Line
                  x1={center}
                  y1={center}
                  x2={center + offset.dx}
                  y2={center + offset.dy}
                  stroke={COLOR.WHITE}
                  strokeWidth={3}
                />
                <Line
                  x1={center}
                  y1={center}
                  x2={center + offset.dx}
                  y2={center + offset.dy}
                  stroke={COLOR.GRAY2}
                  strokeWidth={1.5}
                />
              </React.Fragment>
            ))}
            {/* 実際の位置を示す中心点 */}
            <Circle cx={center} cy={center} r={4} fill={COLOR.ORANGE} stroke={COLOR.WHITE} strokeWidth={1.5} />
          </Svg>
          {photos.map((photo, i) => (
            <View
              key={photo.assetId}
              style={{
                position: 'absolute',
                left: center + offsets[i].dx - THUMBNAIL_SIZE / 2,
                top: center + offsets[i].dy - THUMBNAIL_SIZE / 2,
              }}
            >
              <PhotoThumbnail photo={photo} onLoadEnd={handleThumbnailLoadEnd} />
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.container}>
          <PhotoThumbnail photo={representative} onLoadEnd={handleThumbnailLoadEnd} />
          {photos.length > 1 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{photos.length}</Text>
            </View>
          )}
        </View>
      )}
    </Marker>
  );
});

interface Props {
  bounds: ViewportBounds | null;
}

export const HomeTrackPhotoMarkers = React.memo(({ bounds }: Props) => {
  const { trackPhotos, expandedClusterId } = useContext(TrackPhotoContext);
  const { mapViewRef } = useContext(MapViewContext);
  const { mapRegion, mapSize } = useWindow();

  const photoById = useMemo(() => new Map(trackPhotos.map((p) => [p.assetId, p])), [trackPhotos]);

  // 全写真を画面座標でクラスタリング（タップ判定側と同一の入力・ロジックで結果を一致させる）
  const clusters = useMemo(() => {
    if (trackPhotos.length === 0) return [];
    const items = trackPhotos.map((photo) => {
      const [x, y] = latLonToXY([photo.longitude, photo.latitude], mapRegion, mapSize, mapViewRef.current);
      return { assetId: photo.assetId, x, y };
    });
    return clusterTrackPhotos(items);
  }, [trackPhotos, mapRegion, mapSize, mapViewRef]);

  // 画面範囲（バッファ20%）外のグループは描画しない
  const visibleClusters = useMemo(() => {
    if (clusters.length === 0 || bounds === null) return clusters;
    const expanded = expandBounds(bounds, 20);
    return clusters.filter((cluster) => {
      const rep = photoById.get(cluster.id);
      return rep !== undefined && isPointInBounds({ latitude: rep.latitude, longitude: rep.longitude }, expanded);
    });
  }, [clusters, bounds, photoById]);

  if (visibleClusters.length === 0) return null;

  return (
    <>
      {visibleClusters.map((cluster) => {
        const photos = cluster.assetIds
          .map((id) => photoById.get(id))
          .filter((p): p is TrackPhotoType => p !== undefined);
        if (photos.length === 0) return null;
        return (
          <TrackPhotoClusterMarker
            key={cluster.id}
            photos={photos}
            expanded={cluster.id === expandedClusterId && photos.length > 1}
          />
        );
      })}
    </>
  );
});

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    backgroundColor: COLOR.ORANGE,
    borderColor: COLOR.WHITE,
    borderRadius: 9,
    borderWidth: 1.5,
    height: 18,
    justifyContent: 'center',
    minWidth: 18,
    paddingHorizontal: 3,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  badgeText: {
    color: COLOR.WHITE,
    fontSize: 11,
    fontWeight: 'bold',
  },
  container: {
    alignItems: 'center',
    height: MARKER_SIZE,
    justifyContent: 'center',
    width: MARKER_SIZE,
  },
  placeholder: {
    alignItems: 'center',
    backgroundColor: COLOR.WHITE,
    borderColor: COLOR.WHITE,
    borderRadius: THUMBNAIL_SIZE / 2,
    borderWidth: 2,
    height: THUMBNAIL_SIZE,
    justifyContent: 'center',
    overflow: 'hidden',
    width: THUMBNAIL_SIZE,
  },
  thumbnail: {
    borderColor: COLOR.WHITE,
    borderRadius: THUMBNAIL_SIZE / 2,
    borderWidth: 2,
    height: THUMBNAIL_SIZE,
    overflow: 'hidden',
    width: THUMBNAIL_SIZE,
  },
});
