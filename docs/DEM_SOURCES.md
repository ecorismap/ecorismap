# 標高（DEM）ソースの方針

アプリが標高データを使う機能と、参照するタイルソースの整理。URL定義は`src/constants/DemSources.ts`に集約している。

2026-10に、陸の標高を**Mapterhorn**へ統一した（経緯・速度比較・段階は[MAPTERHORN_MIGRATION_PLAN.md](./MAPTERHORN_MIGRATION_PLAN.md)）。
海底の値が要るもの（GEBCO海底地形図・等深線ラベル・3Dの海底モード）だけ産総研GEBCOを使う。

## 機能とソースの対応

| 使用場面 | プラットフォーム | ソース | 参照ズーム | デコード |
|---|---|---|---|---|
| 可視領域の計算 | iOS/Android/Web | Mapterhorn | z7〜13（512px。旧dem_png z8〜14と同じ画素密度） | ネイティブ（`modules/dem-decoder`）／Web=createImageBitmap（色変換なし） |
| 長押しの標高表示 | iOS/Android/Web | Mapterhorn | z15（日本で約2m）。無い地域は粗い段へ降りる、外洋は0m | 同上 |
| 3D地形（ネイティブ） | iOS/Android | Mapterhorn | z7〜13（地図タイルより3段粗い512px） | ネイティブ→r32floatテクスチャ |
| 3D地形（Web） | Web | Mapterhorn | maplibre raster-dem | maplibre内蔵 |
| 3Dの海底モード | iOS/Android/Web | 陸=Mapterhorn、海（0m・404）=産総研GEBCO | GEBCOはz9まで | `fillSeaWithBathymetry`（海面下×3） |
| 陰影起伏（`hillshade://`） | iOS/Android/Web | Mapterhorn（プリセット） | 地図タイルより1段粗い512pxから地図タイル分だけ計算 | パッチ（Java/ObjC）・Web=shadingTileProtocol。terrarium専用 |
| 段彩（`relief://`、URL手動指定） | iOS/Android/Web | Mapterhorn | 同上 | 同上（hillshadeと同一パイプライン、色付けのみ別。[HILLSHADE_USAGE.md](./HILLSHADE_USAGE.md)） |
| GEBCO海底地形図（`relief://`＋`#style=gebco`） | iOS/Android/Web | 産総研 GEBCO（`elev/gebco`、プリセット、固定ズーム9） | z9まで | GSI形式。Web=maplibre実レイヤ、ネイティブ=パッチのラスタ近似 |
| 等深線の数値ラベル（ネイティブ） | iOS/Android | 産総研 GEBCO | 同上 | ネイティブ（`contourLabels.ts`） |
| 陰影起伏図（初期地図） | iOS/Android/Web | 地理院の陰影**画像**タイル（DEMではない） | − | 通常のラスタ |

形式の規則: `hillshade://`と汎用`relief://`は**terrarium形式専用**（GSI形式は読まない）。GEBCO段彩だけGSI形式。
判定は`terrainShading.isTerrariumDemUrl`、パッチ側も同じ規則。古いURL（産総研elev/mixed等）の保存済みレイヤは
起動時とtileMaps変更時に`demSourceMigrationCore`がMapterhornのURLへ書き換え、旧形式のキャッシュ・ダウンロードを削除する。

## 取得とキャッシュ

- Mapterhorn本体: `src/utils/demSource.ts`（`getDemTile`）。参照順はデコード済みLRU → オフラインDL → ディスクキャッシュ（`cacheDirectory/dem_mapterhorn`）→ ネットワーク（1回リトライ）。404は0バイトのマーカー
- レイヤごとのURL（GEBCO等）: `src/utils/demTileLoader.ts`（`fetchDemTileFile`、`cacheDirectory/dem_tiles`）
- デコードはどちらもネイティブで、JSスレッドを塞がない。Releaseビルドの実測で、同じ範囲を旧方式（dem_png＋JSデコード）の約35〜90倍の速さで読める

## オフライン対応（可視領域・長押し標高・3D）

ダウンロードモードの対象地図セレクタにある「標高タイル（可視領域・3D用）」（`DEM_MAPTERHORN_MAP_ID`、地図一覧には出ない内部専用ターゲット。「すべての地図」にも含まれる）で、
表示範囲のMapterhornタイルをz7〜13で保存する（`src/utils/demTileDownload.ts`）。3Dの遠景用に、z7〜10は指定範囲の外側も保存する（z7で150km、1段ごとに半分）。
保存先は`TILE_FOLDER/dem_mapterhorn/{z}/{x}/{y}.webp`で、404（外洋）は0バイトのマーカー。
旧形式（`dem_viewshed`、dem_png＋terrarium）は読まず、起動時に削除する。

## 各ソースの素性

| ソース | 元データ | 条件 | 備考 |
|---|---|---|---|
| Mapterhorn | 日本=基盤地図情報 DEM 1m/5m/10m（測量法承認済）、国外=Copernicus GLO-30ほか | 無料・キー不要・要「© Mapterhorn」表記 | terrarium WebP 512px（ロスレス）。日本z16まで、国外は地域差（多くはz12前後）、外洋は404・海は0m。z11以下は鉛直1m丸め。有志運営（SLAなし） |
| 産総研シームレス標高タイル（GEBCO `elev/gebco`） | GEBCO Grid（海陸とも収録） | 出典表記（GSJサイト利用規約＝CC BY互換＋GEBCO出典） | 全球・z9まで（2026-08実測）。GSI形式PNG 256px |
| 産総研シームレス標高タイル（elev2系、URL手動指定） | 例: 内閣府 南海トラフ地形データ（`elev2/caonankai`、512px WebP、z11まで） | 出典表記 | GEBCOスタイルで指定可能（プリセットなし）。整備域の外は透明＝NoData |
| 海しるAPI（海上保安庁） | 島名・海底地形名ポイント | 出典表記「海しる（海上保安庁）」（政府標準利用規約2.0＝CC BY互換） | GEBCO海底地形図プリセットに同梱（`src/presets/data/msil_*.json`）。`scripts/fetch-msil-data.js`で再取得（要無料登録キー） |

## Mapterhornのリスクと復旧

- **配信の遅さ**: CDNに載っていないタイルは1〜3秒以上かかる（2026-10実測。キャッシュ済みは0.1〜0.2秒）。長押し・可視領域・3Dの初回に効く。許容済み
- **停止**: 有志運営でSLAなし（許容済み）。止まったら`MAPTERHORN_URL`を同じ形式（terrarium WebP 512px）の配信先へ差し替える。
  候補はMapterhornの日本域を切り出した自前配信。形式が違う配信（例: AWS Terrain Tilesは256px PNG）へは単純に差し替えられない
  （512px前提のズーム対応・陰影の1段粗い取得が崩れる）
