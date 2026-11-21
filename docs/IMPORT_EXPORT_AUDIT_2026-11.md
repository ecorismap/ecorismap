# インポート/エクスポート監査 統合レポート

- **対象ブランチ**: fix/import-export-audit
- **テストファイル**: すべて `/Users/mizutani/prg/ecorismap/ecorismap/src/utils/__tests__/ioaudit/` にあり、未追跡です。
  - `gpx.test.ts`（71件中33件が赤）
  - `kml.test.ts`（48件中28件が赤）
  - `csv.test.ts`（43件中26件が赤）
  - `geojson.test.ts`（43件中26件が赤）
  - `ecorismap-zip.test.ts`（28件中15件が赤）
  - `field-types.test.ts`（33件中21件が赤）
- **作業の範囲**: アプリのソースは変更していません。git 操作もしていません。

**結論**

最優先で直すべき束は 4 つあります。
- 数値 0 が空欄になる
- CSV の改行で記録が分かれる
- CSV 経由で PHOTO 項目が文字列になり、削除や同期で例外になる
- 手書き・飛翔図のスタンプとスタイルが消える

いずれも、アプリ自身が書き出したものを取り込み直すだけで起きます。警告は出ません。
セキュリティ面では、.ecorismap を開くと写真フォルダの外のファイルを上書きできる件（束M1）を中の先頭に置きました。反証役2人の評価に従って中にしていますが、優先して直すべきです。

**全体に共通する増幅要因**

取り込みが失敗した場合や 0 件だった場合でも、「受信しました」と出るか、何も表示されません。該当箇所は次のとおりです。
- `useGeoFile.ts:80/82/93/116-117`
- `loadFile` の `let result = true`（:365）
- `loadKml`・`loadKmz` が戻り値を見ていない点（:186-198）
- `importGeoFile` で message が `''` になる経路（:410-415）

このため、下に挙げる「全件が消える」系の不具合は、どれも黙って起きます。各束の修正とあわせて、「0 件・失敗のときは利用者に知らせる」ことを横断的に入れるのを勧めます。

---

## 深刻度：高

### H1. 数値の 0（と false）が取り込みで空欄になる
- **影響するフォーマット**: GeoJSON（単体の .geojson、レイヤ ZIP の新規取り込み・置き換え取り込み）、KML/KMZ（型付きの SimpleData）。全プラットフォームで起きます。
- **利用者に起きること**
  - INTEGER/DECIMAL の既定値の 0 や、＋/− ボタンで入れた 0 が空欄に変わります。個体数 0 と未記録の区別が消えます。
  - 置き換え取り込みでは、受け取った側に正しい値が残りません。
  - あわせて、KML を書き出すとき、ラベル項目の値が 0 の地物は名前が空になります。
- **再現テスト**
  - field-types: 「INTEGER/DECIMALの0は0のまま戻る」「INTEGER/DECIMALの0が空文字にならない」
  - ecorismap-zip: 「3. INTEGER/DECIMAL/SERIALの0は0のまま戻る」
  - geojson: 「数値0は空文字にならず0のまま保持される」
  - kml: 「SimpleData(type=int)の値 0 が空文字にならない」「ラベル項目の値が 0 でもPlacemarkのnameは "0"」
- **根拠**
  - `src/utils/Geometry.ts:1369` の `properties[field.name] || ''`
  - 書き出し側（:1107-1117）は 0 を数値のまま出しています。
  - ラベルは `src/utils/Layer.ts:582` の generateLabel が真偽値で判定しています。
- **修正方針**
  - 取り込み側は `?? ''` にします。
  - generateLabel は `!= null && !== ''` で判定します。
- **副作用**
  - SERIAL の 0 も 0 のまま戻ります。一覧では getFieldDisplayValue が空欄にするので見た目は変わりません。
  - 地図のラベルに「0」が出るようになります。

### H2. CSV で値の中の改行（引用符の内側）でレコードが分かれる
- **影響するフォーマット**: CSV。具体的には、NONE（位置なし）レイヤのレイヤ ZIP（GeoJSON を含まないので必ず CSV 経路になる）と、CSV の単体取り込み。全プラットフォームで起きます。
- **利用者に起きること**
  - STRING_MULTI の複数行メモが 2 件以上に分かれ、後半は別の列にずれて入ります。写真名・参照キーも別の項目に入ります。
  - 置き換え取り込みでは、既存データを `deleteDataAction`（useGeoFile.ts:280）で消してから壊れたデータを入れます。そのため元に戻せません。
- **再現テスト**
  - csv: 「【往復】値の中の改行（LF/CRLF）が保持され…」
  - ecorismap-zip: 「3. NONE…改行を含む値がCSV経由でも1レコードのまま戻る」
  - field-types: 「改行を含むSTRING_MULTIの値で、レコードが分割されずに戻る」
- **根拠**
  - `Geometry.ts:116`（本文）、:112（ヘッダ）、:52-53（detectCsvType）の `csv.split('\n')`
  - 書き出し側の escapeCSVValue（:538-542）は RFC 4180 どおりで正しいです。
- **修正方針**: 引用符の状態を保ったまま文字単位でレコードを分ける RFC 4180 のパーサを 1 つ作り、本文・ヘッダ・型判定で共用します。この修正で H3・M14・M15・L13 もまとめて直ります。
- **副作用**: 引用符が閉じていない壊れた CSV では、それ以降が 1 つの値になります（閉じていない場合はエラーにするのが安全です）。

