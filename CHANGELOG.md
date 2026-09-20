# Change Log

## [0.6.1]　- 2026-09-20

- Added a group creation button to the map and layer lists, with a dialog for entering the group name. Map groups can now also be deleted from the settings screen
- Improved drawing tool buttons to stay visible and greyed out instead of disappearing while editing, so it is clear which tools are unavailable and how to get back
- Improved the map-move button into a toggle that returns to the previous tool, and kept the confirm/cancel bar visible while the map is being moved
- Improved tool buttons and tool palettes to be disabled while a lasso selection is being moved or rotated, and while a standalone behavior position is being placed
- Improved two-finger map operation to be ignored while an unsaved drawing is on screen, so work in progress is never lost to an accidental pinch
- Improved flight-record symbols and line arrows to be sized by a fixed reference zoom, so symbols drawn at different zoom levels no longer appear at different sizes
- Improved flight-record drawing so behavior positions can only be placed on the flight line when a line is present, and symbols attached to a line select the line instead of themselves
- Removed map memo line editing by long press: lines are now corrected with the partial eraser and redrawing, which is safer and easier to follow
- Improved the encryption PIN to accept six or more digits when newly set (existing four-digit PINs continue to work)
- Improved sessions where the encryption key was never registered to guide the user to the registration form instead of showing an error
- Improved project saving so that members who have not signed up yet or have deleted their account can be kept as pending without blocking the save, with their status rechecked when the settings screen is opened
- Improved the account creation password field to work with the browser's password generator and the iOS keychain suggestion
- Improved the Android release build with code shrinking enabled, and replaced the encryption native libraries with 16 KB page size compatible builds
- Fixed the object being edited disappearing (leaving only the confirm button) when the map was touched with two fingers during plot editing
- Fixed an unsaved drawing staying hidden after a map-move tap, a zoom button, or a pinch
- Fixed an unsaved drawing being redrawn at the wrong position after the map was moved
- Fixed an unsaved drawing being silently discarded when track recording was started while drawing
- Fixed the "Discard changes?" confirmation appearing when there was nothing to discard
- Fixed the confirm/cancel bar disappearing after undo/redo while editing a point
- Fixed a record being saved without a location when the coordinates had not been finalized, and fixed the record link being lost when editing the location of a record with no location
- Fixed serial numbering restarting from 1, by numbering from the maximum value instead of the last record
- Fixed taps in editing selection being treated as a lasso when the finger moved slightly
- Fixed behavior symbols being left behind when the flight line was redrawn before saving
- Fixed the mating (star) symbol being drawn off the recorded position
- Fixed the pen settings of the flight-record palette remaining after switching to a normal line layer
- Fixed crashes and data corruption in undo/redo (out-of-range access, and bulk transform undo rewriting unrelated features)
- Fixed map memo strokes waiting to be saved being lost or saved late when the eraser or undo was used
- Fixed drawing history and unsaved drawings being carried over when switching projects
- Fixed several display inconsistencies while drawing (polygon fill disappearing with the map-move tool, leftover ghost dashed lines, lines staying grey)

- 地図・レイヤ一覧にグループ作成ボタンを追加（名前を入力して直接作成。地図グループは設定画面から削除できるようにも改善）
- 作図の道具ボタンを、編集中に消すのではなくグレーで無効表示するように改善（今使えない道具と戻り方が分かるように）
- 地図移動ボタンをトグル化し、もう一度押すと元の道具へ戻るように改善。地図移動中も確定・キャンセルバーを表示
- なげなわで選んで移動・回転している間と、単独の行動位置を置いている間は、関係のないボタンとツールパレットを無効にするように改善
- 描きかけがある間は2本指の地図操作を無効にし、誤ったピンチで未保存の内容が失われないように改善
- 行動記号と飛翔線の矢印の大きさを基準ズームで決めるように改善（どのズームで描いても同じ大きさになる）
- 飛翔線があるときは線の上にだけ行動位置を置けるように改善。線に付いた記号をタップしたときはその飛翔線が選ばれる
- マップメモの長押しによる線の編集を廃止（誤爆で既存の線が切り詰められるため。修正は部分消去＋描き足しに一本化）
- 暗号化パスワード（PIN）を新規設定時に6桁以上で設定できるように改善（既存の4桁PINはそのまま使えます）
- 暗号化キーの登録を完了していない場合に、エラー表示ではなく登録フォームへ誘導するように改善
- アカウント未登録・退会済みのメンバーがいても「保留」のままプロジェクトを保存できるように改善（設定画面を開いたときに登録状況を再チェック）
- アカウント作成のパスワード欄でブラウザのパスワード自動生成やiOSキーチェーンの提案を使えるように改善
- Androidのリリースビルドでコードの難読化を有効にし、暗号化ライブラリを16KBページ対応版に差し替え
- プロット編集中に2本指で地図を触ると編集中のオブジェクトが消え、確定ボタンだけが残る問題を修正
- 地図移動のタップ・ズームボタン・ピンチのあとに描きかけが非表示のまま固着する問題を修正
- 地図を移動したあとに描きかけの表示位置がずれる問題を修正
- 作図中に軌跡の記録を開始すると描きかけが黙って破棄される問題を修正
- 破棄するものが無いのに「変更を破棄しますか？」が出る問題を修正
- ポイントの編集中に元に戻す・やり直すをすると確定・キャンセルバーが消える問題を修正
- 座標が未確定のまま保存されて位置なしレコードができる問題と、位置なしレコードの位置編集中にレコードの紐付きが失われる問題を修正
- 連番（SERIAL）の採番が1に戻る問題を修正（末尾レコード基準から最大値＋1へ変更）
- 編集選択で指がわずかに揺れるとタップがなげなわ扱いになり選択できない問題を修正
- 確定前に飛翔線を描き直すと行動記号が取り残される問題を修正
- 交尾（★）の記号が記録位置からずれて描かれる問題を修正
- 飛翔図のレイヤから普通のラインレイヤへ移ってもペンの設定（矢印・太さ・色）が残る問題を修正
- 元に戻す・やり直すでのクラッシュと、一括変形の取り消しで無関係の地物の座標が書き換わる問題を修正
- マップメモの保存待ちの線が、消しゴムや元に戻すの操作で失われたり後から保存されたりする問題を修正
- プロジェクトを切り替えたときに作図の履歴と描きかけが持ち越される問題を修正
- 作図中の表示の不整合を修正（地図移動ツールでポリゴンの塗りが消える、指の軌跡の破線が残る、線が灰色のままになる）

