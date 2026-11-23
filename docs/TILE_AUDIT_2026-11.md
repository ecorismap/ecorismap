# 地図タイルとオフラインの監査（2026-11）

2026-11-23 実施。地図タイルとオフライン利用で次のことが起きる経路を探した。オフラインで地図が出ない・欠ける。ダウンロードしたはずのタイルが消える、または使われない。別の地図のタイルが混ざる。容量を浪費する、消せないキャッシュが残る。ダウンロードが終わらない・中止できない。クラッシュする。規約に反する保存をする。表示と設定が食い違う。プロジェクト共有で地図設定がそろわない。

- **範囲**: 地図タイルの表示・ダウンロード・キャッシュ・削除、PMTiles・pbf・PDF 地図、標高（DEM）タイルの取得とキャッシュ、陰影起伏・段彩（`hillshade://`・`relief://`）、地図プリセット、地図リスト、プロジェクトでの地図設定・スタイルの共有。主なファイルは `useTiles.ts`、`useMaps.ts`、`useMapEdit.ts`、`useTileSignatures.ts`、`Tile.ts`、`tileDownloadHelpers.ts`、`TileSignature.ts`、`vectorTileStyle.ts`、`pmtileProps.ts`、`demSource*.ts`、`demTileDownload.ts`、`demTileLoader*.ts`、`shadingTileProtocol.web.ts`、`gebcoDemLayers.web.ts`、`pdfExport/tiles.ts`・`webPmtiles.ts`、`PDF.ts`・`PDF.web.ts`、`containers/Home.tsx`（ダウンロード部分）・`Maps.tsx`・`MapEdit.tsx`、`pages/Home.tsx`・`Home.web.tsx`、`useRepository.ts`（地図設定とスタイルの共有）、`patches/react-native-maps+1.27.2.patch`（ネイティブのタイル取得・PMTiles・DEM オーバーレイ）、`patches/pmtiles+3.0.6.patch`。3D 描画エンジン（描画・カメラ）は対象外だが、3D が使うタイル・DEM の取得とキャッシュは含めた。
- **方法**: 観点（ダウンロード、キャッシュ、端末内ファイル、ネイティブ、DEM、Web、共有と方針）ごとに候補を出し、重複をまとめた。各候補を3人が別々に検証し、実在するか、重大度、手順に訂正があるかを投票した。重大度と手順は3票の多数に従い、訂正は本文に反映した。メモリに記録済みの既知・修正済みの問題（iOS PMTiles の NoTile 確定、iOS の tileCachePath の NSURL、P-M6 のキャッシュクリアの対象変更、Web/ネイティブ差分17件、インポート/エクスポート監査など）は再報告していない。
- **結果**: 確認 44件（**high 7、medium 21、low 16**）。反証 2件（重複を含めると候補3件）。
- コードは変更していない。手順はコードとライブラリのソースを読んで成り立つと確認したもので、実機では確かめていない。ネイティブの行番号は、断りがなければパッチ適用後の `node_modules/react-native-maps/` のもの。
- **分類**: **安全に直せる**＝挙動の方針を変えずに直せる。**判断が要る**＝挙動や仕様を変えるので、どちらにするか決める必要がある。

---

## 優先して直すもの（high）

### M-H1. 「すべての地図」のダウンロード・削除の対象に、選択画面で除外している PDF 地図まで入り、PDF 地図のタイルが壊れる・消える【安全に直せる】

- **原因**: 「すべての地図」で対象にする地図の条件が、画面と処理でそろっていない。
  - 選択画面 `HomeTileMapSelector.tsx:26-36` は `.pdf`・`pdf://`・`file://`・`blob:` を候補から外している。
  - ダウンロード対象 `downloadTargetMaps`（`containers/Home.tsx:1873-1881`）は、グループ・standard・hybrid・peaks しか外さない。
  - 削除 `pressDeleteTiles`（`containers/Home.tsx:2169-2174`）は peaks も外さない。
  - 地図一覧の「ダウンロード」（`Maps.tsx:257-262` の gotoDownload）は tileMap を渡さずに開くので、個別に選ばなければ必ずこの経路を通る。
- **手順と症状**（PDF の種類で症状が違う）
  1. **URL から取り込んだ1ページの PDF**（url が元の `https://…pdf` のまま残る。`useMaps.ts:787-797`）: 「すべての地図」のまま範囲をダウンロードする。`getTileType`（`tileDownloadHelpers.ts:19-28`）は拡張子 pdf を `'png'` と判定し、z0〜min(基準ズーム,16) を取る。URL に `{z}{x}{y}` が無いので、範囲内のタイル1枚ごとに PDF 本体を `FileSystem.downloadAsync` し（`useTiles.ts:684-703`）、200 なので `TILE_FOLDER/{id}/z/x/y` に保存される。新規ダウンロードは既存タイルを飛ばさない（`useTiles.ts:591-594` は再開時だけ）ので、PDF から生成したタイル（`PDF.ts:204`）が PDF のバイト列で上書きされる。iOS は画像でないキャッシュを消すので、その範囲の PDF 地図は表示されなくなる。同じ PDF をタイル枚数分（数百〜数千回）取得し、見積もりは1枚30KB前提なので確認ダイアログにも現れない。
  2. **端末内から取り込んだ PDF**（url=`file://名前`。複数ページは URL 由来でもこの形）: ダウンロードは全件失敗するだけで、上書きはしない。ただし毎回「エラーのあった地図」に載り、推定枚数が膨らみ、完了扱いの保存範囲（`useTiles.ts:750-757`）まで作られる。
  3. **削除**: ダウンロード画面で「すべての地図」のままゴミ箱を押すと（確認文は「地図のキャッシュを削除しますか？」だけ）、全 PDF 地図の `TILE_FOLDER/{id}/` がフォルダごと消える。中身は PDF タイル・boundary.json。端末内の PDF は再生成の経路がなく、地図は一覧に残ったまま白紙になる。選択画面に PDF 地図は出ていないので、利用者は対象に入っていると気づけない。
- **根拠**: `containers/Home.tsx:1868-1885, 2159-2193`、`HomeTileMapSelector.tsx:26-36`、`tileDownloadHelpers.ts:19-41`、`useTiles.ts:113-119, 591-594, 684-703, 750-757`、`useMaps.ts:744-801`、`PDF.ts:186-215`
- **影響**: PDF 地図が範囲内で壊れる、または丸ごと消える。端末内の PDF は取り込み直すしかない。URL の PDF を大量に再取得し、通信量と配信サーバーの負荷も大きい。
- **修正案**: 「ダウンロード対象になる地図」の判定を1つの関数（例: `isDownloadableTileMap`。グループ・standard・hybrid・peaks・`.pdf`・`pdf://`・`file://`・`blob:` を除外）にまとめ、`HomeTileMapSelector`・`downloadTargetMaps`・`estimateDownloadTileCount`・`pressDeleteTiles`・`useTiles` の savedArea と容量集計で使う。
- 補足: 削除で style.json・boundary.json も消える点は、個別に選んだ場合も同じ動きなので M-H2 で扱う。

### M-H2. 設定の「キャッシュをクリア」とダウンロード画面の削除が、再取得できない地図の実体（PDF 地図のタイル、取り込んだスタイル、Web の PMTiles 本体）まで消す【判断が要る】

- **手順**
  1. 設定の「キャッシュをクリア」（`containers/Settings.tsx:306-324`。確認文は「地図のキャッシュをクリアしますか？（写真・記録データ・レイヤは削除されません）」、`ja/translation.json:516`）は `clearTileCache`（`useMaps.ts:193-204`）を呼ぶ。
     - ネイティブ: `TILE_FOLDER` を丸ごと `deleteAsync` する。端末内 PDF から生成したタイルと boundary.json（`useMaps.ts:742-780`、url=`file://名前`）、取り込んだ `style.json`（`useMaps.ts:595-607`、styleURL=`style://style.json`）も消える。
     - Web: `db.geotiff.clear()` と `db.pmtiles.clear()` で全行を消す。取り込んだ PDF（data URI）と PMTiles の blob（`useMaps.ts:739, 880`）、スタイルが唯一の保存先ごと消える。`tileMaps` は消さないので、一覧には壊れた地図が残る。
  2. ダウンロード画面の削除（`containers/Home.tsx:2155-2193`）も地図フォルダごと消すので、個別に選んだ場合でも style.json と boundary.json が一緒に消える（「すべての地図」で PDF 地図まで消える点は M-H1）。
- **消えたあと**
  - PDF 地図は白紙のまま戻らない。Web の PDF は保存版のダウンロードも `pdfNotFound` になる。
  - Web の PMTiles は、再読み込み後 `updatePmtilesURL`（`useMaps.ts:621-633`）が blob を見つけられず URL を作り直せないので、空白になる。
  - スタイル: ネイティブは `style://` を取得できずローカルの style.json も無いので既定スタイル（緑/青）で描く（Android `VectorTileStyleManager.loadStyleAsync`、patch 7278-7302）。Web は `getStyleFromLocal`（`vectorTileStyle.ts:96-104, 140-150`）が空で既定スタイルに戻る。プロジェクトの共有スタイルは開き直せば `downloadStyle`（`useRepository.ts:1518-1540`）が取り直すが、端末で取り込んだスタイルは取り直せない。
- **訂正**: ネイティブではローカル PMTiles の取り込み自体を断っている（`useMaps.ts:850-852`）。PMTiles の本体が消える被害は Web に限られる。
- **影響**: 「キャッシュ」と案内された操作で、取り込んだ地図が元に戻せない形で消える。写真について P-M6 で行った「再取得できるキャッシュだけ消す」方針が、地図側では守られていない。
- **重大度について**: 3票中1票は medium（確認ダイアログの後で起き、元ファイルがあれば取り込み直せる）。多数に従い high とした。
- **修正案**
  - ネイティブの `clearTileCache` と `pressDeleteTiles` は、各地図フォルダの数字名のズームディレクトリ（と `.pbf`、ダウンロード時の metadata.json）だけを消す。PDF 由来の地図（url が `file://` か `.pdf`）のフォルダ、style.json、boundary.json は残す。フォルダ全体を消すのは地図そのものを削除するとき（`useMaps.clearTiles`）だけにする。
  - Web の `clearTileCache` は、blob を持つ pmtiles 行・style を持つ行・`file://` の PDF の geotiff 行を消さない（Web はタイル自体を保存していない）。消すなら `pdf://` から再取得できる geotiff 行と boundary だけにする。
  - 実体も消す仕様を残すなら、確認文にそう書き、該当する `tileMaps` も一覧から外す。

### M-H3. PMTiles・pbf のダウンロード範囲が「今のズーム〜z18」なので、高ズームで保存すると何も保存されず、縮小すると欠け、枚数の見積もりも大きくずれる【判断が要る】

