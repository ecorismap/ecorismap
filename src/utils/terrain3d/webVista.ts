/**
 * Web版（maplibre-glの地形表示）の「ここからの眺望」。
 *
 * ネイティブ（TerrainScene.moveToVista）と同じく、指定地点の地上1.7mに立って真北を水平に見る。
 * maplibreのカメラは「注視点（center）のまわりを回る」形なので、そのままでは
 * ドラッグや回転で立ち位置が動いてしまう。そこで眺望中は地図の標準操作を止め
 * （Home.web.tsxがストアを見て切る）、視点の位置・方位・俯角をここで持ち、
 * 毎回 calculateCameraOptionsFromTo で「視点から前方へ一定距離の点」を注視点に逆算して置く。
 *
 * 状態はterrain3dVistaStoreへ流すので、バナー・高さボタンはネイティブと共通で使える。
 *
 * 注意: Home.web.tsxのMapはReduxのmapRegionで制御されている。react-map-glは
 * カメラ更新のたびにpropsの値へ戻し、さらに再描画時のjumpToで注視点の標高を地表へ
 * 貼り直す（elevationはmapRegionに無い）。これでは逆算した視点が崩れるので、
 * 眺望中はmapRegionを渡さない（非制御にする）。非制御になった後でreapplyWebVistaを呼ぶこと
 */
import type { LngLat, Map as MaplibreMap, Source } from 'maplibre-gl';
import { TERRAIN_EXAGGERATION } from '../../constants/DemSources';
import { getDemElevation } from '../viewshed';
import {
  CAMERA_FOV_DEG,
  VISTA_EYE_HEIGHT_M,
  VISTA_EYE_HEIGHTS_M,
  VISTA_MAX_PITCH_DEG,
  VISTA_PITCH_DEG,
  clampVistaFov,
  stepVistaFov,
} from './constants';
import { terrain3dVistaStore } from './vistaStore';
import type { PeakProjector } from '../peaks/peakProjector';
import { isSightBlocked } from '../peaks/sightline';
import { createTerrainSampler } from './webCamera';

/** 通常時のmaxPitch（Home.web.tsxのMapと同じ値） */
export const WEB_NORMAL_MAX_PITCH_DEG = 85;
/**
 * 注視点を置く前方の距離[m]。ズームはこの距離から決まる。
 *
 * maplibreのニア面は「画面の高さ/50」px固定で、メートルに直すと約0.023×この距離になる。
 * 1kmだとニア面が約23m先になり、足元〜23m以内の地面が切り取られて近くや下向きの地形が抜けた。
 * 40mならニア面は約1m（ネイティブのVISTA_NEAR_Mと同程度）。ズームは約z20.5で上限22に収まる
 */
const LOOK_AHEAD_M = 40;
/** 眺望で地形を描く最遠距離[m]。山名の表示距離（主要峰150km）より少し先まで */
const VISTA_FAR_M = 200000;
/** 眺望を抜けたときの俯瞰（立っていた地点を注視点にする） */
const EXIT_PITCH_DEG = 60;
const EXIT_ZOOM = 15;
/** 足元の標高が取れるまで待つ上限。過ぎたら標高APIで取る */
const ELEVATION_WAIT_MS = 5000;
/** 足元の標高がこれ以上変わったら視点を置き直す（より細かい標高タイルが届いたとき） */
const GROUND_UPDATE_THRESHOLD_M = 0.5;

const EARTH_RADIUS_M = 6378137;
/** ホイール1ノッチ（deltaY≒100）で画角を約1割変える */
const WHEEL_FOV_RATE = 0.001;

interface WebVistaState {
  map: MaplibreMap;
  latitude: number;
  longitude: number;
  /** 足元の標高（誇張込み＝描画上の地表の高さ）[m] */
  ground: number;
  heightM: number;
  bearing: number;
  pitch: number;
  /** 眺望に入る前の縦の視野角（解除時に戻す） */
  previousFovDeg: number;
  /** 眺望中の画角（縦の視野角[度]）。ズームはこれを変える（VISTA_FOV_STEPS_DEG） */
  fovDeg: number;
  detach: () => void;
}

let vista: WebVistaState | null = null;
/** 眺望中にドラッグで見回している最中か（山名ラベルはその間隠す） */
let lookingAround = false;
/** 開始処理の世代（標高待ちの間に解除・再開始されたら古い処理を捨てる） */
let generation = 0;

export const isWebVistaActive = (): boolean => vista !== null;