## [0.6.0]　- 2026-09-17

- Added personal project management using Google Drive
- Added unified login with two methods: Google account link and organization account
- Removed the feature purchase and license restrictions
- Added member addition by project admins with a new encryption key scheme, including key recovery paths
- Added migration of existing projects to the new encryption key scheme (bulk migration, and automatic migration when opening a project)
- Changed the encryption key protection to EcorisMap's own infrastructure: public keys are kept in a Firestore ledger and the key backup is protected by a PIN with server-side rate limiting (Cloud KMS), removing the dependency on the Virgil service. Existing users are migrated automatically at sign-in and keep their current PIN
- Improved the encryption PIN to require 6 digits when newly set or changed
- Added automatic guidance to key restore when signing in on a device without a local key, with a consistency check between local keys and the ledger
- Added a "re-share required" badge in project member settings for members who have reset their encryption key
- Improved sign-out to delete the local encryption keys
- Added automatic backup before data deletion and a restore feature, with individual and bulk deletion of backups
- Changed backup file extension to standard .zip (deprecated the .ecorismap extension)
- Changed data upload to a generation-based scheme, removing the 5 MB per-user limit, with guidance to delete old tracks when data grows too large
- Added a one-tap location on/off toggle when adding data from the dictionary in the data list. The toggle is off by default, turns itself off again once a record is saved with a location, and opens that record's edit screen so the remaining fields can be filled in. A warning is shown if the toggle is on but GPS is off. A lock button keeps the toggle on for continuous recording
- Improved the data list to shade the rows of records that have no location, so records with a location stand out
- Added a filter to the data list: an entry button, an optional target column, filtering by blank values, candidate selection, a User column for shared projects, and a button to show only the filtered records on the map
- Added elevation and coordinates (with tap-to-copy) to the long-press and POI popups
- Added straight-line distance from the current location to the long-pressed point in the map popup when GPS is on
- Added hillshade with omnidirectional shading (SVF) and red relief map styles, unified across iOS, Android, and Web
- Added preset selection to map and layer editing, including terrain visualization presets
- Added a relief:// map protocol (alongside hillshade://) that renders color relief with omnidirectional shading and burned-in depth contours from elevation tiles, unified across iOS, Android, and Web
- Changed the hillshade preset source to the GSJ integrated land-sea DEM so seafloor terrain is also shaded (sea data is reliable up to z8; above that the sea shading degrades or becomes transparent while land stays accurate up to z15)
- Added a global GEBCO seafloor relief preset that reproduces shiwaku's gebco-2025-grid-tile-on-maplibre demo. On web it uses the same MapLibre layer stack as the demo (color-relief, hillshade, maplibre-contour depth contours with numeric labels, and island/undersea feature names from MSIL); on iOS/Android it renders a close raster approximation of the relief and contour lines, with place names and contour labels shown as crisp upright markers
- Added support for GSJ elev2 elevation sources (512px WebP tiles, e.g. Cabinet Office Nankai Trough bathymetry up to z11) in the relief:// protocol via manual URL entry
- Added pause and resume for map tile downloads
- Added a viewshed tool that shows the visible area from a chosen point as a temporary overlay, with elevation data attribution and offline DEM tile download
- Added a distance measurement tool between two points
- Added a track summary screen with statistics and an elevation graph, also available live while recording
- Added automatic photo display along tracks: photos taken during recording appear on the track, overlapping photos are grouped and expand on tap, and a full-screen viewer supports swiping between photos
- Added a pass-time popup when tapping a track (iOS, Android, and Web)
- Added more track export formats: GPX with photo waypoints, photo-point CSV/GeoJSON, KMZ for Google Earth including the track, and SVG export of the summary statistics and graph
- Added track layer sharing: the sharing scope can be changed in layer settings, and per-user coloring switches automatically when sharing is turned on or off
- Added a freehand pen tool to the LINE and POLYGON tabs, unifying handwriting and plotted drawing, with a style modal and two-way conversion between handwritten and plotted shapes
- Added lasso selection with bulk move, rotate, and delete for points, lines, polygons, and map memos
- Added Redo to the drawing tools, with Undo/Redo buttons indicating when they are unavailable
- Added a partial eraser tool for map memos
- Added an option to link map memo stroke width to the zoom level
- Added an editing-layer button at the top of the map screen that shows the current target layer, switches layers, and asks for a layer when none is selected
- Added purpose-specific tool palettes for the editing layer (vegetation classification palette, flight-record palette)
- Added flight-record drawing with preselected attributes and behavior symbols: symbols follow line edits, behaviors can be deleted individually, and behavior symbols are linked to the record's attribute fields
- Added linking of choice values and codes as a layer setting
- Added a language switch to the settings screen
- Added project archiving, with sorting by owner and archive status in the project list (the ordering is kept after navigating away)
- Improved track recording reliability and battery consumption during long recordings
- Improved GPS on/off responsiveness, follow mode, and notification behavior
- Improved GPS settings to open inside the bottom sheet
- Improved map rendering performance with large datasets
- Improved responsiveness with large numbers of records and fields
- Improved upload speed by removing an unnecessary data re-download during conflict detection
- Improved group display design in the layer and map lists
- Improved account-related screen navigation
- Improved dictionary voice input (updated to Expo 56 / React Native 0.85)
- Improved hillshade to fall back to coarser zoom levels where elevation tiles are unavailable
- Improved export file names to include the layer name
- Improved drawing precision: coordinates are now the source of truth and only edited vertices are updated, so repeated editing no longer degrades shapes
- Improved freehand drawing to convert to coordinates continuously, so the map can be panned and zoomed while drawing
- Improved map memo pen drawing: latitude/longitude based (strokes survive pinch and zoom), stroke stabilization, and smoothing with simplification on save
- Improved map memo tools into a single button with tab-integrated settings (first tap opens settings, later taps toggle the tool)
- Improved freehand editing to smooth connection points and polygon closures automatically based on the stroke angle
- Improved number, letter, and text stamps to draw the record's label
- Improved the vegetation preset: the classification field is now first with a dedicated palette, and the reselect flow was streamlined
- Improved confirmation dialogs with a redesigned custom modal style
- Improved the compass button into a compass-rose design that also rotates in north-up mode, with the bearing line toggled by a long press and faster map rotation
- Improved map tiles to fall back to cached tiles when the connection is poor
- Improved the map download limit from a fixed zoom level to an estimated tile count
- Improved the Web 3D terrain elevation tiles (moved to Mapterhorn)
- Improved layer settings: "Permission" is renamed to "Sharing scope" with explanations, and fields are reordered with up/down buttons
- Improved the saving flow to return to the previous screen after saving, with a unified save destination selection
- Improved import validation (SQLite table names, GeoJSON coordinates)
- Fixed lines and polygons being hidden under tile maps on Android
- Fixed the current location showing a stale cached position on iOS
- Fixed data loss when uploading from multiple devices with the same account
- Fixed backup zip files failing to extract on Windows with long layer names
- Fixed record numbering when adding data while columns are sorted
- Fixed the dictionary input box appearing on layers without a dictionary field
- Fixed an issue where the downloaded area was not saved per map in bulk map download
- Fixed an issue where a feature was selected at the same time as the long-press popup
- Fixed project update dates being overwritten by the encryption key scheme migration
- Fixed another user's automatic backup being restorable while signed in as a different user
- Fixed decryption not recovering until re-login after an encryption key was re-shared
- Fixed encryption groups remaining for archived projects when an account was deleted
- Fixed the map download area not following map panning on iOS
- Fixed the current location marker appearing very small on Android
- Fixed the update date in the project list not refreshing after saving project settings
- Fixed the bearing line jittering in compass mode and not appearing on iOS
- Fixed group data failing to decrypt because of an internal identity mix-up
- Fixed canceling the encryption key restore at sign-in leaving the screen looking signed in
- Fixed the key restore dialog showing "6 digits" for users with a 4-digit PIN
- Fixed location sharing not uploading at the intended 60-second interval
- Fixed users without a registered color appearing transparent in per-user coloring
- Fixed markers at identical coordinates flickering and per-frame marker redraws causing high CPU and battery drain on iOS
- Fixed a crash when tapping a track containing Live Photos on iOS, and Live Photo previews in the photo viewer
- Fixed map memos overwriting the layer's color and label settings
- Fixed PDF output when relief:// maps are shown and at high zoom levels
- Fixed PMTiles with encoded URLs not displaying on iOS
- Fixed the scale bar length when the map is rotated
- Fixed export on Android saving to Download even when canceled
- Fixed CSV import leaving values unset when columns are missing
- Fixed values disappearing when changing a field format to check, list, or radio
- Fixed a crash when clicking records with unset values
- Fixed columns added later showing "Invalid Date" or 0
- Fixed dynamic dictionary input not being confirmed with Enter on Web
- Fixed dialogs not appearing during or right after modals on iOS
- Fixed saving while the keyboard is open on iOS and bottom-sheet closing issues
- Fixed dictionary candidate selection needing a double tap while the keyboard is open
- Fixed serial numbering breaking when dragging rows while sorted
- Fixed objects drawn right after clearing data being saved at their initial position
- Fixed template data not being selectable for editing on the map
- Fixed two-finger touches adding stray points while drawing
- Fixed polygons with individual colors rendering black on Web
- Fixed the GPX export timezone and element order
- Fixed a GPS permission alert appearing on every tab return on Web
- Added usage analytics (Firebase Analytics)
- Other minor bug fixes