- **原因**: `getZoomRange`（`tileDownloadHelpers.ts:30-41`）は png と hillshade だけ z0 から取り、pmtiles と pbf は minZoom＝今のズームにしている。ベクタの maxZoom は `overzoomThreshold` を見ずに 18 固定。新規（`useTiles.ts:277-279`）も再開（`useTiles.ts:588-591`）もこの範囲で一覧を作り、見積もり（`estimateDownloadTileCount`、`tileDownloadHelpers.ts:101-106` → `containers/Home.tsx:1887-1897`）も同じ範囲で数える。pmtiles の `getZxy` は z>ヘッダーの maxZoom なら undefined を返し（`node_modules/pmtiles/index.ts:965`）、`useTiles.ts:316-340` は黙って飛ばす。ヘッダーの min/maxZoom で範囲を切る処理はない。
- **手順**（アーカイブのヘッダーは Range 取得で確認済み: 等高線 contour.pmtiles は z12〜13、特定植物群落 spPlantComm.pmtiles は z5〜15）
  1. 等高線を z14 以上、特定植物群落を z16 以上でダウンロードする → 取得範囲がアーカイブの外なので1枚も保存されないのに「完了」になり、保存範囲の枠も出る。オフラインでは `getPmtileMaximumNativeZ` が 13（等高線）のタイルを探すが無いので何も描かれない。
  2. 特定植物群落を z14 で保存してから、オフラインで z12 に縮小する → z14 より粗いタイルが無いので白紙になる（ネイティブは下のズームを上のズームから作らない）。等高線はもともと z12 から始まるので、この症状はない。
  3. z12 前後でベクタ PMTiles を取ると、z12〜18 を数えるので確認ダイアログの枚数が実際の数十〜数千倍になり、条件次第で上限 30,000 を超えて「タイルが多すぎます」でダウンロードできない。存在しない段の分も空のフォルダを大量に作る。
- **訂正**: ネイティブはオンラインで表示したタイルを同じ `tileCachePath` に書くので、オンラインで一度見た範囲はオフラインでも出ることがある。ダウンロード機能そのものが働いていないことは変わらない。z10 程度の広域で上限を超えるのは png も同じで、PMTiles だけの問題ではない。
- **影響**: PMTiles の地図（プリセットの等高線・特定植物群落を含む）がオフラインで出ない・欠ける。ダウンロード可否と容量の表示が実際と合わない。
- **重大度について**: 3票中1票は medium（オンライン閲覧のキャッシュで一部救われる）。多数に従い high。
- **修正案**
  - pmtiles・pbf の最小ズームは 0（取れるならヘッダーの minZoom）、最大ズームは min(ヘッダーの maxZoom, `getPmtileMaximumNativeZ(tileMap, true)`)（overzoomThreshold をベクタ18・ラスタ16で頭打ち）にする。ヘッダーを先に読めないときも、少なくとも minZoom=0、maxZoom=min(18, overzoomThreshold) にする。
  - 見積もりも同じ関数で数える。
  - `getZxy` がすべて undefined だったら完了扱いにせず警告する。
  - オフラインで縮小したときの見え方が変わる（下位ズームが増える）ので、判断が要る扱いにした。

### M-H4. ラスタ PMTiles のダウンロードが「`{y}.png` に Base64 文字列」で保存され、iOS・Android とも一度も読まれない【安全に直せる】

- **手順**
  1. ラスタの PMTiles 地図（URL が `.pmtiles`、ベクタのチェックなし）を表示した状態で範囲をダウンロードする。完了と表示され、保存範囲の枠も出る。
  2. 機内モード（または自動のオフライン判定）にして同じ範囲を見る → 何も出ない。オンライン中に一度表示した場所だけが出るので、ダウンロードが効いているように見える。
- **原因**: 保存側（`useTiles.ts:328-342, 649-662`）は `${TILE_FOLDER}/${id}/${z}/${x}/${y}.png` に、`Buffer.toString('base64')` した文字列を UTF8 テキストとして、await せずに書く（2023年の 78f25331 で、ベクタ用のコードを `.pbf` から `.png` に変えて複製したもの）。読む側は両 OS とも拡張子なしの `{z}/{x}/{y}` を生バイトとして読む。
  - Android: `MapPMTileProvider.getTileImage` → `readTileImage`（patch 2542-2570）、`getTileFilename` は拡張子なし（patch 2657-2663）。オフラインのラスタは tileType=2 で pmtiles を作らず（patch 1619-1629）、`getRasterTile` は `pmtiles == null` で null を返す。
  - iOS: `AIRGoogleMapPMTileOverlay` が `%@/%ld/%ld/%ld` を NSData のまま読む（patch 13351-13365, 13498）。
  - 3D（`terrain3d/tileTextureLoader.ts:64`）と PDF（`PDF.ts:57`）も同じ `tileCachePath` でネイティブ経路を通るので、同じく出ない。
- **影響**: ラスタ PMTiles のオフライン保存が実質働かず、容量（Base64 で約1.33倍）だけ使う。`listExistingTiles`（`tileDownloadHelpers.ts:133`）は `.png` を外して保存済みとみなすので、再開しても取り直されない。
- **重大度について**: 3票中1票は medium（同梱プリセットにラスタ PMTiles はなく、利用者が URL を登録した場合だけ起きる）。多数に従い high。
- **修正案**: 2か所のラスタ分岐で、保存先を拡張子なしの `${TILE_FOLDER}/${id}/${z}/${x}/${y}` にし、`await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 })` で生バイトとして書く（ネイティブがオンライン時に書くキャッシュ・png タイプと同じ形式）。書き込み失敗は errorCount に数える。既存の `{y}.png` は移行時にデコードして書き直すか削除する。

### M-H5. 既存の PMTiles 地図にスタイル JSON を読み込んで保存すると、読み込んだスタイルがその場で消える。Web では取り込んだ PMTiles 本体も消える【安全に直せる】

- **手順**
  1. 登録済みのベクタ PMTiles 地図（styleURL が空、または https のスタイル）の地図編集を開き、スタイル欄のフォルダボタンで style.json を選ぶ。
     - `importStyleFile`（`useMaps.ts:595-614`）は、ネイティブでは `TILE_FOLDER/{id}/style.json` にコピーし、Web では `db.pmtiles.put({mapId, blob: undefined, boundary: '', style})` を await せずに呼ぶ。そのあと styleURL を `style://style.json`（Web は `style://`＋ファイル名）にする（`MapEdit.tsx:107-127`）。
  2. 保存を押す。`pressSaveMap`（`MapEdit.tsx:58-66`）は url に `pmtiles` を含み `params.targetMap.styleURL !== map.styleURL` なので、ネイティブは `FileSystem.deleteAsync(TILE_FOLDER/{id})`、Web は `db.pmtiles.delete(map.id)` を実行し、手順1で置いたスタイルを消す。
- **消えたあと**: ネイティブは `style://` を取得できずローカルにも無いので既定スタイルで描く（Android は `getDefaultStyleLayers` が既定スタイルを style.json として保存してしまう）。Web も `getStyleFromLocal` が空で既定スタイル。ネイティブではその地図のダウンロード済みタイルも消えるが、tileRegions は残る。
- **Web の取り込み PMTiles**（url=`pmtiles://blob:…`）: Dexie の `put` はレコードを丸ごと置き換えるので、**保存を押さなくても**手順1の時点で blob と boundary が消える。その画面の間は古い blob: URL で表示が続くが、再読み込みすると `updatePmtilesURL`（`useMaps.ts:621-633`）が blob を見つけられず空白になり、取り込み直すしかない。スタイル URL 欄を手で変えて保存しただけでも delete で消える。
- **起きない場合**: 新規作成した地図（`targetMap` が null）は削除分岐に入らないので動く。元の styleURL がすでに同じ `style://…` なら削除されない。つまり「既存地図で初めてスタイルを読み込む」通常の手順で必ず起きる。
- **影響**: スタイルの読み込みが成功表示のあと必ず無効になる。Web では端末内の唯一のコピーである PMTiles が失われる。
- **修正案**
  - Web の `importStyleFile` は `await db.pmtiles.update(mapId, {style})` で style だけを書き、レコードが無いときだけ put する。
  - `pressSaveMap` の削除は、新しい styleURL が `style://` で始まるときは行わない。削除する場合もタイル（z/x/y と `.pbf`）と boundary だけにし、style.json と Web の blob/style は残す。url が `blob:` の地図ではレコードを削除しない。
  - Web で `downloadStyle`（`useRepository.ts:1531`）も同じ put をしているので一緒に直す（M-M17・M-L9 を参照）。

### M-H6. 表示中の地図の URL が変わってもネイティブに反映されず、さらに旧 URL のキャッシュが無期限に使われる（署名の取得・ログアウト・URL 編集・プリセット適用・プロジェクト設定の反映で起きる）【判断が要る】

二つの原因が重なっている。

- **主因: ネイティブの setUrlTemplate が新しい URL を反映しない**
  - Android: `MapTileProvider.setUrlTemplate`（596-598）は外側の `urlTemplate` フィールドを書き換えるだけで、実際に URL を組み立てる `AIRMapUrlTileProvider`（48-66）を作り直さない。パッチ前（patch 3424 行付近）は作り直していたが、その処理が削られている。`MapPMTileProvider.setUrlTemplate`（1169-1171）も pmtiles を作り直さない。`MapDEMTileProvider.setUrlTemplate`（849-856）は reliefMode・gebcoStyle・terrarium だけ切り替え、取得先は旧 URL のまま、`demTileSize` も戻さない。
  - iOS: `AIRGoogleMapUrlTile.setUrlTemplate`（`AIRGoogleMapUrlTile.m:107-158`）と `AIRGoogleMapPMTile.setUrlTemplate`（102-123）は新しい `_tileLayer` を作るが地図に載せない。付け外しは `AIRGoogleMap.mm:272-282, 326-333` の挿入・削除時だけなので、旧レイヤが地図に残る。あとで非表示にしても外れるのは載っていない新レイヤで、旧レイヤは消せなくなる。
  - JS: `pages/Home.tsx:136` の UrlTile の key は iOS が `id-isOffline-redraw`、Android が `id` で URL を含まない（redraw を切り替える箇所もない）。PMTile の key（113-117）も Android は `id-styleURL`。地図編集は Home を再マウントしない。
  - これを必ず通る経路が署名の取得: 保護地図は初回は署名なしの URL でマウントされ、`useTileSignatures`（`useTileSignatures.ts:36-41, 46-72`）が署名を取得すると `withTileSignature` で URL の prop だけが変わる。
- **副因: URL を変えてもキャッシュが消えず、キャッシュが優先される**
  - `getTileImage`（Android `MapTileProvider.java:203-222`、iOS `AIRGoogleMapUrlTileOverlay.m:152-172`）は `TILE_FOLDER/{id}/z/x/y` を先に読み、期限の確認（checkForRefresh）はコメントアウトされている。キャッシュのキーは地図 ID だけ。
  - `MapEdit.tsx:58-66` がフォルダを消すのは url に `pmtiles` を含むときだけ。`applyMapPreset`（`useMapEdit.ts:100-115`）は `prev.id` を引き継ぐ。JSON の単体取り込み（`useMaps.ts:668-672`）とプロジェクト設定の反映（`useRepository.ts:1570-1595`）も同じ ID のまま URL を差し替える。tileRegions も残る。
  - 3D のテクスチャキャッシュも `layer.id` キー（`tileTextureLoader.ts:45-46`）。
