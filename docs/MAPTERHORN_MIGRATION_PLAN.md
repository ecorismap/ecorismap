# 標高データのMapterhorn統一 計画書

作成: 2026-10-01 / ブランチ: `feature/dem-webp-native`（以降、段階ごとに切り直す）

## 0. 進捗（2026-10-02）

| 段階 | 状態 |
|---|---|
| 1 基盤（demSource・dem-decoder） | 完了 |
| 2 可視領域・長押し | 完了（新旧比較: 山地IoU 0.55〜0.77、平地は新の可視域が大幅に減る＝微地形の差） |
| 3 3D地形 | 完了（r32float可。海底モードは産総研GEBCOで埋める） |
| 4 オフラインDL | 完了 |
| 5 2D陰影起伏・段彩 | 完了（GSI形式対応は廃止し、旧URLは自動でMapterhornへ書き換え） |
| 6 後片付け | 完了（旧JS経路・計測ハーネス削除、GEBCOの読み込みもネイティブ化、ドキュメント更新） |

残: 実機での確認（機内モードでのオフライン、体感速度）。MapterhornはCDN未キャッシュのタイルが1〜3秒かかる（許容済み）。

## 1. 目的と決定事項

標高タイルの取得元を、可視領域・長押し標高・3D地形・2D陰影起伏まで含めて
**Mapterhorn**（terrarium形式のWebP、512px、全球。日本域は基盤地図情報DEM由来でz16まで）へ統一する。
デコードはJSでなく**ネイティブ**（`modules/dem-decoder`）で行う。

| 項目 | 決定 |
|---|---|
| 運営リスク（有志運営・SLAなし） | 許容する。自動の予備ソースは持たず、止まったら定数差し替えで対応 |
| デコード | ネイティブ（iOS=libwebp直、Android=BitmapFactory非乗算sRGB）。Webは`createImageBitmap`を色変換なしで |
| 細かさ | **長押し標高だけ最高（z15、日本で約2m）**。可視領域・3Dは今と同じ画素密度 |
| 既存のオフライン標高（dem_png形式） | **使わない**。新形式だけ読む（旧データは削除する。§5） |
| 陰影起伏・汎用段彩のGSI形式 | **対応しない**（terrarium専用）。旧URLの保存レイヤは起動時にMapterhornへ書き換える |
| 陰影起伏図の海 | 不要（Mapterhornは海=0mまたは404。平らに描かれるだけ） |
| 海底の値が要るもの | GEBCO海底地形図（`relief://…#style=gebco`）・等深線ラベル・3D海底モードは産総研GEBCOを使う（Mapterhornに海底値が無いため） |
| dynamic-reliefブランチ | 本移行とは独立。ネイティブ版の自動配色は移行後に載せる |

## 2. 速度比較の結果（移行判断の根拠）

富士山付近の同じ範囲、Releaseビルド、5回の中央値（2026-10-01）。

| 経路 | iOSシミュレータ | Androidエミュレータ | JSスレッド占有 |
|---|---|---|---|
| dem_png z14×16枚＋JSデコード（現行） | 730ms | 516ms | ほぼ全部 |
| Mapterhorn z13×4枚＋ネイティブ | **8ms** | **15ms** | 0ms |
| Mapterhorn＋expo-image-manipulator経由（現行のWebP経路） | 644ms | 1171ms | 440〜540ms |

画素一致: 両OSとも全20枚がdwebp/Pillowの正解・現行JS経路と完全一致（色管理による値の変化なし）。

## 3. ズームの対応

512pxのzNは、256pxのz(N+1)と画素密度が同じ。

| 用途 | 現行（256px） | 移行後（Mapterhorn 512px） |
|---|---|---|
| 長押し標高 | z14固定 | **z15固定**（日本で約2m。国外は提供域に応じて親へ降りる） |
| 可視領域 | z8〜14（`selectDemZoom`） | z7〜13（同じ密度。グリッド上限3000画素の考え方は維持） |
| 3D地形 | `clampDemZoom` z8〜14 | z7〜13 |
| オフラインDL | z8〜14＋遠景用周辺幅（z≤11） | z7〜13＋周辺幅（z≤10） |
| 2D陰影起伏 | 産総研elev/mixed、overzoom 15 | Mapterhorn、overzoom 15（512pxなので実質z16密度） |

Mapterhornの実測（2026-10-01）: 日本z16=200・z17=404、外洋z8〜12=404、ロスレスWebP（VP8L）。
z11以下は鉛直1m丸めのため海抜0.5m未満の低地は0mになる。

## 4. 共通基盤（段階1）

新モジュール `src/utils/demSource.ts`（Webは`demSource.web.ts`）に取得〜デコードを集約する。

```
getDemTile(z, x, y): Promise<DemTile | null | undefined>
  DemTile = { z, x, y, size: 512, elev: Float32Array /* 符号付き[m] */, min, max }
  null = データなし（404＝外洋・提供範囲外） / undefined = 通信エラー（一時的）
```

- 参照順: デコード済みLRU → オフラインDL（§5の新保存先）→ ディスクキャッシュ（cacheDirectory）→ ネットワーク（1回リトライ）
- 404は0バイトのマーカーで記憶（現行と同じ規約）
- デコードは`decodeDemFile(path,'terrarium')`。ファイルパスだけ渡し、結果はコピーなしのArrayBuffer
- 同時デコード数はネイティブ側のキューに任せる（JSの直列デコードレーン`runInDecodeLane`は不要になる）
- terrariumの負値は**クランプしない**（海底モード等で使う）。0mクランプが必要な利用側（可視領域）で行う
- `modules/dem-decoder`を正式化: 計測用ヘッダの時間項目は残してよいが、計測ハーネス（`demDecodeBenchmark.ts`と`index.js`のフック）は段階6で削除
- テスト: ネイティブはjestでモック。ヘッダ解析・404/通信エラーの区別・キャッシュ順をユニットテスト

