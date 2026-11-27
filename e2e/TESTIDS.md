# testID 一覧

E2E（Web=Playwright の `getByTestId`、ネイティブ=Maestro の `id`）から画面要素を特定するための ID。
react-native-web では `testID` が `data-testid` になる。

- 命名: `<画面>-<要素>` の小文字ケバブ。一覧の行は末尾に `-${i}`（表示順の0始まり）
- ファイルは `src/components/` からの相対パス
- 「(既存)」は以前からある ID（Maestro フローが依存。名前を変えない）
- ネイティブ版と Web 版（`.web.tsx`）がある部品は同じ ID

## 共通部品

| testID | 要素 | ファイル |
|---|---|---|
| `sheet-back` | ボトムシート共通ヘッダの戻る（＜） | molecules/BottomSheetHeader.tsx |
| `sheet-close` | ボトムシートの閉じる×（Web は編集中は表示されない） | pages/Home.tsx, pages/Home.web.tsx |
| `dialog-title` | 共通ダイアログのタイトル | molecules/StyledDialog.tsx |
| `dialog-message` | 共通ダイアログの本文 | molecules/StyledDialog.tsx |
| `dialog-button-${i}` | 共通ダイアログのボタン（渡した配列の順） | molecules/StyledDialog.tsx |
| `textdialog-input` | 名前入力ダイアログの入力欄（グループ作成など） | molecules/TextInputDialog.tsx |
| `textdialog-ok` / `textdialog-cancel` | 名前入力ダイアログの OK / キャンセル | molecules/TextInputDialog.tsx |
| `<PickerのtestID>` | Picker を開くタップ領域 | atoms/Picker.tsx |
| `<PickerのtestID>-option-${i}` | Picker を開いたあとの選択肢（`optionTestIDPrefix` 指定時は `${prefix}-${i}`） | atoms/Picker.tsx |
| `<TextButtonのtestID>` / `-icon` / `-info` | 設定系の行の文字部分 / 左アイコン / 情報(i)ボタン | molecules/TextButton.tsx |
| `<辞書入力のtestID>` / `-button` / `-suggestion-${i}` | 辞書入力の入力欄 / 右のボタン / 候補 | molecules/DictionaryTextInput.tsx, DynamicDictionaryTextInput.tsx |

## ホーム（地図上のボタン）

| testID | 要素 | ファイル |
|---|---|---|
| `home-maps` (既存) | 地図一覧ボタン | organisms/HomeButtons.tsx |
| `home-track` (既存) | 軌跡記録ボタン（ネイティブのみ） | organisms/HomeButtons.tsx |
| `home-layers` (既存) | レイヤ一覧ボタン | organisms/HomeButtons.tsx |
| `home-feature-point` / `-line` / `-polygon` / `-memo` / `-draw` (既存) | 作図種別ボタン | organisms/HomeButtons.tsx |
| `home-settings` (既存) | 設定ボタン | organisms/HomeButtons.tsx |
| `home-zoom-in` / `home-zoom-out` | ズーム＋/−（ネイティブのみ。Web は maplibre 標準コントロール） | organisms/HomeZoomButton.tsx, HomeZoomButton.web.tsx |
| `home-zoom-level` | ズームレベル表示 | organisms/HomeZoomButton.tsx, HomeZoomLevel.tsx |
| `home-gps` | GPS ボタン | organisms/HomeGPSButton.tsx |
| `home-gps-detail` | 外部GNSS詳細パネル（タップで閉じる） | organisms/HomeGPSButton.tsx |
| `home-gps-open-settings` | 詳細パネル内「設定を開く」 | organisms/HomeGPSButton.tsx |
| `home-terrain` | 3D 切替 | organisms/HomeTerrainControl.tsx, HomeTerrainControl.web.tsx |
| `home-terrain-rotate-ccw` / `-rotate-cw` / `-pitch-ccw` / `-pitch-cw` | 3D カメラの回転・傾き | organisms/HomeTerrain3DButtons.tsx |
| `home-compass-button` (既存) | コンパスボタン | organisms/HomeCompassButton.tsx |
| `compass-ring` / `compass-rose-rotator` (既存) | 方位盤のリング / 回転部 | organisms/HomeCompassButton.tsx |
| `home-account` | アカウントボタン | organisms/HomeAccountButton.tsx |
| `home-account-projects` / `-setting` / `-drive` / `-logout` | アカウントメニューの各項目（logout=ログアウト/Drive切断） | organisms/HomeAccountButton.tsx |
| `home-editing-layer` | 編集レイヤのチップ | organisms/HomeEditingLayerButton.tsx |
| `home-attribution` | 地図の出典表示 | organisms/HomeAttributionText.tsx |
| `home-project-label` | プロジェクト名ラベル | organisms/HomeProjectLabel.tsx |
| `home-project-jump` | プロジェクトのホーム位置へ | organisms/HomeProjectButtons.tsx |
| `home-project-download` / `home-project-upload` | データのダウンロード / アップロード | organisms/HomeProjectButtons.tsx |
| `home-project-close` | プロジェクトを閉じる | organisms/HomeProjectButtons.tsx |
| `home-project-save-setting` / `home-project-discard-setting` | プロジェクト設定の保存 / 破棄 | organisms/HomeProjectButtons.tsx |

### ホーム: 長押しポップアップ・各種ポップアップ

| testID | 要素 | ファイル |
|---|---|---|
| `home-poi-google-maps` | Googleマップで開く | organisms/HomePoiPopup.tsx |
| `home-poi-vista` | 眺望 | organisms/HomePoiPopup.tsx |
| `home-poi-viewshed` | 可視領域の作成 | organisms/HomePoiPopup.tsx |
| `home-poi-measure` | 距離測定 | organisms/HomePoiPopup.tsx |
| `home-poi-distance` / `home-poi-elevation` | 現在地からの距離 / 標高（表示） | organisms/HomePoiPopup.tsx |
| `home-poi-coordinate` | 緯度経度（タップでコピー） | organisms/HomePoiPopup.tsx |
| `home-popup-close` | ベクタタイル情報ポップアップの× | organisms/HomePopup.tsx |
| `home-trackpoint-close` | 軌跡ポイントのポップアップの× | organisms/HomeTrackPointPopup.tsx |
| `home-trackpoint-coordinate` | 軌跡ポイントの緯度経度（タップでコピー） | organisms/HomeTrackPointPopup.tsx |
| `home-trackphoto-close` | 軌跡写真ビューアの閉じる | organisms/HomeTrackPhotoModal.tsx |

