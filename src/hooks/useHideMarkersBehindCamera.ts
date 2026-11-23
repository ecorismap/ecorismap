/**
 * Web版（maplibre）で、カメラの後ろにあるマーカーを隠す。
 *
 * maplibreのマーカーは後ろの地点も投影してしまい、傾けた3Dや眺望では背後の地点が
 * 前方の空に鏡写しで浮く（webCamera.ts冒頭）。調査ポイント（HomePoint.web）と同じ背後判定を、
 * メンバー位置・軌跡フォーカス・測定点・現在地ドットにも当てる。
 * 地形に隠れた点まで消す処理は見え方の変更になるので、ここでは行わない。
 */
import { useCallback, useEffect, useRef } from 'react';
import { useMap } from 'react-map-gl/maplibre';
import type { LngLat, Marker as MaplibreMarker } from 'maplibre-gl';
import { createBehindCameraTest, isUsableLngLat } from '../utils/terrain3d/webCamera';

/** 判定に必要なマーカーの機能だけ（テストで差し替えやすくする） */
export type BehindTestMarker = Pick<MaplibreMarker, 'getLngLat' | 'getElement'>;

/** isBehindがnull（傾けていない）なら全て表示に戻す */
export const applyBehindCameraVisibility = (
  markers: readonly (BehindTestMarker | null | undefined)[],
  isBehind: ((lngLat: LngLat) => boolean) | null
): void => {
  for (const marker of markers) {
    if (marker === null || marker === undefined) continue;
    // GeolocateControlの現在地ドット・精度円は位置が一度も届いていないとundefinedを返す（型はLngLat）
    const lngLat = marker.getLngLat() as LngLat | undefined;
    const hidden = isBehind !== null && isUsableLngLat(lngLat) && isBehind(lngLat);
    const element = marker.getElement();
    const visibility = hidden ? 'hidden' : '';
    if (element.style.visibility !== visibility) element.style.visibility = visibility;
  }
};

/** on/offを持つイベント源（maplibreのEvented。テストで差し替えやすくする） */
export interface RefreshEventSource {
  on: (type: string, listener: () => void) => unknown;
  off: (type: string, listener: () => void) => unknown;
}

/**
 * イベント源の通知で判定し直す。マーカーの位置だけが変わったときは地図の描画イベントが来ないので、
 * 位置更新の通知（GeolocateControlのgeolocate等）を拾う
 * @returns 購読を外す関数
 */
export const refreshOnEvent = (source: RefreshEventSource | null, type: string, update: () => void): (() => void) => {
  if (source === null) return () => undefined;
  source.on(type, update);
  return () => {
    source.off(type, update);
  };
};

let warnedRefreshFailure = false;

/**
 * 地図とマーカーで判定し直す。地図のrender・idleのハンドラやReactのコミット中から呼ばれるので、
 * 例外を外へ出さない（出すとmaplibreの描画ループかReactの更新ごと止まり、画面が真っ白になる）。
 * 判定できなかったときは今の表示のまま残す
 */
export const refreshBehindCameraVisibility = (
  map: Parameters<typeof createBehindCameraTest>[0],
  getMarkers: () => readonly (BehindTestMarker | null | undefined)[]
): void => {
  try {
    applyBehindCameraVisibility(getMarkers(), createBehindCameraTest(map));
  } catch (error) {
    if (!warnedRefreshFailure) {
      warnedRefreshFailure = true;
      // eslint-disable-next-line no-console
      console.warn('useHideMarkersBehindCamera: 背後判定に失敗しました', error);
    }
  }
};

/**
 * @param getMarkers 判定するマーカー（描画のたびに呼ぶので、refから読むだけにすること）
 * @returns 今すぐ判定し直す関数（マーカーが作り直されたとき用）
 */
export const useHideMarkersBehindCamera = (
  getMarkers: () => readonly (BehindTestMarker | null | undefined)[]
): (() => void) => {
  const { current: mapRef } = useMap();
  const getMarkersRef = useRef(getMarkers);
  getMarkersRef.current = getMarkers;
  const update = useCallback(() => {
    const map = mapRef?.getMap();
    if (!map) return;
    refreshBehindCameraVisibility(map, getMarkersRef.current);
  }, [mapRef]);
  useEffect(() => {
    const map = mapRef?.getMap();
    if (!map) return;
    // 位置はmaplibreが描画ごとに動かすので、描画のたびに判定する
    map.on('render', update);
    map.on('idle', update);
    update();
    return () => {
      map.off('render', update);
      map.off('idle', update);
    };
  }, [mapRef, update]);
  return update;
};