- **手順の例**
  1. 署名付き配信の保護地図をプロジェクトから開く → Android は署名なし URL で 403 を受け続け、iOS は署名なしの旧レイヤが残るので、保護地図が出ない。出し直すか再起動するまで直らない。
  2. ログアウトで署名が消えても、両 OS とも署名付き URL のまま取得を続ける。
  3. 既存の「陰影起伏図」をプリセット「GEBCO海底地形図」に替えて保存する → Android は旧 URL の画像を新形式として読み（demTileSize も旧値で長さ不一致）、iOS は旧レイヤが表示され続ける。再起動後も、以前見た範囲は旧ソースのキャッシュを新形式として読み、色や等深線が崩れる。
  4. 地図 A（植生図2023）の URL を植生図2024 に替える、または管理者がプロジェクト設定で替える → 以前見た・ダウンロードした範囲は2023、それ以外は2024 のタイルが混ざる。オフラインではダウンロード範囲がすべて旧地図。メンバー間で見えている地図が食い違う。
- **影響**: 保護地図が初回に出ない。ログアウト後も他人の資格情報（署名）で取得を続ける。別の地図のタイルが同じレイヤに混ざり、年度や区分を取り違える恐れがある。iOS では非表示にできないレイヤが残る。
- **重大度について**: 3票中2票が high（主因は署名取得で必ず通る）、1票が medium。多数に従い high。
- **修正案**
  - Android: `MapTileProvider.setUrlTemplate` で `AIRMapUrlTileProvider` を作り直す。`MapPMTileProvider` は pmtiles・tileType・metadata・styleManager を作り直す。DEM は `demTileSize` を 0 に戻す。
  - iOS: `setUrlTemplate` で旧 `_tileLayer.map` を退避して nil にし、新レイヤに同じ map と zIndex を付ける。または JS 側で key に「実際に渡す URL（署名込み）」を含めて作り直させる（iOS はディスクキャッシュが残るのでダウンロードは無駄にならない）。
  - キャッシュ: 署名を除いた url・flipY・tileSize・styleURL のどれかが変わったら、地図の種類にかかわらず `TILE_FOLDER/{id}` のタイル（z/x/y と `.pbf`）、その地図の tileRegions、3D テクスチャの該当 ID を消す（地図編集・JSON 取り込み・プロジェクト設定の反映の3か所。`demSourceMigrationCore.migrateTileMaps` の処理を汎用化）。ダウンロード済みも消えるので、確認を出すかどうか判断が要る。
- 付随する iOS の setter の問題は M-L16。

### M-H7. Android の PMTiles は、作られたときのオフライン状態とヘッダー取得の結果で固定される。オンラインに戻っても読み込まず、ヘッダー取得に失敗すると保存済みタイルまで出ず、UI スレッドで通信を待つ【安全に直せる】

- **手順**
  1. 圏外でアプリを起動し（`effectiveOffline`=true、`containers/Home.tsx:612-622` で NetInfo に連動）、PMTiles 地図を表示する → 電波が戻っても未保存の範囲は読み込まれない。コンストラクタ（`MapPMTileProvider.java:114-155`）がオフラインなら pmtiles を作らず tileType を固定し、`setOfflineMode`（1209-1211）はフラグを書き換えるだけ。ラスタは `pmtiles == null` で null、ベクタは `pmtiles.getZxy` の NPE を catch して null（870）。iOS は key に isOffline があるので作り直されるが、Android の key は `id-styleURL`（`pages/Home.tsx:113-117`）なので作り直されない。保存済みの範囲は出る。
  2. オンライン判定のまま（電波1本、通信できない Wi-Fi、署名がまだ届かず 403 など）でヘッダー取得に失敗する → tileType が -1 のまま残り、`getTile` 先頭（159/163）の `if (tileType == -1 && !offlineMode) return null` で、ダウンロード済みの `.pbf` や描画済み PNG まで一切出ない。取り直す処理もない。iOS は getTile からヘッダーを取り直すので出る。
  3. 2 と同じ弱電波で、レイヤの表示・起動・オンライン/オフラインの切替により `addToMap` が走ると、コンストラクタ末尾の `join()`（158）で UI スレッドがヘッダー＋メタデータ（`FetchSource.java:49-50` は接続10秒・読み込み10秒）と style.json（`VectorTileStyleManager.downloadStyleJson` はタイムアウトなし、オフラインでも先にダウンロードを試みる）の取得を待つ。画面が固まり、ANR になりうる。
- **影響**: 現場で電波が出入りするたびに PMTiles 地図（特定植物群落など）が空のまま戻らない。ダウンロード済みなのに弱電波で出ない。レイヤを出し直すか再起動しないと直らない。
- **重大度について**: 3票中1票は medium（表示切替・再起動で復旧する）。多数に従い high。ANR は「起こりうる」にとどまる。
- **修正案**
  - 最小の修正は `pages/Home.tsx` の Android の key にも isOffline（と署名済み URL）を入れること。これで1は解消する。根本的には `setOfflineMode`・`setUrlTemplate` で pmtiles・tileType・metadata・styleManager を作り直す。
  - `tileType == -1` でも readTileImage・`.pbf` のキャッシュを先に読み、ヘッダーは getTile のスレッドで取り直す（iOS の `resolveTileTypeWithPMTiles` と同じ）。
  - コンストラクタの `join()` をやめ、初期化はバックグラウンドで行い、終わったら clearTileCache する。`downloadStyleJson` に接続・読み込みのタイムアウトを付け、offlineMode ではダウンロードを試みない。

---

## medium