- Google Drive による個人プロジェクト管理機能を追加
- ログイン機能を単一ビルドに統合し、Google 連携と組織アカウントの 2 系統ログインに対応
- 機能購入とライセンス制限を廃止
- 管理者によるメンバー追加を新しい暗号鍵方式で追加（鍵喪失時の復旧経路も追加）
- 既存プロジェクトを新しい暗号鍵方式へ移行する機能を追加（一括移行と、プロジェクトを開いたときの自動移行）
- 暗号鍵の保護方式を自前基盤へ移行（公開鍵は Firestore の台帳で管理、鍵バックアップは PIN ＋サーバー側レート制限（Cloud KMS）で保護）。Virgil サービスへの依存を解消。既存ユーザーはログイン時に自動移行され、これまでの PIN を継続利用可能
- 暗号化 PIN を新規設定・変更時に 6 桁必須に強化
- ローカル鍵がない端末でのログイン時に鍵復元へ自動誘導し、残存鍵は台帳との整合チェックを実施
- 鍵をリセットしたメンバーにプロジェクト設定で「要再共有」バッジを表示
- ログアウト時にローカルの暗号化キーを削除するように改善
- データ破棄直前の自動バックアップと復元機能を追加（バックアップの個別・一括削除にも対応）
- 保存ファイルの拡張子を標準的な zip に統一（ecorismap 拡張子を廃止）
- データアップロードを世代方式に変更し 5MB 上限を撤廃（サイズ超過時は古い軌跡の削除を案内）
- データ一覧に辞書からのデータ追加時の位置あり/なしワンタッチ切替トグルを追加
- データ一覧で位置なしレコードの行を薄色表示し、位置ありレコードを見分けやすく改善
- データ一覧に絞り込み機能を追加（入口ボタン・対象列選択・空白フィルタ・候補選択・共有プロジェクトの User 列・絞り込んだレコードのみ地図表示）
- 長押し・POI ポップアップに標高と緯度経度（タップでコピー）を表示するように追加
- GPS が ON のとき、地図長押しのポップアップに現在地からの直線距離を表示するように追加
- 陰影起伏図を全方位対応（SVF）に刷新し、赤色立体地図などの表現を追加（iOS / Android / Web で同じ方式に統一）
- 地図・レイヤ編集にプリセット選択機能を追加（立体図のプリセットを含む）
- 標高タイルから全方位陰影付きカラー段彩と等深線を描く relief:// 地図プロトコルを追加（iOS / Android / Web 共通）
- 陰影起伏図プリセットの標高源を産総研の陸海統合 DEM に変更し、海底地形も陰影表示（海域のデータは z8 まで有効）
- GEBCO の全球海底地形図プリセットを追加（カラー段彩・陰影・数値ラベル付き等深線・海底地形名を表示）
- relief:// で GSJ elev2 形式の標高タイル（512px WebP、内閣府南海トラフ海底地形など）に対応
- 地図タイルダウンロードの中断・再開機能を追加
- 可視領域（ビューシェッド）作成機能を追加（一時表示・標高データ出典表示・DEM タイルのオフラインダウンロード対応）
- 二点間の距離測定機能を追加
- 軌跡サマリー画面（統計と標高グラフ）を追加。記録中もライブ表示可能
- 軌跡上に撮影した写真を自動表示（重なる写真はグループ化しタップで展開、拡大表示は左右スワイプで切替）
- 軌跡タップで通過時刻をポップアップ表示（iOS / Android / Web）
- 軌跡エクスポートを拡充（写真ウェイポイント付き GPX、写真ポイントの CSV / GeoJSON、Google Earth 用 KMZ、統計・グラフの SVG 出力）
- 軌跡レイヤの共有設定を追加（レイヤ設定で共有範囲を変更可能、共有 ON/OFF でユーザー別色分けを自動切替）
- LINE / POLYGON タブに手書きペンツールを追加（手書きとプロット作図を統合、スタイル設定と手書き⇔プロットの相互変換に対応）
- なげなわ選択による一括移動・回転・削除を追加（ポイント・ライン・ポリゴン・マップメモ）
- 作図ツールに Redo を追加（Undo / Redo ボタンは使用不可時にグレー表示）
- マップメモに部分消去ツールを追加
- マップメモの線太さをズーム連動にするオプションを追加
- 編集レイヤボタンを画面上部に追加（現在の編集対象の表示・切替、未選択時はレイヤ選択ダイアログを表示）
- 編集レイヤの用途に応じたツールパレットを追加（植生区分パレット・飛翔図パレット）
- 飛翔図を事前選択の属性と行動記号で描く方式に刷新（記号は線の修正に追従、行動の個別削除、行動記号と属性の連動）
- 選択肢の値とコードの連動をレイヤ設定に追加
- 設定画面からの言語切り替えを追加
- プロジェクトのアーカイブ機能を追加（一覧のオーナー・アーカイブ列で並べ替え可能、並び順は画面遷移後も維持）
- GPS 軌跡記録の不具合と長時間記録時の電池消費を改善（react-native-background-geolocation v5 へ更新）
- GPS の ON/OFF 応答性・追従モード・通知まわりを改善
- GPS 設定をボトムシート内で開くように改善
- 大量データ表示時の地図のパフォーマンスを改善
- レコード・項目数が多いときの動作を軽量化
- アップロード時の衝突チェックで不要なデータ再取得が起きていたのを解消し、アップロードを高速化
- レイヤ一覧・地図一覧のグループ表示デザインを刷新
- アカウント関連の画面遷移を改善
- 辞書の音声入力を刷新（Expo 56 / React Native 0.85 へ移行）
- 標高タイルが無いズームでは粗いズームの標高から陰影を描くように改善
- エクスポートのファイル名にレイヤ名を含めるように改善
- 作図編集の座標精度劣化を解消（緯度経度を真とし変更した頂点のみ更新）
- フリーハンド作図を逐次緯度経度化し、描画中も地図の移動・ズームが可能に
- マップメモのペン描画を緯度経度ベースに変更（ピンチ・ズームをまたいで描画継続）。手ぶれ補正と保存時の平滑化・間引きを追加
- マップメモのツールボタンを 1 つに集約し、設定をタブ統合（初回タップで設定・以降はトグル）
- フリーハンド修正の接続部とポリゴンの閉じ目を、なぞり方の角度で自動的に平滑化
- 数字・英字・文字スタンプがレコードのラベルを描くように改善
- 植生図プリセットを改善（植生区分フィールドを先頭に移動し専用パレットを追加、選び直しフローを整理）
- 確認ダイアログをカスタムデザインのモーダルに刷新
- コンパスボタンを方位盤デザインに刷新（ノースアップ時も回転、方角線の切り替えは長押し、地図回転の反応を高速化）
- 電波不良時に地図タイルをキャッシュから代替表示するように改善
- 地図ダウンロードの可否判定をズーム固定から推定タイル数に変更
- Web 版 3D 地形の標高タイルを Mapterhorn へ移行
- レイヤ設定を改善（「権限」を「共有範囲」に改称し説明を追加、フィールドの並べ替えを上下ボタンに変更）
- データ保存後に元の画面へ戻るように変更し、保存先の選択を一本化
- インポート時の検証を強化（SQLite テーブル名・GeoJSON 座標値）
- Android でライン・ポリゴンがタイル地図の下に隠れる不具合を修正
- iOS で現在地がキャッシュされた古い位置になる不具合を修正
- 同一アカウント・複数端末でのアップロードでデータが消失する不具合を修正
- 長いレイヤ名のバックアップ zip が Windows で解凍できない不具合を修正
- 列を並べ替えた状態でのデータ追加時の連番採番を修正
- 辞書未設定のレイヤに辞書入力欄が表示される不具合を修正
- 地図の一括ダウンロードで取得範囲が地図ごとに記録されない不具合を修正
- 長押しポップアップ表示時にフィーチャー選択が同時に起きる不具合を修正
- 暗号鍵方式の移行でプロジェクトの更新日時が書き換わる不具合を修正
- 別ユーザーのログイン中に他ユーザーの自動バックアップを復元できる不具合を修正
- 暗号化キーの再共有後、再ログインしないと復号できない不具合を修正
- アカウント削除時にアーカイブ済みプロジェクトの暗号化グループが残る不具合を修正
- iOS で地図のダウンロード範囲が地図のパンに追従しない不具合を修正
- Android で現在地マーカーが極端に小さく表示される不具合を修正
- プロジェクト設定の保存後に一覧の更新日時が反映されない不具合を修正
- コンパスモードで方角線が揺れる不具合と、iOS で方角線が表示されない不具合を修正
- グループ暗号の照会名義の誤りで復号に失敗する不具合を修正
- ログイン時の暗号化キー復元をキャンセルするとログイン済みに見える不具合を修正
- 4 桁 PIN ユーザーの鍵復元時に「6 桁」と表示される不具合を修正
- 現在地共有のアップロードが 60 秒間隔で行われない不具合を修正
- ユーザー別色分けで色未登録のユーザーが透明になり見えない不具合を修正
- iOS で同一座標のマーカーが点滅する不具合と、毎フレーム再描画による CPU・電池消費を修正
- iOS で Live Photo を含む軌跡のタップでクラッシュする不具合と、拡大表示のプレビューを修正
- マップメモがレイヤの色分け・ラベル設定を上書きする不具合を修正
- relief:// 地図の表示中や高ズームで PDF に地図が出ない不具合を修正
- iOS でエンコード済み URL の PMTiles が表示されない不具合を修正
- 地図回転時にスケールバーの長さが狂う不具合を修正
- Android のエクスポートでキャンセルしても Download へ保存される不具合を修正
- CSV インポートで列が足りないと値が未設定になる不具合を修正
- チェック・リスト・ラジオへの形式変更で値が消える不具合を修正
- 値が未設定のレコードのクリックでクラッシュする不具合を修正
- 後から追加した列が Invalid Date や 0 で表示される不具合を修正
- Web 版で動的辞書の入力が Enter で確定されない不具合を修正
- iOS でモーダル表示中・直後のダイアログが表示されない不具合を修正
- iOS でキーボード表示中に保存できない不具合とボトムシートの閉じ方を修正
- キーボード表示中に辞書候補の選択がダブルタップになる不具合を修正
- 列ソート中のドラッグで連番採番が壊れる不具合を修正
- データクリア直後に描いたオブジェクトが初期位置に保存される不具合を修正
- テンプレートのデータが地図で編集選択できない不具合を修正
- 描画中の 2 本指タッチで点が追加される不具合を修正
- 色分けが個別のポリゴンが Web で黒く表示される不具合を修正
- GPX エクスポートの時刻のタイムゾーンずれと要素順を修正
- Web 版でタブ切替から復帰するたび GPS 権限アラートが出る不具合を修正
- アクセス解析（Firebase Analytics）を導入
- その他細かなバグ修正

