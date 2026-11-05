/**
 * Web版（maplibre-glの地形表示）の通常の3Dで、地表近くからの操作でカメラが遠くへ飛ぶのを抑える。
 *
 * maplibreは地図の移動を「注視点（視線と地面の交点）」で扱う。
 * - 俯角が約84°を超えると、操作の終わりに注視点を10km先の空中へ置く（_distanceToCenterFromAltElevationPitch）。
 *   次の描画で注視点の高さをその地点の地面へ合わせ直すので、カメラごと数百m〜千m上下する。
 *   以後のドラッグは10km先の1画素ぶんだけ動くので、1回で数km〜数十km飛ぶ
 * - ドラッグ先が地平線より上だと、視線と注視点の高さの平面との交点がカメラの後ろになり、逆向きに飛ぶ
 * 前者は、maplibreが求めた画面中央の地形との交点を、俯角が大きくても注視点に使うことで直す。
 * 後者は、表示中のカメラを戻すだけではmaplibre内部の目標位置（_requestedCameraState）が進み続けるので、
 * 目標位置そのものを、カメラの地上高に比例した距離までに縮める（地上高が低いときだけ）
 */
import { MercatorCoordinate } from 'maplibre-gl';
import type { LngLat, Map as MaplibreMap } from 'maplibre-gl';

/** この地上高[m]以下でだけ制限する。上空からの操作はmaplibreのまま */
const LOW_CAMERA_MAX_ALTITUDE_M = 150;
/** ドラッグ・ホイールで1更新あたりに動ける距離（地上高に対する倍率と最小値[m]） */
const STEP_RATE = 0.3;
const STEP_MIN_M = 0.5;
/** 慣性・矢印キーの1回の移動で動ける距離（地上高に対する倍率と最小値[m]） */
const EASE_RATE = 2;
const EASE_MIN_M = 2;
/** 俯角が大きいときに注視点として使う交点の最遠距離[m]。これより遠ければmaplibreのまま（10km先） */
const STEEP_CENTER_MAX_M = 100000;

type Point = { x: number; y: number };

/** 制限に使うmaplibreの内部の値（型定義に出ていない） */
interface CameraTransform {
  center: LngLat;
  zoom: number;
  bearing: number;
  getCameraLngLat: () => LngLat;
  getCameraAltitude: () => number;
  setCenter: (center: LngLat) => void;
}

interface ControlsArgs {
  tr: CameraTransform;
  panDelta?: Point;
}

interface GuardedMap {
  transform: CameraTransform & { _helper?: object };
  terrain: { getElevationForLngLatZoom: (lngLat: LngLat, zoom: number) => number } | null;
  handlers?: { _handleMapControls?: (args: ControlsArgs) => void };
  _applyUpdatedTransform?: (tr: CameraTransform) => void;
}

/** 注視点までの距離を決めるmaplibreの内部処理（型定義に出ていない） */
interface CenterDistanceHelper {
  _distanceToCenterFromAltElevationPitch: (
    alt: number,
    elevation: number,
    pitch: number
  ) => { distanceToCenter: number; clampedElevation: number };
}

/** 有効にしている地図の数。注視点の処理はクラス共通なので、どれか1つでも有効なら働かせる */
let steepCenterUsers = 0;
const wrappedHelpers = new WeakSet<CenterDistanceHelper>();

/**
 * 俯角が約84°（視線の鉛直成分0.1）を超えても、注視点を視線と地形の交点に置く。
 * maplibreは画面中央の地形との交点の標高（elevation）を求めて渡してくるので、
 * その標高の平面と視線の交点＝地形との交点になる。交点が無い（上向き）・遠すぎるときはmaplibreのまま
 */
const wrapCenterDistance = (helper: CenterDistanceHelper) => {
  if (wrappedHelpers.has(helper)) return;
  wrappedHelpers.add(helper);
  const original = helper._distanceToCenterFromAltElevationPitch;
  helper._distanceToCenterFromAltElevationPitch = function (
    this: CenterDistanceHelper,
    alt: number,
    elevation: number,
    pitch: number
  ) {
    const down = Math.cos((pitch * Math.PI) / 180);
    const distance = (alt - elevation) / down;
    if (steepCenterUsers > 0 && down > 0 && down < 0.1 && distance > 0 && distance <= STEEP_CENTER_MAX_M) {
      return { distanceToCenter: distance, clampedElevation: elevation };
    }
    return original.call(this, alt, elevation, pitch);
  };
};

/** 操作の始点のカメラ位置と、動ける距離・向き */
interface Move {
  origin: MercatorCoordinate;
  limitM: number;
  /** 操作から見たカメラの進む向き（メルカトル座標の単位ベクトル）。不明ならundefined */
  direction?: Point;
}

const cameraOf = (tr: CameraTransform) => MercatorCoordinate.fromLngLat(tr.getCameraLngLat());

/** カメラの地上高[m]。地形が無ければundefined */
const altitudeAboveGround = (map: GuardedMap, tr: CameraTransform) => {
  if (map.terrain === null) return undefined;
  return tr.getCameraAltitude() - map.terrain.getElevationForLngLatZoom(tr.getCameraLngLat(), tr.zoom);
};

/**
 * 画面上の移動量（ドラッグのpanDelta、easeToのoffset）から、カメラの進む向きを求める。
 * 下へドラッグすると前進、左へドラッグすると右へ進む（maplibreの挙動と同じ向き）
 */