| # | 内容 | 分類 | 箇所 | 修正案 |
|---|---|---|---|---|
| M-M1 | 一部のタイルが取れなくても領域を「完了」として記録し、再開の対象から外れる。PMTiles（ベクタ・ラスタ）は `getZxy` の例外を console.log するだけで数えず（単一地図側は `//errorCount++` がコメントアウト）、`writeAsStringAsync` も await しない（pbf も同じ）。複数地図版はエラー率80%超で警告するだけ、単一地図版は20%超で警告するが、どちらもエラーの有無に関係なく `toCompletedRegion` で status を外す。`resumeDownloadTiles` は status 付きの領域しか拾わず、保存済みを飛ばすのも再開時だけ。途中で圏外になると「完了」と保存範囲の枠が出るのに、現地で一部（PMTiles は全部もありうる）が欠け、取り直すには最初から全部ダウンロードするしかない。`demTileDownload.ts:38-42` の「一時エラーは再開時に再試行」というコメントとも食い違う | 判断 | `useTiles.ts:313-342, 355-358, 422-432, 635-662, 750-757, 767`、`demTileDownload.ts:38-42` | PMTiles の例外（resp===undefined は数えない）、通信例外、5xx、書き込み失敗を errorCount に数え、書き込みは await する。404 以外の失敗が1件でもあれば領域を 'paused' のまま残し、「n枚取得できませんでした。再開すると残りを取得します」と出す。単一地図版も同じ規則にそろえる（今は404も数えている。M-L3） |
| M-M2 | flipY（TMS）の地図のダウンロードが反転していない y で取得・保存しており、オフラインで出ない（プリセット「クマタカ生息適地」が該当。URL が .png なので isVector:true でも png 経路に入る）。JS は TMS サーバーへ南北反対側の行を要求し、日本付近ではほぼ404で「完了」になる。取れた分は反転しない y のパスに保存。表示側は、Android と 3D は「キャッシュは XYZ の y、URL だけ反転」、iOS は getTile の先頭で y を反転して読み書きするので「キャッシュも TMS の y」。iOS はダウンロード分を一度も読まず、Android・3D は別の行のタイルを読む。PDF（d7f48114/decd7660）は対応済みで、ダウンロードだけ未対応。Android は flipY を切り替えると同じパスに向きの違うタイルが残る | 判断 | `useTiles.ts:367-376, 684-690`、`pdfExport/tiles.ts:76-86`、patch 2797-2800・3620-3631（Android）、14980-14990（iOS `AIRGoogleMapUrlTileOverlay.m:147-152`）、`tileTextureLoader.ts:36-43`、`mapPresets.json:47-57` | キャッシュのパス規約を XYZ の y に統一する。JS のダウンロードは URL の `{y}` にだけ `flipY ? 2^z-1-y : y` を入れる（`buildTileUrl` と共通化）。iOS は反転を URL 生成時だけに移し、read/write/delete には反転前の y を渡す。iOS の既存キャッシュは flipY の地図だけ消す。flipY を変えたらその地図のキャッシュを消す |
| M-M3 | Android の地図タイルは取得したデータが画像か確かめず、上書きも直接書くので、壊れたタイルが恒久的に残る。拡大表示ではデコード失敗で NPE になりうる。`fetchTile` は 200 なら空でも HTML でも返し、`writeTileImage` は一時ファイルを使わず FileOutputStream で直接書き（失敗しても途中のファイルが残る）、`readTileImage` は中身を確かめない。キャッシュを先に読むので取り直さない。`drawOverZoomTile`・`scaleLowerZoomTile` は `BitmapFactory.decodeByteArray` の null を確かめずに `canvas.drawBitmap` と `recycle` を呼ぶ（`drawDoubleSizeTile` などは確かめている）。`getTile` に try/catch はない。オフラインで maximumNativeZ を超えるズーム（overzoomThreshold>16 の地図の z17 以上）やオフライン時の低ズーム代替で、0バイトや非画像の親タイルに当たると落ちる恐れがある。確実に起きる例は容量不足（ENOSPC）での0バイト・途中ファイル、200 で空本文を返すサーバー。キャプティブポータルの HTML は http:// のタイル URL に限る（組み込み地図は https なので TLS エラーになりエラー数に入る）。iOS は `isLikelyImageData` で確かめるので起きない | 安全 | `MapTileProvider.java:141-192, 362-401, 455-509, 511-552, 554-581`、`MapPMTileProvider.java:282-318`、iOS `AIRGoogleMapUrlTileOverlay.m:99-121, 153-166, 287`（比較）、`useTiles.ts:691-724` | まず `drawOverZoomTile`・`scaleLowerZoomTile` で sourceImage==null なら null を返す（最小の変更でクラッシュを防ぐ）。`fetchTile`・`readTileImage` で長さ>0 とマジックバイト（PNG/JPEG/WebP/GIF）を確かめ、不正なら削除して null。`writeTileImage` は一時ファイルに書いて rename。JS の png/hillshade ダウンロードでも content-type か先頭バイトを確かめる |
| M-M4 | プロジェクトを開くとき、共有スタイル（style://）は最初の1地図の分しか取り込まれない。`downloadStyle` の for ループの try 内 `return { isOK: true }`（catch 側も return）で関数を抜ける。Web の `uploadTileMaps` は style:// の地図ごとにスタイルを上げるので、スタイル付きのベクタ地図が2つ以上あると、2つ目以降はメンバー全員の画面で既定スタイルになる。呼び出し側は戻り値を見ないのでエラーも出ない。Web のメンバーが設定を保存し直すと、2つ目以降は db にスタイルが無いので `uploadStyle` が失敗してアラートが出る。どの地図が先頭かは並び順で変わる | 安全 | `useRepository.ts:1518-1545, 1231-1238, 1574`、`storage.ts:495-514` | ループ内の return をやめ、成功は次へ、失敗は地図名を集めて continue し、最後にまとめて返す。ネイティブでは一時ファイル（temp_style.json と decUri）も削除する |
| M-M5 | 同じ範囲を新規にダウンロードし直したとき、一時的な HTTP エラーで保存済みの正常なタイルが消える。png/hillshade は保存先へ直接 `downloadAsync` し、200 以外なら `deleteAsync` する。expo-file-system legacy は応答コードに関係なく保存先を消してから本文を書く（Android `FileSystemLegacyModule.kt:612-620`、iOS `EXSessionDownloadTaskDelegate.m:33, 42`）ので、503・429・署名切れの403 で以前のタイルが失われる。失敗率が低ければ警告も出ず、領域は完了扱い。pbf（fetch で ok を確かめてから書く）と DEM は対象外 | 安全 | `useTiles.ts:376-387, 399-409, 593-595, 691-703, 712-724, 750-752` | `cacheDirectory` の一時パスへ `downloadAsync` し、200 のときだけ `moveAsync` で保存先へ移す（移す前に既存を削除）。それ以外は一時ファイルだけ消す |
| M-M6 | 閲覧したタイルがダウンロードと同じ `Documents/tiles` に期限も上限もなく溜まり、iOS では iCloud・端末バックアップの対象になる。`TILE_FOLDER` は `documentDirectory/tiles`、全地図に `tileCachePath` を渡し、`tileCacheMaxAge` はコメントアウト。ネイティブはオンラインで取得したタイルを毎回 `writeTileImage` し、更新確認も無効。`NSURLIsExcludedFromBackupKey` を付ける箇所はリポジトリにない（Android は `allowBackup=false` で対象外）。再取得できるデータでバックアップ容量を圧迫し、Apple の iOS Data Storage Guidelines から外れる。一度見た場所は提供元が更新しても古いまま。閲覧分とダウンロード分の区別がなく、全部まとめてしか消せない。閲覧キャッシュを恒久保存してオフライン時の代替に使うのは意図した設計（7ff3c360）でもある | 判断 | `AppConstants.tsx:81`、`pages/Home.tsx:129-130, 157`、patch 2993-3010（Android）、15002-15008（iOS） | まず起動時に tiles ディレクトリへ `NSURLIsExcludedFromBackupKey` を付ける（最小の変更）。閲覧キャッシュの分離（cacheDirectory へ移す・上限を設ける）や更新確認の有効化は、オフライン時の代替表示に影響するので方針を決めてから。cacheDirectory へ移すと OS に消されうる点に注意 |
| M-M7 | 3D のテクスチャキャッシュが、一時的な失敗も「タイルなし」として恒久記録し、アプリから消せない。URL タイルは応答が200以外なら403・429・5xx も含めて0バイトの印を書き、以後は通信しない（`demTileLoader.fetchDemTileFile` は 5xx を一時失敗として扱っているのに、3D 側だけ外れている）。Android の `PMTileRasterizerModule` は getTile が null（ヘッダー未取得・通信失敗・オフラインの未保存範囲）でも `resolve(0)` するので、JS が0バイトの印を書く。`resolvePmtilesTexture` は TILE_FOLDER より先に印を見るので、後からダウンロードしても3Dでは欠けたまま。印のキーは地図 ID だけなので URL 変更後も残る。`clearTerrainTextureCache`、demSource/demTileLoader の `clearDemTileDiskCache`・`clearDemTileMemoryCache` はどこからも呼ばれず、設定のキャッシュクリアも地図削除も `terrain3d_tex`・`dem_mapterhorn`・`dem_tiles` を消さない（容量も戻らない）。残るのは OS が cacheDirectory を消すまで | 安全 | `tileTextureLoader.ts:50-80, 104-118, 169-173`、`PMTileRasterizerModule.kt:67-71`、`demSource.ts:20, 129-132`、`demTileLoader.ts:14, 96-99`、`useMaps.ts:193-204` | 0バイトの印は URL の404と、オンラインでアーカイブに本当にタイルがない場合だけにする。403・429・5xx・通信失敗は throw して再試行。Android の rasterizer は失敗時に reject。オフラインでは印を書かない。`clearTileCache` から上記のクリア関数を呼び、地図削除・URL 変更時は該当 ID の印を消す |
| M-M8 | ベクタ PMTiles の描画済み PNG キャッシュがスタイル更新後も残り、新旧スタイルが混在する。ネイティブは描いた PNG を `tiles/<id>/z/x/y` に保存し、以後これを先に返す。スタイル更新時刻と比べる判定（Android `checkForRefresh` 1817、iOS `doesFileNeedRefresh` 14251）は実装済みだが、呼び出し（1700・2354・13368）がコメントアウト。`saveStyle` は内容が変わると lastUpdatedTime を進めるが誰も読まない。同じ地図にスタイルを読み込み直す（styleURL の文字列が `style://style.json` のままなので MapEdit の削除も動かない）、https のスタイルをサーバー側で更新する、ダウンロードで style.json が更新される、のいずれでも、一度見た範囲は旧スタイルのまま残る。直すにはフォルダごと消すしかなく、取り込んだスタイルやダウンロード分も失う。メモリ（vector-style-expression-evaluator）にも「E2E はキャッシュ削除必須」と観察だけがある | 安全 | patch 1680-1713, 1817-1835, 7270-7330（Android）、13363-13405, 14251-14280（iOS）、`useTiles.ts:549-566`、`useMaps.ts:603-606`、`MapEdit.tsx:58-66` | style.json を書き換えたとき（importStyleFile、ダウンロード時の更新、ネイティブの saveStyle で差分があったとき）に、その地図の拡張子なしの z/x/y PNG だけを消す（`.pbf`・style.json・metadata.json・boundary.json は残す）。またはスタイル更新時刻の比較を描画済み PNG だけに有効にする。その場合、iOS の lastUpdatedTime の単位（秒とミリ秒が混在）をそろえ、0 のとき毎回再描画しないようにする |
| M-M9 | 地図リストの CSV が引用符付きセルを扱えず、1行でもカンマを含むと一覧全体が「データ形式が不正」になる。`csvToJsonArray` は `row.split(',')` で分けるだけ。Google スプレッドシートの output=csv（`isValidMapListURL` はこれしか受け付けない）はカンマ入りセルを `"…"` で囲むので、出典に「国土地理院, 環境省」が1行でもあると列がずれ、transparency が文字列になる。`isMapListArray` は every で全件を検査するので一覧ごと拒否。名前が「2024」のような数字だけのセルも Number に変換されて拒否。改行入りセルは行が割れ、引用符だけのセルは `"` が残る。response.ok も確かめない（jest で再現確認済み）。既定のリストには今カンマ入りセルがないので、起きるのは管理者が出典などにカンマを入れたとき。登録済みの地図やタイルには影響しない | 安全 | `utils/Map.ts:25-62, 64-104, 123-131`、`useMaps.ts:141-174` | 既存の RFC4180 パーサ `src/utils/csvParse.ts` を使う。型変換は列ごとにし、name・url・attribution・styleURL・groupId は文字列のまま。不正な行だけ除外して件数を知らせる。response.ok を確かめる |
| M-M10 | Web の PMTiles 取り込みでファイル全体を data: URL に変換するため、大きなファイルで失敗し、失敗が表示されないか読み込み中のまま固まる。`pressImportMaps` は拡張子に関係なく blob: を `blobUriToDataUri`（FileReader.readAsDataURL）に通す（必要なのは PDF 経路だけ）。V8 の文字列上限（約5.4億文字）から、約400MB を超える PMTiles では失敗する（境界は計算値で実測していない）。この await は try/catch の外で `setIsLoading(true)` より前なので、未処理の拒否になり何も表示されない。上限未満でも元の Blob・base64 文字列（UTF-16）・作り直した Blob が同時にメモリに載る。`db.pmtiles.put` が QuotaExceededError で失敗すると、setTimeout 内の `setIsLoading(false)` まで届かず読み込み中のまま操作できなくなる | 安全 | `containers/Maps.tsx:22-31, 187-215`、`useMaps.ts:847-882, 907-913` | data: への変換は `ext === 'pdf'` のときだけにし、PMTiles は blob: URL のまま渡す（`importPmtilesFile` は fetch(uri).blob() なのでそのまま動く）。変換と importMapFile を try/catch/finally で包み、`setIsLoading(false)` と失敗メッセージを必ず出す。put 失敗時は `URL.revokeObjectURL` して `{isOK:false}` を返す |
| M-M11 | 複数ページの PDF 地図の扱いがそろっていない。`importPdfFile` は totalPages>1 のとき受け取った id を無視して新しい ULID を振り、url=`file://${name}` で追加する。元のエントリは置き換えない。(1) 地図リストから複数ページの PDF をダウンロードすると name が地図名なので url が `file://現地植生図`（.pdf なし）になる。`.pdf` 末尾で PDF を判定する箇所（Home・uploadTileMaps・MapTable・HomeTileMapSelector）から外れ、オフラインで基準ズームが17以上の高解像度 PDF は maximumNativeZ=16 に切り詰められ、押すたびに同じページ地図が重複追加される。(2) Web で取り込んだ複数ページの PDF は全ページの geotiff に同じ PDF 全体を入れるので、設定保存で PDF 全体がページ数分 Storage に上がる。受け手が page01 を押すと `X.pdf_page01_page01〜03` が追加され、押した項目も残る（全部押すとページ数×ページ数）。その新しい地図の url は `.pdf` で終わらないので、受け手の管理者が保存すると端末内パスのまま共有設定に載る。共有されない・重複するのは Web で保存した場合（uploadPDF は IndexedDB を読む） | 判断 | `useMaps.ts:711-790`（特に 713, 742, 765-786）、`containers/Maps.tsx:103-131`、`pages/Home.tsx:138-152`、`useRepository.ts:1223-1229`、`storage.ts:162-175`、`HomeTileMapSelector.tsx:29-32` | PDF かどうかは url の拡張子でなく `attribution==='PDF'` か専用フラグで判定する。複数ページの地図には元 PDF の ID とページ番号を持たせ、再ダウンロードでは前回のページ群（とタイルフォルダ）を置き換える。共有は PDF を1部だけ上げてページ番号で開くか、ページ単位の blob を上げる |
| M-M12 | PDF 地図の再ダウンロード（同じ ID の置き換え）で旧タイルを消さないため、改訂版に入れ替わらない・旧版が混ざる。`generateTilesFromPDF` は `tiles/<id>` を消さずに新しい範囲だけ書く。切り出し後の `moveFile` は await も return もされない。iOS の `RNFS.moveFile` は NSFileManager `moveItemAtPath`（`RNFSManager.m:419`）で、移動先にファイルがあると失敗する。そのため iOS では範囲も縮尺も同じまま内容を改訂した PDF を再ダウンロードしても、重なるタイルはすべて旧版のまま（失敗は無言、一時ファイルもキャッシュに残る）。Android は renameTo で上書きされるが、範囲外と旧版の高ズームのタイルが残る。Android の UrlTile の key は id だけで redraw を含まないので表示も更新されにくい。完了の dispatch が最後の移動より先に走ることもある | 安全 | `useMaps.ts:713, 746-801`、`PDF.ts:186-230`（特に 212-214）、`containers/Maps.tsx:128-131`、`pages/Home.tsx:137-141` | 置き換え時は生成前に `deleteAsync(TILE_FOLDER/{id}, {idempotent:true})`（boundary.json はあとで書き直す。tileRegions は対象外）。`.then` 内は unlink してから `return moveFile(...)` にして完了を待ち、失敗時は一時ファイルを消す。Android の key にも redraw を含める |
| M-M13 | Android の PMTiles は maximumNativeZ から1段までしか拡大表示しないので、それより細かいズームで空白になる。`getTile` は `zoom > maximumNativeZ && zoom <= maximumNativeZ + 1` のときだけ `scaleLowerZoomTile` を呼ぶ。それより上は `getTileImage(zoom)` に進み、オンラインでは `getZxy` が header.maxZoom 超で empty、オフラインではベクタが offlineMode で早期 null、ラスタは pmtiles==null で null。オフラインではベクタ z20 以上・ラスタ z18 以上が必ず空白、オンラインでもアーカイブの最大ズームが overzoomThreshold と同じなら threshold+2 以上で空白（特定植物群落の実際の最大ズームは未確認）。iOS は何段でも拡大する（594141c0 で制限を外した）。同じパッチの Android `MapTileProvider` も段数を制限していない | 安全 | patch 1669（Android getTile）、1779（scaleLowerZoomTile）、4533（PMTiles.getZxyAttempt）、14434（iOS drawOverZoomTile）、`pmtileProps.ts` | 条件を `zoom > maximumNativeZ` にし、`scaleLowerZoomTile(x, y, zoom, maximumNativeZ)` で何段でも拡大する（iOS と同じ）。段数が深いと subTileSize が 0 になるので下限を設けるか maximumZ で止める。ベクタは親タイルの pbf を読んで描き直す方法もある |
| M-M14 | 陰影起伏・段彩の標高タイルに、地図タイル用の「低ズームを拡大した代替タイル」が混入する。Android の `MapDEMTileProvider.loadElevationUncached`（301）は `super.getTile` を呼ぶので、オフラインや一時失敗（HEAD の3秒タイムアウト、5xx）のとき `MapTileProvider` の代替処理（176-191）に入る。`drawOverZoomTile` は `subTileSize = this.tileSize(256)/zoomFactor`（386）なので、512px の Mapterhorn タイルから位置のずれた区画を切り出し、256px の PNG を「成功」として返す。null でないので DEM 自前の「粗いズームへ降りる」処理（257 の continue）に進まず、中央タイルは長さ不一致（401）で NaN になり透明なタイルが shadingCache に残る。プロバイダを作った直後の最初の1枚がこれだと `demTileSize`（330）が256に固定され、以後の正しい512px タイルがすべて捨てられてレイヤ全体が出なくなる（Android の key は id だけなので再起動まで直らない）。主に起きるのはオフラインでダウンロード範囲の縁や外を見たとき、オンラインでタイムアウトしたとき（Mapterhorn は CDN 未キャッシュだと1.2〜3.5秒）。iOS の GEBCO（`AIRGoogleMapDEMTileOverlay.m:309` の `[super tileForX]`）も代替処理を通り、補間で RGB の標高値が壊れ、scale=0 で画面倍率の寸法になる（iOS は実際の描画を未確認） | 安全 | `MapDEMTileProvider.java:250-334, 366-417`、`MapTileProvider.java:175-192, 362-401`、iOS `AIRGoogleMapDEMTileOverlay.m:309-345`、`AIRGoogleMapUrlTileOverlay.m:69-87, 379-398` | DEM プロバイダからは拡大代替を通らない取得口を呼ぶ（Android は `getTileImage(x, y, zoom, false, transient)`、iOS の GEBCO は `getTile:transient:`）。粗いズームへ降りるのは DEM 自身のループに任せる。`demTileSize` は最初の1枚で固定せず中央タイルごとの実寸で扱う（terrarium は512以外を捨てる）。一時失敗では elevationCache・shadingCache に入れず null を返す |
| M-M15 | iOS の陰影起伏・GEBCO 段彩（DEM オーバーレイ）は、通信の一時失敗でも `kGMSTileLayerNoTile` を返し、そのタイルが空白で確定する。`elevationForX`（280-281）は getTile の `transient` を受け取るが捨てる。GSI 経路（309-311）は `[super tileForX]` の nil（一時失敗）と NoTile（確定）を区別しない。`tileForX` は全段で取れないと 848 で無条件に NoTile。GMS は NoTile を確定キャッシュし、clearTileCache まで再要求しない（`setOfflineMode` はオフラインにするときしか clearTileCache しない）。UrlTile（2316f994）と PMTiles（959a48d1）で直した問題が DEM 側に残っている。粗い段だけ取れた場合は低解像度のまま `_shadingCache` に固定される。1タイルの応答が最大約36秒かかりうる | 安全 | iOS `AIRGoogleMapDEMTileOverlay.m:278-311, 785-848`（patch 11809 行〜、12095・12656-12662）、比較 `AIRGoogleMapUrlTileOverlay.m:96` | `elevationForX` に `BOOL *transientOut` を足し、terrarium は getTile の transient、GSI は super が nil を返したら一時失敗として返す。tileForX はどこかの段で一時失敗があり画像が得られなければ nil、全段が確定失敗のときだけ NoTile。一時失敗の後に粗い段で描いた画像は `_shadingCache` に入れない。iOS のリビルドが必要 |
| M-M16 | Web の陰影・段彩プロトコルが、取得中の標高タイルを最初の要求の AbortSignal に紐づけて共有する。`loadElevationTile` は inflight の promise をそのまま返し（106-107）、共有の fetch には最初の要求者の signal を渡す（110）。maplibre は画面外に出たタイルの要求を中止する（`tile_manager.ts` の `_removeTile`）ので、中止で null になった結果を、中止されていない兄弟タイルも受け取る。terrarium は4枚の地図タイルが中央の標高タイルを共有し、3×3 の袖も重なるので、パン中に画面端で起きやすい。中央が null なら1段粗いズームから引き伸ばし、袖が null なら縁が欠けた絵を返し、maplibre がそれをタイルとして保持する。中止の null 自体は LRU に入らないが、一時的な通信エラーや 5xx/429 の null は LRU（64枚）に入る。`gebcoDemLayers.web.ts` も ok でない応答（5xx を含む）を null としてキャッシュする（通信例外はキャッシュしない） | 安全 | `shadingTileProtocol.web.ts:97-145, 186-192`、`gebcoDemLayers.web.ts:90-104`、`reliefTileCompose.ts:19-24` | 共有の fetch は要求ごとの signal から切り離す（参照カウント付きの共有 AbortController にして全員が中止したときだけ中止、または signal なしで fetch し各自は Promise.race で自分の signal を見る）。中止された task は待っている側が再取得できるようにする。キャッシュは成功と404だけにし、通信エラー・5xx・429 はキャッシュしない（gebco の loadRawTile も同じ） |
| M-M17 | Web で取り込んだ PMTiles（url=`pmtiles://blob:…`）にスタイルを付けてプロジェクト設定を保存すると、開けない blob: URL の地図が共有設定に載る。`uploadTileMaps` の `Platform.OS==='web' && styleURL.startsWith('style://')` の分岐（1231）が、「ローカルの PMTiles はアップロードしない」 `url.includes('blob:')` のスキップ（1239）より先に評価されるため。`uploadStyle` が成功しても失敗しても tileMap が push される。他のメンバーの一覧に開けない地図が載る。訂正: 管理者側の PMTiles 本体は、アップロードや開き直しより前に、スタイルを付けた時点の `importStyleFile` の put で消えている（M-H5）。`downloadStyle`（1531）の put も同じ上書きをする | 安全 | `useRepository.ts:1219-1248, 1531-1532`、`useMaps.ts:600` | `uploadTileMaps` で `url.includes('blob:')` の判定を style:// の分岐より前に置く。`importStyleFile` と `downloadStyle`（Web）は put をやめて `db.pmtiles.update(mapId, {style})`（無ければ put） |
| M-M18 | URL で登録した PMTiles の上限ズームがヘッダーに合わず、Web ではアーカイブの最大ズームを超えるとベクタ地物が消え、PDF が空白になる。`pressSaveMap` はヘッダーから `finalMap.minimumZ/maximumZ` を計算するが、`saveMapToState()`（useMapEdit の saveMap）は引数を取らず state の map を保存するので、finalMap は捨てられる（00abe43d 以来）。overzoomThreshold はもともとヘッダーから設定しない（新規の既定は18。ファイル取り込みの経路は header.maxZoom にしている）。Web の `getPmtilesSource` は maxzoom: overzoomThreshold を明示し、maplibre は明示値を TileJSON より優先する。pmtiles の Protocol はアーカイブにないタイルに空の Uint8Array を返すので、ベクタは「読み込み済み・地物なし」になり親タイルにも戻らない。ラスタは画面では親で補われるが、Web PDF は dz を overzoomThreshold 基準で計算するので getZxy が undefined になり抜ける。最大ズームが18未満（例: z15）の PMTiles では既定のまま普通に起きる。固定ズームのスライダーを手で合わせれば回避できる | 安全 | `MapEdit.tsx:55-89`、`useMapEdit.ts:23, 108-116`、`vectorTileStyle.ts:199-208`、`pdfExport/tiles.ts:190-191`、`webPmtiles.ts:51`、`useMaps.ts:891-900`、`node_modules/pmtiles/adapters.ts:220-232` | `saveMap` が上書き値を受け取れるようにし、ヘッダーが取れたら `overzoomThreshold = min(現在値, header.maxZoom)`、`maximumZ = header.maxZoom` で保存する（finalMap の minimumZ/maximumZ を渡すだけでは直らない）。`getPmtilesSource` の maxzoom も `min(overzoomThreshold, maximumZ)` にして保存済みの地図も救う |
| M-M19 | PDF 出力で、署名付き配信の XYZ ラスタ地図に署名が付かず、その地図が載らない。`usePDF` は Redux の生の tileMaps を渡し、`tileSignatures` を使うのは PMTiles の経路だけ。`buildTileUrl` は `{z}/{x}/{y}` を置き換えるだけで、Web（`PDF.web.ts:40-42`）もネイティブ（`PDF.ts:92`）も署名なしの URL で取る。配信側は署名なしに403を返す（`server/survey-tile-gateway/README.md:164`）。Web は読み込めなかった画像を取り除き、ネイティブは 200 以外を飛ばす（保存済みタイルは先に使われるので、抜けるのは未保存部分）。画面表示（`Home.tsx:140`、`Home.web.tsx:795`）は署名を付けているので画面と PDF が食い違う | 安全 | `PDF.web.ts:40-42`、`PDF.ts:55-56, 92`、`pdfExport/tiles.ts:79-86`、`usePDF.ts:97, 241` | `buildTileUrl({ ...map, url: withTileSignature(map.url, options.tileSignatures ?? {}) }, z, x, y)` とするか、`buildTileUrl` に signatures 引数を足す。ローカルのタイルパスは map.id 基準なので影響しない |
| M-M20 | 新規プロジェクトの mapType が `'none'` なのに、地図一覧では標準地図が表示中。プロジェクトを閉じても mapType が戻らない。`uploadDefaultProjectSettings` は `tileMaps: tileMapsInitialState`（standard は visible:true）と `mapType: 'none'` を一緒に保存し、開く側（1594-1595）はそのまま取り込む。tileMaps から mapType を導き直す処理はなく、変わるのは表示の切替時（`useMaps.ts:223-235`）だけ。英語環境で作ったプロジェクトは tileMaps が BASE のみなので、スマホで開いた直後の背景が白紙になる（日本語環境は不透明な地理院地図が覆うので、一覧と実際の食い違いにとどまる）。管理者がそのまま保存しても `'none'` が再保存される。`clearProject` は tileMaps を初期状態（standard 表示）に戻すが mapType は残すので、衛星写真で閉じると一覧は標準地図なのに衛星写真が出る。Web は影響しない | 安全 | `useRepository.ts:1422-1440, 1594-1595`、`useProject.ts:96-106`、`pages/Home.tsx:597`、`modules/tileMaps.ts:6-14`、`constants/Maps.tsx:41-60` | tileMaps の standard/hybrid の visible から mapType を決める関数を作り（standard→'standard'、hybrid→'hybrid'、どちらも非表示→'none'）、`uploadDefaultProjectSettings`・`downloadProjectSettings`・`clearProject` で使う。`useEcorismapFile.ts:416` も確認する |
| M-M21 | Web の初期状態（日本語）では、不透明な地理院地図の下で MapTiler topo-v2 を常に取得して無料枠を消費している。日本語の初期 tileMaps は `[...JP, ...BASE]` で、std（transparency 0）と standard（topo-v2）の両方が visible:true。`Home.web.tsx` は visible な standard に topo-v2 のソースとレイヤ（opacity 1）を必ず追加する。maplibre は覆われた下のレイヤのタイル取得を省かないので、国内では画面に出ない topo-v2 のリクエストがパン・ズームのたびに出る。記録上、MapTiler 使用量の99.4%は Web のベースマップで、ピーク月は無料枠の9割超、先期は上限超過（上限を超えると翌月まで停止）。ただし std の読み込み中や std に無い海外の高ズームでは topo-v2 が実際に見えている。保存済みの tileMaps（既存ユーザー・共有プロジェクト）では初期値を変えても効かない。削減量はキーが1本なので定量できない | 判断 | `constants/Maps.tsx:8-37, 53-71`、`modules/tileMaps.ts:6-11`、`Home.web.tsx:445-453, 718-722, 818-832` | 方針を決める必要がある（海外での背景が変わる）。案は、std が上に表示中で不透明かつ地図中心が国内のとき standard レイヤを visibility:none にする動的な切替（bounds は包含範囲しか指定できないので「日本を除く」は書けない）。または日本語の初期状態で standard を非表示にする（新規分にしか効かない） |