### ホーム: 距離測定・可視領域・眺望

| testID | 要素 | ファイル |
|---|---|---|
| `home-measure-text` | 距離測定バナーの文言 | organisms/HomeMeasureBanner.tsx |
| `home-measure-close` | 距離測定の終了× | organisms/HomeMeasureBanner.tsx |
| `home-viewshed-text` | 可視領域バナーの文言 | organisms/HomeViewshedBanner.tsx |
| `home-viewshed-clear` | 可視領域の消去 | organisms/HomeViewshedBanner.tsx |
| `home-viewshedsettings-distance` / `-observer-height` | 可視領域設定の距離 / 観測者高さ入力 | organisms/HomeModalViewshedSettings.tsx |
| `home-viewshedsettings-snap` | スナップ点を使うチェック | organisms/HomeModalViewshedSettings.tsx |
| `home-viewshedsettings-ok` / `-cancel` | OK / Cancel | organisms/HomeModalViewshedSettings.tsx |
| `home-vista-close` | 眺望バナー（押すと解除） | organisms/HomeTerrain3DVistaBanner.tsx |
| `home-vista-peak-names` | 山名表示の切替 | organisms/HomeTerrain3DVistaBanner.tsx |
| `home-vista-peak-label` | 眺望の山名ラベル（山ごとに1つ。同じIDが複数並ぶ。文字は縦書きで1文字ごとに改行。タップで詳細） | organisms/HomeVistaPeakLabels.tsx |
| `home-vista-peak-detail` | 山名をタップしたときの詳細（山名・標高・距離） | organisms/HomeVistaPeakLabels.tsx |
| `home-vista-height-up` / `home-vista-height-down` / `home-vista-height` | 視点高さの上下 / 表示 | organisms/HomeTerrain3DButtons.tsx |
| `home-vista-zoom-in` / `home-vista-zoom-out` / `home-vista-zoom` | 画角（望遠・広角）/ 倍率表示 | organisms/HomeTerrain3DButtons.tsx |

### ホーム: タイルのダウンロード

| testID | 要素 | ファイル |
|---|---|---|
| `home-download-start` | ダウンロード実行 | organisms/HomeDownloadButtons.tsx |
| `home-download-back` | ダウンロードモードのヘッダ戻る | pages/Home.tsx |
| `home-download-map-select` | 対象地図の選択欄 | pages/Home.tsx |
| `home-download-size` | 保存済みタイル容量 | pages/Home.tsx |
| `home-download-delete` | 保存済みタイルの削除 | pages/Home.tsx |
| `home-download-progress` | 進捗の数値 | pages/Home.tsx |
| `home-download-stop` | ダウンロード停止 | pages/Home.tsx |
| `home-download-map-all` | 地図選択: すべての地図 | organisms/HomeTileMapSelector.tsx |
| `home-download-map-${i}` | 地図選択: 各地図 | organisms/HomeTileMapSelector.tsx |
| `home-download-map-dem` | 地図選択: 可視領域用DEM | organisms/HomeTileMapSelector.tsx |
| `home-download-map-cancel` / `home-download-map-ok` | 地図選択の Cancel / OK | organisms/HomeTileMapSelector.tsx |

### ホーム: PDF 出力

| testID | 要素 | ファイル |
|---|---|---|
| `home-pdf-export` | PDF 出力の実行 | organisms/HomePDFButtons.tsx |
| `home-pdf-settings` | PDF 設定の要約チップ（設定を開く） | organisms/HomePDFButtons.tsx |
| `home-pdf-back` | PDF モードの戻る（Web のみ表示） | organisms/HomePDFButtons.tsx |
| `home-pdf-header-settings` / `home-pdf-header-back` | PDF モードのヘッダ歯車 / 戻る（ネイティブ） | pages/Home.tsx |
| `home-pdfsettings-paper-size` / `-orientation` / `-scale` / `-zoom-level` | 用紙サイズ / 向き / 縮尺 / 地図ズームの Picker | organisms/HomeModalPDFSettings.tsx |
| `home-pdfsettings-output-vrt` / `-output-data-pdf` | VRT 出力 / データPDF 出力のチェック | organisms/HomeModalPDFSettings.tsx |
| `home-pdfsettings-ok` | OK | organisms/HomeModalPDFSettings.tsx |

### ホーム: 作図ツール

| testID | 要素 | ファイル |
|---|---|---|
| `home-draw-add-location-point` | 現在地ポイント追加 | organisms/HomeDrawTools.tsx |
| `home-draw-plot-point` | ポイントのプロット | organisms/HomeDrawTools.tsx |
| `home-draw-move-point` | ポイント移動 | organisms/HomeDrawTools.tsx |
| `home-draw-handwriting-line` | 手書きライン（ペン） | organisms/HomeDrawTools.tsx |
| `home-draw-tools` | スタンプ・ブラシ・設定の集約ボタン（閉じた状態） | organisms/HomeDrawTools.tsx |
| `home-draw-tools-stamp` / `-brush` / `-setting` | 集約展開時のスタンプ / ブラシ / 設定 | organisms/HomeDrawTools.tsx |
| `home-draw-stamp` / `home-draw-brush` / `home-draw-eraser` | スタンプ / ブラシ / 消しゴム（個別ボタン） | organisms/HomeDrawTools.tsx |
| `home-draw-split-line` | ライン分割 | organisms/HomeDrawTools.tsx |
| `home-draw-setting` | 手書き設定（歯車） | organisms/HomeDrawTools.tsx |
| `home-draw-style` | スタイル設定（太さ・矢印・色） | organisms/HomeDrawTools.tsx |
| `home-draw-finish-edit-position` | 位置編集の終了 | organisms/HomeDrawTools.tsx |
| `home-draw-plot-line` | ラインのプロット | organisms/HomeLineToolButton.tsx |
| `home-draw-plot-polygon` | ポリゴンのプロット | organisms/HomePolygonToolButton.tsx |
| `home-draw-handwriting-polygon` | ポリゴンの手書き | organisms/HomePolygonToolButton.tsx |
| `home-draw-info` | 情報ツール（タップ=切替、長押し=種類選択） | organisms/HomeInfoToolButton.tsx |
| `home-draw-select` | 選択ツール | organisms/HomeCommonToolButtons.tsx |
| `home-draw-move` | 地図移動ツール | organisms/HomeCommonToolButtons.tsx |
| `home-draw-pencil-lock` | Apple Pencil 専用モード（iPad のみ） | organisms/HomeCommonToolButtons.tsx |
| `home-draw-undo` / `home-draw-redo` | Undo / Redo（作図・メモ共通） | organisms/HomeCommonToolButtons.tsx |
| `home-draw-delete` | 削除 | organisms/HomeCommonToolButtons.tsx |
| `home-draw-save` | 確定（上部バー） | organisms/HomeEditControlButtons.tsx |
| `home-draw-cancel` | キャンセル（上部バー） | organisms/HomeEditControlButtons.tsx |

