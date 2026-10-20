# ベクタタイルのスタイル対応表（ネイティブ）

iOS / Android のベクタタイル（PMTiles・pbf）描画は、`patches/react-native-maps+1.27.2.patch` が追加する
自前レンダラ（iOS: `ios/AirGoogleMaps/AIRGoogleMapPMTileOverlay.m`、Android: `android/.../MapPMTileProvider.java`）で行う。
Web は maplibre-gl に style.json をそのまま渡すので全仕様が使える。ネイティブは MapLibre Style Spec v8 の
**データ連動の部分集合**に対応する。このページはその対応範囲と、Web との既知の差分をまとめたもの。

**同期の規律**: 演算子やプロパティを足すときは、iOS（`VectorTile/StyleExpression.m`）・Android
（`VectorStyle/StyleExpression.java`）・共通フィクスチャ（`scripts/gen-style-fixtures.mjs` →
`src/__tests__/resources/vectorStyleExpressions.json`）・この表を同時に更新する。
期待値は Web と同じ `@maplibre/maplibre-gl-style-spec` が生成する（Web がオラクル）。

検証コマンド:

```bash
node scripts/gen-style-fixtures.mjs                      # フィクスチャ再生成
yarn jest src/utils/__tests__/vectorStyleExpressions.fixtures.test.ts   # 鮮度確認
scripts/native-tests/run-ios.sh                           # iOS 評価器（macOS 上で実行）
(cd android && ./gradlew :app:testDebugUnitTest --tests 'jp.co.ecoris.ecorismap.StyleExpressionFixtureTest')
```

## 評価の規律

- プロパティ値は地物ごとに式として評価する（リテラルも式として扱う）。
- 評価できない値（未対応の演算子・型不一致・不正な形）は **そのプロパティの既定値** に退避する。
  レイヤやスタイル全体は落とさない。初回だけ `[VectorStyle] <レイヤid>/<プロパティ>` の警告ログを出す。
- `filter` は評価エラーなら **描かない**（maplibre と同じ）。
- legacy filter（`["==","k",v]`, `["in","k",a,b]`, `["has","k"]`, `"$type"`, `"$id"` 等）はスタイル読込時に
  式へ変換する。描画ループは式評価だけになる。
- 数値プロパティは、数値に変換できる文字列（`"2.5"`）も受け付ける（maplibre は型エラー。Web で動かない
  スタイルを救う方向に倒している）。

## 対応レイヤとプロパティ

既定値は Style Spec v8。★は 2026-10 の対応で現行から変わったもの。

| レイヤ | プロパティ | 既定値 | 備考 |
|---|---|---|---|
| 共通 | `filter` | 全通過 | legacy / 式の両形式 |
| 共通 | `layout.visibility` | `visible` | `none` は読込時にレイヤを除外 |
| 共通 | `minzoom` / `maxzoom` | 0 / 22 | 判定に使う zoom は描画するタイルの z |
| circle | `circle-color` | `#000000` ★ | |
| circle | `circle-radius` | 5 | Android は従来どおり 2 倍で描く（既知差分） |
| circle | `circle-opacity` | 1 | 追加 |
| circle | `circle-stroke-color` | `#000000` ★ | 式対応 |
| circle | `circle-stroke-width` | 0 | Android は 2 倍 |
| circle | `circle-stroke-opacity` | 1 | 追加 |
| line | `line-color` | `#000000` ★ | |
| line | `line-width` | 1 | |
| line | `line-opacity` | 1 | 追加 |
| fill | `fill-color` | `#000000` ★ | |
| fill | `fill-opacity` | 1 | 塗りと輪郭の両方に効く |
| fill | `fill-outline-color` | = `fill-color` | 式対応。輪郭は常に 1px |
| symbol | `layout.text-field` | 無し（描かない） | 文字列 / `"{name}"` トークン / `["get"]` / `["concat"]` / `["format"]` / `["to-string"]` / 他の式 |
| symbol | `layout.text-size` | 16 | 地物ごとに評価 |
| symbol | `text-color` | `#000000` | |
| symbol | `text-halo-color` | `rgba(0,0,0,0)` ★ | 幅 0 なら描かない |
| symbol | `text-halo-width` | 0 | |
| symbol | `text-opacity` | 1 | 追加 |