---

## low

| # | 内容 | 分類 | 箇所 | 修正案 |
|---|---|---|---|---|
| M-L1 | 停止・バックグラウンドの中断フラグが次のダウンロードに持ち越される。`pause.current`/`pauseReason.current` を戻すのは `handlePause` だけで、開始時・完了時に戻さない。最後のバッチ（10枚以内）を待っている間に停止を押すかバックグラウンドへ回すと、そのまま「完了」になりフラグが残る（停止したのに「完了」と出る食い違いもある）。次に始めると最初のタイルで、user なら押していない停止確認、background なら即 paused と再開確認が出る。続行・再開を選べば回復し、データは失われない | 安全 | `useTiles.ts:59-60, 131-134, 154-203, 416-420, 452-454, 744-748, 806-812` | `downloadTiles`・`downloadMultipleTiles` の開始時と完了時に `pause.current=false; pauseReason.current=null`。最後の Promise.all の後でもフラグを見る |
| M-L2 | 中断中・ダウンロード中の領域も、保存済みと同じオレンジ枠で描かれる。`savedArea` は tileMapId で絞るだけで status を見ない。一時停止や「後で」を選んだ後の画面で、一部しか保存されていない範囲を保存済みと誤認する（次の起動で再開確認は出る） | 安全 | `useTiles.ts:103-123`、`containers/Home.tsx:194-201`、`HomeDownloadArea.tsx:29-47` | `status === undefined` の領域だけをオレンジで描き、未完了は点線・別の色で描き分ける |
| M-L3 | 単一地図のダウンロードは404もエラーに数え、範囲外の多い地図（現存植生図2024 の配信範囲外、Mapterhorn 陰影の海、地理院写真の海）で失敗と通知する。地図一覧の行から入る（mode:'downloadMap'、地図選択 UI はコメントアウト）と必ず単一経路を通り、失敗率20%超でエラー。「すべての地図」経路（c6f0b5f0 で修正済み）は404を数えないので、同じ範囲でも入口で結果が変わる。表示だけの問題 | 安全 | `useTiles.ts:376-386, 399-409, 428-431`（比較 691-720）、`containers/Home.tsx:1910-1915` | png/hillshade で `status !== 404` のときだけ errorCount++。または単一経路を `downloadMultipleTiles([tileMap])` に寄せる |
| M-L4 | 陰影起伏（Mapterhorn）と標高タイル疑似地図が、同じ Mapterhorn のタイルを二重に取得・保存する。陰影は z0〜14 を `TILE_FOLDER/{陰影地図id}/`（拡張子なし）、標高は z7〜13 を `TILE_FOLDER/dem_mapterhorn/`（.webp）に保存し、読み取り側は互いのフォルダを見ない。「すべての地図」では標高タイルが必ず含まれる。重複は範囲内の z7〜13 で、陰影側の約1/4。1枚は平均約35KB（実測） | 判断 | `tileDownloadHelpers.ts:30-41`、`mapPresets.json:107-118`、`useTiles.ts:704-728`、`demTileDownload.ts:48-66`、`demSource.ts:83-109`、`containers/Home.tsx:1876-1883` | 保存時に相手側に同じ z/x/y があれば copyAsync で済ませる（拡張子と404の0バイト印に注意）。または読み取り側が相手のフォルダも探す。その場合、片方の地図を消したとき他方のオフライン表示が欠けないよう削除処理と整合させる |
| M-L5 | タイル一覧が東・南へ1列ずつ余分に取り、低ズームでは存在しない番号も要求する。`tilesForZoom` は `maxTileX + 1`・`maxTileY + 1` まで回し、0〜2^z−1 に収めない。見積もりも `+2` で同じ数え方（コメントで承知済み）。小さい範囲の高ズームでは枚数が数十%以上増え、z0 では (1,0)(0,1)(1,1) を要求する。表示は壊れない（3票中1票は意図した仕様として反証） | 判断 | `Tile.ts:38-57`、`tileDownloadHelpers.ts:49-63, 92-98` | ループを maxTileX/maxTileY までにし範囲を収める。`countTilesForRegion` の `+2` を `+1` に。開始・再開・見積もりは同じ関数経由なので同時に変える |
| M-L6 | クエリ付きの pbf URL（`…/{y}.pbf?key=…`）は、iOS ではダウンロード時に png 扱いされ、オフラインで読めない。`getExt` は最後の `.` 以降を返すので `pbf?key=…` になり `'png'` 判定、拡張子なしの `{y}` に生バイトで保存し style.json も取らない。iOS は `.pbf` を含めば tileType=0 でオンラインは表示し、オフラインは `{y}.pbf`（base64）を探す。Android はネイティブが `endsWith(".pbf")` で判定するので、この URL はオンラインでも表示できない（別の不具合） | 安全 | `tileDownloadHelpers.ts:20-29`、`General.ts:31-35`、`pages/Home.tsx:110-112`、patch 1619（Android）、13139・14001-14016（iOS） | `getTileType` はクエリとフラグメントを除いたパスで判定する。Android パッチの判定もクエリを除いて行う |
| M-L7 | iOS で、同じ URL・同じスタイルの PMTiles 地図を2つ表示すると React の key が重複する。iOS の key は `${url}-${isOffline}-${styleURL}` で id を含まない。地図リストやプリセットから同じ地図を2回追加でき、URL の重複チェックはない。並べ替えや追加・削除で要素を取り違える恐れがある（3票中1票は、Fabric では実害は警告と再マウントだけとして反証）。ローカル PMTiles は URL に mapId を含むので対象外 | 安全 | `pages/Home.tsx:113-117`、`containers/MapList.tsx:16-18`、`useMaps.ts:569-585` | key に id を足す: `${tileMap.id}-${tileMap.url}-${isOffline}-${tileMap.styleURL}` |
| M-L8 | 地図一覧を丸ごと置き換える経路（地図設定 JSON の一覧取り込み、プロジェクトの開閉）で、外れた地図の `TILE_FOLDER/{id}` と tileRegions が残り、全体のキャッシュクリア以外では消せない。起動時に孤立フォルダを掃除する処理もない。表示やデータは壊れない。プロジェクトの開閉で外れる分は、同じプロジェクトを開き直せば再利用される | 判断 | `useMaps.ts:651-659`、`useRepository.ts:1594`、`useProject.ts:106`、`useMaps.ts:176-204` | JSON 一覧の取り込みは、新しい一覧に無い ID の tiles/<id> と tileRegions を確認のうえ消す（dem_mapterhorn は除外）。開閉は自動で消さず、設定画面に「一覧に無い地図のデータ」を一覧・削除する操作を足す |
| M-L9 | Web で端末内スタイル付きの PMTiles の地図名をタップすると、常に「範囲を取得できません」になる。Web でプロジェクトを開くと `downloadStyle` が `db.pmtiles.put({boundary: ''})` で既存の boundary を空文字で上書きする。`loadBoundary` は `boundaryJson === undefined` のときしか取り直さないので `JSON.parse('')` が例外になる。地図編集で保存し直すまで続く（スタイル取り込みの経路は保存時の delete/update で通常は解消される） | 安全 | `containers/Maps.tsx:268-284, 315-324`、`useRepository.ts:1531-1532`、`useMaps.ts:600` | `if (!boundaryJson)` で空文字でも取り直す。`downloadStyle`・`importStyleFile` は put で boundary と blob を上書きしない（M-H5・M-M17 と同じ修正） |
| M-L10 | Android で、スタイルを指定していないベクタ PMTiles を一度もオンラインで描かずにオフラインで表示すると、何も描かれない。オフライン分岐は metadata を読まず（保存済みの metadata.json を読む箇所が Android にない）、style.json も無いと `getDefaultStyleLayers(null)` で NPE→全タイル null。オンラインで一度描けば既定スタイルが style.json に保存され、実行中のオフライン切替でも provider が残るので起きない。起きるのは非表示のまま「すべての地図」でダウンロードした地図をオフラインで初めて表示したとき、オンラインで作り直した直後（removeStyleFile で style.json が消える）に描く前にオフラインにしたとき。iOS は metadata.json を読む | 安全 | `MapPMTileProvider.java:124-131, 922-924`、`VectorTileStyleManager.java:175-191, 230`、`useTiles.ts:530-566`、iOS `AIRGoogleMapPMTileOverlay.m:85-140` | オフライン分岐で `${tileCachePath}/metadata.json` を読み this.metadata に入れる。metadata/vectorLayers が null なら空リストを返す。styleURL が無ければダウンロード時に既定スタイルの style.json も作る |
| M-L11 | Web のラスタ XYZ 地図に固定ズーム（overzoomThreshold）が効かない。ラスタソースの maxzoom が maximumZ（22）なので、std（固定18）は z19〜22、veg2024（固定15、URL が .png なのでラスタ扱い）は z16 以上を実際に取りに行き404になる（maplibre は親タイルを後から取って拡大するので、欠けたままにはならず一瞬空白になる程度）。固定ズームを下げても Web だけ効かず、ネイティブ・PDF と見た目が違う。陰影起伏ソースは同じファイルで `Math.min(overzoomThreshold, maximumZ)` にしている | 判断 | `Home.web.tsx:778, 789-801`、比較 `pages/Home.tsx:146-156`、`pdfExport/tiles.ts:191` | ラスタソースの maxzoom を `Math.min(tileMap.overzoomThreshold ?? tileMap.maximumZ, tileMap.maximumZ)` にする |
| M-L12 | 拡張子が大文字（`.PDF`）の PDF 地図は、保存しても共有されず端末内パスのまま設定に載る。取り込みは拡張子の判定だけ小文字化し、url は `file://MAP.PDF` のまま。`uploadTileMaps` の `endsWith('.pdf')` が偽になり、PDF を上げずに file:// のまま push する（警告なし）。受け手は表示できず、ダウンロードボタンも `.pdf` でしか出ないので取得手段がない。管理者の Web 画面では表示されるので共有できたように見える | 安全 | `useRepository.ts:1223`、`useMaps.ts:768`、`containers/Maps.tsx:82, 194, 282`、`MapTable.tsx:113`、`MapTable.web.tsx:134`、`pages/Home.tsx:138, 152`、`HomeTileMapSelector.tsx:30`、`HomeTerrain3D.tsx:104` | PDF 判定を共通関数（小文字化して `.pdf` か `pdf://`）にまとめ、上記すべてで使う（M-M11 の属性判定にまとめてもよい）。file:// がどの分岐にも当たらないときは共有せず警告する |
| M-L13 | ネイティブの 3D 表示・眺望で、地形に使う標高データ（Mapterhorn／地理院 基盤地図情報）の出典が出ない。出典の文字列は表示中 tileMaps の attribution と、可視領域プレビューのときの `common.demAttribution` だけで、3D・眺望中には足さない。陰影起伏図など Mapterhorn 由来の地図を出していなければ出典がどこにも出ない（`DemSources.ts:42` に要出典表記と明記）。Web は raster-dem に © Mapterhorn を付けている | 安全 | `containers/Home.tsx:588-602`、`pages/Home.tsx:579, 762`、`terrain3d/terrainDem.ts:2, 11`、`Home.web.tsx:51-58` | `Platform.OS !== 'web' && isTerrainActive` のときも `common.demAttribution` を足し、可視領域と重複しないようにする |
| M-L14 | 地図設定の JSON 書き出しに `encryptKey` と Storage のトークン付きダウンロード URL がそのまま入る。`exportSingleMap`・`pressExportMaps` は tileMap を JSON.stringify するだけ。プロジェクトの PDF・スタイルは url=`pdf://`＋トークン付き URL と復号鍵（`decryptSharedFile` は fileKey だけで復号できる）を持つので、JSON を受け取った外部の人は取り込むだけで暗号化 PDF を取得・復号できる（Rules を通らない）。書き出すのは閲覧権限のあるメンバー本人で、その人は元々 PDF を渡せる立場。メンバーから外しても取得できる点は書き出しではなく、トークン付き URL を使う共有方式全体の性質（別の判断事項） | 判断 | `useMaps.ts:496-500`、`containers/Maps.tsx:232-236`、`storage.ts:172-175, 507-510`、`useRepository.ts:1229, 1237`、`utils/Map.ts:105-119`、`e3kit-browser.ts:91-101` | 書き出し時に encryptKey を除き、`pdf://`・`style://` の地図は URL を空にするか対象から外して知らせる。.ecorismap・Drive 保存にも広げるか、トークンの失効をどうするかは別途決める |
| M-L15 | `style://` のスタイルを持つベクタ地図をダウンロードすると、毎回「(style.json) エラー」と表示される。`downloadMultipleTiles` は styleURL が `style://` かを見ずに fetch し、RN の fetch はこのスキームを扱えないので必ず失敗して errorMaps に入る（81e18d1b 以来）。対象は共有スタイル（`style://https://…`）だけでなく、ネイティブで自分で取り込んだスタイル（`style://style.json`）も含む。1地図だけのダウンロードも同じ経路を通る。実際のスタイルはローカルの style.json で、上書きされないので実害は誤表示だけ | 安全 | `useTiles.ts:230, 255, 549-566, 567-586, 764-771`、`useMaps.ts:606`、`MapEdit.tsx:126`、`storage.ts:510` | styleURL が `style://` で始まるときは fetch を飛ばす（必要ならローカルの style.json の有無だけ確かめる） |
| M-L16 | iOS の UrlTile は、flipY の OFF や minimumZ=0 など「偽の値」への変更をネイティブに渡さないので、設定を戻しても表示が戻らない。`setFlipY`・`setMinimumZ`・`setMaximumZ`・`setMaximumNativeZ` が `if (self.tileLayer && flipY)` のように値の真偽を条件にしている。key も変わらないので、再起動かオフライン切替まで直らない。Android は直る | 安全 | iOS `AIRGoogleMapUrlTile.m:36-77`、`pages/Home.tsx:136` | 各 setter の条件を `if (self.tileLayer)` だけにして常に反映し、clearTileCache する |

