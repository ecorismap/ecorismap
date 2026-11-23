import React, { useEffect } from 'react';
import type { GeolocateControl as MaplibreGeolocateControl, Marker as MaplibreMarker } from 'maplibre-gl';
import { refreshOnEvent, useHideMarkersBehindCamera } from '../../hooks/useHideMarkersBehindCamera';

interface Props {
  controlRef: React.RefObject<MaplibreGeolocateControl | null>;
}

/** GeolocateControlが内部に持つ現在地ドットと精度円（型定義に出ていないので必要な分だけ書く） */
interface GeolocateMarkers {
  _userLocationDotMarker?: MaplibreMarker;
  _accuracyCircleMarker?: MaplibreMarker;
}

/**
 * 現在地ドット（GeolocateControl）がカメラの後ろにあるとき隠す（Web版）。
 * 傾けた3D・眺望では、後ろの現在地が前方の空に鏡写しで浮く。Mapの子として置くこと
 */
export const HomeUserLocationBehindGuard = React.memo(({ controlRef }: Props) => {
  const refreshVisibility = useHideMarkersBehindCamera(() => {
    const control = controlRef.current as (MaplibreGeolocateControl & GeolocateMarkers) | null;
    if (control === null) return [];
    return [control._userLocationDotMarker, control._accuracyCircleMarker];
  });
  // 追従していないときの位置更新はドットを動かすだけで地図の描画イベントが来ないので、
  // 位置が届くたびに判定し直す（geolocateはドットを動かした後に通知される）
  useEffect(
    () => refreshOnEvent(controlRef.current, 'geolocate', refreshVisibility),
    [controlRef, refreshVisibility]
  );
  return null;
});