### ホーム: マップメモツール

メモのツールバー内の PencilLock / Undo / Redo は共通部品のため `home-draw-pencil-lock` `home-draw-undo` `home-draw-redo`。

| testID | 要素 | ファイル |
|---|---|---|
| `home-memo-pen` | ペン | organisms/HomeMapMemoTools.tsx |
| `home-memo-eraser` | 消しゴム | organisms/HomeMapMemoTools.tsx |
| `home-memo-pen-width` | 太さ切替 | organisms/HomeMapMemoTools.tsx |
| `home-memo-pen-style` | 直線/曲線切替 | organisms/HomeMapMemoTools.tsx |
| `home-memo-arrow-style` | 矢印切替 | organisms/HomeMapMemoTools.tsx |
| `home-memo-color` | 色 | organisms/HomeMapMemoTools.tsx |

### ホーム: ツールパレット・サブツール

| testID | 要素 | ファイル |
|---|---|---|
| `home-palette-${item.id}` | パレットの各ボタン（id はパレット定義のまま。例 `home-palette-SENKAI`） | organisms/HomeToolPalette.tsx |
| `home-subtool-${item.id}` | サブツール選択モーダルの各ボタン | organisms/HomeModalSubToolPicker.tsx |
| `home-subtool-cancel` | Cancel | organisms/HomeModalSubToolPicker.tsx |

### ホーム: モーダル

| testID | 要素 | ファイル |
|---|---|---|
| `home-terms-link` | 利用規約リンク | organisms/HomeModalTermsOfUse.tsx |
| `home-terms-agree` / `home-terms-cancel` | 利用規約の OK（同意）/ Cancel | organisms/HomeModalTermsOfUse.tsx |
| `home-updateinfo-version` | 更新情報のバージョン表示 | organisms/HomeModalUpdateInfo.tsx |
| `home-updateinfo-close` | 更新情報の OK | organisms/HomeModalUpdateInfo.tsx |
| `home-layerselect-row-${i}` | 編集レイヤ選択の候補行 | organisms/HomeModalLayerSelect.tsx |
| `home-layerselect-create-new` / `home-layerselect-cancel` | 新規作成 / Cancel | organisms/HomeModalLayerSelect.tsx |
| `home-categorypicker-tab-${i}` | 区分選択の属性タブ | organisms/HomeModalCategoryPicker.tsx |
| `home-categorypicker-row-${i}` | 選択肢の行 | organisms/HomeModalCategoryPicker.tsx |
| `home-categorypicker-edit-${i}` | 行の鉛筆（編集） | organisms/HomeModalCategoryPicker.tsx |
| `home-categorypicker-input-name` / `-input-code` | 名前 / コード入力 | organisms/HomeModalCategoryPicker.tsx |
| `home-categorypicker-add` / `-cancel` / `-delete` / `-ok` | ＋追加 / Cancel / 削除 / OK | organisms/HomeModalCategoryPicker.tsx |
| `home-colorpicker-close` / `-ok` / `-cancel` | 色選択の × / OK / Cancel | organisms/HomeModalColorPicker.tsx, HomeModalColorPicker.web.tsx |
| `home-conflict-apply-${i}` | 競合解決: 候補を採用 | organisms/HomeModalConflictResolver.tsx |
| `home-conflict-bulk-self` / `home-conflict-bulk-latest` | 競合解決: 一括（自分 / 最新） | organisms/HomeModalConflictResolver.tsx |
| `home-averaging-count-${n}` | GNSS平均化: エポック数（n は値。5/10/30/60） | organisms/HomeModalGnssAveraging.tsx |
| `home-averaging-fix-only` | FIX のみスイッチ | organisms/HomeModalGnssAveraging.tsx |
| `home-averaging-progress` | 収集数の表示 | organisms/HomeModalGnssAveraging.tsx |
| `home-averaging-start` / `-stop` / `-record` / `-restart` / `-cancel` | 開始 / 停止 / 記録 / やり直し / キャンセル | organisms/HomeModalGnssAveraging.tsx |
| `home-infopicker-close` | 情報ツール種類選択の× | organisms/HomeModalInfoPicker.tsx |
| `home-infopicker-all` / `-point` / `-line` / `-polygon` | 種類の行（タップ領域） | organisms/HomeModalInfoPicker.tsx |
| `home-infopicker-all-button` / `-point-button` / `-line-button` / `-polygon-button` | 行内のアイコンボタン | organisms/HomeModalInfoPicker.tsx |
| `home-memosettings-tab-${key}` | メモ/手書き設定のタブ（pen/stamp/brush/eraser） | organisms/HomeModalMapMemoSettings.tsx |
| `home-memosettings-option-${id}` | 選択肢（id は小文字ケバブ。例 `pen-thin`, `freehand`, `senkai`） | organisms/HomeModalMapMemoSettings.tsx |
| `home-memosettings-eraser-${tool}` | 消しゴム種別の行（`pen-eraser`, `pen-eraser-partial`, `brush-eraser`, `stamp-eraser`） | organisms/HomeModalMapMemoSettings.tsx |
| `home-memosettings-eraser-${tool}-button` | 同行内のアイコンボタン | organisms/HomeModalMapMemoSettings.tsx |
| `home-memosettings-snap-with-line` | 線にスナップのチェック | organisms/HomeModalMapMemoSettings.tsx |
| `home-memosettings-ok` / `home-memosettings-cancel` | OK / Cancel | organisms/HomeModalMapMemoSettings.tsx |
| `home-stylesettings-tab-${key}` | スタイル設定のタブ（width/arrow/color） | organisms/HomeModalStyleSettings.tsx |
| `home-stylesettings-option-${id}` | 選択肢（pen-thin/pen-medium/pen-thick/pen-extra-thick/none/arrow-end/arrow-both） | organisms/HomeModalStyleSettings.tsx |
| `home-stylesettings-ok` / `home-stylesettings-cancel` | OK / Cancel | organisms/HomeModalStyleSettings.tsx |