---

## 反証されたもの

| 候補 | 反証の理由 |
|---|---|
| 地図リスト URL を変更しても一覧が再取得されず旧 URL の一覧が出る／Cancel 後も未保存の入力が残る | 設定画面で地図リスト URL のモーダルを開く入口が無い（`pages/Settings.tsx:14` で `pressMapListURLOpen` がコメントアウトされ、ほかに呼ぶ箇所もない）。`saveMapListURL` に至る操作をユーザーは実行できないので再現しない。コード上の指摘（mapList を空にしない、モーダルの値が同期されない）は、入口を復活させるときの注意点にとどまる |
| pmtiles パッチで Range 非対応サーバーの検査を外したため、毎回アーカイブ全体を取得・誤デコードする（2件） | パッチが書き換えているのは `node_modules/pmtiles/index.ts`（ソース）だけで、Metro が実際に読むのは exports の `dist/index.js`・`dist/index.cjs`。dist には検査がそのまま残り、`cache: "reload"` も元のまま。本番 Web バンドルにも "content-length exceeding request" が含まれる。Range 非対応では最初の getBytes で例外になる。付記: このパッチ（Buffer 化・no-store・検査削除）自体が実行時には効いていない死にパッチ |

---

## 直す順番の提案

1. **データが消える・壊れるもの（安全に直せる）**: M-H5（スタイル読み込みで Web の PMTiles 本体が消える）、M-H1（「すべての地図」で PDF 地図が壊れる・消える）。どちらも条件のそろえ直しと put→update で済む。M-M17・M-L9 も同じ `db.pmtiles.put` の修正なので一緒に直す。
2. **オフラインで地図が出ない（安全に直せる）**: M-H4（ラスタ PMTiles の保存形式）、M-H7（Android PMTiles の状態固定。まず key に isOffline）、M-M13（Android の拡大段数）、M-M3 のうちクラッシュ対策（null チェック）、M-M14・M-M15（DEM の一時失敗）。ネイティブはパッチ再生成とリビルドが要るので、パッチの修正はまとめて1回にする。
3. **ネイティブの URL 反映（M-H6 主因）**: setUrlTemplate の作り直しと iOS のレイヤ付け替え。M-L16 も同じファイル。署名付き配信の保護地図が初回に出ない問題なので早めに。
4. **方針を決めてから直すもの**: M-H2（キャッシュクリアの対象。P-M6 と同じ方針にそろえる）、M-H3（PMTiles のズーム範囲）、M-H6 副因（URL 変更時にキャッシュを消すか、確認を出すか）、M-M1（部分失敗を paused で残すか）、M-M2（flipY のキャッシュ規約）、M-M6（バックアップ除外は先に入れてよい。閲覧キャッシュの分離は判断）、M-M11（複数ページ PDF の持ち方）、M-M21（MapTiler の無料枠。サービス開始前の条件に関わる）。
5. **共有・表示の食い違い**: M-M4、M-M18、M-M19、M-M20、M-M9、M-M10、M-M12、M-M16、M-M5、M-M7、M-M8。
6. **low**: 表示の誤り（M-L1・L2・L3・L15）、容量（M-L4・L5・L8）、そのほか個別に。M-L13（出典）は文言を足すだけなので先に入れてもよい。

