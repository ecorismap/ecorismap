# 標高（DEM）ソースの方針

アプリが標高データを使う機能と、参照するタイルソースの整理。URL定義は`src/constants/DemSources.ts`に集約している。

## 機能とソースの対応

| 使用場面 | プラットフォーム | ソース | 実効精度 | 提供範囲 | エンコード / デコーダ |
|---|---|---|---|---|---|
| 3D起伏表示 | Webのみ | Mapterhorn | 日本1〜10m・z15 | 全球 | terrarium WebP 512px / maplibre内蔵 |
| 可視領域の計算 | iOS/Android/Web | 地理院dem_png → 国外はAWS Terrain Tilesへタイル単位フォールバック | 国内10m（z14）／国外30m | 全球 | 地理院独自 + terrarium PNG / 自前（pngLite） |
| 長押しの標高表示 | iOS/Android/Web | 同上（`getDemElevation`、可視領域とキャッシュ共有） | 同上 | 全球 | 同上 |
| 陰影起伏（`hillshade://`） | iOS/Android/Web | 産総研シームレス標高タイル 海陸統合DEM（`elev/mixed`、プリセット地図） | 陸10m相当（z15）／海250〜500m級（信頼できるのはz8まで） | 日本周辺（z9以上の海は不正確または透明） | 地理院系独自 / 自前（Web: shadingTileProtocol、ネイティブ: react-native-mapsパッチ） |
| 陰影段彩＋等深線（`relief://`、URL手動指定） | iOS/Android/Web | 任意の地理院/産総研方式DEM（プリセットなし） | ソース依存 | ソース依存（海に接する陸画素は透明=海岸はベース地図優先） | 同上（hillshadeと同一パイプライン、色付けのみ別。詳細は[HILLSHADE_USAGE.md](./HILLSHADE_USAGE.md)） |
| GEBCO海底地形図（`relief://`＋`#style=gebco`） | iOS/Android/Web | 産総研シームレス標高タイル GEBCO（`elev/gebco`、プリセット地図、固定ズーム9） | 約450m（GEBCO 15秒メッシュ） | 全球 | shiwaku氏デモの再現。Web=maplibre実レイヤ（color-relief＋hillshade＋maplibre-contourの等深線・数値ラベル）、ネイティブ=同じ見た目のラスタ近似（数値ラベルは水平焼き込み） |
| （参考）elev2系ソースのURL手動指定 | iOS/Android/Web | 例: 内閣府 南海トラフ地形データ（`elev2/caonankai`、512px WebP、z11まで） | z10〜11（≒40〜80m/px） | 南海トラフ広域。整備域の外は透明 | GEBCOスタイルで指定可能（プリセットなし）。Webは親タイル補完あり、ネイティブはNoDataが透明 |
| 陰影起伏図（初期地図） | iOS/Android/Web | 地理院の陰影**画像**タイル（DEMではない） | − | 日本 | 通常のラスタ |

方針: **数値を返す計算系（可視領域・標高表示）は地理院＋AWSの1系統に統一**されている。3Dは表示専用なので別配信（Mapterhorn）を許容するが、日本のデータは可視領域と同じ基盤地図情報の系譜であり、値の食い違いは実用上生じない。

## オフライン対応（可視領域・長押し標高）

ダウンロードモードの対象地図セレクタにある「標高タイル（可視領域用）」（`DEM_VIEWSHED_MAP_ID`、地図一覧には出ない内部専用ターゲット。「すべての地図」にも含まれる）で、表示範囲のDEMタイルをz8〜14で保存できる。タイルごとに地理院dem_pngを取得し、404（海・国外）ならTerrain Tilesへフォールバック保存する（`src/utils/demTileDownload.ts`）。保存先は`TILE_FOLDER/dem_viewshed/{gsi|terrarium}/{z}/{x}/{y}`で、GSI 404のタイルはgsi側に0バイトマーカーを書いて「確定404」と「未ダウンロード」を区別する。実行時はオン/オフライン問わず**ダウンロード済みローカル→cacheDirectoryキャッシュ→ネットワーク**の順で参照する（`demTileLoader.loadDownloadedDemTile` + `viewshed.fetchTileFromSource`）。Webはダウンロード機能がないため従来どおり。

