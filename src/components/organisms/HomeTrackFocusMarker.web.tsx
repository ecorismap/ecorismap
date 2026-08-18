import React, { useContext } from 'react';
import { Marker } from 'react-map-gl/maplibre';
import { COLOR } from '../../constants/AppConstants';
import { TrackFocusContext } from '../../contexts/TrackFocus';

// 軌跡サマリー表示中に標高グラフのカーソル位置を示すマーカー（Web版）
export const HomeTrackFocusMarker = React.memo(() => {
  const { trackFocusPoint } = useContext(TrackFocusContext);

  if (trackFocusPoint === null) return null;

  return (
    <Marker longitude={trackFocusPoint.longitude} latitude={trackFocusPoint.latitude} anchor="center">
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