あわせて、M-H1・M-H2・M-H5・M-H6 の削除処理は「消すのはタイル（数字のズームディレクトリと `.pbf`）だけ、style.json・boundary.json・取り込んだ実体は残す、フォルダ全体を消すのは地図そのものの削除だけ」という1つの規則にまとめると、修正の重複を避けられる。

## 修正状況

### high の安全な4件（2026-11-23、fix/tile-high-safe）

| 番号 | 修正内容 |
|---|---|
| M-H1 | ダウンロード対象の判定を `isDownloadableTileMap`／`tileMapsForDownloadScreen`（`tileDownloadHelpers.ts`）にまとめ、選択画面・対象・見積もり・削除・保存範囲・容量集計で共通に使う。PDF・file://・blob:・peaks・Google は対象外 |
| M-H4 | ラスタ PMTiles を拡張子なしの `{z}/{x}/{y}` に Base64 デコードした生バイトで await して書く。書き込み失敗は errorCount に数える。旧形式の `{y}.png` は保存済みとみなさず、ダウンロード時に消す。ヘッダーの tileType で実際のベクタ/ラスタを判定する（`resolvePmtileIsVector`） |
| M-H5 | Web のスタイル保存は `saveStyleToPmtilesDb`（update、無ければ put）で blob・boundary を壊さない（`downloadStyle` も同じ）。保存時の後始末は `getPmtilesSaveCleanup`／`cleanupPmtilesOnSave`（`pmtilesLocalStore.ts`）で、url 変更=タイル・.pbf・boundary、スタイル変更=描画済み画像だけ、スタイルを空に=style.json も消す。フォルダごとは消さない。スタイル読込失敗時は style:// に切り替えない。M-L9（boundary が '' のとき取り直す）も同時に修正 |
| M-H7 | Android の PMTiles の key に isOffline を入れる（`pmtileKey.ts`）。`MapPMTileProvider.java` は初期化をバックグラウンドへ移して `join()` を廃止、ヘッダー未取得でも保存済み PNG・.pbf を描く、getTile のスレッドで5秒間隔で取り直す、setOfflineMode でオンラインに戻ったら作り直す。`VectorTileStyleManager` にタイムアウトを付け、オフラインでは取得しない。3D・PDF の `PMTileRasterizerModule.kt` は `awaitInitialization` で初期化を待つ。パッチを再生成し、素の 1.27.2 への forward と導入済みへの reverse の `git apply --check` を確認 |