const publish = () => {
  if (vista === null) terrain3dVistaStore.clear();
  else terrain3dVistaStore.set({ active: true, heightM: vista.heightM, fovDeg: vista.fovDeg });
};

/** 視点から方位bearing・俯角pitchへdistanceM進んだ点（球面近似、短い距離なので十分） */
const lookTarget = (state: WebVistaState, distanceM: number) => {
  const pitchRad = (state.pitch * Math.PI) / 180;
  const bearingRad = (state.bearing * Math.PI) / 180;
  const horizontal = distanceM * Math.sin(pitchRad);
  const dLat = (horizontal * Math.cos(bearingRad)) / EARTH_RADIUS_M;
  const dLon = (horizontal * Math.sin(bearingRad)) / (EARTH_RADIUS_M * Math.cos((state.latitude * Math.PI) / 180));
  return {
    longitude: state.longitude + (dLon * 180) / Math.PI,
    latitude: state.latitude + (dLat * 180) / Math.PI,
    // pitch=0で真下、90で水平、90超で見上げ
    altitude: eyeAltitude(state) - distanceM * Math.cos(pitchRad),
  };
};

const eyeAltitude = (state: WebVistaState) => state.ground + state.heightM;

const applyCamera = (state: WebVistaState) => {
  // 画角を狭めると、同じ距離の注視点を写すのにmaplibreのズームが上がり、望遠側で
  // 上限（z25）を超えて地図ごと落ちた。狭めた分だけ注視点を遠くへ置き、ズームを保つ。
  // なお望遠に合わせてズームを上げれば遠景のタイルが細かくなるが、眺望は注視点が足元の
  // すぐ先にあるため、ズームを1段上げただけで足元のタイルが上限を超えて落ちた（実測）。
  // Webの望遠はタイルの細かさを上げない
  const lookAhead =
    (LOOK_AHEAD_M * Math.tan((CAMERA_FOV_DEG * Math.PI) / 360)) / Math.tan((state.fovDeg * Math.PI) / 360);
  const target = lookTarget(state, lookAhead);
  // 型定義はfrom/toをLngLatに限るが、実装はLngLat.convertを通すので配列でよい
  // （LngLatクラスを使うにはmaplibre-glを実行時importする必要があり、ネイティブのバンドルに入ってしまう）
  const options = state.map.calculateCameraOptionsFromTo(
    [state.longitude, state.latitude] as unknown as LngLat,
    eyeAltitude(state),
    [target.longitude, target.latitude] as unknown as LngLat,
    target.altitude
  );
  // ファー面の上書きはjumpToの前にいったん外す。上書きしたままjumpToすると、呼ぶたびに
  // 注視点のズームと標高が下がり（実測: 1回で z19.95→19.39、標高2777→2634）、
  // 高さ変更を数回押しただけで視点が地面の下に潜って空か灰色しか見えなくなった
  const transform = state.map.transform as unknown as WritableTransform;
  transform.clearNearFarZOverride();
  // 逆算した方位・俯角は丸め誤差を含むので、持っている値で上書きする
  state.map.jumpTo({ ...options, bearing: state.bearing, pitch: state.pitch });
  extendFarPlane(state.map);
  applyVistaTileZoom(state.map);
};

/**
 * 眺望中のタイルの細かさの決め方（maplibreのcalculateTileZoomを差し替える）。
 *
 * maplibre既定の規則は「地平線が画面の上端付近にある地図の見下ろし」を前提に、地平線に
 * 近いタイルほど強く粗くし、さらに枚数が増えすぎないよう全体を一律に粗くする。
 * 眺望は水平に見るので遠くの山はすべて地平線際にあり、既定の規則では望遠にしても
 * 20km先の山がz8（1画素600m）のままだった（実測）。
 * ここでは画面1画素あたりの地上距離が揃うよう、カメラからの距離だけで決める
 * （注視点と同じ距離でzoom、距離が2倍ごとに1段粗く）。水平に見る場合、距離ごとの
 * 枚数は距離によらずほぼ一定で、総数は距離の対数でしか増えないので破綻しない
 * （実測: 画角12°で約370枚、60°で約160枚）。
 * 上限は22。足元の至近のタイルで上限（z25）を超えると地図ごと落ちる
 */
const VISTA_MAX_TILE_ZOOM = 22;
const vistaTileZoom = (
  requestedCenterZoom: number,
  distanceToTile2D: number,
  distanceToTileZ: number,
  distanceToCenter3D: number
): number =>
  Math.min(
    VISTA_MAX_TILE_ZOOM,
    requestedCenterZoom + Math.log2(distanceToCenter3D / Math.max(1e-6, Math.hypot(distanceToTile2D, distanceToTileZ)))
  );

