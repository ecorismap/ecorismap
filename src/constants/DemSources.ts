/**
 * 標高（DEM）タイルソースの定義。
 *
 * アプリ内で参照する標高タイルのURLをここに集約する。
 * 機能ごとの使い分け・精度・選定理由は docs/DEM_SOURCES.md 参照。
 */

/**
 * 国土地理院 標高タイル（DEM10B統合、最大z14 ≒ 10m解像度、日本国内のみ・海はNoData）。
 * 独自エンコードのPNGで、maplibreは直接デコードできない（pngLite + decodeElevationで自前デコード）。
 * 用途: 可視領域の計算・長押しポップアップの標高表示（国内）。
 * 利用条件: 国土地理院コンテンツ利用規約（出典と加工した旨の記載）。
 * https://maps.gsi.go.jp/development/demtile.html
 */
export const GSI_DEM_URL = 'https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png';

/**
 * AWS Terrain Tiles（旧Mapzen、terrariumエンコードPNG 256px、z0-15、全球30m級）。
 * 出典: Mapzen/AWS Open Data "Terrain Tiles"（SRTM, GMTED, ETOPO1等の合成）。
 * 用途: 可視領域・標高表示の国外フォールバック。3D地形の非常用差し替え先。
 * 利用条件: 無料・キー不要。出典表記は https://github.com/tilezen/joerd/blob/master/docs/attribution.md
 * https://registry.opendata.aws/terrain-tiles/
 */
export const TERRARIUM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

/**
 * Mapterhorn（terrariumエンコードWebP 512px、z0-15、全球）。
 * 日本は基盤地図情報DEM(1m/5m/10m)、国外はCopernicus GLO-30ほか各国の公開DEM。
 * WebPのため自前デコーダ（pngLite）では読めず、maplibreの内蔵デコード専用。
 * 用途: Web版の3D地形表示（raster-dem）。
 * 利用条件: 無料・キー不要・要出典表記（© Mapterhorn）。有志運営（SLAなし）のため、
 * 停止時はTERRARIUM_URL（PNG 256px）へ差し替えて復旧できる。
 * https://mapterhorn.com/
 */
export const MAPTERHORN_URL = 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp';

/** Web版3D地形の起伏強調率。Home.web.tsxとuseDrawTool.tsのsetTerrainで共用 */
export const TERRAIN_EXAGGERATION = 1.5;