## レイヤ一覧 (layers)

| testID | 要素 | ファイル |
|---|---|---|
| `layers-row-${i}` | レイヤ名のタップ領域（レイヤ=データ一覧へ、グループ=開閉） | organisms/LayersTable.tsx, LayersTable.web.tsx |
| `layers-expand-${i}` | グループ行の開閉ボタン | 同上 |
| `layers-active-${i}` | 編集レイヤのチェック | 同上 |
| `layers-visible-${i}` | 表示/非表示 | 同上 |
| `layers-style-${i}` | 色アイコン（スタイル設定へ） | 同上 |
| `layers-label-${i}` | ラベル Picker（選択肢は `layers-label-${i}-option-${n}`） | 同上 |
| `layers-custom-label-${i}` | カスタムラベル入力欄 | 同上 |
| `layers-settings-${i}` | レイヤ設定（歯車） | 同上 |
| `layers-up-${i}` / `layers-down-${i}` | 上へ / 下へ | 同上 |
| `layers-import` | インポート | organisms/LayerButtons.tsx |
| `layers-add-group` | グループ作成 | organisms/LayerButtons.tsx |
| `layers-add` | レイヤ追加 | organisms/LayerButtons.tsx |

## レイヤ設定 (layeredit)

| testID | 要素 | ファイル |
|---|---|---|
| `layeredit-save` | 保存（ヘッダ右） | pages/LayerEdit.tsx |
| `layeredit-name` | レイヤ名入力 | organisms/LayerEditLayerName.tsx |
| `layeredit-preset` | プリセット選択（▼） | organisms/LayerEditLayerName.tsx |
| `layeredit-style` | スタイル設定へ（色アイコン行） | organisms/LayerEditLayerStyle.tsx |
| `layeredit-type` | タイプ Picker | organisms/LayerEditLayerStyle.tsx |
| `layeredit-purpose` | 用途 Picker（飛翔図/植生図） | organisms/LayerEditToolPalette.tsx |
| `layeredit-permission-${permission}` | 共有範囲ラジオ（PermissionType の小文字） | organisms/LayerEditRadio.tsx |
| `layeredit-field-add` | フィールド追加（＋） | organisms/LayerEditFieldTable.tsx |
| `layeredit-field-delete-${i}` | フィールド削除（−） | 同上 |
| `layeredit-field-name-${i}` | フィールド名入力 | 同上 |
| `layeredit-field-format-${i}` | データ形式 Picker（選択肢は `...-option-${n}`） | 同上 |
| `layeredit-field-value-${i}` | 値の設定へ | 同上 |
| `layeredit-field-option-${i}` | 「追加を使う」チェック（辞書系のみ） | 同上 |
| `layeredit-field-up-${i}` / `layeredit-field-down-${i}` | 上へ / 下へ | 同上 |
| `layeredit-export` | エクスポート | organisms/LayerEditButton.tsx |
| `layeredit-delete` | 削除 | organisms/LayerEditButton.tsx |

## フィールド値の設定 (fieldedit)

| testID | 要素 | ファイル |
|---|---|---|
| `fieldedit-import-dictionary` | 辞書の読み込み（ヘッダ右） | pages/LayerEditFieldItem.tsx |
| `fieldedit-ref-layer` / `fieldedit-ref-field` / `fieldedit-primary-field` | 参照レイヤ / 参照フィールド / 主フィールドの Picker | 同上 |
| `fieldedit-ref-custom` / `fieldedit-primary-custom` | 参照側 / 主側のカスタムフィールド入力 | 同上 |
| `fieldedit-use-last-value` | 「前回値を使う」チェック | 同上 |
| `fieldedit-code-field` | コード連動先 Picker | 同上 |
| `fieldedit-value-${i}` / `fieldedit-code-${i}` | 値 / コード入力 | 同上 |
| `fieldedit-delete-${i}` | 値の削除（−） | 同上 |
| `fieldedit-top-${i}` | 先頭へ移動 | 同上 |
| `fieldedit-add` | 値を追加（＋） | 同上 |
| `fieldedit-add-other` | 「その他」を追加 | 同上 |

## スタイル設定 (featurestyle)

| testID | 要素 | ファイル |
|---|---|---|
| `featurestyle-save` | 保存（ヘッダ右） | pages/LayerEditFeatureStyle.tsx |
| `featurestyle-width` | 太さスライダー | 同上 |
| `featurestyle-color-type` | カラータイプ Picker | 同上 |
| `featurestyle-outline` | 「輪郭のみ」チェック | 同上 |
| `featurestyle-field-name` | フィールド名 Picker | 同上 |
| `featurestyle-custom-field` | カスタムフィールド入力 | 同上 |
| `featurestyle-color-ramp` | カラーランプ Picker | 同上 |
| `featurestyle-single-color` | 単色の色選択 | pages/LayerEditFeatureStyle.tsx, organisms/FeatureStyleSingleColorSelect.tsx |
| `featurestyle-value-${i}` | 色分け表の値入力 | organisms/FeatureStyleColorTable.tsx |
| `featurestyle-color-${i}` | 色分け表の色セル | 同上 |
| `featurestyle-delete-${i}` | 色分け表の行削除 | 同上 |
| `featurestyle-reload` / `featurestyle-add` | 値の再読込 / 行追加 | 同上 |
| `featurestyle-gnss-quality-${quality}` | 測位品質の凡例行（quality=FIX_QUALITY の数値） | organisms/FeatureStyleGnssQualityLegend.tsx |

## データ一覧 (data)

`${i}` は並べ替え後のレコード集合上の位置（グループの子レコードは描画されないので番号が飛ぶことがある）。

