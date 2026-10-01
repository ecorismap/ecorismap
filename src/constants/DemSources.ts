/**
 * 標高（DEM）タイルソースの定義。
 *
 * アプリ内で参照する標高タイルのURLをここに集約する。
 * 機能ごとの使い分け・精度・選定理由は docs/DEM_SOURCES.md 参照。
 */

/**
 * 旧・可視領域用DEMタイル（dem_png＋terrarium）の疑似地図ID。
 * Mapterhornへの移行で使わなくなった。起動時に保存済みデータと領域記録を削除するためだけに残す
 * （demSourceMigration.ts）
 */
export const LEGACY_DEM_VIEWSHED_MAP_ID = 'dem_viewshed';

/**
 * ダウンロードするズーム範囲（Mapterhorn 512px）。
 * 可視領域（viewshed.ts VIEWSHED_MIN/MAX_DEM_ZOOM）と3D（terrainDem.ts TERRAIN_DEM_MIN/MAX_ZOOM）の
 * 参照範囲z7〜13に揃える。長押し標高はz15を使うが、無ければ親へ降りるのでz13のDLで足りる
 */
export const DEM_DOWNLOAD_MIN_ZOOM = 7;
export const DEM_DOWNLOAD_MAX_ZOOM = 13;

/**
 * 3D地形の遠景をオフラインで描くため、粗いズームだけ指定範囲の外側も取る。
 *
 * 遠景リング（terrain3d/constants.tsのFAR_RING_DELTAS）は近景の数十〜百数十km先まで
 * 広がるが、DEMはユーザーが選んだ範囲（数km四方が多い）しか端末に無い。
 * 周辺幅は最も粗いz7で150km（z16表示時のΔ6リング半径）とし、1段細かくなるごとに半分にする。
 * リングの半径もタイル枚数固定＝ズーム1段で半分になるので対応が取れ、
 * 追加枚数もズームによらず各段25枚前後に収まる
 */
export const DEM_FAR_MARGIN_KM_AT_MIN_ZOOM = 150;
/** 周辺も取る最も細かいズーム（z16表示時のΔ3リングが参照するDEM=z10・512px） */
export const DEM_FAR_MARGIN_MAX_ZOOM = 10;

/**
 * Mapterhorn（terrariumエンコードWebP 512px、全球）。
 * 日本は基盤地図情報DEM(1m/5m/10m)でz16まで、国外はCopernicus GLO-30ほか各国の公開DEM。
 * 海は0m（深さなし）、外洋は404。z11以下は鉛直1m丸め。
 * ネイティブはmodules/dem-decoder、WebはcreateImageBitmap（色変換なし）でデコードする（demSource.ts）。
 * 用途: 標高の主ソース（docs/MAPTERHORN_MIGRATION_PLAN.mdで段階的に移行中）、Web版の3D地形（raster-dem）。
 * 利用条件: 無料・キー不要・要出典表記（© Mapterhorn）。有志運営（SLAなし）のため、
 * 停止時はMAPTERHORN_URLを同じ形式（terrarium WebP 512px）の配信先へ差し替えて復旧する
 * （例: Mapterhornの日本域を切り出して自前配信。docs/DEM_SOURCES.md参照）。
 * https://mapterhorn.com/
 */
export const MAPTERHORN_URL = 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp';

/**
 * 標高タイル（Mapterhorn）のオフライン保存用の疑似地図ID。
 * Redux tileMapsには登録しない内部専用のダウンロードターゲットで、
 * tileRegions.tileMapId・TILE_FOLDER配下のフォルダ名・ダウンロードセレクタの選択IDに使う。
 * 保存構造: TILE_FOLDER/dem_mapterhorn/{z}/{x}/{y}.webp（0バイト=404マーカー）
 */
export const DEM_MAPTERHORN_MAP_ID = 'dem_mapterhorn';

/** Web版3D地形の起伏強調率。Home.web.tsxとuseDrawTool.tsのsetTerrainで共用 */
export const TERRAIN_EXAGGERATION = 1.5;
