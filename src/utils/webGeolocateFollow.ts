/**
 * Web版で、現在地の追従（maplibreのGeolocateControl）がひとりでに外れるのを防ぐ。
 *
 * 地図（react-map-gl）には表示範囲をpropsで渡している（制御モード）。制御モードでは、アニメーション中の
 * カメラは毎フレームpropsの値へ戻され、動かす先はonMoveで受け取ってpropsへ入れ直す。このためpropsは
 * 常に1フレーム遅れ、アニメーションの最後のフレームは、moveendの後の再描画でreact-map-glが
 * `map.jumpTo()` を呼んで反映する（Maplibre._updateViewState）。
 * GeolocateControlは、自分が出した移動（イベントに `geolocateSource` が付く）以外のmovestartを
 * 「利用者が地図を動かした」とみなして追従をやめる。上のjumpToには印が無いので、位置の更新に地図が
 * 付いていった直後に必ず追従が外れていた。
 *
 * そこで、jumpToの行き先が「追従の移動が最後に求めた表示範囲」と同じときだけ、同じ印を付ける。
 * それ以外のjumpTo（データへのジャンプ、眺望など）は印が付かず、これまでどおり追従が外れる
 */
import type { JumpToOptions, LngLatLike, Map as MaplibreMap, PaddingOptions } from 'maplibre-gl';

/** 追従の移動が求めた表示範囲（react-map-glのonMoveのviewState） */
export interface FollowViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  bearing: number;
  pitch: number;
  padding?: PaddingOptions;
}

const lngLatOf = (center: LngLatLike): [number, number] => {
  if (Array.isArray(center)) return [center[0], center[1]];
  return ['lng' in center ? center.lng : center.lon, center.lat];
};

const samePadding = (a: JumpToOptions['padding'], b: PaddingOptions | undefined): boolean => {
  if (a === undefined) return true;
  if (typeof a === 'number' || b === undefined) return false;
  return a.top === b.top && a.bottom === b.bottom && a.left === b.left && a.right === b.right;
};

/**
 * jumpToの行き先が、追従の移動が求めた表示範囲の反映か。
 * react-map-glは現在のカメラと違う項目だけを渡してくるので、渡された項目がすべて一致すれば反映とみなす
 */
export function isSyncOfFollowViewState(options: JumpToOptions, viewState: FollowViewState | null): boolean {
  if (viewState === null) return false;
  const { center, zoom, bearing, pitch, padding, ...rest } = options;
  // 表示範囲以外の指定（around、elevationなど）があるものは、react-map-glの反映ではない
  if (Object.keys(rest).length > 0) return false;
  if (center === undefined && zoom === undefined && bearing === undefined && pitch === undefined && padding === undefined) {
    return false;
  }
  if (center !== undefined) {
    const [lng, lat] = lngLatOf(center);
    if (lng !== viewState.longitude || lat !== viewState.latitude) return false;
  }
  if (zoom !== undefined && zoom !== viewState.zoom) return false;
  if (bearing !== undefined && bearing !== viewState.bearing) return false;
  if (pitch !== undefined && pitch !== viewState.pitch) return false;
  return samePadding(padding, viewState.padding);
}

const patchedMaps = new WeakSet<MaplibreMap>();

/**
 * 地図のjumpToを包み、追従の移動の反映には `geolocateSource` の印を付ける。
 * getFollowViewState は、直近のカメラ移動が追従によるものならその表示範囲、そうでなければnullを返すこと
 */
export function keepGeolocateFollowOnViewStateSync(map: MaplibreMap, getFollowViewState: () => FollowViewState | null) {
  if (patchedMaps.has(map)) return;
  patchedMaps.add(map);
  const jumpTo = map.jumpTo.bind(map);
  // eventDataの型はmaplibreの定義がanyなので、そのまま受け渡す
  map.jumpTo = (options: JumpToOptions, eventData?: Parameters<MaplibreMap['jumpTo']>[1]) =>
    jumpTo(
      options,
      isSyncOfFollowViewState(options, getFollowViewState()) ? { ...eventData, geolocateSource: true } : eventData
    );
}