## [0.5.5]　- 2026-04-26

- Fixed proximity notification audio to play through the speaker on iOS
- Fixed map panning not disabling GPS follow mode on iOS

- iOS で近接通知の音声がスピーカーから出ない不具合を修正
- iOS で地図のドラッグ操作で GPS 追従モードが解除されない不具合を修正

## [0.5.4]　- 2026-04-20

- Improved track recording with low-accuracy GPS data
- Improved line/polygon drawing tool UI
- Fixed COMMON layer to be editable when not joined to a project

- ライン・ポリゴンツールの UI を改善
- ポイント位置編集モードの動作を改善
- プロジェクト未参加時に COMMON レイヤを編集できない不具合を修正

## [0.5.3]　- 2025-12-27

- Fixed a bug in layer display
- Other minor bug fixes
- レイヤ表示のバグ修正
- その他細かなバグ修正

## [0.5.2]　- 2025-12-24

- Added proximity voice notification feature
- Improved operation of the draw tool
- Modified to allow data replacement during import
- Fixed a bug where track recording did not resume after being killed (Android)
- Other minor bug fixes

- 近接音声通知の機能追加
- ドローツールの操作を改善
- インポート時にデータの置換えができるように修正
- 軌跡の記録が kill 後に再開されない不具合を修正(Android)
- その他細かなバグ修正

