/** 3D地形エンジンのチューニング定数 */

/** カメラの視野角[度]（垂直） */
export const CAMERA_FOV_DEG = 60;
/** 3Dモード開始時の俯角[度] */
export const INITIAL_PITCH_DEG = 60;
/** ピッチの可動範囲[度] */
export const MIN_PITCH_DEG = 0;
export const MAX_PITCH_DEG = 80;
/** テクスチャタイルのズーム範囲。上限はオフライン地図ダウンロードの最大z=16に合わせる */
export const MIN_TEX_ZOOM = 8;
export const MAX_TEX_ZOOM = 16;
/** 同時に保持するタイル数の上限（ジオメトリ）。48タイル=おおよそ7x7リング */
export const MAX_TILES = 48;
/** テクスチャLRUの上限枚数（256px RGBA≒256KB/枚 → 約25MB） */
export const MAX_TEXTURES = 96;
/** ズーム切替のヒステリシス。擬似ズームがこの幅を超えて変わったらタイルズームを変更 */
export const ZOOM_HYSTERESIS = 0.5;
/** タイル取得の同時実行数 */
export const TILE_LOAD_CONCURRENCY = 6;
/** 地形メッシュの分割数（一辺）。256pxDEMを4px間引き */
export const MESH_SEGMENTS = 64;
/** アニメーション中の描画フレームレート上限 */
export const MAX_FPS = 30;
/**
 * フォグの開始・終端（カメラ〜注視点距離を底上げした上で、タイルリング半径に掛ける倍率）。
 * 開始が手前すぎると画面の大半が白くかすむ（白飛びに見える）ため、
 * リングは前方へ30%偏らせてある分（前方端=1.3R）を使って奥側に寄せている
 */
export const FOG_NEAR_RATIO = 0.6;
export const FOG_FAR_RATIO = 1.15;
/** 空・フォグの色 */
export const SKY_COLOR = 0xbfd9ec;
/** 太陽光の方位[度]（北=0・時計回り、赤色立体図の光源方位315°=北西と整合） */
export const SUN_AZIMUTH_DEG = 315;
/** 太陽光の高度[度] */
export const SUN_ALTITUDE_DEG = 45;
/** ジェスチャ終了後にmapRegionへ同期するまでのスロットル[ms] */
export const REGION_SYNC_THROTTLE_MS = 1000;
