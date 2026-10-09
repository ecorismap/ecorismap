import React, { useContext, useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Marker, Polyline } from 'react-native-maps';
import { COLOR } from '../../constants/AppConstants';
import { MeasureContext } from '../../contexts/Measure';
import { SELECTED_MARKER_ZINDEX } from '../../utils/markerZIndex';
import { LocationType } from '../../types';

// 二点間距離測定の線・端点マーカー（native版）。距離の数値は上部のバナー（HomeMeasureBanner）に出す
export const HomeMeasure = React.memo(() => {
  const { measureA, measureB } = useContext(MeasureContext);

  const lineCoordinates = useMemo(() => {
    if (!measureA || !measureB) return null;
    return [
      { latitude: measureA.latitude, longitude: measureA.longitude },
      { latitude: measureB.latitude, longitude: measureB.longitude },
    ];
  }, [measureA, measureB]);

  if (!measureA) return null;

  return (
    <>
      {/* 白い縁取りを下に敷き、その上にオレンジの破線を重ねる（どの背景地図でも線が埋もれないように） */}
      {lineCoordinates && (
        <Polyline coordinates={lineCoordinates} strokeColor={COLOR.WHITE} strokeWidth={6} zIndex={999} />
      )}
      {lineCoordinates && (
        <Polyline
          coordinates={lineCoordinates}
          strokeColor={COLOR.ORANGE}
          strokeWidth={3}
          lineDashPattern={[8, 6]}
          zIndex={1000}
        />
      )}
      <MeasurePointMarker coordinate={measureA} />
      {measureB && <MeasurePointMarker coordinate={measureB} />}
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
    {/* Androidでは外枠Viewが平坦化（view flattening）されて内側の丸がマーカー直下に来ると、
        ビットマップが内側基準で切り出されてアンカー（中央）が右下へずれる。collapsable=falseで外枠を残す */}
    <View style={styles.outer} collapsable={false}>
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