### H3. CSV 経路で PHOTO 項目が文字列、数値項目も文字列になる（削除・クラウド同期で例外）
- **影響する経路**: NONE レイヤのレイヤ ZIP（CSV 経路）。全プラットフォームで起きます。
- **利用者に起きること**
  - PHOTO 項目が `"a.jpg,b.jpg"` や `''` の文字列になります。PHOTO 項目を持っていれば、写真が 0 枚でも起きます。
  - 写真欄が表示されなくなります（DataEditPhoto.tsx:19）。一覧の写真枚数が文字数で表示されます（Data.ts:237）。
  - レコードを削除すると例外になります（Photo.ts:127 の forEach。呼び出し元は useDataEdit.ts:328 と useData.ts:305）。
  - プロジェクトへのアップロードと写真取得も例外になります（useRepository.ts:415、388、970 の .map）。
  - INTEGER/DECIMAL/SERIAL は `'-42'` のような文字列になり、SERIAL の 0 は「0」と表示されます。並べ替えや採番は parseInt しているので壊れません（ここは低）。
- **再現テスト**
  - csv: 「【往復】PHOTO列は取り込み後も配列（PhotoType[]）になる」「数値型（INTEGER/DECIMAL/SERIAL）は数値のまま戻る」
  - field-types: 「INTEGER/DECIMAL/SERIALは数値型で戻る」「PHOTO列は写真の配列で戻る」
- **根拠**: `Geometry.ts:127-133` の csv2Data が importedLayer の format を見ずに文字列をそのまま入れています。GeoJSON 経路（:1364）は PHOTO を `[]` にしています。
- **修正方針**
  - importedLayer がある場合は format に合わせて変換します。
  - PHOTO は `[]` にします（写真を戻すのは M3 と合わせて行う）。
  - 数値型は Number にし、空や数値にならない値は `''` にします。
- **副作用**: すでに文字列で保存されているデータは自動では直りません。Photo.ts などの読む側に `Array.isArray` で守る処理を入れると安全です。

### H4. 手書き・マップメモ・飛翔図のスタンプが消え、線の色・太さ・線種・グループも消える
- **影響する経路**: レイヤ ZIP（GeoJSON 経路）の新規取り込み・置き換え取り込み。全プラットフォームで起きます。プロジェクトのバックアップ（.ecorismap）は影響を受けません。
- **利用者に起きること**
  - 1 点だけのスタンプは、行動属性を持つ飛翔図の行動記号（現行機能。useDrawTool.ts:2299-2314）も含めて、レコードごと黙って消えます。
  - 線は既定の色・太さになります。色分け「個別」（`_strokeColor`）は効かなくなり、isMapMemoLayer の判定も外れます。`_group` の親子関係も切れます。
  - 結果表示は「成功」です。
- **再現テスト**
  - geojson: 「手書き（マップメモ）レイヤ: ストロークの色・太さ…」「LINEレイヤの1点だけのレコード（スタンプ…）が往復で消えない」
  - ecorismap-zip: 「3. マップメモ（ライン）: スタンプ（1点）と線の色・太さ・グループが戻る」
  - field-types: 「マップメモ（LINE）の線の色・太さ・スタイルが戻る」「スタンプ…が取り込みで消えない」
- **根拠**
  - 書き出し側は Point で出します（Geometry.ts:1194-1202）。`_stroke*/_group/_stamp/_zoom` も出しています（:1179-1190、:1226-1237）。
  - 取り込み側は LINE のフィルタが LineString と null しか通しません（:458-461）。
  - createFields（:1359-1373）は layer.field にある項目しか拾いません。
  - MULTI での再試行は、線が 1 本でも取り込めると実行されません（useGeoFile.ts:296/337）。
- **修正方針**
  - LINE の取り込みで Point を 1 点の coords として受け入れます。
  - 既知の内部キー（`_strokeColor`、`_strokeWidth`、`_strokeStyle`、`_group`、`_stamp`、`_zoom`）を record.field に戻します。
  - `_group` は M9 の旧 id から新 id への対応表で付け替えます。
- **副作用**: 外部の GeoJSON に `_` で始まる同名のキーがあると、スタイルとして解釈されます（許可リストで限定すれば許容範囲です）。

---

## 深刻度：中

### M1.【セキュリティ】.ecorismap/バックアップを開くと写真フォルダの外のファイルを上書きできる
- **影響する経路**: .ecorismap/ZIP を開く操作（設定→ファイルを開く、Google Drive プロジェクトを開く）。iOS と Android で起きます。Web は Blob URL なので起きません。
- **利用者に起きること**
  - 細工したファイルを開くと、写真名やレイヤ ID に `%2e%2e%2f` を入れた値を経由して、アプリ領域内の `SQLite/dictionary.sqlite` などが任意の内容で上書きされます。
  - アプリ領域内であれば、自動バックアップも上書き対象になりえます。
- **再現テスト**: ecorismap-zip 「5. 写真名にエンコードした ../ があっても写真フォルダの外へ書かない」「レイヤIDにエンコードした ../ があっても…」
- **根拠**
  - `src/hooks/useEcorismapFile.ts:228`（toFolder）と :248（to）が、ZIP 内の layer.id と photo.name を isSafePathSegment で検証していません。
  - クラウド経路は useRepository.ts:973 で検証しています。
  - 写真の照合に使う findPhotoFileKey（General.ts:89）はベース名の一致しか見ません。
  - expo-file-system がパーセントデコードすることは safePath.ts:5-13 を根拠にしています。実機では確認していません。
- **修正方針**
  - updatePhotoField で `isSafePathSegment(layer.id) && isSafePathSegment(photo.name)` を満たさないものは取り込みません。
  - makeDirectoryAsync の前にも検証します。
  - 書き込む直前に `isUriInsideFolder(to, PHOTO_FOLDER)` で確かめます。
- **副作用**: `%` などを含む正当な写真名は取り込まれなくなります（実際の写真名は `EMAP_...` なので影響はほぼありません）。
- **深刻度について**: 反証役2人とも高から中へ下げました。理由は、利用者が自分でファイルを開く必要があることと、影響がサンドボックス内に限られることです。ただしセキュリティルールの対象として最優先で直すことを勧めます。