未対応（無視される。フォローアップ候補）: `line-dasharray` / `line-cap` / `line-join` / `line-offset` / `line-blur` /
`fill-pattern` / `fill-antialias` / `text-font` / `text-anchor` / `text-offset` / `text-max-width` / `symbol-placement` /
`icon-*` / `background` `raster` `heatmap` `fill-extrusion` `hillshade` レイヤ。

## 対応する式の演算子

| 分類 | 演算子 |
|---|---|
| 参照 | `get` `has` `properties` `geometry-type` `id` `zoom` `feature-state`（常に null）`literal` |
| 分岐 | `match`（ラベルは文字列または整数、配列ラベル可、型が違えば fallback）`case` `coalesce` `let` `var` |
| 比較・論理 | `==` `!=`（同型同値）`<` `<=` `>` `>=`（数値同士・文字列同士のみ、混在はエラー）`!` `all` `any` |
| 配列・文字列 | `in` `index-of` `slice` `length` `at` `upcase` `downcase` `concat` `format`（文字列部分だけ）`number-format`（en-US の decimal のみ） |
| 型変換 | `to-string`（JS と同じ数値書式）`to-number` `to-boolean` `to-color` `to-rgba` `rgb` `rgba` `typeof` `string` `number` `boolean` `array` `object` |
| 算術 | `+` `-` `*` `/` `%` `^` `abs` `round` `floor` `ceil` `min` `max` `sqrt` `ln` `log10` `log2` `sin` `cos` `tan` `asin` `acos` `atan` `pi` `e` `ln2` |
| 補間 | `step` `interpolate`（`linear` / `exponential` / `cubic-bezier`、出力は数値と色） |

未対応（エラー扱い → 既定値）: `interpolate-hcl` `interpolate-lab` `collator` `resolved-locale` `image`
`distance` `within` `global-state` `is-supported-script` `split` `join` `number-format` の `currency` / `unit` / 英語以外の `locale`。

## 色の書式

`#rgb` `#rgba` `#rrggbb` `#rrggbbaa`（CSS 順）、`rgb()` `rgba()`（カンマ区切り・空白区切り・`/` alpha・`%`）、
`hsl()` `hsla()`（`deg` 可、`turn`/`rad` 不可）、CSS Level 4 の色名 148 個と `transparent`。大文字小文字と前後の空白は無視。
解釈規則は maplibre の `parseCssColor` と同じ。

## Web との既知の差分

- **静的な型検査をしない**: maplibre がパース時に弾く式（例: `["==", 1, "1"]`、出力型が不明な
  `["interpolate", ..., ["get","a"]]`）もネイティブは動的に評価する。Web より寛容な方向。
- **`zoom` は描画するタイルの z**: オーバーズーム中は `maximumNativeZ` のタイルを拡大するため、
  画面のズームとは一致しない。ズーム連動スタイルは目安程度。
- **ジオメトリ型に Multi\* が無い**: MVT のデコーダが持っていない。`["geometry-type"]` は
  `Point` / `LineString` / `Polygon` のみ。
- **`to-string` のオブジェクト**: iOS は `NSDictionary` のキー順が保たれない。配列は一致する。
- **`to-color` に配列を渡した場合**: maplibre-gl の `Color` の癖（プリマルチプライ扱い）を再現し、
  `[1,2,3,0.5]` は `rgba(2,4,6,0.5)` になる。
- **Android の circle**: `circle-radius` と `circle-stroke-width` を 2 倍して描く（従来互換）。
- **px 寸法の倍率**: Google Maps は 512px タイルを 256pt のセルに描くため、`line-width: 1` は Web の約半分の
  太さに見える。文字サイズも同様。揃える場合は px 系プロパティに共通の倍率を掛ける一箇所の変更で済む（未実施）。
- **ラベル**: 衝突判定は同一レイヤ・同一タイル内のみ。フォントはシステムフォント。配置はポイントの先頭点 /
  線・面の頂点平均。

## 発端となった不具合（2026-10）

`"line-width": ["match", ["get","区分"], "樋門・樋管等", 1.3, 2.7]` のように **色以外のプロパティに式** を
書いたスタイルで、iOS はそのレイヤが丸ごと消え（`floatValue` の例外を握りつぶしていた）、Android は
スタイル全体のパースに失敗して既定スタイル（緑一色）に落ちていた。式評価器の導入で、全プロパティが
データ連動の式を受け付け、不正な値もプロパティ単位の既定値で退避するようになった。