| testID | 要素 | ファイル |
|---|---|---|
| `data-filter` | ヘッダ右の絞り込みボタン | pages/Data.tsx |
| `data-location-toggle` | 位置あり/なしスイッチ（辞書追加時） | pages/Data.tsx |
| `data-location-lock` | 位置 ON のロック | pages/Data.tsx |
| `data-dictionary-input` | 辞書からのデータ追加の入力欄（`-button`、`-suggestion-${i}`） | pages/Data.tsx |
| `data-filter-label` / `data-filter-count` | 絞り込み中の条件表示 / 件数 | pages/Data.tsx |
| `data-filter-show-on-map` | 絞り込み結果を地図に表示 | pages/Data.tsx |
| `data-filter-clear` | 絞り込み解除（×） | pages/Data.tsx |
| `data-add` (既存) | データ追加 | organisms/DataButton.tsx |
| `data-export` | エクスポート | organisms/DataButton.tsx |
| `data-delete` | 削除 | organisms/DataButton.tsx |
| `data-visible-all` | 見出しの全表示切替 | organisms/DataTable.tsx, DataTable.web.tsx |
| `data-check-all` | 見出しの全選択 | 同上 |
| `data-sort-_user_` | User 列の見出し（タップ=ソート、長押し=絞り込み） | 同上 |
| `data-sort-${field.name}` | 各列の見出し（タップ=ソート、長押し=絞り込み） | 同上 |
| `data-visible-${i}` | 行の表示切替 | 同上 |
| `data-check-${i}` | 行のチェック | 同上 |
| `data-user-${i}` | 行の User 列セル（編集画面へ） | 同上 |
| `data-row-${i}` (既存。Web 版にも追加) | 行の先頭フィールドのセル（編集画面へ） | 同上 |
| `data-cell-${i}-${fieldIndex}` | 行の2列目以降のセル（fieldIndex は1始まり） | 同上 |
| `data-filter-field-${fieldName}` | 絞り込みモーダルの対象列チップ（User 列は `_user_`） | organisms/DataModalFilter.tsx |
| `data-filter-input` | 絞り込みモーダルの入力欄 | organisms/DataModalFilter.tsx |
| `data-filter-blank` / `data-filter-not-blank` | 「空白」/「空白以外」で即適用 | organisms/DataModalFilter.tsx |
| `data-filter-candidate-${i}` | 候補値 | organisms/DataModalFilter.tsx |
| `data-filter-ok` / `data-filter-cancel` | OK / Cancel | organisms/DataModalFilter.tsx |
| `export-save` / `export-share` / `export-cancel` | エクスポート先モーダル（Android のみ）: デバイスに保存 / 共有 / キャンセル | organisms/ExportDestinationModal.tsx |

## データ編集 (dataedit)

| testID | 要素 | ファイル |
|---|---|---|
| `dataedit-save` (既存) | 保存 | pages/DataEdit.tsx |
| `dataedit-photo-processing` (既存) | 写真処理中の表示 | pages/DataEdit.tsx |
| `dataedit-modify-block` (既存) | 変更不可の理由表示 | pages/DataEdit.tsx |
| `dataedit-prev` / `dataedit-next` | 前 / 次のレコード | organisms/DataEditRecordSelector.tsx |
| `dataedit-record-number` | 「n/最大」表示 | organisms/DataEditRecordSelector.tsx |
| `dataedit-jump` | 表示（地図へジャンプ） | organisms/DataEditButtons.tsx |
| `dataedit-google-maps` | Googleマップで開く | organisms/DataEditButtons.tsx |
| `dataedit-edit-position` | 位置を編集 | organisms/DataEditButtons.tsx |
| `dataedit-copy` | 複製 | organisms/DataEditButtons.tsx |
| `dataedit-delete` (既存) | 削除 | organisms/DataEditButtons.tsx |
| `dataedit-username` / `dataedit-layername` | ユーザー名 / レイヤ名（読み取り専用） | organisms/DataEditUserName.tsx, DataEditLayerName.tsx |
| `dataedit-input-${field.name}` | 入力欄。文字・数値=TextInput、範囲=開始側、辞書=入力欄、LIST=Picker を開くタップ領域、日時=ネイティブはピッカーを開くタップ領域・Web はピッカーを包む View | organisms/DataEditString.tsx, DataEditNumber.tsx, DataEditNumberRange.tsx, DataEditDictionary.tsx, DataEditDynamicDictionary.tsx, DataEditList.tsx, DataEditDatetime(.web).tsx, DataEditTimeRange(.web).tsx |
| `dataedit-input-${field.name}-end` | NUMBERRANGE / TIMERANGE の終了側 | organisms/DataEditNumberRange.tsx, DataEditTimeRange(.web).tsx |
| `dataedit-input-${field.name}-button` | 辞書=マイク、動的辞書=候補を開くボタン | molecules/DictionaryTextInput.tsx, DynamicDictionaryTextInput.tsx |
| `dataedit-input-${field.name}-suggestion-${i}` | 辞書/動的辞書の候補 | 同上 |
| `dataedit-plus-${field.name}` / `dataedit-minus-${field.name}` | 整数・連番の ＋ / − | organisms/DataEditNumber.tsx |
| `dataedit-option-${field.name}-${i}` | LIST の選択肢（モーダル内、「その他」含む並び順）/ CHECK・RADIO の選択肢（「その他」を除く並び順） | organisms/DataEditList.tsx, DataEditCheck.tsx, DataEditRadio.tsx |
| `dataedit-option-${field.name}-other` | CHECK・RADIO の「その他」のチェック | organisms/DataEditCheck.tsx, DataEditRadio.tsx |
| `dataedit-input-${field.name}-other` | LIST・CHECK・RADIO の「その他」の入力欄 | organisms/DataEditList.tsx, DataEditCheck.tsx, DataEditRadio.tsx |
| `dataedit-coords-${latlonType}-decimal` | 経度/緯度の入力欄（十進）。latlonType は `longitude` / `latitude` | organisms/DataEditCoords.tsx |
| `dataedit-coords-${latlonType}-deg` / `-min` / `-sec` | 経度/緯度の度・分・秒 | organisms/DataEditCoords.tsx |
| `dataedit-coords-toggle-${latlonType}` | 十進⇔度分秒の切替 | organisms/DataEditCoords.tsx |
| `dataedit-gnss-info` | 外部GNSSの測位品質行 | organisms/DataEditGnssInfo.tsx |
| `dataedit-photo-camera` (既存) | 写真撮影 | organisms/DataEditPhoto.tsx |
| `dataedit-photo-library` (既存) | 写真選択 | organisms/DataEditPhoto.tsx |
| `dataedit-photo-thumb-${i}` (既存) | 写真サムネイル | organisms/DataEditPhoto.tsx |
| `dataedit-reference-add-${field.name}` | 参照データの＋ | organisms/DataEditReference.tsx |
| `dataedit-reference-dictionary-${field.name}` | 参照先への辞書追加の入力欄（`-button`、`-suggestion-${i}`） | organisms/DataEditReference.tsx |
| `dataedit-reference-row-${field.name}-${i}` | 参照データの行 | organisms/DataEditReference.tsx |
| `dataedit-table-add-${field.name}` | TABLE / LISTTABLE の行追加＋ | organisms/DataEditTable.tsx, DataEditListTable.tsx |
| `dataedit-table-input-${field.name}-${row}-${col}` | TABLE のセル入力欄 | organisms/DataEditTable.tsx |
| `dataedit-table-select-${field.name}-${row}` | LISTTABLE の選択 Picker（選択肢は `...-option-${i}`） | organisms/DataEditListTable.tsx |
| `dataedit-table-input-${field.name}-${row}` | LISTTABLE の値入力欄 | organisms/DataEditListTable.tsx |
| `dataedit-table-delete-${field.name}-${row}` | TABLE / LISTTABLE の行削除− | organisms/DataEditTable.tsx, DataEditListTable.tsx |
| `photo-view-close` (既存) | 写真表示: 閉じる | organisms/DataEditModalPhotoView.tsx |
| `photo-view-download` (既存) | 写真表示: ダウンロード | organisms/DataEditModalPhotoView.tsx |
| `photo-view-delete` | 写真表示: 写真を削除 | organisms/DataEditModalPhotoView.tsx |
| `photo-view-counter` | 写真表示: 「n / 枚数」 | organisms/DataEditModalPhotoView.tsx |