### M2. GPX：1 点だけの trkseg・空の trkseg・trkseg の無い trk が 1 つでもあると、軌跡が全部取り込まれない
- **影響するフォーマット**: GPX の取り込み（LINE）。全プラットフォームで起きます。
- **利用者に起きること**: 他のソフトの GPX や、自分で書き出した 1 点だけの軌跡を含む GPX を取り込むと、ファイル内のすべての trk が成功表示のまま消えます（wpt は残ります）。
- **再現テスト**: gpx 「1点だけのtrksegを含むtrkも取り込める」ほか、合計 6 件。
- **根拠**
  - `Geometry.ts:262` の `trackseg.trkpt.map`。trkpt が 1 個だとオブジェクト、空だと `''`、trkseg が無いと undefined になります。
  - :212 の XMLParser に isArray オプションがありません。
  - :303-319 の catch で全体が undefined になります。
- **修正方針**: trkseg と trkpt を常に配列にそろえ、点の無いセグメントや trk は飛ばします。
- **副作用**: ありません。
- **深刻度について**: 反証役の評価は高と中に割れました。元のファイルは残り、地図を見れば気付けるため中としました。中の中では最上位です。

### M3. レイヤ ZIP を取り込んでも写真が戻らない（ZIP に写真が入っているのに参照が空になる）
- **影響する経路**: データ一覧の書き出し（Data.tsx:135 は常に exportPhoto:true）でできた ZIP の取り込み。全プラットフォームで起きます。
- **利用者に起きること**
  - 全レコードの写真が 0 枚になります。マニュアル（20-export.md）は、この ZIP を「そのままバックアップになる」と案内しています。
  - 置き換え取り込みでは、手元のレコードに付いていた写真の紐づけも消えます。
- **再現テスト**
  - geojson: 「PHOTO: 写真の参照（ファイル名）が往復で失われない」
  - ecorismap-zip: 「3. 写真付きで書き出したZIPを取り込むと、写真がレコードに戻る」
  - field-types: 「PHOTOの写真参照（ファイル名）が戻る」
- **根拠**: `Geometry.ts:1364-1367` が PHOTO を常に `[]` にしています。loadZip（useGeoFile.ts:210-）は写真のエントリを読みません。
- **修正方針**: カンマ区切りの写真名を ZIP 内の同名ファイルと照合し、`${PHOTO_FOLDER}/LOCAL/<新ID>/OWNER/` へ書き出して PhotoType を組み立てます。useEcorismapFile の importPhotos/findPhotoFileKey を流用し、名前は M1 と同じ検証を通します。
- **副作用**: 取り込みが遅くなり、容量も増えます。写真名が同じ場合の問題（L12）がそのまま持ち込まれます。

### M4. LINE/POLYGON の取り込みで geometry:null が 1 件でもあると全体が失敗する（ZIP では線と面が消え、位置なしの行だけが残る）
- **影響するフォーマット**: GeoJSON、KML/KMZ、レイヤ ZIP。全プラットフォームで起きます。
- **利用者に起きること**
  - 単体のファイルでは何も取り込まれず、表示もありません。
  - ZIP では MULTI での再試行で線と面が全部消え、属性だけの行が「成功」として入ります。
  - 置き換え取り込みでは既存データも消えます。
  - CSV で座標が空だった線を ZIP で往復させた場合にも起きます。
- **再現テスト**
  - geojson: 「LINE: geometryがnullのフィーチャーが1件混ざっても…」ほか 3 件
  - kml: 「ジオメトリ無しのPlacemarkが混ざっていても…」
  - ecorismap-zip: 「3. ライン: 座標の無いレコードが1件混ざっても…」
- **根拠**: `Geometry.ts:458-465` と :493-500。フィルタは null を通しているのに、map の中で `feature.geometry.coordinates` を読んでいます。
- **修正方針**: map の中で null を先に分け、`coords: undefined` にします（MULTI の分岐と同じ扱い）。フィーチャーごとに try/catch を入れます。
- **副作用**: 位置なしの LINE/POLYGON レコードが入るようになります（UI で扱えることは確認済みです）。

### M5. XML で使えない制御文字や孤立サロゲートがあると、GPX/KML の生成が例外になり、エクスポート全体が失敗する
- **影響する経路**: データ一覧の書き出し、.ecorismap の保存、Google Drive への保存。全プラットフォームで起きます。
- **利用者に起きること**: 外部の CSV/GeoJSON の取り込みや貼り付けで `\u000B` などが 1 文字入ると、そのレイヤやプロジェクトのバックアップができなくなります。原因のレコードは分かりません。
- **再現テスト**
  - gpx: 「XMLで使えない制御文字を含んでも書き出しが例外にならない」
  - kml: 「XML1.0で禁止の制御文字…」「壊れたサロゲート…」「1件のレコードに制御文字があっても…」
- **根拠**
  - `Geometry.ts:768/781/796`（KML）、:1059/1060/1076（GPX）で、xmlbuilder に invalidCharReplacement を指定していません。
  - generateExportGeoData（useGeoFile.ts:477/496）は例外を捕まえていません。
- **修正方針**: 各 `xmlBuilder.create` に `invalidCharReplacement: ''` を渡します。
- **副作用**: 制御文字が黙って削られます（XML としては正しくなります）。

### M6. GPX：XML の実体参照を復号しない（& < > や CR が化ける）
- **影響するフォーマット**: GPX の取り込み。全プラットフォームで起きます。
- **利用者に起きること**
  - 「A&B」が「A&amp;B」になります。CRLF のコメントには「&#xD;」が混ざります。
  - 自分で書き出した GPX でも起き、往復するたびに `&amp;amp;` と二重化していきます。
