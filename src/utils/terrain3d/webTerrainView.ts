/**
 * Web版（maplibre-glの地形表示）の通常の3Dで、遠くの山並みを眺望（webVista.ts）と同じように描く。
 *
 * maplibreの既定は「地図を斜めに見下ろす」前提で、地表近くから水平に見ると遠景が実際と違って見えた。
 * - 地平線に近いタイルほど強く粗くするので、40km先の富士山がなだらかな三角錐になる
 * - 描画する最遠距離（ファー面）をカメラの海抜から決めるので、平地では数km〜数十km先で地形が切れる
 * - フォグ（Home.web.tsxのsky）が遠くの山を濃い青に沈める
 * タイルとファー面は、眺望中はwebVista.tsが同じ対処を自前で持つので、眺望の外でだけ働かせる。
 * フォグは距離に応じた掛け方（enableWebDistanceFog）に置き換え、眺望の中でも外でも使う
 */
import type { Map as MaplibreMap, Source } from 'maplibre-gl';

/** 地形を描く最遠距離[m]。眺望（webVista.tsのVISTA_FAR_M）と同じ */
const TERRAIN_FAR_M = 300000;
/** タイルのズームの上限。地表すれすれでz25を超えると地図ごと落ちる（webVista.tsと同じ） */
const TERRAIN_MAX_TILE_ZOOM = 22;

type TileZoomFunction = (
  requestedCenterZoom: number,
  distanceToTile2D: number,
  distanceToTileZ: number,
  distanceToCenter3D: number
) => number;

/**
 * カメラからの距離だけでタイルの細かさを決める規則（maplibreのcalculateTileZoomの差し替え）。
 * 注視点と同じ距離で地図のズーム、距離が2倍ごとに1段粗く。画面1画素あたりの地上距離が揃うので、
 * 水平に見ても遠景が粗くなりすぎず、枚数は距離の対数でしか増えない（webVista.tsの実測参照）。
 * 見下ろしではどのタイルも注視点とほぼ同じ距離なので、既定の規則とほぼ同じになる。
 * 外すときに自分が付けたものだけを外せるよう、使う側ごとに別の関数を作る
 */
export const createDistanceTileZoom =
  (maxZoom: number): TileZoomFunction =>
  (requestedCenterZoom, distanceToTile2D, distanceToTileZ, distanceToCenter3D) =>
    Math.min(
      maxZoom,
      requestedCenterZoom +
        Math.log2(distanceToCenter3D / Math.max(1e-6, Math.hypot(distanceToTile2D, distanceToTileZ)))
    );

const terrainTileZoom = createDistanceTileZoom(TERRAIN_MAX_TILE_ZOOM);

type TileZoomSource = Source & { calculateTileZoom?: unknown };

const setTileZoom = (map: MaplibreMap, from: unknown, to: TileZoomFunction | undefined) => {
  for (const id of Object.keys(map.getStyle()?.sources ?? {})) {
    const source = map.getSource(id) as TileZoomSource | undefined;
    // 眺望が付けた規則（webVista.ts）は上書きしない
    if (source && source.calculateTileZoom === from) source.calculateTileZoom = to;
  }
};

/** ファー面を計算するmaplibreの内部処理（型定義に出ていない） */
interface NearFarTransform {
  pixelsPerMeter: number;
  _helper: { _farZ: number; autoCalculateNearFarZ: boolean };
  _calculateNearFarZIfNeeded: (...args: unknown[]) => void;
}

/** ファー面を延ばす対象の地図（transform単位。ラップは一度だけ） */
const farViewTransforms = new WeakSet<NearFarTransform>();
const wrappedTransforms = new WeakSet<NearFarTransform>();

/**
 * ファー面の自動計算の結果を、最低でもTERRAIN_FAR_M先まで延ばす。
 * 眺望のようにoverrideNearFarZで固定すると、ズームや移動のたびに値を置き直す必要があり、
 * 上書きしたままのカメラ操作で注視点がずれる（webVista.tsのapplyCamera参照）。
 * 自動計算の直後に延ばせば、操作中も常にその時点の正しい値から延びる。
 * 自動計算より短くはしない（フォグ行列が壊れて真っ白になる。webVista.tsのextendFarPlane参照）。
 * 眺望中（overrideNearFarZで上書き中）は自動計算自体が走らないので触らない
 */
const wrapNearFarZ = (transform: NearFarTransform) => {
  if (wrappedTransforms.has(transform)) return;
  wrappedTransforms.add(transform);
  const original = transform._calculateNearFarZIfNeeded;
  transform._calculateNearFarZIfNeeded = function (this: NearFarTransform, ...args: unknown[]) {
    original.apply(this, args);
    if (!farViewTransforms.has(this) || !this._helper.autoCalculateNearFarZ) return;
    this._helper._farZ = Math.max(this._helper._farZ, TERRAIN_FAR_M * this.pixelsPerMeter);
  };
};