const directionFromScreen = (screen: Point, bearingDeg: number): Point | undefined => {
  const length = Math.hypot(screen.x, screen.y);
  if (length === 0) return undefined;
  const b = (bearingDeg * Math.PI) / 180;
  // メルカトル座標はyが南向き
  const forward = { x: Math.sin(b), y: -Math.cos(b) };
  const right = { x: Math.cos(b), y: Math.sin(b) };
  const f = screen.y / length;
  const r = -screen.x / length;
  return { x: forward.x * f + right.x * r, y: forward.y * f + right.y * r };
};

/** trのカメラを、始点からlimitM以内・操作の向きへ収まるよう注視点ごと平行移動する */
const limitMove = (tr: CameraTransform, move: Move) => {
  const camera = cameraOf(tr);
  let dx = camera.x - move.origin.x;
  let dy = camera.y - move.origin.y;
  const unitsPerMeter = move.origin.meterInMercatorCoordinateUnits();
  const distance = Math.hypot(dx, dy);
  const limit = move.limitM * unitsPerMeter;
  const reversed =
    move.direction !== undefined && distance > 0 && dx * move.direction.x + dy * move.direction.y < 0;
  if (!reversed && distance <= limit) return;
  if (reversed && move.direction !== undefined) {
    // 地平線より上まで引っ張って逆向きに飛んだときは、操作の向きへ直す
    const length = Math.min(distance, limit);
    dx = move.direction.x * length;
    dy = move.direction.y * length;
  } else {
    dx *= limit / distance;
    dy *= limit / distance;
  }
  const center = MercatorCoordinate.fromLngLat(tr.center);
  center.x += move.origin.x + dx - camera.x;
  center.y += move.origin.y + dy - camera.y;
  tr.setCenter(center.toLngLat());
};

/** 通常の3Dで、地表近くの操作によるカメラの飛びを抑える。地形表示中・眺望の外で呼ぶ。戻り値で元に戻す */
export const enableWebLowCameraGuard = (maplibreMap: MaplibreMap): (() => void) => {
  const map = maplibreMap as unknown as GuardedMap;
  const handlers = map.handlers;
  const originalControls = handlers?._handleMapControls;
  const originalApply = map._applyUpdatedTransform;
  // 型定義の外の内部処理に頼るので、無ければ（maplibreの更新で変わったら）何もしない
  if (handlers === undefined || typeof originalControls !== 'function' || typeof originalApply !== 'function') {
    return () => undefined;
  }
  // 注視点の処理は個々の地図でなくクラス（transformごとに作り直される）にあるので、プロトタイプを包む
  const helperProto = map.transform._helper ? Object.getPrototypeOf(map.transform._helper) : undefined;
  const canFixCenter =
    helperProto !== undefined &&
    typeof (helperProto as Partial<CenterDistanceHelper>)._distanceToCenterFromAltElevationPitch === 'function';
  if (canFixCenter) {
    wrapCenterDistance(helperProto as CenterDistanceHelper);
    steepCenterUsers++;
  }
  /** 実行中の慣性・矢印キーの移動。終わるまで始点からの距離を制限する */
  let easeMove: Move | undefined;

  // ドラッグ・ホイール: 1更新ごとに、更新前の目標位置から制限する
  handlers._handleMapControls = function (this: unknown, args: ControlsArgs) {
    easeMove = undefined;
    const altitude = altitudeAboveGround(map, args.tr);
    const origin = altitude !== undefined && altitude <= LOW_CAMERA_MAX_ALTITUDE_M ? cameraOf(args.tr) : undefined;
    const bearing = args.tr.bearing;
    originalControls.call(this, args);
    if (origin === undefined || altitude === undefined) return;
    limitMove(args.tr, {
      origin,
      limitM: Math.max(STEP_MIN_M, altitude * STEP_RATE),
      direction: args.panDelta ? directionFromScreen(args.panDelta, bearing) : undefined,
    });
  };

  // 慣性・矢印キー（どちらも操作のイベント付きでoffsetを指定したeaseTo）: 1回の移動全体を始点から制限する
  const originalEaseTo = maplibreMap.easeTo;
  maplibreMap.easeTo = function (this: MaplibreMap, ...args: Parameters<MaplibreMap['easeTo']>) {
    const [options, eventData] = args;
    easeMove = undefined;
    const offset = options.offset;
    const altitude = altitudeAboveGround(map, map.transform);
    if (eventData?.originalEvent !== undefined && offset !== undefined && altitude !== undefined) {
      const screen = Array.isArray(offset) ? { x: offset[0], y: offset[1] } : { x: offset.x, y: offset.y };
      const direction = directionFromScreen(screen, map.transform.bearing);
      if (direction !== undefined && altitude <= LOW_CAMERA_MAX_ALTITUDE_M) {
        easeMove = { origin: cameraOf(map.transform), limitM: Math.max(EASE_MIN_M, altitude * EASE_RATE), direction };
      }
    }
    return originalEaseTo.apply(this, args);
  };
  map._applyUpdatedTransform = function (this: unknown, tr: CameraTransform) {
    if (easeMove !== undefined) limitMove(tr, easeMove);
    originalApply.call(this, tr);
  };
  const endEase = () => {
    easeMove = undefined;
  };
  maplibreMap.on('moveend', endEase);

  return () => {
    if (canFixCenter) steepCenterUsers--;
    maplibreMap.off('moveend', endEase);
    handlers._handleMapControls = originalControls;
    maplibreMap.easeTo = originalEaseTo;
    map._applyUpdatedTransform = originalApply;
  };
};