- **再現テスト**
  - gpx: 「XMLの定義済み実体参照…は復号する」ほか、name/trk/写真名の 7 件
  - field-types: 「& < > を含むname/cmtが実体参照のまま残らない」
- **根拠**: `Geometry.ts:216` の `processEntities: false`。
- **修正方針**: processEntities を false のままにし、パースした後の文字列で定義済みの 5 実体と数値文字参照だけを自前で復号します。
- **注意**
  - fast-xml-parser 5.8.0 で `processEntities: true` にすると、DOCTYPE で宣言した内部実体まで展開されることを実測しています。
  - また true にしても数値文字参照は復号されません。単純に true にすることは勧めません。
  - billion laughs のテスト（緑）は残したままにしてください。
- **副作用**: ありません。

### M7. GPX：数字だけの name/cmt が数値に変わり、「0」は空になる
- **影響するフォーマット**: GPX の取り込み。全プラットフォームで起きます。
- **利用者に起きること**: Garmin などの「001」が 1 に、「0012」が 12 になります。1e3・0x1F も数値に変わり、「0」は空欄になります。STRING 項目に number 型の値が入ります。
- **再現テスト**
  - gpx: 「数字だけのname/cmtは文字列のまま…」ほか 3 件
  - field-types: 「数字だけのnameが数値に化けない」「nameが"0"の地点の名前が空にならない」
- **根拠**: `Geometry.ts:212-217`（parseTagValue が既定の true のまま）と、:244/:247/:291/:293 の `d.name ? d.name : ''`。
- **修正方針**: `parseTagValue: false` にし、空の判定は `?? ''` にします。
- **副作用**: ele が文字列で入るようになるので、:231/:266 で `Number()` に変換する修正も同時に必要です。

### M8. GPX：time の無い wpt に取り込んだ時刻が入る
- **影響するフォーマット**: GPX の POINT 取り込み。全プラットフォームで起きます。
- **利用者に起きること**: POI リストなどを取り込むと、全ポイントの time に取り込んだ日時が入ります。観測日時との見分けがつきません。
- **再現テスト**: gpx 「timeの無いwptは時刻が空になる」
- **根拠**: `Geometry.ts:230` の `dayjs(undefined)` は現在時刻を返します。LINE 側（:268/:292）には undefined の判定がありますが、POINT 側にはありません。
- **修正方針**: `d.time !== undefined && time.isValid()` にします。
- **副作用**: ありません。

### M9. ZIP 取り込みでレコード id が振り直され、_group（親子）と REFERENCE（主キーが _id）の参照が切れる
- **影響する経路**: レイヤ ZIP の取り込み。全プラットフォームで起きます。
- **利用者に起きること**: 飛翔線に付けた行動記号などの子レコードが独立したレコードになります。_id を主キーにしている参照元が親を見失います。
- **再現テスト**: field-types 「グループの子レコード…親子関係が保たれる」「REFERENCE(主キー=_id)…一致する」
- **根拠**
  - `Geometry.ts:1349` の createBase は常に ulid() で id を作り、書き出した `_id`（:1163 ほか）を使いません。
  - `_group` は isMapMemoLayer（:1141）のときしか書き出していません。
- **修正方針**: 取り込みのたびに旧 id から新 id への対応表を作ります。`_group` と、REFERENCE で主キーが `_id` の値をその表で付け替えます。`_group` は常に書き出します。
- **副作用**: 置き換え取り込みで `_id` をそのまま使う設計にする場合は、ID が衝突しないことの確認が必要です。

### M10. GeoJSON/KMZ の型判定が先頭のフィーチャーに依存する（混在した型が捨てられる、空や単体の Feature で例外、先頭が null だと何も起きない）
- **影響するフォーマット**: 単体の .geojson、KMZ。全プラットフォームで起きます。KMZ の書き出しはネイティブだけなので、自前の軌跡 KMZ の往復はネイティブで問題になります。
- **利用者に起きること**
  - LineString と MultiLineString が混ざったファイルや、点と面が混ざったファイルでは、先頭と違う型が黙って消えます。
  - 自前の軌跡 KMZ を取り込み直すと、写真の Point が全部消えます。
  - features が空、単体の Feature、Geometry 単体の場合は英語の TypeError が出ます。
  - 先頭が geometry:null の場合は、何も表示されずに何も取り込まれません。位置なしの点が先頭にある自前の .geojson を取り込み直すと再現します。
- **再現テスト**
  - geojson: 「Point と Polygon が混在…」「LineString と MultiLineString が混在…」「featuresが空の FeatureCollection で例外を投げない」ほか 4 件
  - kml: 「PointとLineStringが混在するKMZで…」「Placemarkが0件のdoc.kmlを含むKMZ…」「detectGeoJsonType は features が空でも…」
- **根拠**: `Geometry.ts:1491-1492` の `features[0].geometry`。loadGeojson（useGeoFile.ts:148-155）と loadKmz（:171-182）は型を 1 つしか取り込みません。loadKml は presentFeatureTypes ですべての型を処理しています。
- **修正方針**
  - .geojson と KMZ でも presentFeatureTypes を使い、型ごとに取り込みます。
  - 単体の Feature や Geometry は FeatureCollection に包みます。
  - 型の判定は null でない最初の geometry で行います。
- **副作用**: 1 つのファイルから複数のレイヤができるようになります（KML と同じ挙動です）。

