import React, { useContext, useEffect, useRef } from 'react';
import { Marker } from 'react-map-gl/maplibre';
import type { Marker as MaplibreMarker } from 'maplibre-gl';
import { useHideMarkersBehindCamera } from '../../hooks/useHideMarkersBehindCamera';
import { COLOR } from '../../constants/AppConstants';
import { TrackFocusContext } from '../../contexts/TrackFocus';

// 軌跡サマリー表示中に標高グラフのカーソル位置を示すマーカー（Web版）
export const HomeTrackFocusMarker = React.memo(() => {
  const { trackFocusPoint } = useContext(TrackFocusContext);
  // 傾けた3D・眺望で、カメラの後ろの点が前方の空に浮かないようにする
  const markerRef = useRef<MaplibreMarker | null>(null);
  const refreshVisibility = useHideMarkersBehindCamera(() => [markerRef.current]);
  // 地図が止まっていると描画イベントが来ないので、点が動いたら判定し直す
  useEffect(() => refreshVisibility(), [trackFocusPoint, refreshVisibility]);

  if (trackFocusPoint === null) return null;

  return (
    <Marker ref={markerRef} longitude={trackFocusPoint.longitude} latitude={trackFocusPoint.latitude} anchor="center">
      <div
        style={{
          backgroundColor: COLOR.ORANGE,
          border: `2.5px solid ${COLOR.WHITE}`,
          borderRadius: 8,
          boxSizing: 'border-box',
          height: 16,
          width: 16,
        }}
      />
    </Marker>
  );
});
