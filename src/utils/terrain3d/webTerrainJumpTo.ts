/**
 * Web版の3D（maplibreの地形表示）で、地図を動かすとポイントなどのマーカーがずれるのを防ぐ。
 *
 * maplibre 5.24 の `jumpTo` は、地形があると注視点の標高を取り直すが、ズームを指定されるとその値（小数）を
 * そのままタイルのズームとして渡す（`getElevationForLngLatZoom(center, options.zoom || tr.tileZoom)`）。
 * 小数のズームのタイルは無いので標高が0mになり、カメラは標高0mのまま move・moveend を出す。
 * マーカーはこのイベントで画面位置を計算する。次の描画でmaplibreが標高を地面へ合わせ直すが、
 * そのときはイベントが出ないので、マーカーだけが標高0mで計算した位置に取り残される。
 *
 * 地図（react-map-gl）には表示範囲をpropsで渡しているので、ドラッグなどの操作の終わりには必ず
 * ズームつきの `jumpTo` で反映される。3Dで地図を動かすたびにこの経路を通る。
 *
 * そこで `jumpTo` を包み、地形があって標高の指定が無いときは、いま読み込まれているズームで求めた
 * 行き先の地面の標高を `elevation` として渡す（`jumpTo` は指定された標高を優先する）
 */
import type { JumpToOptions, LngLat, LngLatLike, Map as MaplibreMap } from 'maplibre-gl';

const lngLatOf = (center: LngLatLike): [number, number] => {
  if (Array.isArray(center)) return [center[0], center[1]];
  return ['lng' in center ? center.lng : center.lon, center.lat];
};

/**
 * jumpToへ渡す指定に、行き先の地面の標高を足す。
 * @param elevationAt 経度・緯度から地面の標高[m]を返す。地形が無ければnull
 * @param currentCenter 行き先の指定が無いときに使う、いまの注視点
 */
export function withTerrainElevation(
  options: JumpToOptions,
  elevationAt: ((lng: number, lat: number) => number) | null,
  currentCenter: [number, number]
): JumpToOptions {
  if (elevationAt === null || 'elevation' in options) return options;
  const [lng, lat] = options.center === undefined ? currentCenter : lngLatOf(options.center);
  const elevation = elevationAt(lng, lat);
  return Number.isFinite(elevation) ? { ...options, elevation } : options;
}

const patchedMaps = new WeakSet<MaplibreMap>();

/** 地図のjumpToを包み、3Dのときは行き先の地面の標高を渡す */
export function keepTerrainElevationOnJumpTo(map: MaplibreMap) {
  if (patchedMaps.has(map)) return;
  patchedMaps.add(map);
  const jumpTo = map.jumpTo.bind(map);
  map.jumpTo = (options: JumpToOptions, eventData?: Parameters<MaplibreMap['jumpTo']>[1]) => {
    const terrain = map.terrain;
    const tr = map.transform;
    const LngLatClass = tr.center.constructor as new (lng: number, lat: number) => LngLat;
    return jumpTo(
      withTerrainElevation(
        options,
        // tileZoom は、いま読み込まれている地形タイルのズーム（整数）
        terrain ? (lng, lat) => terrain.getElevationForLngLatZoom(new LngLatClass(lng, lat), tr.tileZoom) : null,
        [tr.center.lng, tr.center.lat]
      ),
      eventData
    );
  };
}