### M11. MultiGeometry（GeometryCollection）の Placemark が黙って捨てられる
- **影響するフォーマット**: KML/KMZ。全プラットフォームで起きます。
- **利用者に起きること**: 飛び地のある区域や、Google Earth の「面＋ラベル点」の地物が、属性ごと消えます。
- **再現テスト**: kml 「MultiGeometry(同種のPoint×2)…」「MultiGeometry(LineString+Point混在)…」
- **根拠**: togeojson 7.1.2 は MultiGeometry を常に GeometryCollection に変換します。`Geometry.ts:372-393` の hasValidCoordinates は default で false を返し、presentFeatureTypes にもこの型がありません。
- **修正方針**: 取り込む前に GeometryCollection を要素ごとに分け、属性を複製した Feature にします。
- **副作用**: 1 つの地物が複数のレコードになります。

### M12. KML の CDATA の description が文字列ではなくオブジェクトで入る
- **影響するフォーマット**: KML/KMZ（自前の軌跡 KMZ も写真の description が CDATA です）。全プラットフォームで起きます。
- **利用者に起きること**: 編集画面に [object Object] と表示されます。保存すると元の HTML が失われます。再び書き出すと内容が消えます。
- **再現テスト**: kml 「CDATAのdescriptionは文字列として取り込まれる」
- **根拠**: togeojson が `{"@type":"html",value}` を返し、`Geometry.ts:1369` がそれをそのまま入れています。
- **修正方針**: `value` を持つオブジェクトは文字列に直します。それ以外の非プリミティブは JSON.stringify します（L10 と一緒に直します）。
- **副作用**: ありません。

### M13. 取り込むときの項目が先頭フィーチャーの properties だけで作られる
- **影響するフォーマット**: KML/KMZ、単体の .geojson（レイヤ設定が無い取り込み）。全プラットフォームで起きます。
- **利用者に起きること**: 2 件目以降にしかない属性（説明・ExtendedData・OSM のタグ）が全件から消えます。先頭の properties が null なら全属性が消えます。
- **再現テスト**
  - kml: 「ExtendedDataの項目が2件目以降のPlacemarkにしか無くても…」
  - geojson: 「2件目以降のフィーチャーにしかない属性キーも項目として作られる」「先頭フィーチャーのpropertiesがnullでも…」
- **根拠**: `Geometry.ts:1445-1456` の createAllStringFieldsFromGeoJson。
- **修正方針**: 全フィーチャーのキーの和集合（出現順）から項目を作ります。
- **副作用**: 疎なデータでは項目が多くなります。togeojson のスタイル由来のキー（icon-color など）は除外の対象にします。
- **深刻度について**: geojson 担当の反証役の 1 人は低としましたが、もう 1 人の中に合わせました。

### M14. CSV の WKT 処理の不具合（穴なしポリゴンの書き出しが不正、穴ありの連結、方言非対応）
- **影響するフォーマット**: CSV（ポリゴンの単体取り込みと外部 GIS）、ZIP で geojson が無い場合。全プラットフォームで起きます。ZIP の往復は GeoJSON が優先されるので影響しません。
- **利用者に起きること**
  - 穴なしポリゴンは `POLYGON((...),)` と書き出され、取り込み直すと 1 件も入らず、表示もありません。
  - 穴ありポリゴンは、外周と穴の継ぎ目が緯度 0・経度 0 へ伸びます。
  - `POINT (139 35)`、MULTIPOINT、範囲外の値は (0,0) になります。`Point (…)` は NONE と判定されます。
- **再現テスト**: csv 「【往復】穴なしPOLYGONの書き出しは正しいWKT」「…頂点が増えずに戻る」「…穴ありPOLYGONの外周と穴が分かれて戻る」「【WKT】」の 4 件
- **根拠**
  - `Geometry.ts:668`（holestring が空のとき）
  - :169-176（環の区切りを扱っていない）
  - :41-51（大文字の includes で判定）
  - :139-145（判定に失敗すると 0）
  - Format.ts:176（`toString` の TypeError で全体が失敗）
- **修正方針**
  - 書き出しは `POLYGON((outer))` と `POLYGON((outer),(hole)...)` を正しく出します。
  - 大文字小文字・空白を許し、環単位で解析する WKT パーサにします。MULTI* は分解するか拒否します。
  - 解析できない座標は 0 で埋めず、欠損として扱って件数を知らせます。
- **副作用**: 既存の Geometry.test.ts で 0 埋めを期待している箇所の見直しが必要です（M18 と同じ）。

### M15. CSV の単体取り込みで全項目が 1 列ずれる（displayName・geometry も項目になり、BOM・\r・引用符が項目名に残る）
- **影響するフォーマット**: EcorisMap が書き出した CSV を単体で取り込む場合（ZIP から取り出した CSV、TrackSummary の CSV）。全プラットフォームで起きます。
- **利用者に起きること**
  - 各項目に隣の列の値が入り、最後の項目には WKT が入ります。
  - 項目名に「﻿displayName」「memo\r」「"a"」が混ざります。
- **再現テスト**
  - csv: 「【往復】EcorisMapが書き出したCSVを単体で取り込むと値が正しい列に入る」「BOM付きUTF-8でも先頭フィールド名にBOMが残らない」「CRLFでも…\rが残らない」「ヘッダが引用符付き…」
  - field-types: 「項目名が書き出し時の項目名と一致する」「各項目の値が列ずれせずに…」
- **根拠**: `Geometry.ts:1481-1489` の createAllStringFieldsFromCsv（`split('\n')[0].split(',')` そのまま）と、:121/:131 の offset=1 が食い違っています。
- **修正方針**
  - ヘッダは H2 のパーサで読み、BOM を除き、trim します。
  - displayName、geometry、マップメモと GNSS の付帯列を項目から外します。
  - 値は位置ではなくヘッダ名で対応させます。
- **副作用**: 外部 CSV に本当に「displayName」「geometry」という属性がある場合は項目になりません。

