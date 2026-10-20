# EcorisMap Supported Vector Tile Styles

## Overview
1. Only {layers:[]} is a required item.
2. id and source can be dummy values.
3. source-layer must correspond to the vector tile data.
4. Native (iOS/Android) supports the data-driven subset of the MapLibre Style Spec:
   `match` / `case` / `get` / `coalesce` / comparisons / logical operators / `concat` / `to-string` /
   `step` / `interpolate` etc. on every paint/layout property, plus legacy and expression filters.
   Unsupported values fall back to the property's default (the layer is still drawn).
   See `docs/VECTOR_STYLE_SUPPORT.md` for the full table. Web (maplibre-gl) supports the full spec.


## 概要
1. {layers:[]}のみが必須項目です。
2. id、sourceはダミーでOKです。
3. source-layerはベクトルタイルのデータと対応させる必要があります。
4. ネイティブ（iOS/Android）は MapLibre Style Spec のデータ連動の部分集合に対応しています:
   `match` / `case` / `get` / `coalesce` / 比較 / 論理 / `concat` / `to-string` / `step` / `interpolate` などを
   全ての paint/layout プロパティと filter（legacy 形式・式形式）で使えます。
   未対応の値はそのプロパティの既定値に退避します（レイヤは描かれます）。
   対応表は `docs/VECTOR_STYLE_SUPPORT.md` を参照。Web（maplibre-gl）は全仕様に対応しています。

## Thanks
style3.jsonはG空間情報センター「栃木県「樹種ポリゴン」で公開されているstyle.jsonを参照
https://www.geospatial.jp/ckan/dataset/tree_species_tochigi