## 5. 各機能の移行

### 段階2: 可視領域・長押し標高
- `viewshed.ts`のタイル計算を512px前提へ（`TILE_SIZE`、`selectDemZoom`の範囲）
- `getDemElevation`はz15。GSIのNaN→terrarium補完の分岐は不要になる（海は0m）
- 海・404は0m扱い（現行のNaN＝海0mと同じ結果）
- **新旧比較**: 同じ地点・半径で現行と新方式の可視領域を出し、差を確認（データ源がDEM10B→DEM5A等に変わるため一致はしない。差が地形の細かさで説明できるかを見る）

### 段階3: 3D地形
- DEMテクスチャを`rgba8uint`から**`r32float`（標高そのもの）**へ。シェーダのGSI/terrarium分岐とNoData処理を削除
  - 最初に、react-native-webgpuで`r32float`の`textureLoad`が使えるか試作で確認する。不可なら`rgba8uint`にterrarium RGBを詰めて送る（シェーダはterrarium一本化）
- `DEM_TILE_SIZE`・DEM部分矩形の計算（`buildPass`のspan、`tileElevRange`の4×4ブロック、`sampleNearest`）を512へ
- 海底モード: Mapterhornの0m以下・404を**産総研GEBCO**で埋める（Web版`bathyterrain://`と同方式、`fillSeaWithBathymetry`を流用）。GSI形式への詰め直しは不要になる
- 遠景リングの縦縞（2026-09の3D高速化時に見つかった「遠景メッシュを間引くと出る縦縞」）が再発しないか確認

### 段階4: オフラインDL
- 新しい疑似ターゲット（保存先 `TILE_FOLDER/dem_mapterhorn/{z}/{x}/{y}.webp`）。404は0バイトマーカー
- 見積もり・周辺幅（`downloadBoundsForZoom`）を§3のズームに合わせる
- **旧データ**（`TILE_FOLDER/dem_viewshed/`と対応するtileRegions）は、移行後の初回起動で削除する
- ダウンロード画面の表示名・容量表示を新ターゲットへ

### 段階5: 2D陰影起伏・段彩（`hillshade://` / `relief://`）
- 形式はURLのスキームとスタイルで決める（エンコード指定パラメータは設けない）:
  - `hillshade://` と `relief://`（汎用段彩）＝ **terrarium形式のみ**（GSI形式の対応はしない）
  - `relief://…#style=gebco` ＝ GSI形式（産総研GEBCO。海底値が要るため従来どおり）
- **既存ユーザーの保存済みレイヤを移行**: `hillshade://`と汎用`relief://`でURLがMapterhorn以外のもの（産総研elev/mixed等）は、起動時のデータ移行でMapterhornのURLへ書き換える（GEBCOスタイルは対象外）。オフラインDL済みの元DEMはGSI形式のため削除し、再DLを促す
- Android（パッチのJava）: BitmapFactoryの設定を`inPremultiplied=false`・sRGBに固定し、terrariumのデコードを追加
- iOS（パッチのObjC）: WebPはlibwebpで直接展開（react-native-mapsのpodspecにlibwebp依存を追加）。PNG（GEBCO）も色変換が入らない経路へ
- 512px対応: 画素数で決めているHALO・探索半径を、メートル基準またはタイル寸法比で補正
- Web（`shadingTileProtocol.web.ts`）: `createImageBitmap`を色変換なしで使い、512pxをそのまま扱う
- プリセット「陰影起伏」のURLをMapterhornへ差し替え
- `colorRelief.test.ts`のパッチ定数一致テストを更新
- オフライン（地図ごとのDL）は現行どおり元DEMをそのまま保存する

### 段階6: 後片付け
- 削除: dem_png取得・JSデコード経路（`pngLite`の利用箇所のうちDEM分、`decodeDemTile`、デコードレーン）、expo-image-manipulatorでのWebP→PNG変換（`contourLabels`・`reliefTexture`はネイティブデコードへ）、`GSI_DEM_URL`の利用
- 計測ハーネスの削除
- `docs/DEM_SOURCES.md`の書き換え（Mapterhornが主、3DネイティブのMapterhorn化、旧記述の訂正）
- 出典表記: © Mapterhorn（日本域は国土地理院の基盤地図情報由来である旨も）。`licenses.json`・アプリ内の出典表示

## 6. 検証

- 各段階: `npx tsc --noEmit`、`yarn lint`、`yarn test`
- 段階2・3・5: iOSシミュレータ・Androidエミュレータで表示と値を確認（ビルドは1つずつ順番に）
- 段階4: 機内モードで可視領域・長押し・3D遠景
- 実機での体感（3Dの初回表示時間・パン中のカクつき）は段階3の後に計測

## 7. リスクと未確認事項

| 項目 | 対応 |
|---|---|
| WebGPUの`r32float` | 段階3の冒頭で試作。不可なら`rgba8uint`のterrarium一本化 |
| 国外の最大ズーム | 地域で違う（例: スイスz17、外洋404）。z15が無い地点は親へ降りる |
| z11以下の1m丸め | 長押し・可視領域は高ズームを使うので影響小。遠景3Dは許容 |
| 旧オフラインデータ削除 | 再DLが必要になる旨をリリースノートに書く |
| 既存の陰影起伏・汎用段彩レイヤ | 起動時にURLをMapterhornへ書き換える。GSI形式のデコードはGEBCO段彩のためだけに残る |
| Mapterhorn停止 | `MAPTERHORN_URL`を差し替えて復旧（候補: 自前PMTiles抽出） |