### M16. CSV の型判定が先頭データ行の素朴な split で行われる（全レコードの座標が消える）
- **影響するフォーマット**: CSV の単体取り込み、ZIP の CSV 経路。全プラットフォームで起きます。
- **利用者に起きること**
  - 1 件目の属性にカンマがある場合（写真が 2 枚以上、マップメモの rgba(…) は必ず該当）、1 件目の座標が空の場合、ヘッダ直後に空行がある場合、全件が NONE として座標なしで取り込まれます。
  - importedLayer があってもレイヤの type は使われません。
- **再現テスト**: csv 「【検出】先頭レコードのgeometryより前の列にカンマ…」「先頭レコードの座標が空でも…」「ヘッダ直後に空行…」
- **根拠**: `Geometry.ts:52-65`。
- **修正方針**: H2 のパーサで geometry 列を探し、空でない最初の値で判定します。importedLayer があればその type を優先します。
- **副作用**: ありません。
- **深刻度について**: 評価は高と中に割れました。ZIP の主要な経路は影響しないため中としました。

### M17. ポリゴンを取り込むたびに必ず簡略化（simplify）される
- **影響するフォーマット**: GeoJSON、KML、レイヤ ZIP。全プラットフォームで起きます。
- **利用者に起きること**: 面積に応じて最大で次の幅だけ黙って形が変わります。
  - 1ha 未満: 約 0.1m
  - 1ha〜1km²: 約 1m
  - 1〜100km²: 約 10m
  - 100km² 超: 約 100m
  - RTK で測った区画や、隣接面の位相にも影響します。
  - 「繰り返すたびに劣化する」は誤りで、劣化はほぼ初回の 1 回だけです（実測）。
- **再現テスト**
  - geojson: 「POLYGON: 細かい頂点…が往復で間引かれない」
  - ecorismap-zip: 「3. ポリゴン: 頂点が書き出し→取り込みで間引かれない」
- **根拠**: `Geometry.ts:1313-1346`。コミット e93b5171 で意図的に入れたものです。
- **修正方針**: 少なくとも importedLayer があるとき（EcorisMap の ZIP）は簡略化しません。外部ファイルについても、表示側の viewport culling に任せることを検討します。
- **副作用**: 頂点の多い外部ポリゴンで表示や編集が重くなる可能性があります。
- **深刻度について**: 低と中に割れました。意図的な割り切りですが、自前の往復で形が変わるため中としました。

### M18. GPX の rte（ルート）が黙って捨てられる
- **影響するフォーマット**: GPX。全プラットフォームで起きます。
- **利用者に起きること**: 山行計画やナビアプリのルートだけの GPX を取り込むと、0 件のまま成功と表示されます。
- **再現テスト**: gpx 「rte（ルート）は黙って捨てずにラインとして取り込む」
- **根拠**: `Geometry.ts:224-303` は wpt と trk しか読みません。
- **修正方針**: LINE の取り込みで rte/rtept を trk と同じように扱います（M2 と同じく配列にそろえます）。
- **副作用**: ありません。

### M19. Shift_JIS の CSV が文字化けする（Web の「対応済み」というコメントが実装と食い違う）
- **影響するフォーマット**: CSV。全プラットフォームで起きます。
- **利用者に起きること**: 日本語 Windows の Excel で保存した CSV は、日本語の項目名と値がすべて U+FFFD になります。座標は正しいので気付きにくいです。
- **再現テスト**: csv 「Shift_JISのCSV（data URI）を文字化けせずに読める」
- **根拠**: `src/utils/File.web.ts:207-225` は UTF-8 で固定しています（:198-205 の判定はコメントアウト）。`useGeoFile.ts:203-204` のコメントは実際と食い違っています。
- **修正方針**
  - バイト列で読み、UTF-8 として不正なら `TextDecoder('shift_jis')` で読み直します。ネイティブは iconv-lite を使います。
  - 最低限、U+FFFD を見つけたら警告します。
- **副作用**: 判定を誤ると、正しいファイルが化けるおそれがあります（判定の順序は BOM → UTF-8 の妥当性 → SJIS にします）。

---

## 深刻度：低