/** 通常の3Dで遠景を眺望と同じように描く。地形表示中・眺望の外で呼ぶ。戻り値で元に戻す */
export const enableWebTerrainFarView = (map: MaplibreMap): (() => void) => {
  const transform = map.transform as unknown as NearFarTransform;
  // ファー面は型定義の外の内部処理に頼るので、無ければ（maplibreの更新で変わったら）タイルの規則だけにする
  const canExtendFar = typeof transform._calculateNearFarZIfNeeded === 'function';
  if (canExtendFar) {
    wrapNearFarZ(transform);
    farViewTransforms.add(transform);
  }
  // 地図一覧の変更でソースが作り直されても付け直す
  const applyTileZoom = () => setTileZoom(map, undefined, terrainTileZoom);
  applyTileZoom();
  map.on('styledata', applyTileZoom);
  map.triggerRepaint();
  return () => {
    map.off('styledata', applyTileZoom);
    setTileZoom(map, terrainTileZoom, undefined);
    if (canExtendFar) farViewTransforms.delete(transform);
    map.triggerRepaint();
  };
};

/** フォグが掛かり始める距離[m]。これより手前は掛からない */
const FOG_START_M = 5000;

/** フォグの計算に使うmaplibreの内部の値（型定義に出ていない） */
interface FogTransform {
  _helper: { _farZ: number; _pixelPerMeter: number; cameraToCenterDistance: number };
  _fogMatrix?: Float64Array;
  _fogMatrixCacheF32?: { clear: () => void };
  _calcMatrices: (...args: unknown[]) => void;
}

const fogTransforms = new WeakSet<FogTransform>();
const fogWrappedTransforms = new WeakSet<FogTransform>();

/**
 * フォグの深度を「カメラからの距離」に揃える。
 *
 * maplibreのフォグは、ニア面を「カメラから海面までの視線距離」にした透視行列（_fogMatrix）の深度で
 * 濃さを決める。水平に近い視線ではこの距離が海抜の約76倍になり（海抜400mで約30km、山頂で200km超）、
 * それより手前には一切掛からないので、距離に応じたフォグにならなかった。
 * ニア面をフォグの開始距離（注視点より手前なら注視点）に置き直すと、深度はおよそ1−開始距離/距離になり、
 * sky側のfog-ground-blendを0にすれば、濃さ＝(1−開始距離/距離)²（maplibreの式）とカメラの高さに依らず決まる。
 * 注視点より手前を霞ませないのは、高い所から見下ろしたとき画面全体が沈むのを避けるため。
 *
 * 透視行列のニア面はz行（2行目）にしか効かず、z行は「−w行×A＋B」の形（w行は視線方向の距離）なので、
 * 組み上がった行列のz行だけをA・Bの置き直しで書き換えられる（列優先: z行=2,6,10,14、w行=3,7,11,15）
 */
const rewriteFogNear = (transform: FogTransform) => {
  const matrix = transform._fogMatrix;
  if (matrix === undefined) return;
  const helper = transform._helper;
  const near = Math.max(FOG_START_M * helper._pixelPerMeter, helper.cameraToCenterDistance);
  const far = helper._farZ;
  if (!(far > near)) return;
  const a = (far + near) / (near - far);
  const b = (2 * far * near) / (near - far);
  for (let column = 0; column < 4; column++) {
    matrix[2 + 4 * column] = -a * matrix[3 + 4 * column] + (column === 3 ? b : 0);
  }
  // タイルごとのフォグ行列のキャッシュは_calcMatricesの末尾で消されるが、書き換えたので消し直す
  transform._fogMatrixCacheF32?.clear();
};

const wrapFogMatrix = (transform: FogTransform) => {
  if (fogWrappedTransforms.has(transform)) return;
  fogWrappedTransforms.add(transform);
  const original = transform._calcMatrices;
  transform._calcMatrices = function (this: FogTransform, ...args: unknown[]) {
    original.apply(this, args);
    if (fogTransforms.has(this)) rewriteFogNear(this);
  };
};

/**
 * 地形表示に距離に応じたフォグを掛ける（眺望の中でも外でも）。戻り値で元に戻す。
 * 濃さの上限は設けない（以前のフォグと同じくしっかり沈める）。俯角60度未満で掛けないのはmaplibreのまま。
 * Home.web.tsxのskyはfog-ground-blend=0（ニア面＝開始距離から掛ける）にしておくこと
 */
export const enableWebDistanceFog = (map: MaplibreMap): (() => void) => {
  const transform = map.transform as unknown as FogTransform;
  // 型定義の外の内部処理に頼るので、無ければ（maplibreの更新で変わったら）何もしない
  if (typeof transform._calcMatrices !== 'function') return () => undefined;
  wrapFogMatrix(transform);
  fogTransforms.add(transform);
  // 行列は次のカメラ更新で作り直されるが、止まったままでも効くよう今の行列も書き換える
  rewriteFogNear(transform);
  map.triggerRepaint();
  return () => {
    fogTransforms.delete(transform);
    map.triggerRepaint();
  };
};
