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
/**
 * カメラズームの上限（テクスチャ上限とは別）。16超はz16タイルの拡大表示になる
 * （2Dのオーバーズームと同じ見え方）。下限はテクスチャ・DEMの下限z8に合わせる
 */
export const MAX_CAMERA_ZOOM = 20;
/**
 * カメラのズーム下限。テクスチャ・DEMの下限(z8)とは別物で、ここまでは引ける
 * （引いた先はz8のタイルを引き伸ばして見せる。広域を俯瞰する用途）
 */
export const MIN_CAMERA_ZOOM = 5;
/** 同時に保持するタイル数の上限（ジオメトリ）。48タイル=おおよそ7x7リング */
export const MAX_TILES = 48;
/**
 * 遠景リング（近景よりΔ段粗いズームのタイル）のLODチェーン。
 * タイル一辺が2^Δ倍になるため、少ないタイル数で大きな半径をカバーする。
 * 外側のリングから順に描き、間でデプスをクリアして内側を重ねる。
 * z16基準: Δ3=半径約17km、Δ6=約150km（蔵王・船形クラスの遠山まで入る）
 */
export const FAR_RING_DELTAS = [3, 6];
/**
 * 遠景リングのタイル数上限（FAR_RING_DELTASと同じ並び）。半径もこの枚数から逆算する。
 *
 * 最外リングはズームアウトするとDEM配信の下限(z8)に張り付き、DEMを粗くして
 * 共有させることができなくなる（1タイル＝1DEM）。z8のタイルは一辺150km以上あり
 * 40枚だと半径550km＝日本列島が丸ごと入る過剰な範囲なので、枚数自体を絞る
 */
export const MAX_FAR_TILES = [24, 16];
/**
 * 1タイルに同時に重ねられるレイヤ数の上限。
 * フラグメントシェーダのサンプラ本数（uTex0..7）と対応するため、変更時はシェーダも直すこと。
 * PMTiles（距離標等のベクタ）も1枠を使うため、部分配信の写真＋ベース地図の
 * 実運用構成が収まるよう余裕を持たせてある
 */
export const MAX_TERRAIN_LAYERS = 8;
/**
 * DEMテクスチャLRUの上限枚数（256px RGBA≒256KB/枚 → 約16MB）。
 * 近景・遠景の全リングで共有する。z15/16のテクスチャタイルは親のz14 DEMを
 * 共有するため、タイル枚数(最大128)よりずっと少なくて足りる
 */
export const MAX_DEM_TEXTURES = 64;
/** ズーム切替のヒステリシス。擬似ズームがこの幅を超えて変わったらタイルズームを変更 */
export const ZOOM_HYSTERESIS = 0.5;
/** タイル取得の同時実行数 */
export const TILE_LOAD_CONCURRENCY = 6;
/**
 * 可視範囲から外れたタイルを保持しておく時間[ms]と、保持込みの枚数上限倍率。
 *
 * タイル集合は注視点まわりの円をheading方向へ偏らせて決めるため、回転すると
 * 外れる／戻るタイルが多数出る。外れた瞬間に捨てると回し戻すたびに再取得と
 * 再デコードが走り、地形が明滅する。しばらく持っておけば往復でも作り直さずに済む
 */
export const TILE_RETAIN_MS = 4000;
export const TILE_RETAIN_RATIO = 1.5;
/**
 * タイル画像が届くまでに、何段上の親タイルまで遡って仮表示に使うか。
 *
 * 0にすると親を探さなくなり、未着タイルは従来どおり灰色になる（不具合時の切り戻し用）。
 * 3あれば遠景リング（FAR_RING_DELTASの1段目=3）のタイルを親にできる。
 * 4段＝256画素を16画素まで引き伸ばすことになり、それ以上は絵として見るに堪えない
 */
export const MAX_PARENT_TILE_LEVELS = 3;
/**
 * 眺望（その地点に立って見る視点）の設定。
 *
 * pitchは90＝水平。通常のジェスチャ・ボタンはMAX_PITCH_DEGまでだが、
 * 眺望は「水平に見る」ことが目的なので真横まで倒す。
 * ニア面は視点が地上1.7mしかないため小さくする（既定値は注視点距離の2%で数十mある）
 */