| # | タイトル | 影響 | 再現テスト | 根拠 | 修正方針（副作用） |
|---|---|---|---|---|---|
| L1 | 非表示（_visible=false）が往復で表示に戻る | ZIP、全プラットフォーム | geojson／ecorismap-zip／field-types「非表示…のまま戻る」 | Geometry.ts:1349-1356 の createBase が visible:true で固定 | `_visible===false` を復元する（なし） |
| L2 | 標高・GNSS 品質が往復しない（GPX の geoidheight を読まない・品質を書かない、ZIP の `_altitude/_gnss*` を戻さない、KML の POINT の標高、GeoJSON の3次元座標） | 全形式、全プラットフォーム | gpx「GNSS点の楕円体高…」ほか4件、field-types「外部GNSSで測ったポイント…」、kml「POINTの標高…」、geojson「3次元座標の標高…」 | Geometry.ts:262-275, 821-824, 1048-1067, 766, 1169; Coords.ts:222 | 取り込み時に ele+geoidheight と `_gnss*` を coords に戻す。書き出し時は3要素目と GPX の `<extensions>` に出す（GPX 1.1 の fix では FIX と FLOAT を区別できない） |
| L3 | GPX で name/time/cmt 以外の項目は desc にしか残らない。KML は description 1つにまとまる（ExtendedData を出していない） | GPX/KML の単体往復 | gpx「name/time/cmt以外の項目…」2件、kml「全ての項目型の値が…」、field-types「KMLの往復 › 各項目が項目として戻る」 | Geometry.ts:1024-1043, 683-697 | desc を STRING 項目として取り込む。KML に `<ExtendedData>` を出し、取り込み時はスタイル由来のキーを除く。どちらも型は戻らないことを前提にする（contested。採用は低。ZIP には GeoJSON と CSV が同梱されるため） |
| L4 | GPX で lat/lon が欠けた点が1つあると全件失敗、範囲外や文字列の座標は (0,0) に置かれる | GPX | gpx「lat属性の無いwpt…」「…trkpt…」「範囲外・文字列の点は(0,0)にせず…」「軌跡の点の…(0,0)を混ぜない」 | Geometry.ts:228-229, 263-264, 239-240, 269-270; Format.ts:176/188 | 不正な点は1点ずつ除外して件数を知らせる。既存の Geometry.test.ts「return track/point from invalid gpx」の期待値の変更が必要 |
| L5 | GPX で点に時刻の無い線の trk.time が消える | GPX | field-types「時刻の無い軌跡でも…time…が戻る」 | Geometry.ts:292 | `time.isValid() && (trk.time!==undefined || firstTrkptTime!==undefined)` にする |
| L6 | KML の穴（innerBoundaryIs）を書き出さない | KML の書き出し | kml「POLYGONの穴(holes)が書き出され…」 | Geometry.ts:784-797 | holes を innerBoundaryIs に出す（アプリ内で穴を作る手段は無く、外部由来のデータに限られる） |
| L7 | KML の description に未入力の項目が "undefined"/"null" と出る | KML の書き出し | kml・field-types「…"undefined"…で出ない」 | Geometry.ts:692 | `fieldValue ?? ''` にする |
| L8 | 空の KML や `kml:` 接頭辞付き、数値でない座標の KML でも「受信しました」と出る | KML | kml「Placemarkが1件も無いKMLは失敗…」ほか2件 | useGeoFile.ts:186-198, 365 | 0 件なら失敗を返す（共通の増幅要因の一部） |
| L9 | KMZ 内の .kml を探すとき大文字小文字を区別し、`__MACOSX/._*.kml` も対象にする。loadZip の除外は `'__MACOS/'` の打ち間違い | KMZ/ZIP | kml「DOC.KML…」「__MACOSX…」2件、ecorismap-zip「4. macOSのFinderで圧縮したZIP…」 | useGeoFile.ts:171, 215, 252-254 | `/\.kml$/i` にし、`__MACOSX/` と `._` で始まるファイルを除外する（loadZip 側の件は contested。Finder の通常の並び順では起きないが、打ち間違いは事実なので採用） |
| L10 | GeoJSON の入れ子・配列・真偽値がそのまま入る。`__proto__` でレコードのプロトタイプが差し替わる | GeoJSON | geojson「入れ子オブジェクト…正規化される」「"__proto__"…」 | Geometry.ts:1369, 1372 | 値を string か number に正規化する。`Object.fromEntries` で組み立てる |
| L11 | 軌跡 KML の写真の img タグでファイル名をエスケープしない。`]]>` で切れる | 軌跡 KMZ（ネイティブ） | kml「写真ファイル名に " や <…」「…"]]>"…」 | Geometry.ts:921 | HTML 属性用にエスケープする |
| L12 | 名前が同じ写真（秒単位の命名）が書き出し時に上書きされ、別のレコードの写真になる | .ecorismap/ZIP、多人数での利用 | ecorismap-zip「5. 同名の写真…」 | Photo.ts:153/160/177; File.ts:69/203; General.ts:89 | ZIP 内のパスに photo.id を含める |
| L13 | CSV で値の前後の空白やタブが削られる。GPX の値も trim される | CSV/GPX | csv「前後の空白・タブが保持される」、field-types「前後の空白…」、gpx「前後の空白を含むname…」 | Geometry.ts:86/95/117, 212-217 | 引用符の内側は trim しない（GPX は contested。採用は低） |
| L14 | 数式インジェクション対策で付けた先頭の `'` が取り込み時に外れない（例: `-` → `'-`） | CSV の往復 | csv「無害化で付けた先頭の'は…外れて…」「NUMBERRANGE」 | Geometry.ts:533-542 | 取り込み時に `'`＋数式の開始文字なら `'` を外す。または ZIP 内の CSV は無害化しない（Excel 側の防御とのトレードオフ） |
| L15 | CSV のヘッダ（項目名）をエスケープも無害化もしていない | CSV の書き出し | csv「フィールド名にカンマ…」「…= で始まっても…」 | Geometry.ts:591 | ヘッダも escapeCSVValue を通す。取り込み側も H2 のパーサで読む |
| L16 | 同名の列があると前の列の値が上書きされる | 外部 CSV | csv「同名の列があっても…」 | Geometry.ts:127-133, 1481-1488 | 重複した名前に `_2` などを付ける |
| L17 | crs が `urn:ogc:def:crs:EPSG::4326` のファイルを黙って拒否する | GeoJSON | geojson「URN形式の…EPSG::4326…」 | Geometry.ts:311-339 | 受け入れる場合は軸の順序を判定する。少なくとも理由を表示する |
| L18 | ZIP の展開サイズに上限が無い（zip bomb） | 全 ZIP | ecorismap-zip「4. …zip bomb…」 | Zip.ts:45-47; useGeoFile.ts:217 ほか | uncompressedSize の合計と圧縮率に上限を設ける |
| L19 | 辞書 SQLite に NULL があると取り込みが止まり、その表は空のまま残る | 外部で編集した辞書 | ecorismap-zip「2. 辞書の値にNULL…」 | SQLiteBulkInsert.ts:19; SQLite.ts:131-147 | `String(value ?? '')` にする。一時表に入れてから入れ替える |
| L20 |【セキュリティ衛生】書き出したレイヤ JSON にクラウド辞書の鍵 dictionaryKey が入る | レイヤ ZIP | ecorismap-zip「2. …dictionaryKeyを含めない」 | useGeoFile.ts:436; useRepository.ts:744 | 書き出し時と changeLayerId で取り除く（Storage Rules でメンバーに限られているため実害は小さい） |

