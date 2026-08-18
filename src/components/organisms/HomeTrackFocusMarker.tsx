import React, { useContext } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Marker } from 'react-native-maps';
import { COLOR } from '../../constants/AppConstants';
import { TrackFocusContext } from '../../contexts/TrackFocus';
import { TRACK_FOCUS_MARKER_ZINDEX } from '../../utils/markerZIndex';

// 軌跡サマリー表示中に標高グラフのカーソル位置を示すマーカー
export const HomeTrackFocusMarker = React.memo(() => {
  const { trackFocusPoint } = useContext(TrackFocusContext);

  if (trackFocusPoint === null) return null;

  return (
    <Marker
      coordinate={{ latitude: trackFocusPoint.latitude, longitude: trackFocusPoint.longitude }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={false}
      // style.zIndexはGMSMarkerに届かないためiOSはnativeのzIndexプロップを使う
      zIndex={Platform.OS === 'ios' ? TRACK_FOCUS_MARKER_ZINDEX : undefined}
      style={{ zIndex: 1001 }}
    >
      <View style={styles.outer}>
        <View style={styles.inner} />
      </View>
    </Marker>
  );
});

const styles = StyleSheet.create({
  inner: {
    backgroundColor: COLOR.ORANGE,
    borderColor: COLOR.WHITE,
    borderRadius: 8,
    borderWidth: 2.5,
    height: 16,
    width: 16,
  },
  outer: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
});