## [0.5.1] - 2025-12-14

- Fixed an instability issue in information display
- Fixed bugs in the draw tool

- 情報表示で不安定になる不具合を修正
- ドローツールの不具合を修正

## [0.5.0] - 2025-12-11

- Fixed a bug that map layers and data lists could not be scrolled
- レイヤ一覧やデータ一覧がスクロールできなくなる不具合を修正

## [0.4.9] - 2025-12-10

- Added bulk map download feature
- Fixed track recording issue on Android

- 地図の一括ダウンロード機能を追加
- Android における軌跡の記録の不具合を修正（react-native-background-geolocation を導入）

## [0.4.8] - 2025-9-29

- Removed the selection button and changed to always selectable
- Added a jump-to-Google Maps feature by long-pressing on the map or selecting a POI
- Added support for a dynamic dictionary format
- Modified to include time in trajectory data

  - Added update information display

- 選択ボタンを廃止して、常時選択可能に変更
- 地図の長押し or POI 選択で google maps へジャンプ機能を追加
- 動的辞書フォーマットを追加
- 軌跡のデータに時間を追加するように修正
- 更新情報の表示を追加

## [0.4.7] - 2025-9-24

不備があったため、一旦リリースを取り下げました。

## [0.4.6] - 2025-8-23

- Support export previous storage system data

