import React, { useContext } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Marker, Polygon } from 'react-native-maps';
import { COLOR } from '../../constants/AppConstants';
import { ViewshedContext } from '../../contexts/Viewshed';
import { SELECTED_MARKER_ZINDEX } from '../../utils/markerZIndex';
import { LocationType } from '../../types';

// 旧来のレイヤ保存時と同じ半透明赤の見た目に合わせる
const VIEWSHED_FILL_COLOR = 'rgba(255, 0, 0, 0.4)';

// 可視領域の一時表示（native版）。計算結果を地図に直描画する（レイヤ化しない）
export const HomeViewshedPreview = React.memo(() => {
  const { viewshedResults } = useContext(ViewshedContext);

  if (viewshedResults.length === 0) return null;

  return (
    <>
      {viewshedResults.map((result, index) => (
        <React.Fragment key={result.id}>
          {result.polygons.map((polygon, i) => (
            <Polygon
              key={`${result.id}-${i}`}
              coordinates={polygon.coords}
              holes={Object.keys(polygon.holes).length > 0 ? Object.values(polygon.holes) : undefined}
              strokeColor={VIEWSHED_FILL_COLOR}
              fillColor={VIEWSHED_FILL_COLOR}
              strokeWidth={1.5}
              zIndex={100}
            />
          ))}
          <Polygon
            coordinates={result.circleRing}
            strokeColor={COLOR.RED}
            fillColor="rgba(0, 0, 0, 0)"
            strokeWidth={1.5}
            zIndex={100}
          />
          <ObserverMarker coordinate={result.observer} no={index + 1} />
        </React.Fragment>
      ))}
    </>
  );
});

// 観測点マーカー。番号は表示中の作成順の連番
const ObserverMarker = React.memo(({ coordinate, no }: { coordinate: LocationType; no: number }) => (
  <Marker
    coordinate={{ latitude: coordinate.latitude, longitude: coordinate.longitude }}
    anchor={{ x: 0.5, y: 0.5 }}
    tracksViewChanges={false}
    // style.zIndexはGMSMarkerに届かないためiOSはnativeのzIndexプロップを使う
    zIndex={Platform.OS === 'ios' ? SELECTED_MARKER_ZINDEX : undefined}
    style={{ zIndex: 1001 }}
  >
    <View style={styles.outer}>
      <View style={styles.inner}>
        <Text style={styles.no}>{no}</Text>
      </View>
    </View>
  </Marker>
));

const styles = StyleSheet.create({
  inner: {
    alignItems: 'center',
    backgroundColor: COLOR.RED,
    borderColor: COLOR.WHITE,
    borderRadius: 10,
    borderWidth: 2,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  no: {
    color: COLOR.WHITE,
    fontSize: 11,
    fontWeight: 'bold',
  },
  outer: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
});
