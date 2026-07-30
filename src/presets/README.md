# プリセット設定ファイル

地図編集・レイヤ編集画面の「プリセット選択」（組織アカウントログイン時のみ表示）に出る雛形の定義ファイルです。
ここのJSONを編集するだけでプリセットを追加・変更できます（アプリのリビルドは必要）。

- `mapPresets.json` — 地図のプリセット（`MapPresetType[]`）
- `layerPresets.json` — レイヤのプリセット（`LayerPresetType[]`）。`dictionaryKey`等の秘匿情報は変換時に除去済み

型定義は `src/types/index.d.ts` の `MapPresetType` / `LayerPresetType` を参照。

## ルール

- `presetId` は全プリセットでユニークにする（`src/utils/__tests__/Preset.test.ts` で検証される）
- `presetName` が選択リストに表示される名前
- `id` は書かない（追加時に自動採番される。レイヤのfieldも同様）
- レイヤの `type` は `POINT` / `LINE` / `POLYGON` / `NONE`、`format` は `src/constants/AppConstants.tsx` の `DATAFORMAT` のキー（`STRING`, `SERIAL`, `DATETIME`, `PHOTO` など）
- `STRING_DICTIONARY` フィールドには `"dictionary": ["語彙1", "語彙2", ...]` で辞書語彙を持たせられる。レイヤ保存時に辞書DBへ自動登録される
- `dictionaryFieldId` は書かない（`useDictionaryAdd: true` の辞書フィールドから自動導出される）

## アプリからエクスポートしたレイヤの変換

アプリの「レイヤ設定のエクスポート」で出力したZIP（レイヤJSON＋辞書sqlite）は、
`id`・`dictionaryKey`・`dictionaryFieldId`・`groupId`・`expanded`・`sortedOrder`・`sortedName` を除去し、
fieldの `id` を取り除き、辞書sqliteの値を該当フィールドの `dictionary` 配列に展開して変換する。
元ZIPは `maps/`・`layers/` に置いてある（アプリにはバンドルされない）。