## 地図一覧 (maps) / 地図リスト (maplist) / 地図編集 (mapedit)

| testID | 要素 | ファイル |
|---|---|---|
| `maps-row-${i}` | 地図名のタップ領域（地図=範囲へ移動、グループ=開閉） | organisms/MapTable.tsx, MapTable.web.tsx |
| `maps-expand-${i}` | グループ行の開閉ボタン | 同上 |
| `maps-visible-${i}` | 表示/非表示 | 同上 |
| `maps-download-${i}` | PDF 地図のダウンロード | 同上 |
| `maps-edit-${i}` | 編集（鉛筆） | 同上 |
| `maps-up-${i}` / `maps-down-${i}` | 上へ / 下へ | 同上 |
| `maps-import` | インポート | organisms/MapButttons.tsx |
| `maps-add-group` | グループ作成 | organisms/MapButttons.tsx |
| `maps-add` | 地図追加 | organisms/MapButttons.tsx |
| `maps-toggle-online` | オンライン/オフライン切替（ネイティブのみ） | pages/Maps.tsx |
| `maps-goto-download` | ダウンロード画面へ（ネイティブのみ） | pages/Maps.tsx |
| `maplist-add-${i}` | 地図リスト: 地図を追加（＋） | organisms/MapListTable.tsx |
| `maplist-reload` | 地図リスト: 再読込 | organisms/MapListButtons.tsx |
| `mapedit-save` | 保存（ヘッダ右） | pages/MapEdit.tsx |
| `mapedit-name` / `mapedit-url` / `mapedit-attribution` / `mapedit-style-url` | 名前 / URL / 出典 / スタイルURL 入力 | pages/MapEdit.tsx |
| `mapedit-preset` | プリセット選択（▼） | pages/MapEdit.tsx |
| `mapedit-transparency` / `mapedit-fix-zoom` | 透過率 / 固定ズームのスライダー | pages/MapEdit.tsx |
| `mapedit-high-resolution` / `mapedit-flip-y` / `mapedit-vector` | 高解像度 / Y軸反転 / ベクタタイルのチェック | pages/MapEdit.tsx |
| `mapedit-import-style` | スタイルファイル読込 | pages/MapEdit.tsx |
| `mapedit-export` / `mapedit-delete` | エクスポート / 削除 | pages/MapEdit.tsx |

## 設定 (settings)

| testID | 要素 | ファイル |
|---|---|---|
| `settings-file-open` / `settings-file-save` | 開く / 保存 | pages/Settings.tsx |
| `settings-pdf` | PDF 出力 | pages/Settings.tsx |
| `settings-clear-data` | 新規（データ初期化） | pages/Settings.tsx |
| `settings-backup-restore` | バックアップから復元（ネイティブのみ） | pages/Settings.tsx |
| `settings-gps` | GPS 設定（ネイティブのみ） | pages/Settings.tsx |
| `settings-proximity-alert` | 接近通知（ネイティブのみ） | pages/Settings.tsx |
| `settings-clear-cache` | キャッシュ削除 | pages/Settings.tsx |
| `settings-language` | 言語 | pages/Settings.tsx |
| `settings-manual` / `settings-oss-license` / `settings-version` | マニュアル / OSSライセンス / バージョン | pages/Settings.tsx |
| `settings-<項目>-icon` | 上記各行の左アイコンボタン | molecules/TextButton.tsx |
| `settings-backup-row-${i}` | バックアップ選択の行 | organisms/SettingsModalBackupSelect.tsx |
| `settings-backup-delete-${i}` / `settings-backup-delete-all` / `settings-backup-cancel` | 1件削除 / すべて削除 / Cancel | organisms/SettingsModalBackupSelect.tsx |
| `settings-filesave-name` | ファイル名入力 | organisms/SettingsModalFileSave.tsx |
| `settings-filesave-include-photo` | 写真を含めるチェック | organisms/SettingsModalFileSave.tsx |
| `settings-filesave-ok` / `settings-filesave-cancel` | OK / Cancel | organisms/SettingsModalFileSave.tsx |
| `settings-language-option-${value}` | 言語の選択肢（value=言語コード、システム既定は `system`） | organisms/SettingsModalLanguageSelect.tsx |
| `settings-language-cancel` | Cancel | organisms/SettingsModalLanguageSelect.tsx |
| `settings-maplisturl-input` | 地図リストURL入力 | organisms/SettingsModalMapListURL.tsx |
| `settings-maplisturl-ok` / `-cancel` / `-reset` | OK / Cancel / リセット | organisms/SettingsModalMapListURL.tsx |
| `settings-proximity-enabled` | 接近通知の有効スイッチ | organisms/SettingsModalProximityAlert.tsx |
| `settings-proximity-distance-${distance}` | 通知距離の選択肢（メートル値） | organisms/SettingsModalProximityAlert.tsx |
| `settings-proximity-layer-${i}` | 対象レイヤのチェック | organisms/SettingsModalProximityAlert.tsx |
| `settings-proximity-ok` / `settings-proximity-cancel` | OK / Cancel | organisms/SettingsModalProximityAlert.tsx |
| `settings-storage-option-${choice}` | 保存先/読込元の選択肢（choice=内部値） | organisms/SettingsModalStorageSelect.tsx |
| `settings-storage-cancel` | キャンセル | organisms/SettingsModalStorageSelect.tsx |