/** 全ソースに眺望用の規則を付ける（地図一覧の変更でソースが作り直されても追従するよう、カメラ更新のたびに呼ぶ） */
const applyVistaTileZoom = (map: MaplibreMap) => {
  for (const id of Object.keys(map.getStyle()?.sources ?? {})) {
    const source = map.getSource(id) as (Source & { calculateTileZoom?: unknown }) | undefined;
    if (source && source.calculateTileZoom !== vistaTileZoom) source.calculateTileZoom = vistaTileZoom;
  }
};

/** 眺望用の規則を外して既定に戻す */
const clearVistaTileZoom = (map: MaplibreMap) => {
  for (const id of Object.keys(map.getStyle()?.sources ?? {})) {
    const source = map.getSource(id) as (Source & { calculateTileZoom?: unknown }) | undefined;
    if (source && source.calculateTileZoom === vistaTileZoom) source.calculateTileZoom = undefined;
  }
};

/**
 * 描画する最遠距離（ファー面）を眺望用に伸ばす。
 *
 * maplibreはファー面をカメラの海抜高度から決めるので、平地（海抜数十m）に立つと
 * 数km先までしか地形を描かず、山名は出るのに山が見えなかった（山頂からは高度があるので届いていた）。
 * ニア面はmaplibreの既定（画面高さ/50）のまま。単位はmaplibreのZ単位（中心での1px）。
 *
 * 自動計算より短くはしない。maplibreのフォグ行列は「カメラから海面までの視線距離」を
 * ニア面にしており、高所から水平に見るとそれが約200kmを超える（海抜2777m（誇張込み）で約212km）。
 * ファー面がそれより手前だと行列が壊れ、地形全体が地平線の色に塗られて真っ白になった（実測）。
 * 自動計算のファー面は必ずその距離より先にあるので、それを下限にすれば起きない。
 * jumpToの直後に呼ぶこと（そのときのtransform.farZが自動計算値）
 */
const extendFarPlane = (map: MaplibreMap) => {
  const transform = map.transform as unknown as WritableTransform;
  transform.overrideNearFarZ(
    transform.height / 50,
    Math.max(transform.farZ, VISTA_FAR_M * transform.pixelsPerMeter)
  );
};

/** ファー面を上書きする操作（型定義では読み取り専用のtransformにしか出ていない） */
interface WritableTransform {
  height: number;
  pixelsPerMeter: number;
  farZ: number;
  overrideNearFarZ: (nearZ: number, farZ: number) => void;
  clearNearFarZOverride: () => void;
}

/** 足元の標高（誇張込み）。地形タイルが未着ならnull */
const queryGround = (map: MaplibreMap, latitude: number, longitude: number): number | null => {
  const elevation = map.queryTerrainElevation([longitude, latitude]);
  return elevation === null || !Number.isFinite(elevation) ? null : elevation;
};

