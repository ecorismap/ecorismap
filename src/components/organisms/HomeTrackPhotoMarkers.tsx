import React, { useContext, useMemo, useState } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import { Marker } from 'react-native-maps';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { G, Path } from 'react-native-svg';
import { COLOR } from '../../constants/AppConstants';
import { TrackPhotoContext } from '../../contexts/TrackPhoto';
import { TrackPhotoType } from '../../types';
import { MARKER_BAND, markerZIndex } from '../../utils/markerZIndex';
import { ViewportBounds, expandBounds, isPointInBounds } from '../../utils/ViewportCulling';

// 軌跡サマリー表示中に、記録時間帯に撮影された写真をサムネイルマーカーで軌跡上に表示する。
// EXIFの撮影方向がある写真は扇形でカメラの向き（真北基準）を示す。
// タップ判定はMarkerのonPressではなくcontainers/Home.tsxの画面タップヒットテストで行う
// （native onPressはPanResponderと競合して取りこぼすため）

const MARKER_SIZE = 64;
const FAN_RADIUS = 30;
const THUMBNAIL_SIZE = 36;
const CENTER = MARKER_SIZE / 2;
// 中心角60度の扇形（北向き）。回転はGのrotationで与える。
// サムネイルは円形（半径18）なので、半径30の扇形の先端12px分がどの方向でも均等にはみ出して見える
const FAN_PATH = `M${CENTER} ${CENTER} L${CENTER - FAN_RADIUS * Math.sin(Math.PI / 6)} ${
  CENTER - FAN_RADIUS * Math.cos(Math.PI / 6)
} A${FAN_RADIUS} ${FAN_RADIUS} 0 0 1 ${CENTER + FAN_RADIUS * Math.sin(Math.PI / 6)} ${
  CENTER - FAN_RADIUS * Math.cos(Math.PI / 6)
} Z`;

const TrackPhotoMarker = React.memo(({ photo }: { photo: TrackPhotoType }) => {
  // Androidでサムネイル画像の描画完了前にスナップショット化されて空表示になるのを防ぐ。
  // 読み込み完了後はfalseに落として再描画コストを抑える
  const [tracksViewChanges, setTracksViewChanges] = useState(photo.thumbnail !== null);
  const zIndex = markerZIndex(MARKER_BAND.TRACK_PHOTO, photo.assetId);

  return (
    <Marker
      coordinate={{ latitude: photo.latitude, longitude: photo.longitude }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracksViewChanges}
      // style.zIndexはGMSMarkerに届かないためiOSはnativeのzIndexプロップを使う
      zIndex={Platform.OS === 'ios' ? zIndex : undefined}
      style={{ zIndex }}
    >
      <View style={styles.container}>
        {photo.direction !== null && (
          <Svg width={MARKER_SIZE} height={MARKER_SIZE} style={StyleSheet.absoluteFill}>
            <G rotation={photo.direction} origin={`${CENTER}, ${CENTER}`}>
              <Path d={FAN_PATH} fill={COLOR.ORANGE} fillOpacity={0.7} stroke={COLOR.WHITE} strokeWidth={1} strokeOpacity={0.8} />
            </G>
          </Svg>
        )}
        {photo.thumbnail !== null ? (
          <Image
            source={{ uri: photo.thumbnail }}
            style={styles.thumbnail}
            // Androidは画像読み込み直後にスナップショット化すると扇形がまだ描画されて
            // いないことがあるため、少し待ってからfalseに落とす
            onLoadEnd={() => setTimeout(() => setTracksViewChanges(false), 300)}
          />
        ) : (
          <View style={styles.placeholder}>
            <MaterialCommunityIcons name="camera" size={20} color={COLOR.GRAY3} selectable={undefined} />
          </View>
        )}
      </View>
    </Marker>
  );
});

interface Props {
  bounds: ViewportBounds | null;
}

export const HomeTrackPhotoMarkers = React.memo(({ bounds }: Props) => {
  const { trackPhotos } = useContext(TrackPhotoContext);

  // 画面範囲（バッファ20%）外の写真は描画しない
  const visiblePhotos = useMemo(() => {
    if (trackPhotos.length === 0) return trackPhotos;
    if (bounds === null) return trackPhotos;
    const expanded = expandBounds(bounds, 20);
    return trackPhotos.filter((p) => isPointInBounds({ latitude: p.latitude, longitude: p.longitude }, expanded));
  }, [trackPhotos, bounds]);

  if (visiblePhotos.length === 0) return null;

  return (
    <>
      {visiblePhotos.map((photo) => (
        <TrackPhotoMarker key={photo.assetId} photo={photo} />
      ))}
    </>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    height: MARKER_SIZE,
    justifyContent: 'center',
    width: MARKER_SIZE,
  },
  // 円形にすることで扇形のはみ出し量がどの方向でも均等になる
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
