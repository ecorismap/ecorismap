/**
 * Web版（maplibre）のカメラまわりの補助。
 *
 * maplibreのマーカーはカメラの後ろにある地点を隠さない。傾きが小さいうちは
 * 後ろの地点は画面外へ飛ぶので目立たないが、眺望のようにほぼ水平に見ると、
 * 背後の地点が鏡写しになって空に浮いて見える（GPI-宮古岩泉の調査地点で実際に起きた）。
 */
import type { LngLat, Map as MaplibreMap } from 'maplibre-gl';
import { TERRAIN_EXAGGERATION } from '../../constants/DemSources';
import { ElevationSampler, isSightBlocked, TargetSlack } from '../peaks/sightline';

const EARTH_RADIUS_M = 6378137;
const DEG = Math.PI / 180;
/**
 * カメラの真横（視線と直交する面）からこれだけ前に無い点は後ろとみなす[m]。
 * 0ちょうどだと、目の位置に重なる点（立ち位置に置いた調査地点など）が巨大な座標へ飛ぶ
 */
const BEHIND_MARGIN_M = 1;

/**
 * 「その地点がカメラの後ろにあるか」の判定関数を作る（1回の描画のあいだ使い回す）。
 * 傾けていない（ほぼ真上から見ている）ときは後ろの点が画面に入らないのでnullを返す
 */
export const createBehindCameraTest = (map: MaplibreMap): ((lngLat: LngLat) => boolean) | null => {
  const pitch = map.getPitch();
  if (pitch < 45) return null;
  const camera = map.transform.getCameraLngLat();
  const cameraAltitude = map.transform.getCameraAltitude();
  const pitchRad = pitch * DEG;
  const bearingRad = map.getBearing() * DEG;
  // 視線の向き（東・北・上）。pitch=90で水平、90超で見上げ
  const forwardE = Math.sin(bearingRad) * Math.sin(pitchRad);
  const forwardN = Math.cos(bearingRad) * Math.sin(pitchRad);
  const forwardU = -Math.cos(pitchRad);
  const metersPerDegLat = EARTH_RADIUS_M * DEG;
  const metersPerDegLng = metersPerDegLat * Math.cos(camera.lat * DEG);
  return (lngLat) => {
    const east = (lngLat.lng - camera.lng) * metersPerDegLng;
    const north = (lngLat.lat - camera.lat) * metersPerDegLat;
    // 地表の点として扱う（誇張込みの標高。カメラの高度も同じ空間の値）
    const ground = map.queryTerrainElevation(lngLat) ?? 0;
    const up = ground - cameraAltitude;
    return east * forwardE + north * forwardN + up * forwardU < BEHIND_MARGIN_M;
  };
};

/** 地点は地表から少し上（人の目線の高さ程度）を見えるかの基準にする[m] */
const POINT_HEIGHT_M = 2;
/**
 * 地点のすぐ手前は遮蔽とみなさない範囲。斜面上の地点は手前の地表が視線とほぼ同じ高さに
 * なり、標高の補間誤差で消えやすいため。山頂（SUMMIT_SLACK）よりずっと狭くする
 */
const POINT_SLACK: TargetSlack = { meters: 30, ratio: 0.005 };

/**
 * 描画中の地形の標高（誇張込み）を引く関数を作る。地形表示中でなければnull。
 *
 * map.queryTerrainElevationは呼ぶたびに「画面を覆うタイル」を数え直すので、
 * 視線判定のように1回の更新で数千回引く用途では重すぎる。ズームを一度だけ決め、
 * maplibreの同じ標高読み出し（getElevationForLngLatZoom）を直接使う。
 * 未着のタイルは読み込み済みの親タイルで代用される（maplibreの実装）
 */
export const createTerrainSampler = (map: MaplibreMap): ElevationSampler | null => {
  const terrain = map.terrain;
  if (!terrain) return null;
  const zoom = Math.min(Math.max(0, Math.floor(map.getZoom())), terrain.tileManager.maxzoom);
  // LngLatクラスは実行時importするとネイティブのバンドルに入るので、地図が持つ値から取る
  const LngLatClass = map.getCenter().constructor as new (lng: number, lat: number) => LngLat;
  return (latitude, longitude) => terrain.getElevationForLngLatZoom(new LngLatClass(longitude, latitude), zoom);
};

/**
 * 地表の地点がカメラから地形に遮られて見えないかの判定関数を作る（1回の更新のあいだ使い回す）。
 * 地形表示中でなければnull。
 *
 * maplibreのマーカーも地形に隠れたかを判定する（薄く表示する）が、深度バッファの差に
 * 固定の許容差を使うため、水平に遠くを見る眺望では遠方ほど甘くなり、尾根の向こうの
 * 地点が見えていると判定された（宮古岩泉の調査地点で、1.5km先の尾根に50〜70m隠れる
 * 10km先の地点が表示された）。山名と同じ視線上の標高で判定する
 */
export const createTerrainOcclusionTest = (map: MaplibreMap): ((lngLat: LngLat) => boolean) | null => {
  const sample = createTerrainSampler(map);
  if (sample === null) return null;
  const camera = map.transform.getCameraLngLat();
  const eye = { latitude: camera.lat, longitude: camera.lng, altitude: map.transform.getCameraAltitude() };
  const metersPerDegLat = EARTH_RADIUS_M * DEG;
  const metersPerDegLng = metersPerDegLat * Math.cos(camera.lat * DEG);
  return (lngLat) => {
    const ground = sample(lngLat.lat, lngLat.lng);
    if (ground === null) return false;
    const distance = Math.hypot((lngLat.lat - camera.lat) * metersPerDegLat, (lngLat.lng - camera.lng) * metersPerDegLng);
    const target = { latitude: lngLat.lat, longitude: lngLat.lng, altitude: ground + POINT_HEIGHT_M * TERRAIN_EXAGGERATION };
    return isSightBlocked(sample, eye, target, distance, TERRAIN_EXAGGERATION, POINT_SLACK);
  };
};