## 各ソースの素性

| ソース | 元データ | 条件 | 備考 |
|---|---|---|---|
| 地理院 dem_png | 基盤地図情報 DEM10B | 出典＋加工した旨の記載（国土地理院コンテンツ利用規約） | 海はNoData。独自エンコードでmaplibreは直接読めない（NoData表現が壊れるため3Dに直結不可） |
| AWS Terrain Tiles | SRTM/GMTED/ETOPO1等の合成 | 無料・キー不要・[出典一覧](https://github.com/tilezen/joerd/blob/master/docs/attribution.md) | SRTMはレーダー計測で樹冠を含みがち。森林では地理院DTMより高く出る |
| Mapterhorn | 日本=基盤地図情報 DEM 1m/5m/10m（測量法承認済）、国外=Copernicus GLO-30ほか | 無料・キー不要・要「© Mapterhorn」表記 | 有志運営（Cloudflare支援、SLAなし）。停止時は`TERRARIUM_URL`へ1行差し替えで復旧。恒久策は日本域PMTiles抽出の自己ホスト |
| 産総研シームレス標高タイル（陸域統合DEM `elev/land`） | 陸域統合DEM | 出典表記 | z14全国、z15以上は一部地域のみ。プリセットはmixedへ移行したが陸専用の指定先として使える |
| 産総研シームレス標高タイル（海陸統合DEM `elev/mixed`） | 陸=基盤地図情報系、海=日本周辺250mメッシュ(岸本2000)＋GEBCO | 出典表記（GSJサイト利用規約=CC BY互換） | 陸域はz15まで。海域が信頼できるのはz8まで（z9は地域により海面に正値が混入、z10は海が全てNoData。2026-08実測）。`hillshade://`と`relief://`のプリセットで使用 |
| 産総研シームレス標高タイル（GEBCO `elev/gebco`） | GEBCO Grid（大洋水深総図、海陸とも収録） | 出典表記（同上＋GEBCO出典） | 全球・z9まで（2026-08実測）。「GEBCO海底地形図(全球)」プリセットで使用 |
| 海しるAPI（海上保安庁） | 島名・海底地形名ポイント | 出典表記「海しる（海上保安庁）」（政府標準利用規約2.0=CC BY互換） | GEBCO海底地形図プリセットに同梱（`src/presets/data/msil_*.json`、Web=GeoJSONレイヤ・ネイティブ=Markerオーバーレイ）。`scripts/fetch-msil-data.js`で再取得（要無料登録キー） |

## 3DにMapterhornを採用した経緯（2026-08）

以前はMapTiler terrain-rgb-v2（無料枠・30m級・maxzoom12設定）を使っていた。無料枠は非商用限定・セッション上限超過で配信停止のため移行。候補比較:

- **Mapterhorn（採用）**: 性能（512px=リクエスト1/4・ブラウザ内蔵デコード）と精度（日本1〜10m/z15）が最良。表示専用機能なので有志運営リスクの影響が最小
- AWS直接: 工数最小だが日本30mのまま。SRTMは樹冠込みで、可視領域の計算結果（地理院DTM）と森林で系統的にずれる
- 自前変換（地理院→terrarium再エンコードのカスタムプロトコル）: 計算系と同一データになるが、タイルあたり10〜20msのJS処理がメインスレッドに乗り、3D操作時のカクつきリスクが大きい

## 全面Mapterhorn統一の前提条件（将来の検討用）

計算系・陰影までMapterhornに寄せる場合のブロッカー:

1. 配信がWebPのみで自前デコーダ（pngLite）はPNG専用。HermesはWebAssembly非対応でwasmデコーダも不可 → **ネイティブのWebPデコード追加が前提**
2. Web版だけ移すと可視領域の計算結果がプラットフォーム間で食い違う（保存・共有されるデータなので不可）
3. 陰影起伏のネイティブ実装（react-native-mapsパッチ）は地理院エンコード＋PNG専用
4. 中核機能（可視領域）の生命線を有志運営1本に預けることになる
