import React, { useContext, useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Marker, Polyline } from 'react-native-maps';
import { COLOR } from '../../constants/AppConstants';
import { MeasureContext } from '../../contexts/Measure';
import { SELECTED_MARKER_ZINDEX } from '../../utils/markerZIndex';
import { haversineKm, formatDistanceKm } from '../../utils/Location';
import LineLabel from '../atoms/LineLabel';
import { LocationType } from '../../types';

// 二点間距離測定の線・端点マーカー・距離ラベル（native版）
export const HomeMeasure = React.memo(() => {
  const { measureA, measureB } = useContext(MeasureContext);

  // 中点ラベル座標。経度180度跨ぎでは単純平均が反対側に出るが実用上許容
  const midPoint: LocationType | null = useMemo(() => {
    if (!measureA || !measureB) return null;
    return {
      latitude: (measureA.latitude + measureB.latitude) / 2,
      longitude: (measureA.longitude + measureB.longitude) / 2,
    };
  }, [measureA, measureB]);

  const distanceLabel = useMemo(() => {
    if (!measureA || !measureB) return '';
    return formatDistanceKm(haversineKm(measureA, measureB));
  }, [measureA, measureB]);

  if (!measureA) return null;

  return (
    <>
      {measureB && (
        <Polyline
          coordinates={[
            { latitude: measureA.latitude, longitude: measureA.longitude },
            { latitude: measureB.latitude, longitude: measureB.longitude },
          ]}
          strokeColor={COLOR.ORANGE}
          strokeWidth={2}
          lineDashPattern={[5, 5]}
          zIndex={1000}
        />
      )}
      <MeasurePointMarker coordinate={measureA} />
      {measureB && <MeasurePointMarker coordinate={measureB} />}
      {midPoint && (
        <LineLabel coordinate={midPoint} label={distanceLabel} size={16} color={COLOR.BLACK} borderColor={COLOR.WHITE} />
      )}
    </>
  );
});

const MeasurePointMarker = React.memo(({ coordinate }: { coordinate: LocationType }) => (
  <Marker
    coordinate={{ latitude: coordinate.latitude, longitude: coordinate.longitude }}
    anchor={{ x: 0.5, y: 0.5 }}
    tracksViewChanges={false}
    // style.zIndexはGMSMarkerに届かないためiOSはnativeのzIndexプロップを使う
    zIndex={Platform.OS === 'ios' ? SELECTED_MARKER_ZINDEX : undefined}
    style={{ zIndex: 1001 }}
  >
    <View style={styles.outer}>
      <View style={styles.inner} />
    </View>
  </Marker>
));

const styles = StyleSheet.create({
  inner: {
    backgroundColor: COLOR.ORANGE,
    borderColor: COLOR.WHITE,
    borderRadius: 7,
    borderWidth: 2,
    height: 14,
    width: 14,
  },
  outer: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
});