export const VISTA_EYE_HEIGHT_M = 1.7;
export const VISTA_PITCH_DEG = 90;
export const VISTA_NEAR_M = 1;
/**
 * 眺望の視点の高さ[m]の段階（ボタンで上下する）。
 * 立った目線から、丘や木立の上・上空へと見晴らしを上げていける刻みにする
 */
export const VISTA_EYE_HEIGHTS_M = [VISTA_EYE_HEIGHT_M, 5, 10, 20, 50, 100, 200, 500, 1000];
/**
 * 眺望中のピッチ上限[度]（90=水平）。
 *
 * 山頂や稜線を見上げられるよう、水平より上も向けるようにする。
 * 通常の操作はMAX_PITCH_DEGのままで、ここを使うのは眺望中だけ
 */
export const VISTA_MAX_PITCH_DEG = 120;
export const VISTA_DURATION_MS = 600;
/**
 * 長押しメニューを出す閾値。2D（containers/Home.tsxのPanResponder）と揃える。
 * 誤爆のコストが大きいので、指が動いたら長押しにしない
 */
export const LONG_PRESS_MS = 800;
export const LONG_PRESS_MAX_MOVE_DP = 10;
/**
 * タイル集合の中心を進行方向へずらす割合（半径に対する比）。
 *
 * 近景は進む先を厚く見せたいので前方へ寄せるが、遠景リングでは0にする。
 * 中心をずらすと回転のたびに集合が入れ替わり、遠景はDEM配信の下限(z8)で
 * 1タイル＝DEM1枚になるため、回すだけで数十枚の展開が走ってしまう
 * （実測: 回転中にデコード54枚/3秒＝JSスレッドが埋まり回転が止まる）。
 * 中心対称にしておけば回しても集合が変わらない
 */
export const NEAR_RING_FORWARD_BIAS = 0.3;
export const FAR_RING_FORWARD_BIAS = 0;
/** 地形メッシュの分割数（一辺）。256pxDEMを4px間引き（旧メッシュ実装と同じ密度） */
export const MESH_SEGMENTS = 64;
/**
 * 遠景リングのメッシュ分割数（FAR_RING_DELTASと同じ並び）。
 *
 * 遠景は画面上で小さくフォグにも隠れるため、近景と同じ密度は要らない。
 * 64→24/12で遠景の頂点数が約9割減る（頂点数はそのままフレーム時間に効く）。
 * 注意: expo-gl時代は間引くと地平線付近にスカートの縦縞が出た（原因未特定・2026-09実測）。
 * WebGPU移行後に再評価した結果がこの値。縦縞が再発したら[64, 64]へ戻すこと
 */
export const FAR_RING_MESH_SEGMENTS = [24, 12];
/**
 * 参照するDEMをタイルズームから何段粗くするか（近景／遠景）。
 *
 * DEM配信の上限はz14なので、タイルズームがそれ以下だと「1タイルにつきDEM1枚」に
 * なり、デコード（1枚あたり数十msの同期処理）がタイル数ぶん発生する。
 * z13では近景48枚＋最外リング40枚で実測1.3秒/3秒をデコードに取られていた。
 * 1段で4タイル、2段で16タイルが1枚を共有できる。スカート底の算出に使う
 * 4x4ブロックはdz=2まで境界に揃う（demTileProvider.DEM_RANGE_BLOCKS参照）。
 *
 * 近景も2段落とす。メッシュは64分割＝65頂点なので、参照するDEMが
 * 64画素（dz=2）あれば1頂点1画素で足り、それ以上細かくても描画結果は変わらない。
 * タップ時の標高だけは粗くなるが、DEMが細かい高ズームでは上限z14に頭打ちして
 * 自動的にdz=2になるため、実用上の精度が落ちるのは広域表示のときだけ
 */
export const NEAR_RING_DEM_ZOOM_OFFSET = 2;
export const FAR_RING_DEM_ZOOM_OFFSET = 2;
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