- 旧ストレージのデータのエクスポートに対応

## [0.4.5] - 2025-8-22

- Revamped internal storage
- Fixed tracking log bug

- 内部ストレージを刷新
- トラッキングログのバグを修正

## [0.4.3] - 2025-8-5

- Add dictionary input functionality
- Fix the eraser bug in map memos
- Fix the bug where cache remains even after changing the map URL
- Fixed an issue where display slowed down when tiles were not available (Android)
- Added map groups
- Added KML to data export options

- 辞書入力の機能を追加
- マップメモの消しゴムの不具合を修正
- 地図の URL を変更してもキャッシュが残る不具合を修正
- タイルがない場合に表示が遅くなる問題を修正（Android）
- 地図グループを追加
- データのエクスポートに KML を追加

## [0.4.1] - 2024-8-22

- Update terms of use.
- Fix import data bug (iOS).

- 利用規約を更新
- データのインポートのバグを修正（iOS）

## [0.4.0] - 2024-8-17

- Added support for exporting Geospatial PDF
- Added support for importing Geospatial PDF
- Added settings for GPS accuracy and battery usage
- Added stamp and brush features to map memos
- Added support for importing local PMTiles
- Added layer grouping functionality
- Fixed minor bugs and improved various features

- Geospatial PDF の書き出しに対応
- Geospatial PDF のインポートに対応
- GPS の精度とバッテリーの設定を追加
- マップメモのスタンプ、ブラシ機能を追加
- ローカルの PMTiles のインポートに対応
- レイヤーのグループ化機能を追加
- 細かなバグと機能を修正