const waitForGround = async (map: MaplibreMap, latitude: number, longitude: number): Promise<number | null> => {
  const startMs = Date.now();
  while (Date.now() - startMs < ELEVATION_WAIT_MS) {
    const ground = queryGround(map, latitude, longitude);
    if (ground !== null) return ground;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  // 地形タイルが来ない場合は標高APIの値を描画と同じ誇張に合わせて使う
  const elevation = await getDemElevation(latitude, longitude);
  return elevation === null ? null : elevation * TERRAIN_EXAGGERATION;
};

/**
 * 眺望中のドラッグ＝その場で見回す（移動しない）。
 * 掴んだ景色が指に付いてくる向き（右へドラッグで左を向く／下へドラッグで見上げる）はネイティブと同じ
 */
const attachLookAround = (map: MaplibreMap): (() => void) => {
  const container = map.getCanvasContainer();
  let last: { id: number; x: number; y: number } | null = null;
  const onDown = (e: PointerEvent) => {
    if (last !== null) return;
    last = { id: e.pointerId, x: e.clientX, y: e.clientY };
    lookingAround = true;
  };
  const onMove = (e: PointerEvent) => {
    if (last === null || e.pointerId !== last.id || vista === null) return;
    // 基準は地図の外枠の高さ。canvas-containerは高さ0の要素なので使えない（1pxで60度回ってしまう）
    const degPerPx = map.getVerticalFieldOfView() / Math.max(1, map.getContainer().clientHeight);
    lookBy(-(e.clientX - last.x) * degPerPx, (e.clientY - last.y) * degPerPx);
    last = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const onUp = (e: PointerEvent) => {
    if (last !== null && e.pointerId === last.id) {
      last = null;
      lookingAround = false;
      // 指を離した時点の向きで山名を出し直させる（カメラが止まると描画が来ない）
      map.triggerRepaint();
    }
  };
  // より細かい標高タイルが届いたら足元の高さを取り直す
  const onIdle = () => {
    if (vista === null) return;
    applyVistaTileZoom(map);
    const ground = queryGround(map, vista.latitude, vista.longitude);
    if (ground !== null && Math.abs(ground - vista.ground) > GROUND_UPDATE_THRESHOLD_M) {
      vista.ground = ground;
      applyCamera(vista);
    }
  };
  // ホイール＝画角のズーム（眺望中は地図のスクロールズームを止めているので、こちらで受ける）
  const onWheel = (e: WheelEvent) => {
    if (vista === null) return;
    e.preventDefault();
    setFov(vista, vista.fovDeg * Math.exp(e.deltaY * WHEEL_FOV_RATE));
  };
  container.addEventListener('wheel', onWheel, { passive: false });
  container.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  map.on('idle', onIdle);
  return () => {
    lookingAround = false;
    container.removeEventListener('wheel', onWheel);
    container.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    map.off('idle', onIdle);
  };
};

/** 指定地点の地上1.7mから真北を水平に見る視点へ移す。地形表示中に呼ぶこと */
export const startWebVista = async (map: MaplibreMap, latitude: number, longitude: number): Promise<boolean> => {
  const current = ++generation;
  // 足元の地形タイルを読ませるため、先に注視点を寄せる
  map.jumpTo({ center: [longitude, latitude] });
  const ground = await waitForGround(map, latitude, longitude);
  if (current !== generation || ground === null || map.getTerrain() === null) return false;

  if (vista !== null) vista.detach();
  // 水平（90度）より上も向けるよう上限を広げる。注視点が地表に吸着すると
  // 逆算した視点がずれるので、吸着も切る（maplibreの仕様: pitch>90には必須）
  map.setMaxPitch(VISTA_MAX_PITCH_DEG);
  map.setCenterClampedToGround(false);
  // 視野角をネイティブ（60度）に合わせる。maplibre既定の約37度だと、
  // 傾きボタン1回（20度）で地平線が画面の外へ出て空しか見えなくなる
  const previousFovDeg = map.getVerticalFieldOfView();
  map.setVerticalFieldOfView(CAMERA_FOV_DEG);
  vista = {
    map,
    latitude,
    longitude,
    ground,
    heightM: VISTA_EYE_HEIGHT_M,
    bearing: 0,
    pitch: VISTA_PITCH_DEG,
    previousFovDeg,
    fovDeg: CAMERA_FOV_DEG,
    detach: () => undefined,
  };
  applyCamera(vista);
  vista.detach = attachLookAround(map);
  publish();
  return true;
};

/** 眺望の視点を置き直す（地図が非制御になった直後に、propsで戻されたカメラを正す） */
export const reapplyWebVista = (): void => {
  if (vista !== null) applyCamera(vista);
};

/** その場で向きを変える（方位・俯角の差分[度]） */
export const lookBy = (deltaBearingDeg: number, deltaPitchDeg: number): void => {
  if (vista === null) return;
  vista.bearing = (((vista.bearing + deltaBearingDeg) % 360) + 360) % 360;
  vista.pitch = Math.min(VISTA_MAX_PITCH_DEG, Math.max(0, vista.pitch + deltaPitchDeg));
  applyCamera(vista);
};

/**
 * 画角を変える。maplibreは画角を変えると注視点とズームを保ってカメラを前後させるので、
 * 立ち位置から注視点を逆算し直して視点を元の位置に戻す
 */
const setFov = (state: WebVistaState, fovDeg: number) => {
  const next = clampVistaFov(fovDeg);
  if (Math.abs(next - state.fovDeg) < 1e-6) return;
  state.fovDeg = next;
  state.map.setVerticalFieldOfView(next);
  applyCamera(state);
  publish();
};

/** 眺望中のズーム。画角を1段狭める（step>0＝望遠）／広げる（step<0＝広角） */
export const changeWebVistaFov = (step: number): void => {
  if (vista === null) return;
  setFov(vista, stepVistaFov(vista.fovDeg, step));
};

/** 視点の高さを1段上げ下げする（VISTA_EYE_HEIGHTS_M） */
export const changeWebVistaHeight = (step: number): void => {
  if (vista === null) return;
  const index = VISTA_EYE_HEIGHTS_M.indexOf(vista.heightM);
  const current = index < 0 ? 0 : index;
  const next = Math.min(VISTA_EYE_HEIGHTS_M.length - 1, Math.max(0, current + step));
  if (next === current) return;
  vista.heightM = VISTA_EYE_HEIGHTS_M[next];
  applyCamera(vista);
  publish();
};

/**
 * 眺望を解除する。restoreCamera=trueなら立っていた地点を注視点にした俯瞰へ戻す
 * （3Dを抜けるときは2D側が俯角を戻すのでfalse）
 */
export const clearWebVista = (restoreCamera = true): void => {
  generation++;
  const state = vista;
  if (state === null) return;
  vista = null;
  state.detach();
  state.map.setCenterClampedToGround(true);
  // ファー面の上書きをやめ、maplibreの自動計算に戻す
  (state.map.transform as unknown as WritableTransform).clearNearFarZOverride();
  clearVistaTileZoom(state.map);
  state.map.setVerticalFieldOfView(state.previousFovDeg);
  // 3Dを抜けるとき（restoreCamera=false）は2D側が俯角0の表示範囲を流し込むので、カメラは触らない。
  // ここで俯角を戻すと、その2Dの値を上書きしてしまう（俯角が上限を超えていれば下のsetMaxPitchが丸める）
  if (restoreCamera) {
    state.map.easeTo({
      center: [state.longitude, state.latitude],
      zoom: EXIT_ZOOM,
      pitch: EXIT_PITCH_DEG,
      bearing: state.bearing,
      duration: 600,
    });
  }
  state.map.setMaxPitch(WEB_NORMAL_MAX_PITCH_DEG);
  publish();
};

/**
 * 山頂を画面へ投影する。カメラの後ろ・画面外・地形の陰ならnull。
 *
 * maplibreは地形に隠れた点も投影してしまうので、視線上の標高をqueryTerrainElevationで
 * 調べて隠れているかを判定する（utils/peaks/sightline.ts。描画と同じ誇張込みの標高で比べる）
 */
const projectPeak = (
  map: MaplibreMap,
  latitude: number,
  longitude: number,
  ele: number
): { x: number; y: number } | null => {
  const state = vista;
  if (state === null) return null;
  const summit = queryGround(map, latitude, longitude);
  if (summit === null) return null;
  // 後ろ半分の点はprojectが画面内の座標を返すことがあるので、方位で先に落とす
  const north = (latitude - state.latitude) * (Math.PI / 180) * EARTH_RADIUS_M;
  const east =
    (longitude - state.longitude) * (Math.PI / 180) * EARTH_RADIUS_M * Math.cos((state.latitude * Math.PI) / 180);
  const azimuth = (Math.atan2(east, north) * 180) / Math.PI;
  const offAxis = Math.abs(((azimuth - state.bearing + 540) % 360) - 180);
  if (offAxis > 90) return null;
  const point = map.project([longitude, latitude]);
  const container = map.getContainer();
  if (point.x < 0 || point.y < 0 || point.x > container.clientWidth || point.y > container.clientHeight) return null;

  const distance = Math.hypot(north, east);
  const eye = { latitude: state.latitude, longitude: state.longitude, altitude: eyeAltitude(state) };
  const sample = createTerrainSampler(map);
  if (sample === null) return null;
  // 視線は描かれた山頂と山頂データの標高の高い方へ引く（peakProjector.tsのPEAK_SIGHT_NOTE）
  const target = { latitude, longitude, altitude: Math.max(summit, ele * TERRAIN_EXAGGERATION) };
  if (isSightBlocked(sample, eye, target, distance, TERRAIN_EXAGGERATION)) {
    return null;
  }
  return { x: point.x, y: point.y };
};

/** Web版の山名ラベルの投影（HomeVistaPeakLabelsへ渡す） */
export const createWebPeakProjector = (map: MaplibreMap): PeakProjector => ({
  project: (latitude, longitude, ele) => projectPeak(map, latitude, longitude, ele),
  subscribe: (listener) => {
    map.on('render', listener);
    return () => {
      map.off('render', listener);
    };
  },
  isReady: () => vista !== null && !lookingAround,
  getViewpoint: () => (vista === null ? null : { latitude: vista.latitude, longitude: vista.longitude }),
});
