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
import type { LngLat, Map as MaplibreMap } from 'maplibre-gl';
import { TERRAIN_EXAGGERATION } from '../../constants/DemSources';
import { getDemElevation } from '../viewshed';
import {
  CAMERA_FOV_DEG,
  VISTA_EYE_HEIGHT_M,
  VISTA_EYE_HEIGHTS_M,
  VISTA_MAX_PITCH_DEG,
  VISTA_PITCH_DEG,
} from './constants';
import { terrain3dVistaStore } from './vistaStore';

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
/** 眺望を抜けたときの俯瞰（立っていた地点を注視点にする） */
const EXIT_PITCH_DEG = 60;
const EXIT_ZOOM = 15;
/** 足元の標高が取れるまで待つ上限。過ぎたら標高APIで取る */
const ELEVATION_WAIT_MS = 5000;
/** 足元の標高がこれ以上変わったら視点を置き直す（より細かい標高タイルが届いたとき） */
const GROUND_UPDATE_THRESHOLD_M = 0.5;

const EARTH_RADIUS_M = 6378137;

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
  detach: () => void;
}

let vista: WebVistaState | null = null;
/** 開始処理の世代（標高待ちの間に解除・再開始されたら古い処理を捨てる） */
let generation = 0;

export const isWebVistaActive = (): boolean => vista !== null;

const publish = () => {
  if (vista === null) terrain3dVistaStore.clear();
  else terrain3dVistaStore.set({ active: true, heightM: vista.heightM });
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
  const target = lookTarget(state, LOOK_AHEAD_M);
  // 型定義はfrom/toをLngLatに限るが、実装はLngLat.convertを通すので配列でよい
  // （LngLatクラスを使うにはmaplibre-glを実行時importする必要があり、ネイティブのバンドルに入ってしまう）
  const options = state.map.calculateCameraOptionsFromTo(
    [state.longitude, state.latitude] as unknown as LngLat,
    eyeAltitude(state),
    [target.longitude, target.latitude] as unknown as LngLat,
    target.altitude
  );
  // 逆算した方位・俯角は丸め誤差を含むので、持っている値で上書きする
  state.map.jumpTo({ ...options, bearing: state.bearing, pitch: state.pitch });
};

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
  };
  const onMove = (e: PointerEvent) => {
    if (last === null || e.pointerId !== last.id || vista === null) return;
    // 基準は地図の外枠の高さ。canvas-containerは高さ0の要素なので使えない（1pxで60度回ってしまう）
    const degPerPx = map.getVerticalFieldOfView() / Math.max(1, map.getContainer().clientHeight);
    lookBy(-(e.clientX - last.x) * degPerPx, (e.clientY - last.y) * degPerPx);
    last = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const onUp = (e: PointerEvent) => {
    if (last !== null && e.pointerId === last.id) last = null;
  };
  // より細かい標高タイルが届いたら足元の高さを取り直す
  const onIdle = () => {
    if (vista === null) return;
    const ground = queryGround(map, vista.latitude, vista.longitude);
    if (ground !== null && Math.abs(ground - vista.ground) > GROUND_UPDATE_THRESHOLD_M) {
      vista.ground = ground;
      applyCamera(vista);
    }
  };
  container.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  map.on('idle', onIdle);
  return () => {
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