## GPS 設定 (gpssettings)

| testID | 要素 | ファイル |
|---|---|---|
| `gpssettings-accuracy-${high\|medium\|low}` | 精度カード | pages/GpsSettings.tsx |
| `gpssettings-gnss-link-status` | 外部GNSS接続状態 | organisms/GpsSettingsExternalGnss.tsx |
| `gpssettings-gnss-disconnect` | 切断 | 同上 |
| `gpssettings-gnss-usb-refresh` | USB 機器の更新 | 同上 |
| `gpssettings-gnss-usb-connect-${i}` | USB 機器へ接続 | 同上 |
| `gpssettings-gnss-ble-scan` | BLE スキャン | 同上 |
| `gpssettings-gnss-ble-connect-${i}` | BLE 機器へ接続 | 同上 |
| `gpssettings-gnss-receiver-edit` / `gpssettings-gnss-ntrip-edit` | 受信機設定 / NTRIP 設定の編集 | 同上 |
| `gpssettings-gnss-ntrip-enabled` | NTRIP 有効スイッチ | 同上 |
| `gpssettings-ntrip-host` / `-port` / `-username` / `-password` / `-mountpoint` / `-gga-interval` | NTRIP 各入力欄 | organisms/GpsSettingsModalNtrip.tsx |
| `gpssettings-ntrip-fetch-mountpoints` | マウントポイント取得 | 同上 |
| `gpssettings-ntrip-mountpoint-option-${i}` | マウントポイント候補 | 同上 |
| `gpssettings-ntrip-version-${v1\|v2}` | NTRIP バージョン | 同上 |
| `gpssettings-ntrip-send-gga` | GGA 送信スイッチ | 同上 |
| `gpssettings-ntrip-ok` / `gpssettings-ntrip-cancel` | OK / キャンセル | 同上 |
| `gpssettings-receiver-antenna-height` | アンテナ高入力 | organisms/GpsSettingsModalReceiver.tsx |
| `gpssettings-receiver-track-mode-${mode}` | 軌跡記録モード | 同上 |
| `gpssettings-receiver-track-distance-${d}` | 軌跡間引き距離（m） | 同上 |
| `gpssettings-receiver-advanced` | 詳細設定の開閉 | 同上 |
| `gpssettings-receiver-baud-rate-${rate}` | ボーレート | 同上 |
| `gpssettings-receiver-ok` / `gpssettings-receiver-cancel` | OK / キャンセル | 同上 |

## 軌跡サマリー (tracksummary)

| testID | 要素 | ファイル |
|---|---|---|
| `tracksummary-replay` | 再生/一時停止 | pages/TrackSummary.tsx |
| `tracksummary-export` | エクスポート | pages/TrackSummary.tsx |
| `tracksummary-photo-toggle` | 写真表示切替 | pages/TrackSummary.tsx |
| `tracksummary-select-more-photos` | 写真をさらに選択（iOS 限定アクセス時） | pages/TrackSummary.tsx |
| `tracksummary-stat-${key}` | 統計カード（key は statItems の key） | pages/TrackSummary.tsx |
| `tracksummary-chart` | 標高グラフのコンテナ | organisms/TrackSummaryChart.tsx |

## アカウント (account) / アカウント設定 (accountsettings)

ログアウトは Account 画面ではなくホームのアカウントメニュー（`home-account-logout`）。

| testID | 要素 | ファイル |
|---|---|---|
| `account-close` | 閉じる× | pages/Account.tsx |
| `account-title` | 画面モードのタイトル | pages/Account.tsx |
| `account-connect-google` | Google 連携 | pages/Account.tsx |
| `account-org-login` | 組織アカウントでログインへ | pages/Account.tsx |
| `account-email` | メール入力 | pages/Account.tsx |
| `account-password` | パスワード入力（ログイン・登録・変更後の新パスワード・削除確認など） | pages/Account.tsx |
| `account-pin` | PIN 入力（登録/バックアップ/復元/移行、PIN 変更の新PIN） | pages/Account.tsx |
| `account-old-password` / `account-old-pin` | 旧パスワード / 旧PIN | pages/Account.tsx |
| `account-toggle-password` / `account-toggle-old-password` | 目アイコン（表示切替） | pages/Account.tsx |
| `account-display-name` / `account-photo-url` | 表示名 / アイコンURL | pages/Account.tsx |
| `account-message` | エラーメッセージ | pages/Account.tsx |
| `account-reset-password` | パスワードを忘れた（ログイン時） | pages/Account.tsx |
| `account-reset-encrypt-key` | PIN を忘れた（復元/バックアップ時） | pages/Account.tsx |
| `account-goto-signup` | アカウント作成へのリンク（ログイン時） | pages/Account.tsx |
| `account-login` / `account-signup` / `account-submit` | 「次へ」ボタン（ログイン / 登録 / その他のモード） | pages/Account.tsx |
| `account-back-to-select` | ログイン方法選択へ戻る | pages/Account.tsx |
| `accountsettings-back` | 戻る | pages/AccountSettings.tsx |
| `accountsettings-account-edit` | プロフィール変更 | pages/AccountSettings.tsx |
| `accountsettings-password-change` | パスワード変更 | pages/AccountSettings.tsx |
| `accountsettings-encryption-password-change` | 暗号化PIN変更 | pages/AccountSettings.tsx |
| `accountsettings-encryption-key-reset` | 暗号化キーのリセット | pages/AccountSettings.tsx |
| `accountsettings-account-delete` | アカウント削除 | pages/AccountSettings.tsx |
| `accountsettings-project-delete-all` | 全プロジェクト削除（Web のみ） | pages/AccountSettings.tsx |
| `accountsettings-<項目>-icon` / `-info` | 各行の左アイコン / 情報(i)ボタン | molecules/TextButton.tsx |

## プロジェクト一覧 (projects) / プロジェクト編集 (projectedit)