## [0.3.13] - 2023-12-18

- Support for data sorting
- Fixed minor bugs and features

- データの並び替えに対応
- 細かなバグと機能を修正

## [0.3.11] - 2023-11-29

- Change the iOS picker.
- Add a copy function for data.
- Add a lock feature for Apple Pencil in the drawing tool.
- Change the layout for tablets in landscape mode.
- Modify to disable landscape mode usage on smartphones.
- Fix minor bugs and adjust features.

- iOS のピッカーを変更
- データのコピー機能を追加
- ドローツールに Apple Pencil 用のロック機能を追加
- タブレットの横向きの配置を変更
- スマホの横向き利用はできないように変更
- 細かなバグと機能を修正

## [0.3.9] - 2023-11-23

- Fixed a bug that prevented downloading maps for offline use
- Added support for downloading PMTiles (raster)

- オフライン用の地図をダウンロードできないバグを修正
- PMTiles(ラスター)のダウンロードに対応

## [0.3.7] - 2023-11-21

- Fix the bug that prevents editing with the draw tool.
- Fix the bug that causes freezing with PMTiles(iOS).

- ドローツールで編集できなくなるバグを修正
- PMTiles でフリーズするバグを修正(iOS)

## [0.3.5] - 2023-10-27

- Improved data display speed.
- Enhanced drawing process of MapMemo.
- Fixed vector tile loading bug on Android.

- データの表示速度を改善
- MapMemo のドロー処理を改善
- Android のベクトルタイルの読み込みバグを修正

## [0.3.3] - 2023-10-16

- Added support for displaying PMTiles and vector tiles in pbf format
- Added a tool to write notes on the map
- Added support for importing and exporting map settings
- Modified split-screen display
- Discontinued the function to load map settings via the internet
- Fixed numerous bugs

- PMTiles と pbf 形式のベクタータイルの表示に対応
- 地図上にメモを書き込めるツールを追加
- 地図設定のインポート、エクスポート対応
- 画面の分割表示を変更
- 地図設定のネット経由の読み込み機能の廃止
- 多くのバグを修正

## [0.2.0] - 2023-4-6

#### Common

- Updated to expo47
- Support for editing polygons
- Changes to draw tools in general
- Support for loading GeoJSON with layer settings
- Support for color settings in multiple fields
- Support for loading PMTiles (raster)
- Fixed performance drop bug in point data editing
- Minor bug fixes

- expo47 に更新
- ポリゴンの編集に対応
- ドローツール全般の変更
- レイヤ設定付き GeoJSON の読み込みに対応
- 複数フィールドでの色設定に対応
- PMTiles（ラスタ）の読み込みに対応
- ポイントデータの編集でパフォーマンスが落ちるバグ修正
- 細かなバグ修正

#### Android

- Fixed a bug that the date could not be changed in dark mode
- ダークモードで日付を変更できない不具合修正

## [0.1.10] - 2022-12-01

#### Common

- Remove unnecessary code for development.
- Change color when selecting features.
- fix stop tracking on startup.

#### Android