確認: tsc 0、lint エラー0、jest 3054件通過、Android ビルド成功。エミュレータで、オフラインで起動したあとオンラインへ切り替えると、特定植物群落（ベクタ PMTiles）のタイルが取得・描画されることを確認した（画面は固まらない）。
残り: iOS・Web と、ラスタ PMTiles のオフライン表示、3D・PDF の初回タイル、弱電波時の保存済みタイル表示は未確認。M-H2・M-H3・M-H6 は方針判断待ち。

### 判断が要る high 3件（2026-11-23、fix/tile-high-decision）

方針（ユーザー判断）: M-H2=取り直せるタイルだけ消す、M-H3=z0〜ファイルの最大ズーム、M-H6=URL が変わったら確認なしで古いキャッシュを消す。

| 番号 | 修正内容 |
|---|---|
| M-H2 | `tileCacheCleanup.ts` に「タイルだけ消す」処理をまとめた。キャッシュのクリアは、今の一覧にある PDF 以外の地図（と DEM の疑似地図）から数字ディレクトリ・.pbf・metadata.json だけを消し、style.json・boundary.json・PDF 地図・一覧に無いフォルダは残す。保存範囲は消した地図の分だけ外す。Web は boundary だけの pmtiles 行だけ消す。ダウンロード画面の削除も同じ規則。確認文（ja/en）を実際の挙動に合わせた |
| M-H3 | `getZoomRange` を、ヘッダーの min〜min(ヘッダーの max, 固定ズームの上限) に変更（読めないときは 0〜min(18, overzoomThreshold)）。見積もりも `usePmtilesZoomRanges` で読んだヘッダーの範囲とベクタ/ラスタで数える。1枚も保存できなかったときは完了扱いにせず `noTilesInRange` を知らせる |
| M-H6 | 主因: タイル部品の key に実際に渡す URL（署名込み）・styleURL・flipY・tileSize を含め、URL が変わったら作り直す（`pmtileKey.ts`、ネイティブのパッチは変えない）。署名は期限の7日前までは据え置き、問い合わせ直しで不要に作り直さない（`tileSignatures.ts`）。副因: `tileSourceChange.ts`／`tileSourceCleanup.ts` で、署名を除いた URL・flipY・tileSize が変わったら確認なしでタイル・metadata・boundary・保存範囲・3D テクスチャを消す（地図編集の保存、JSON 単体取り込み、プロジェクト設定の反映）。PMTiles のスタイルだけの変更は描画済み画像だけを消す（.pbf はスタイルに依らないので残す）。PDF 地図は対象外 |

確認: tsc 0、lint エラー0、jest 3104件通過。Android エミュレータで、特定植物群落（ヘッダー z5〜15）を z13 から範囲ダウンロードして z5〜15 が保存されること、キャッシュのクリアでタイルだけ消えて style.json が残り一覧外のフォルダが残ることを確認した。
残り: M-H6 の署名付き保護地図の初回表示・プリセット置換は実機で未確認。iOS・Web は未確認。JSON 配列の一括取り込み・バックアップ復元・.ecorismap 読み込みで URL が差し替わる経路は未対応。一覧外の孤立フォルダは容量が回収されない。

### medium 21件（2026-11-23、fix/tile-medium）

方針（ユーザー判断）: M-M1=完了扱いは変えず失敗枚数を警告、M-M2=キャッシュの y を XYZ に統一、M-M6=tiles をバックアップ対象外にするだけ、M-M11=PDF の判定と再ダウンロードの重複だけ、M-M21=日本語の初期状態で MapTiler の standard を非表示。

| 番号 | 修正内容 |
|---|---|
| M-M1 | 1枚分の取得を `downloadOneTile` にまとめ、単一地図版と複数地図版で同じ規則に。404 以外の失敗（PMTiles 例外・通信例外・5xx・書き込み失敗）を数えて警告。書き込みは await |
| M-M2 | JS のダウンロードは URL の {y} だけ反転し保存は XYZ の y。iOS も反転を URL 生成時だけに。旧キャッシュは `flipYTileCacheMigration` で地図ごとに一度だけ消し、保存範囲も外す（起動時とダウンロード前） |
| M-M3 | Android で取得データが画像か確かめ、一時ファイル経由で書く。decode の null チェック、getTile の例外処理 |
| M-M4 | `downloadStyle` のループ内 return をやめ、全地図のスタイルを取り込む |
| M-M5 | `downloadFileIfOk` で一時パスへ落とし、200 のときだけ置き換える（DEM も） |
| M-M6 | AppDelegate で Documents/tiles に isExcludedFromBackup を付ける（起動時と背面移行時）。PDF 地図のタイルもバックアップされなくなる |
| M-M7 | 3D テクスチャは 403/429/5xx・一時的な null を「タイルなし」にしない。キャッシュのクリアで 3D・DEM キャッシュも消す |
| M-M8 | ベクタ PMTiles の描画済み PNG をスタイル更新時刻と比べて描き直す（Android・iOS） |
| M-M9 | 地図リスト CSV を RFC4180 のパーサで読み、列ごとに型を決める。不正な行だけ除き件数を知らせる。response.ok を確認 |
| M-M10 | Web の PMTiles 取り込みで data URL 変換をやめ、失敗表示と読み込み中の解除を必ず行う |
| M-M11 | `pdfTileMap.ts` の `isPdfTileMap`（attribution==='PDF' 等）で判定。複数ページ PDF の再ダウンロードは前回のページ群を置き換え、共有ページ地図を押してもそのページだけ作る |
| M-M12 | PDF 地図の再ダウンロードで旧タイルを消し、移動の上書き失敗を防ぐ |
| M-M13 | Android の PMTiles を maximumNativeZ より何段でも拡大表示 |
| M-M14 | Android の DEM が地図タイル用の代替タイルを受け取らない |
| M-M15 | iOS の DEM オーバーレイで一時失敗に NoTile を返さない |
| M-M16 | Web の陰影・段彩で共有の取得を最初の要求の中止に巻き込まない。gebcoDemLayers も 5xx を覚えない |
| M-M17 | blob: の地図はスタイル付きでも共有設定に載せない |
| M-M18 | MapEdit の保存でヘッダーの min/maxZoom と overzoomThreshold を反映。Web の PMTiles の maxzoom を min(overzoomThreshold, maximumZ) に |
| M-M19 | PDF 出力で署名付き XYZ 地図に署名を付ける |
| M-M20 | mapType を tileMaps から導き（`mapTypeFromTileMaps`）、プロジェクトの作成・取り込み・終了でそろえる |
| M-M21 | `createInitialTileMaps` で日本語の初期状態の standard を非表示に（既存の設定は変えない） |

確認: tsc 0、lint エラー0、jest 3190件通過。react-native-maps パッチを再生成（行末空白の罠で1回目は素の版に当たらず、素の版に当て直して再生成し forward/reverse とも確認）。Android・iOS ともビルド成功し、エミュレータ/シミュレータで起動・地図と陰影起伏の表示を確認、iOS の tiles に isExcludedFromBackup が付くことを確認した。
残り: 各件の実機での動作（flipY 地図、PDF 再ダウンロード、スタイル更新後の描き直し、DEM の一時失敗、オーバーズーム）は未確認。旧版でダウンロードした flipY 地図は更新後にダウンロードし直しが必要（周知が要る）。pbf の flipY 地図は移行対象外。Web は未確認。

### low 9件（2026-11-23、fix/tile-low）

直したのは害のある9件。M-L3（M-M1）・M-L7（M-H6）・M-L9（M-H5）・M-L12（M-M11）は先の修正で解消済み。M-L4（陰影と標高の二重保存）・M-L5（東南へ1列余分）・M-L8（一覧置き換えで残る孤立フォルダ）は容量だけの問題で見送った。

| 番号 | 修正内容 |
|---|---|
| M-L1 | 停止・背面移行の中断フラグを開始時と完了時に戻し、最後のバッチ中の停止も一時停止として扱う |
| M-L2 | 未完了の保存範囲を灰色の破線で描き、保存済み（オレンジの実線）と区別する |
| M-L6 | 拡張子の判定でクエリと # を除く（JS の `getUrlPathExt`、Android の `isPbfUrlTemplate`） |
| M-L10 | Android でベクタ PMTiles の metadata.json を保存・読み込みし、どちらも無ければタイルのレイヤ名から既定スタイルを作る |
| M-L11 | Web のラスタ XYZ ソースの maxzoom を min(overzoomThreshold, maximumZ) に |
| M-L13 | ネイティブの 3D・眺望で標高データの出典（短い文言 `common.demAttributionShort`）を出す。Mapterhorn の出典が既にあれば足さない |
| M-L14 | 地図設定の JSON 書き出しから encryptKey を除き、共有 PDF の地図は書き出さず、共有スタイルは外して知らせる（`mapExport.ts`） |
| M-L15 | `style://` のスタイルはダウンロード時に取得しない（端末にあるかだけ確認） |
| M-L16 | iOS の UrlTile・PMTile の setter が偽の値への変更も反映する |

確認: tsc 0、lint エラー0、jest 3218件通過。パッチ再生成（forward/reverse とも確認）、Android・iOS ともビルド成功し起動・地図表示を確認。
残り: 破線の見え方、3D の出典の折り返し、クエリ付き pbf の地図、オフラインでの M-L10 は実機未確認。共有 PDF の地図でも書き出しボタンは押せる（押すとメッセージ）。