| testID | 要素 | ファイル |
|---|---|---|
| `projects-back` | 戻る | pages/Projects.tsx |
| `migrate-dek-projects` (既存) | DEK 一括移行（Web） | pages/Projects.tsx |
| `check-stale-keys` (既存) | 暗号化キー再共有チェック | pages/Projects.tsx |
| `toggle-show-archive` (既存) | アーカイブを含む切替（Web） | pages/Projects.tsx |
| `projects-filter-favorites` | ヘッダの★（お気に入りのみ） | pages/Projects.tsx |
| `projects-sort-name` / `-abstract` / `-updated-at` / `-owner` / `-storage` / `-archived` | 列ヘッダ（並べ替え） | pages/Projects.tsx |
| `projects-row-${i}` | 行全体 | pages/Projects.tsx |
| `projects-favorite-${i}` | 行の★ | pages/Projects.tsx |
| `project-${i}` (既存) | プロジェクト名 | pages/Projects.tsx |
| `archive-toggle-${i}` (既存) | アーカイブ/復元（Web） | pages/Projects.tsx |
| `projects-reload` | 再読込 | organisms/ProjectsButtons.tsx |
| `projects-add` | 新規作成（Web） | organisms/ProjectsButtons.tsx |
| `projects-encrypt-pin` | PIN 入力モーダルの入力欄 | organisms/ProjectsModalEncryptPassword.tsx |
| `projects-encrypt-ok` / `projects-encrypt-cancel` | OK / Cancel | organisms/ProjectsModalEncryptPassword.tsx |
| `reshare-candidate-${uid}` (既存) | 再共有候補の行 | organisms/ProjectsModalReshareKeys.tsx |
| `reshare-keys-ok` (既存) | 再共有実行 | organisms/ProjectsModalReshareKeys.tsx |
| `reshare-keys-cancel` | キャンセル | organisms/ProjectsModalReshareKeys.tsx |
| `projectedit-back` | 戻る | pages/ProjectEdit.tsx |
| `projectedit-save` | 保存（ヘッダ右） | pages/ProjectEdit.tsx |
| `projectedit-name` / `projectedit-abstract` | プロジェクト名 / 概要入力 | pages/ProjectEdit.tsx |
| `projectedit-member-add` | メンバー追加の入力欄（編集終了で追加） | pages/ProjectEdit.tsx |
| `projectedit-member-email-${i}` | メンバーのメール入力 | organisms/ProjectEditMembers.tsx |
| `projectedit-member-admin-${i}` | 管理者チェック | organisms/ProjectEditMembers.tsx |
| `projectedit-member-delete-${i}` | メンバー削除（−） | organisms/ProjectEditMembers.tsx |
| `projectedit-member-menu-${i}` | ⋮メニュー（DEK方式のみ） | organisms/ProjectEditMembers.tsx |
| `projectedit-member-reshare-key-${i}` | メニュー内「暗号化キーの再共有」 | organisms/ProjectEditMembers.tsx |
| `projectedit-open` | 開く | organisms/ProjectEditButtons.tsx |
| `projectedit-setting` / `projectedit-data-manage` / `projectedit-export` | 設定 / データ管理 / エクスポート（Web） | organisms/ProjectEditButtons.tsx |
| `projectedit-delete` | 削除（Web・オーナー） | organisms/ProjectEditButtons.tsx |

## クラウドデータ管理 (clouddata) / Google Drive (gdrive) / ライセンス (licenses)

| testID | 要素 | ファイル |
|---|---|---|
| `clouddata-back` | 戻る | pages/CloudDataManagement.tsx |
| `clouddata-select-all` | すべて選択 | pages/CloudDataManagement.tsx |
| `clouddata-delete` | 選択を削除 | pages/CloudDataManagement.tsx |
| `clouddata-layer-${i}` | レイヤ行（展開） | organisms/CloudDataList.tsx |
| `clouddata-layer-check-${i}` | レイヤ行のチェック | organisms/CloudDataList.tsx |
| `clouddata-data-${i}-${j}` | データ行（i=レイヤ、j=データ） | organisms/CloudDataList.tsx, CloudDataListItem.tsx |
| `gdrive-connect` | Google Drive に接続 | pages/GoogleDriveProjects.tsx |
| `gdrive-reload` | 再読込 | pages/GoogleDriveProjects.tsx |
| `gdrive-disconnect` | 接続解除 | pages/GoogleDriveProjects.tsx |
| `gdrive-save` | Drive へ保存 | pages/GoogleDriveProjects.tsx |
| `gdrive-row-${i}` | ファイル行 | pages/GoogleDriveProjects.tsx |
| `gdrive-load-${i}` / `gdrive-delete-${i}` | 読み込み / 削除 | pages/GoogleDriveProjects.tsx |
| `gdrive-save-name` | 保存名入力 | organisms/GoogleDriveModalSaveName.tsx |
| `gdrive-save-ok` / `gdrive-save-cancel` | OK / Cancel | organisms/GoogleDriveModalSaveName.tsx |
| `licenses-row-${i}` | パッケージ名の行 | pages/Licenses.tsx |

## 注意（ID が届かない・取り方に工夫が要る要素）

- **Web のズーム＋/−**: Web は maplibre 標準の NavigationControl を使うため `home-zoom-in` / `home-zoom-out` は DOM に出ない。`.maplibregl-ctrl-zoom-in` / `.maplibregl-ctrl-zoom-out` で取る。
- **Web の日時ピッカー**: MUI の入力欄そのものではなく、包んでいる View に `dataedit-input-${field.name}` が付く。`getByTestId(...).locator('input')` で中をたどる。
- **ネイティブの日時ピッカー**: 開くタップ領域のみ。ホイールや OK/キャンセルはネイティブ UI で ID なし。
- **色ピッカー本体**（reanimated-color-picker / react-color）: ライブラリ部品のため ID なし。
- **`layeredit-preset` / `mapedit-preset`**: ModalSelector 外側のタッチ領域には渡せないため、内側の▼アイコンの枠に付けている。
- **写真ボタン**: `dataedit-photo-camera` などはフィールド名を含まない（既存 ID 維持）。PHOTO フィールドが複数あると画面内で重複する。
- **ネイティブの一覧**（`layers-*-${i}` `maps-*-${i}`）: 番号は DraggableFlatList の `getIndex()` 由来。
- **iOS のモーダル**: 親 Pressable に `accessible={false}` が無いモーダルは、Maestro から中の ID を個別に取れないことがある。