- Support for Android API level 31.

#### Web

- Eliminated averaging algorithm for line creation.
- Fixed color selection layout corruption.
- Support for hover and selection of polygons and lines.

## [0.1.9] - 2022-11-13

- App Release.
  [0.6.1]: https://github.com/ecorismap/ecorismap/compare/7a0ebd1c...bb439a2f
  [0.6.0]: https://github.com/ecorismap/ecorismap/compare/b0753cddf1b8db8d05f540a32a621f37eff9c741...7a0ebd1c
  [0.5.5]: https://github.com/ecorismap/ecorismap/compare/030e239c0bc4f548926c3eba796cc67d48e96a95...b0753cddf1b8db8d05f540a32a621f37eff9c741
  [0.5.4]: https://github.com/ecorismap/ecorismap/compare/a400ef19c0a56fff902837d4d8f5da31d1dde4a4...030e239c0bc4f548926c3eba796cc67d48e96a95
  [0.5.3]: https://github.com/ecorismap/ecorismap/compare/57c4b971f94c6eff41fd857d81ee7fa48af2709b...a400ef19c0a56fff902837d4d8f5da31d1dde4a4
  [0.5.2]: https://github.com/ecorismap/ecorismap/compare/bd97c8c1fe1cf029bee991ba56bbe9ebbc77d0fc...57c4b971f94c6eff41fd857d81ee7fa48af2709b
  [0.5.1]: https://github.com/ecorismap/ecorismap/compare/169ec0287a8129c93c38d0d826170176242bd8ed...bd97c8c1fe1cf029bee991ba56bbe9ebbc77d0fc
  [0.5.0]: https://github.com/ecorismap/ecorismap/compare/3e9b5a093965d8dd68a53b66b83962ad6a4cf594...169ec0287a8129c93c38d0d826170176242bd8ed
  [0.4.9]: https://github.com/ecorismap/ecorismap/compare/65c311635ef12f2d6d22842e1872ecfaa2064bcb...3e9b5a093965d8dd68a53b66b83962ad6a4cf594
  [0.4.8]: https://github.com/ecorismap/ecorismap/compare/7425433d6bae566e48067b2c8a36eacf27bd562e...65c311635ef12f2d6d22842e1872ecfaa2064bcb
  [0.4.6]: https://github.com/ecorismap/ecorismap/compare/6196449453febecc5eb2adcc21be183db21d73b8...7425433d6bae566e48067b2c8a36eacf27bd562e
  [0.4.5]: https://github.com/ecorismap/ecorismap/compare/27e5e0da2bfe9c67ae496efda7a9dbe8ff7d2b12...6196449453febecc5eb2adcc21be183db21d73b8
  [0.4.3]: https://github.com/ecorismap/ecorismap/compare/7ca59c7d5e9678397af39bd4eda43a7c9e83f4e8...27e5e0da2bfe9c67ae496efda7a9dbe8ff7d2b12
  [0.4.1]: https://github.com/ecorismap/ecorismap/compare/12f64c2289ebf291339f453d4cba33920120ae9a...0d9d02a29c54c21277cffa2ef8173144c993ad6a
  [0.4.0]: https://github.com/ecorismap/ecorismap/compare/12f64c2289ebf291339f453d4cba33920120ae9a...d3538ad56fd23f6b3293c54706576d57856356eb
  [0.3.13]: https://github.com/ecorismap/ecorismap/compare/80638642cfe69f9fa27464d8e6deb58bbcd698d0...12f64c2289ebf291339f453d4cba33920120ae9a
  [0.3.11]: https://github.com/ecorismap/ecorismap/compare/996dcffdb7baf6a08d2e4056920585422f26bd6f...80638642cfe69f9fa27464d8e6deb58bbcd698d0
  [0.3.9]: https://github.com/ecorismap/ecorismap/compare/8410b80fb75dcb65e214b431d4ddfadcd9afe9d4...996dcffdb7baf6a08d2e4056920585422f26bd6f
  [0.3.7]: https://github.com/ecorismap/ecorismap/compare/5b421a6fd52393b90b9f2c14adb536daa19639c0...8410b80fb75dcb65e214b431d4ddfadcd9afe9d4
  [0.3.5]: https://github.com/ecorismap/ecorismap/compare/d642a3f85075c51679cfe795b96b443b793ab605...5b421a6fd52393b90b9f2c14adb536daa19639c0
  [0.3.3]: https://github.com/ecorismap/ecorismap/compare/37e4fe928b7728a191e87b7538cbfd92554bfc6b...d642a3f85075c51679cfe795b96b443b793ab605
  [0.2.0]: https://github.com/ecorismap/ecorismap/compare/69d133b13d58a12f9ee4dbe406e1212560721551...37e4fe928b7728a191e87b7538cbfd92554bfc6b
  [0.1.10]: https://github.com/ecorismap/ecorismap/tree/69d133b13d58a12f9ee4dbe406e1212560721551