---

## 採用しなかったもの（contested で反証を受け入れたもの）

- **gpx「timestamp=0の点も時刻が書き出される」**: 軌跡の点に 0 が入る経路がありません（`Geometry.ts:818`）。`typeof === 'number'` への修正は1行で済み、害もないので、直すのは任意です。
- **csv「極小の座標（指数表記）が0に化けない」**: 1e-6 度（約 0.1m）未満の値が 0 になるだけで、実害はありません。
- **ecorismap-zip「レコード0件のレイヤのデータZIP」**: アプリの書き出しでは作れない ZIP です。データ一覧のボタンは選択0件だと無効になり、設定だけの書き出しは正しく往復します。

---

## フォーマット別の項目型の往復対応表（field-types 担当の要約）

| 形式 | そのまま戻る | 直すべき欠落（束） | 仕様上やむを得ない |
|---|---|---|---|
| レイヤ ZIP（GeoJSON 経路: POINT/LINE/POLYGON） | STRING, STRING_MULTI, STRING_DICTIONARY, DATETIME, DATESTRING, TIMESTRING, TIMERANGE, NUMBERRANGE, LIST, RADIO, CHECK, TABLE, LISTTABLE, REFERENCE の値。0 以外の SERIAL/INTEGER/DECIMAL（負数・巨大数・小数も型ごと）。空文字。日本語・絵文字・改行・タブ・カンマ・`"`・`<>&` | 0 が空欄（H1）。PHOTO が `[]`（M3）。visible（L1）。_group と id（M9）。マップメモの属性とスタンプ（H4）。GNSS の標高（L2）。ポリゴンの頂点（M17） | — |
| レイヤ ZIP（NONE = CSV 経路） | 文字列・カンマ・`"`・`<>&` | 改行で分裂（H2）。PHOTO と数値が文字列（H3）。前後の空白（L13） | 先頭が `= + - @` の文字列に `'` が付く（L14。方針の判断が必要） |
| 単体 CSV | 座標（POINT/LINE） | 全項目が1列ずれる（M15）。WKT（M14）。型判定（M16）。SJIS（M19） | 型はすべて STRING になる |
| 単体 GeoJSON | JSON の型のまま戻る | 0 が空欄（H1）。先頭依存（M10、M13） | 型は STRING、PHOTO は名前の文字列になる |
| KML/KMZ | name/description、エスケープ、座標 | CDATA（M12）。MultiGeometry（M11）。KMZ の型（M10）。穴（L6）。undefined（L7）。標高（L2） | 項目は description にまとまる（L3） |
| GPX | name/time/cmt、座標、標高、時刻 | 実体参照（M6）。数値化と `'0'`（M7）。trkseg（M2）。time の無い wpt（M8）。線の time（L5）。制御文字（M5） | その他の項目は desc の文字列になる（L3）。DATETIME は UTC から端末のローカル時刻表記に変わる（同じ時刻を指す） |

- SERIAL の再採番: 取り込みは常に新しいレイヤになるので、再採番は起きません。文字列になっても getSerialMaxValue が parseInt で扱うため、採番は壊れません。

---

## テストファイルの扱い

**修正後に緑にすべき赤テスト（期待値はそのまま）**

- H1〜H4、M1〜M16、M18、M19、L1、L4〜L13、L15〜L20 に対応する赤テストがすべて該当します。
- 特に、往復で値が一致するもの、全件が失敗しないもの、写真フォルダの外へ書かないものは、回帰防止として必ず残してください。
- 現在緑の正常系（billion laughs・XXE が展開されないこと、`__proto__` で Object.prototype が汚れないこと、zip slip、辞書の fieldIdMap など）は、M6 と L10 の修正後も緑のままであることを確かめてください。

**仕様として期待値を見直すべきもの**

- **M17 の simplify**（geojson と ecorismap-zip のポリゴン）
  - ZIP 経路で簡略化をやめる方針なら、期待値はそのままでかまいません。
  - 外部ファイルでは簡略化を残すなら、geojson のテストは「許容誤差以内」の判定に変えてください。
- **L4 の (0,0)**: 既存の `src/utils/__tests__/Geometry.test.ts` の「return track/point from invalid gpx」は 0 埋めを期待しています。こちらを新しい仕様（除外）に合わせて直す必要があります。
- **L11**: 「"]]>" でも切れない」テストの期待値 `src="x]]>y.jpg"` は、HTML エスケープ後の `&gt;` を許す形に直してください。
- **L14**（csv の `'` の除去、NUMBERRANGE の負の値）: 無害化を残すか、取り込み時に外すかの方針を決めてから期待値を確定させてください。
- **L15**: 「フィールド名にカンマ…」で displayName と geometry まで引用符付きで完全一致させている部分は、厳しすぎます。列数が一致すること、と数式が先頭に残らないこと、の2点を判定する形に緩めてください。
- **L18**（zip bomb）: テストは 30MB で拒否することを期待していますが、30MB は正当なデータとしてありえる大きさです。実装の上限（例: 合計 200MB、圧縮率 100 倍）に合わせて入力を作り直してください。
- **L2・L3**: GPX の品質情報は `<extensions>` 前提に、KML の ExtendedData は「文字列として戻ること」に期待値を合わせてください。どちらのフォーマットも型は戻りません。
- **不採用の3件**（timestamp=0、指数表記の座標、0件レイヤの ZIP）: 削除するか、`it.skip` にして理由を書いてください。timestamp=0 は1行で直せるので、直して緑にしてもかまいません。

**実行時の注意**: `jest -t` を `--` の後ろに置くと、パスのパターンとして扱われ、ioaudit 配下のほかのファイルまで実行されます。`-t` は `--` の前に置いてください。