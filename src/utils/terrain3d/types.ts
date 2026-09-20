/**
 * 3D地形エンジンの共通型。
 * エンジン部（src/utils/terrain3d/）はReact非依存の純TSとして実装し、jestでテスト可能にする。
 */

export interface TileKey {
  z: number;
  x: number;
  y: number;
}

/** 3Dビューで描画するラスタレイヤ1枚分の定義（ReduxのtileMapsから抽出） */
export interface LayerSpec {
  /** tileMap.id。オフラインタイルのフォルダ名 */
  id: string;
  /** 署名付与済みのURLテンプレート（{z}/{x}/{y}形式）。hillshade://等は除去済みであること */
  urlTemplate: string;
  /** 0(不透明)〜1(透明)ではなく、three.jsのopacity(1=不透明)に換算済みの値 */
  opacity: number;
  minimumZ: number;
  maximumZ: number;
  /** タイルY座標が反転（TMS）の場合true */
  flipY: boolean;
}

/** orbitカメラの状態。targetは地表上の注視点 */
export interface Terrain3DCameraState {
  /** 注視点の緯度経度 */
  latitude: number;
  longitude: number;
  /** 2D地図のズームレベル相当（小数）。カメラ距離はここから導出する */
  zoom: number;
  /** 方位角[度]。0=北、時計回り（2DのbearingやanimateCameraのheadingと同じ） */
  heading: number;
  /** 俯角[度]。0=真上から、80=水平に近い */
  pitch: number;
}

/**
 * react-native-mapsのMapView互換の最小カメラ操作面。
 * 3D表示中にmapViewRef.currentへ差し込むことで、useMapViewのズームボタンや
 * useLocationのanimateCamera呼び出し（follow追従・ヘディングアップ回転）を
 * 無改造で3Dカメラへ届ける（isMapViewはanimateCameraの有無で判定するため）。
 */
export interface Terrain3DHandle {
  animateCamera: (
    camera: { center?: { latitude: number; longitude: number }; heading?: number; zoom?: number; pitch?: number },
    opts?: { duration?: number }
  ) => void;
  animateToRegion: (
    region: { latitude: number; longitude: number; latitudeDelta?: number; longitudeDelta?: number },
    duration?: number
  ) => void;
  getCamera: () => Promise<{
    center: { latitude: number; longitude: number };
    heading: number;
    zoom: number;
    pitch: number;
  }>;
  /** jumpTo等の即時移動用（MapView.setCamera互換） */
  setCamera: (camera: { center?: { latitude: number; longitude: number }; zoom?: number; heading?: number }) => void;
  /** 回転ボタン用。現在headingから相対回転（アニメーション付き） */
  rotateBy: (deltaDeg: number) => void;
  /** 傾きボタン用。現在pitchから相対変更（アニメーション付き） */
  pitchBy: (deltaDeg: number) => void;
  /** MapView実体との判別用 */
  isTerrain3D: true;
}

export const isTerrain3DHandle = (map: unknown): map is Terrain3DHandle =>
  typeof map === 'object' && map !== null && (map as Terrain3DHandle).isTerrain3D === true;

/** タイルテクスチャの解決結果 */
export type TileTextureSource =
  | { kind: 'localUri'; uri: string; width: number; height: number }
  | { kind: 'rgba'; data: Uint8Array; width: number; height: number }
  | { kind: 'missing' };
