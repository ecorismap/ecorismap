# データ編集・作図の監査（2026-11）

2026-11-23 実施。データ編集と作図で次のことが起きる経路を探した。保存した内容が黙って元に戻る・消える。消したはずの記録が残る、または復活する。保存や画面表示が例外で止まる。利用者が選んでいない記録が操作の対象になる。形や値が意図せず変わる。入口によって規則が食い違う。

- **範囲**: 記録（レコード）の作成・編集・保存・削除・複製、レイヤ設定とフィールドの追加・削除・型変更・並べ替え、作図ツール（点・線・面・手書き・プロット・なげなわ選択・一括移動/回転/削除・Undo/Redo・スナップ）、マップメモ（描画・部分消去・色/太さ）、データ一覧（ソート・絞り込み・一括操作）、連番・辞書・計算フィールド。主なファイルは `useDataEdit.ts`、`useData.ts`、`useRecord.ts`、`useLayerEdit.ts`、`useLayers.ts`、`useDrawTool.ts`、`useMapMemo.ts`、`useEditableLayerSelection.ts`、`utils/Data.ts`・`Geometry.ts`・`Format.ts`・`Layer.ts`・`Coords.ts`、`modules/dataSet.ts`・`layers.ts`、`containers/DataEdit.tsx`・`LayerEdit.tsx`・`Data.tsx`・`Home.tsx`（作図部分）、`components/organisms/DataTable*.tsx`・`HomeDrawTools*` など。
- **方法**: 観点（記録、レイヤ設定、作図、選択と一括変形、マップメモ、データ一覧）ごとに候補を出し、重複をまとめた。各候補を3人が別々に検証し、実在するか、重大度、分類、手順の訂正を投票した。重大度・分類・手順は3票の多数に従い、訂正は本文に反映した。既存の監査（インポート/エクスポート、同期、軌跡、暗号、写真、地図タイル）とメモリに記録済みの既知・修正済みの問題は再報告していない。
- **結果**: 確認 35件（**high 4、medium 17、low 14**）。内訳は high＝安全4、medium＝安全14・判断3、low＝安全6・判断8。反証された候補はなし（候補の一部として退けたものは「反証されたもの」に記載）。
- コードは変更していない。手順はコードを読んで成り立つと確認したもので、実機では確かめていない（一部は一時テストで再現を確認、本文に明記）。
- **分類**: **安全に直せる**＝挙動の方針を変えずに直せる。**判断が要る**＝挙動や仕様を変えるので、どちらにするか決める必要がある。

---

## 優先して直すもの（high）

### E-H1. データ編集画面から位置を直した後（面を始点タップで閉じる・線を分割する）、属性だけ保存すると形が編集前に戻る【安全に直せる】

- **手順**
  1. 既存のポリゴンのデータ編集画面で「位置」ボタンを押す（`DataEdit.tsx:647-679` → navigateToHome、mode='editPosition'）。シートは `closeSheetLater` で閉じ、`BottomSheetContent.tsx:80` が閉じている間は画面を描かないので DataEdit はアンマウントされる。
  2. 地図で頂点を動かし、最初の頂点をタップして閉じる（`handleReleasePlotLinePolygon` → `tryFinishEditObject` → `savePolygon` → `finishEditPosition(true)`、`Home.tsx:3196-3205`）。ストアには新しい形が保存される。線の場合は位置編集中に分割する（`Home.tsx:3412-3414`、handleGrantSplitLine → finishEditPosition）。
  3. `finishEditPosition`（`Home.tsx:1510-1527`）は `openSheet(2)` するだけで、最新の記録を DataEdit へ渡し直さない。DataEdit は、位置編集前のスナップショット（`params.targetData`）のまま再マウントされる。
  4. 再マウント時、`useDataEdit` の effect は次の順に走る（`useDataEdit.ts:170-206`）。recordNumber の初期値は1（101行）。
     - [recordNumber] の effect: `allUserRecordSet[0]`（ストアの最新）を targetRecord にする。
     - [record] の effect: 古い `record` を targetRecord にし、recordNumber を実際の番号にする。
     - 実際の番号が1以外なら recordNumber が変わり、[recordNumber] の effect がもう一度走って最新の記録に置き換わる。**番号が1（レイヤの記録一覧の先頭）のときだけ**、古い記録が残る。
     - ストアとの同期の effect（`useDataEdit.ts:209-228`）は POINT しか扱わないので、線・面はここでも直らない。
  5. その状態でコメントなど別の項目を直して保存すると、`saveData`（`useDataEdit.ts:335-375`）が古い coords・centroid を含む targetRecord 全体に新しい updatedAt を付けて書き込む。
- **訂正**: 3票中2票は DataEdit がマウントされたままと見て「常に起きる」とした。1票はアンマウントと再マウントを指摘し、先頭の記録に限ると訂正した。コード（`BottomSheetContent.tsx:80`、`useDataEdit.ts:101, 170-206`）を確認すると後者が正しいので、条件は「対象が `allUserRecordSet` の先頭の記録」とする。先頭の線・面や、記録が1件だけのレイヤでは普通に起きる。通常の確定ボタン（`pressSaveDraw`、`Home.tsx:1831-1858`）は最新の記録で DataEdit を開き直すので起きない。点は同期の effect で直るので起きない。
- **根拠**: `Home.tsx:1510-1527, 3196-3205, 3412-3414`、`useDataEdit.ts:101, 170-228, 335-375`、`BottomSheetContent.tsx:80`、`DataEdit.tsx:647-679`
- **影響**: 地図で直した形が、関係のない属性の保存で黙って元に戻る。updatedAt が新しいので同期でも古い形が勝ち、他のメンバーにも広がる。分割の場合は元の記録が分割前の全長に戻り、分割した片と重なる。管理者がテンプレートや他人の記録を持ち替えた直後は targetRecord.userId も古いまま残り、続けて削除すると元の名義の集合を対象にしてしまう。
- **重大度について**: 3票中1票は medium（先頭の記録に限られる）。多数に従い high。
- **修正案**（どれか1つ）
  - `finishEditPosition` で、ストアから最新の記録を引き、`pressSaveDraw` と同じく `navigateToSplit('DataEdit', {previous:'Data', targetData: 最新, targetLayer})` で開き直す。
  - [record] の effect で `allUserRecordSet.find(d => d.id === record.id) ?? record` を使う。
  - 同期の effect で、`isEditingRecord=false` のときは線・面もストアの版（少なくとも coords・centroid・userId）を取り込む。

### E-H2. 属性のキーが無い記録で、データ編集の保存・一覧の並べ替え・レイヤ設定の保存が例外で止まる【安全に直せる】

- **キーが無い記録ができる経路**（どちらも実在）
  - 共有プロジェクトで管理者が既存のレイヤに属性（例: INTEGER の「個体数」）を追加する。`updateDataOfTheLayer`（`useLayerEdit.ts:170-198`）が空の値を入れるのは、その端末のローカルの dataSet だけ。メンバーがすでにアップロードした記録や、他の端末の記録にはキーが無い。属性の追加は移行の警告（`unmigratedCloudFieldNames`）の対象外で、読み込み時に補う処理も無い。
  - `"properties": null` のフィーチャーを含む GeoJSON を取り込むと、`createFields`（`Geometry.ts:2089-2091`）が `{}` を返す。
- **手順と症状**
  1. **データ編集の保存**: キーの無い記録を開き、別の項目だけ直して保存する。`checkFieldInput`（`Data.ts:389-399`）が `record.field[l.name]`（undefined）をそのまま `formattedInputs` に渡す。INTEGER・DECIMAL・SERIAL の分岐（`Format.ts:87, 105, 123`）は `''` だけを未入力とみなし、`value.toString()` で TypeError になる。`runSave`（`DataEdit.tsx:86-91`）に try が無く、`finalizeSave` も await されないので、何も表示されずに保存されない。新しい欄に何か入れない限り保存できない。
  2. **一覧の並べ替え**: その列の見出しをタップする。`sortData`（`Data.ts:78-83`）は先頭の行しか undefined を確かめず、2行目以降で `a.field[fieldName].toString()` が例外になる（一時テストで TypeError を確認）。先頭の行に値が無いときは、黙って並べ替えない（ソート中の扱いになりドラッグも無効）。
  3. **ソート設定が保存された後**: ソート設定（sortedName/sortedOrder）はレイヤに保存され、`useData.ts:391-395` の effect が開くたびに同じソートを実行する。ソート設定を保存した後でキーの無い記録が加わると、そのレイヤのデータ一覧を開くたびに落ちる。
  4. **レイヤ設定の保存**: 取り込んだ STRING の列を LIST・CHECK・STRING_DICTIONARY などに変えて保存すると、`changeFieldValue`（`Data.ts:127-128`）の `originalData.toString()` が例外になり、レイヤ設定を保存できない。
- **訂正**: 見出しのタップで最初に例外が出たときは、dispatch より前に止まるのでソート設定は保存されない。「開くたびに落ちる」のは手順3の場合に限る。表示は `DataEditNumber` が `rawValue ?? ''` としているので落ちない。
- **根拠**: `Format.ts:80-131`、`Data.ts:78-83, 119-170, 389-399`、`DataEdit.tsx:86-91, 190-200`、`useData.ts:158-185, 391-395`、`useLayerEdit.ts:170-198`、`Geometry.ts:2089-2091`
- **影響**: 記録を保存できない、データ一覧が開けなくなる、レイヤ設定を保存できない。いずれも理由が表示されない。
- **重大度について**: 3票中1票は medium（保存だけを見た評価）。一覧が開けなくなる経路を含めて、多数に従い high。
- **修正案**: undefined と null を空欄として扱う。
  - `formattedInputs` の SERIAL・INTEGER・DECIMAL で、`value === undefined || value === null` も `''` と同じく未入力にする。
  - `sortData` は `String(v ?? '')` で比べ、先頭の行だけ見て早期 return するのをやめる。値の無い行は末尾に集める（DATETIME と同じ扱い）。
  - `changeFieldValue` は `originalData` が undefined/null なら `getBlankFieldValue(changedFormat)` を返す。
  - E-M5（NaN が再起動後に null になる）も同じ修正で防げる。

### E-H3. TABLE・LISTTABLE の列や選択肢を編集して保存すると、全記録の表の値が消える【安全に直せる】

- **手順**
  1. TABLE（例: 列が「種名|個体数」）または LISTTABLE の属性に値が入った記録がある。値は `'種A|3,種B|1'` のような文字列で記録にある（`DataEdit.tsx:319-340`、`DataEditTable.tsx:16-29`）。
  2. レイヤ設定でその属性の値設定を開き、列（選択肢）を1つ足すか、見出しの誤字を1字直して戻り、保存する。TABLE・LISTTABLE は `useFieldList.ts:160-162` の else 分岐で list を自由に編集できる。
  3. `saveLayer`（`useLayerEdit.ts:202-207`）は、形式が同じでも `JSON.stringify(list)` が違えば changedFields に入れる。`updateDataOfTheLayer`（186-195行）が全記録に `changeFieldValue(元の値,'TABLE','TABLE',list)` を呼ぶ。
  4. `changeFieldValue`（`Data.ts:119-170`）は、TABLE・LISTTABLE が `isTextValueFormat` にも明示の分岐にも無い（形式が同じで値を残すのは LIST→LIST だけ）。`getInitialFieldValue` の `''`（`Data.ts:203-206`）が返る。
- **根拠**: `useLayerEdit.ts:186-195, 202-207`、`Data.ts:111-117, 119-170, 203-206`、`useFieldList.ts:160-162`。テスト（`Data.test.ts:238-262`）にこの組み合わせは無く、93fdafa2 の修正も選択肢系だけが対象。
- **訂正**: REFERENCE も同じ経路で `''` になるが、REFERENCE の値は表示用の 'Reference' だけで実データを持たない（`Data.ts:240`、`DataEdit.tsx:303-317`）ので、実害はほぼ無い。影響は TABLE・LISTTABLE に絞る。
- **影響**: 形式を変えていないのに、そのレイヤの表形式の調査データが全件、確認なしで消える。共有プロジェクトでなければ確認ダイアログも出ない。
- **修正案**: `changeFieldValue` の先頭で、`originalFormat === changedFormat` なら元の値をそのまま返す（LIST→LIST と同じ扱い）。または `saveLayer` で、形式が同じで list だけが変わった属性を changedFields から外す。列を削除・並べ替えたときに、位置で持つ値（`'a|b'`）を付け替えるかどうかは別の判断で、今回は値を残すだけでよい。

### E-H4. データ一覧で絞り込みを変えると、チェックが別の記録へ移り、その記録が一括削除・書き出しの対象になる【安全に直せる】

- **手順**（一時テストで再現済み）
  1. 記録 r1=スギ、r2=ミズナラ、r3=スギナ の一覧で、2行目の r2 をチェックする（checkList=`[{id:0},{id:1,checked:true},{id:2}]`）。
  2. 「Name: スギ」で絞り込む。filteredRecordSet=[r1,r3] になる。`setFilter`（`useData.ts:84-89`）は checkList を消さない。
  3. `useData.ts:391-395` の effect が `changeOrder` を再実行する。`changeOrder`（`useData.ts:162-175`）は、どの記録かを見ずに、旧 checkList の id（＝旧一覧での位置）を新しい一覧の同じ位置へ引き継ぐ。新しい位置1の r3 がチェック済みになる。
  4. `checkedRecords`（`useData.ts:122-125`）は sortedRecordSet を位置で引くので `['r3']`。ここで削除すると r3 が消え、r2 は残る。
- ほかの手順: 絞り込み中に全選択してから別の値へ絞り込み直す・解除する（旧一覧の件数ぶん、新しい一覧の先頭から別の記録がチェックされる）。列ソート中に絞り込みを変える。同期で記録が増減して filteredRecordSet が変わる。checkList を空にするのは追加・削除・並べ替えの後だけで、絞り込みの変更時には何もしない。
- **根拠**: `useData.ts:84-89, 122-125, 157-185, 281-292, 391-395`、`containers/Data.tsx:369-379`
- **影響**: 利用者がチェックしていない記録が削除・書き出し・地図表示の対象になる。大量データではチェックが画面外の行に移るので気づきにくい。アップロード済みなら墓標としてクラウドからも消える。
- **修正案**: チェック状態を位置ではなくレコード id で持つ（checkList の要素に recordId を持たせる、または `Set<string>`）。`changeOrder` は recordId で照合し、新しい一覧に無い id は落とす。`changeChecked`・`changeCheckedAll`・`checkedRecords`・`DataTable`（ネイティブと Web）の表示も id で引く。最小限なら、絞り込みを変えたとき（filteredRecordSet が変わったとき）に checkList をすべて未チェックへ戻す。E-M15 もこの修正で同時に直る。

---

## medium

| # | 内容 | 分類 | 箇所 | 修正案 |
|---|---|---|---|---|
| E-M1 | データ編集画面から飛翔線を削除すると、ぶら下がる行動記号（`_group` の子）が残る。`isMapMemoLayer` は「レイヤ内に `_strokeColor` を持つ記録があるか」で決まり、猛禽類野帳（飛翔）は CATEGORIZED なので `_strokeColor` が書かれず false。`deleteRecord` は親だけを消す。一覧からの削除（withChildRecords、同期監査 M14 で修正）と作図からの削除は子も消すので、入口で結果が変わる。残った子は一覧に出ず（`selectors.ts:76`）、地図でも選べない（`useDrawTool.ts:447-450`）ので消す手段がなく、アップロードで他のメンバーにも配られる。なおマップメモの分岐も、子を `targetRecord.userId` の集合でしか消さないので、別名義の子は残る | 安全 | `useDataEdit.ts:139-143, 432-470`、比較 `useData.ts:337-387`、`useDrawTool.ts:98-115, 990-1001`、`layerPresets.json:11` | `isMapMemoLayer` に関係なく、レイヤの全集合から `_group === targetRecord.id` の子を集め、子の userId ごとに `deleteRecordsAction` を出す（useData の byBucket と同じ）。子が他人名義の場合に `deleteBlockMessage` を子にも当てるか決めておく。写真の削除範囲は今のまま |
| E-M2 | 1件目で ← を押して「変更を破棄」に OK すると、画面には破棄したはずの値が残り、この編集で追加した写真のファイルだけが消える。← は value=1（今と同じ番号）を送り、`onChangeRecord` は比較せず確認を出す。`changeRecord(1)` は同じ値なので effect が走らず targetRecord は戻らない。`cancelUpdate` は追加写真を `deleteLocalPhoto` で消し、一時リストを空にし、isEditingRecord=false にする。そのあと何か1つ編集して保存すると、破棄した値と、ファイルの無い写真 uri がまとめて保存される。編集で外した写真は削除リストから消えているので端末に孤児として残る。最後の記録で → を押した場合は、確認が出て何も起きないだけ（データは壊れない） | 安全 | `DataEditRecordSelector.tsx:16-23`、`DataEdit.tsx:443-459`、`useDataEdit.ts:170-189, 237-244, 509-538` | `onChangeRecord` の先頭（isPhotoProcessingRef の確認の直後、確認ダイアログの前）で `if (value === recordNumber \|\| value < 1 \|\| value > maxRecordNumber) return;` |
| E-M3 | 実行中プロジェクトで、COMMON の参照先レイヤへ、参照欄の「＋」や辞書入力から記録を追加できてしまう（ロックを通らない）。`pressAddReferenceData`・`pressAddReferenceDataByDictionary` は isEditingRecord しか見ず、`addDefaultRecord` は権限を見ない。一覧からの追加は `checkRecordEditable` で lockProject として断っている。追加した記録はメンバーのアップロード対象（PublicAndPrivate）に入らず、手元にだけ残って他のメンバーと食い違う。辞書入力は編集画面も開かずに即追加する | 判断 | `DataEditReference.tsx:59, 92-133`、`DataEdit.tsx:622-648, 694-718`、`useData.ts:301-331`、比較 `Data.tsx:178-217`、`useRecord.ts:227-229` | 2つの関数の先頭で、`isRunningProject` かつ最新の layers 上の参照先が `permission==='COMMON'` なら lockProject を出して止める。`DataEditReference` の＋と辞書入力も同じ条件で無効にする。編集レイヤ切替の確認は入れない（POINT の参照先で主レイヤが非アクティブになる、`useLayers.ts:142-146`）。今できている追加が断られるようになるので判断 |
| E-M4 | DECIMAL→INTEGER など一部の形式変更で、既存の値が全件 0 または空に戻る。`changeFieldValue` に分岐の無い組み合わせは `getInitialFieldValue`（数値は 0、日付は ''）になる。対象は DECIMAL→INTEGER/SERIAL、STRING_MULTI・STRING_DICTIONARY・LIST→INTEGER/DECIMAL、DATETIME→DATESTRING、TIMESTRING→TIMERANGE など。逆向きの INTEGER→DECIMAL（132行）と STRING→INTEGER（152行）は値を残すので非対称。保存前の確認は共有プロジェクトのときだけ（`LayerEdit.tsx:66-72`）で、個人データでは確認なしで全件置き換わり、形式を戻しても復元できない | 判断 | `Data.ts:119-170, 188-206` | DECIMAL→INTEGER/SERIAL は `Number.isFinite` な値を残す（丸めるか切り捨てるかを決める）。文字列系→数値は STRING と同じく parse して残す（数値にならない値を 0 にするか空にするかを決める）。値を初期化する組み合わせでは、共有かどうかに関係なく件数を示して確認する |
| E-M5 | STRING を INTEGER・DECIMAL・SERIAL に変えると、空欄と数値でない値が NaN になる。`changeFieldValue` の STRING→数値は `parseInt`/`parseFloat` をそのまま入れる。空欄（列を後から追加した記録の ''）は普通にある。一覧には「NaN」と出る。データ編集で別の項目を直して保存すると、`formattedInputs` が 'NaN' を不正とみなし「以下の値を正しく入力してください 個体数(INTEGER):NaN」で止まる。再起動すると JSON の永続化で null になり、並べ替えとデータ編集の保存が E-H2 と同じ例外で落ちる（再起動前は表示と保存拒否だけ） | 安全 | `Data.ts:153-159, 244-246`、`Format.ts:97-110`、`dataSetStorage.ts:94-97`、`useLayerEdit.ts:188-194` | STRING→数値で、元の値がトリム後に '' なら `getBlankFieldValue(changedFormat)`（''）を返す。parse の結果が NaN の場合も NaN は入れない（'' にするか元の文字列を残すかは判断）。既に null が入った記録には E-H2 の修正が効く |
| E-M6 | INTEGER・DECIMAL の既定値の欄を空のまま（または「abc」で）戻ると、既定値が NaN になり、そのセッションで作る記録に NaN が入る。値設定の「＋」は `{value:''}` を足し、`useLayerEdit.ts:150-153` は `itemValues[0]` があれば無検査で parse する。`checkLayerInputs` は既定値を見ない。`getDefaultFieldValue` の `value ?? 0` は NaN を通す。作図は検査せずに保存するので NaN のまま記録され、データ編集では「NaN」と表示され保存できない | 安全 | `useLayerEdit.ts:150-153`、`useFieldList.ts:252-256`、`LayerEditFieldItem.tsx:231-236, 287-301`、`Layer.ts:380`、`Data.ts:294-305` | parse の結果が `Number.isFinite` でなければ defaultValue を undefined にする |
| E-M7 | 新規レイヤで辞書付きのプリセットを選び、保存の前に属性の値設定かスタイルの画面を開いて戻ると、プリセットの辞書が登録されない。保留中の辞書は `pendingPresetDictionariesRef`（useRef）にだけある。ボトムシートは今の画面しか描かないので、遷移で LayerEdit はアンマウントされ、戻ると `navigate('LayerEdit', …)` で新しく積まれて ref は [] に戻る。保存時に `importPresetDictionaries` が呼ばれず、辞書型の属性の候補が空のレイヤができる（利用者には知らされない）。辞書付きプリセットは `layerPresets.json` に3件。同梱データ `pendingPresetGeojsonRef` も同じ仕組みで失われる（今は dataKey を持つプリセットが無い）。開かずにそのまま保存すれば正しく登録される | 安全 | `useLayerEdit.ts:82-84, 241-247, 525-535`、`BottomSheetContent.tsx:69-97`、`BottomSheetNavigationContext.tsx:163-166`、`LayerEdit.tsx:102-126`、`LayerEditFieldItem.tsx:45-54`、`LayerEditFeatureStyle.tsx:44-53` | 保留中の辞書とデータを、レイヤ id をキーにしたモジュールスコープの Map に置くか、navigate の params で往復させる。保存したら消し、保存せずに戻ったら破棄する |
| E-M8 | 既存の「区分」（英語 UI では「Category」）が STRING のレイヤで用途を植生図にすると、コードの入れ先が不正な設定になり、レイヤを保存できない。`changeToolPalette('VEGETATION')` は同名の属性を形式を見ずに categoryField にし、`codeFieldId` を付ける条件に区分側の `hasCodeLink`（LIST/RADIO）を含めない。保存で `checkLayerInputs` が invalidCodeField を返し「値の設定で選び直してください」と出るが、STRING の値設定画面にはコードの入れ先の Picker が無い。値設定で何かを編集して戻る・形式を一度変える・LIST に変えると外れるが、案内からは分からない | 安全 | `useLayerEdit.ts:338-358`（356行の条件）, `159-160, 455-458`、`Layer.ts:347, 438-455`、`LayerEditFieldItem.tsx:180-193` | 356行の条件を `categoryField.codeFieldId === undefined && hasCodeLink(categoryField.format) && isCodeTargetFormat(codeField.format)` にする。既存の STRING の区分を LIST に変えるかどうかは別の判断 |
| E-M9 | 作図の編集選択中に、データ一覧で選択中の記録を編集・削除すると、地図で確定したとき選択時点の古い版で上書きされる（属性が戻り、削除した記録が復活する）。`convert*FeatureToDrawLine` は選んだ時点の record を drawLine に持ち、dataSet が変わっても引き直さない。レイヤボタン（`gotoLayers`）は isEditingRecord しか見ないので、選択を保ったままデータ一覧・データ編集を開ける。確定すると `savePoint`/`saveLine`/`savePolygon` が `{...line.record, coords}` を `updateRecord`（updatedAt を更新）に渡す。`updateRecords` は id が同じなら丸ごと置き換え、無ければ追加するので、墓標は生きた版で上書きされ、物理削除された記録は追加し直される。saveLine は findRecord が undefined なら addRecord もする。同期で他の端末の変更が入った後に確定した場合も同じ。updatedAt が新しいので同期でも古い版が勝つ | 安全（削除済みの扱いは判断） | `useDrawTool.ts:376-424, 1032-1035, 1131, 1156-1161, 1265, 1283`、`useRecord.ts:332-358`、`dataSet.ts:71-95, 242-`、`Home.tsx:2418-2429`、`pages/Home.tsx:774` | 保存の直前に `findRecord(line.layerId, line.record.userId, line.record.id, type)` でストアの最新の版を引き直し、coords・centroid と、操作したスタイル項目（applyStyleToSelected）だけを重ねる。ストアに無い、または deleted の要素は保存しない。ただし saveLine の分割でできた新しい線は addRecord を残すので、分割由来の印を drawLine に持たせて区別する。削除済みを保存しない・選択を自動で解く部分は挙動が変わるので判断 |
| E-M10 | 頂点15以上のポリゴンをタップで選び、形を変えずに確定すると、閉じ目の周りの形が変わる。タップ選択で `changeToEditingObject` が閉じ点を外し、`isHandwrittenSelection`（頂点15以上）で手書き扱い（properties=HANDWRITING）になる。プロットで打った面か取り込んだ面かは区別しない。`pressSaveDraw` は変更の有無を見ずに `savePolygon` を呼び、始点≠終点・HANDWRITING なので `closeFreehandPolygonSeam` に入る。閉じ目の角が150°未満（直角など普通の角）ならベジエに置き換える。**訂正**: 丸まるのは「前後24px」ではない。辺が24pxより長い面（プロットした面ではよくある）では、元の最終頂点と頂点0の2点が消え、頂点n-2から頂点1までがベジエの11点に置き換わる。さらに始点を floor(n/2) 回転させて返すので、確定するたびに閉じ目が別の頂点へ移り、選択・確定を繰り返すと別々の角が次々に丸まる | 安全 | `useDrawTool.ts:78, 555-573, 615, 1222-1237, 1712-1767, 1808-1810, 1865, 1883-1887`、`Home.tsx:1805-1817`、`Coords.ts:550-612` | 閉じ目の平滑化は、そのセッションで描いた新しいストローク（`line.record === undefined`）か、なぞり修正などで形を変えたものに限る。既存の記録で形が変わっていなければ、従来どおり先頭点を足して閉じる。形が変わったかは、選択時に pushUndo した latlon と比べれば判定できる |
| E-M11 | 飛翔図で保存済みの飛翔線を選び、パレットの「行動削除」で保存済みの記号を消してから「キャンセル」しても、記号は戻らない。保存済みの記号は `eraseHandwritingSymbol` がその場で `deleteRecordsAction` し、Undo 用の控え（DELETE_SYMBOL）を積むだけ。`cancelDraw` は `resetDrawTools` を呼ぶだけで、`undoLine.current=[]` で控えも捨てるので戻す手段がない。線の編集はキャンセルで元に戻るのに、記号の削除だけ先にストアへ確定する非対称（同期で他のメンバーからも消える） | 判断 | `useDrawTool.ts:483-507, 1457-1470, 2209-2231, 2248`、`Home.tsx:1630-1652`、`ToolPalette.ts:96` | (a) 保存済みの記号は削除予定として控えて描画上だけ隠し、saveLine の確定時にまとめて消す。または (b) `cancelDraw` で resetDrawTools の前に、undoLine の deletedRecord を新しい順に `updateRecordsAction`（updatedAt を更新）で戻す。削除の確定時期とキャンセルの意味が変わるので判断。3票中1票は low |
| E-M12 | 作図の編集選択中に、レイヤ一覧で同じ種類の別レイヤ B を編集レイヤにしてから削除すると、何も消えないのに削除できたかのように B のデータ一覧へ移る。選択した要素は元のレイヤ A の layerId を持つが、`deleteDraw` は今のアクティブレイヤ B を取り、B で権限を判定し `deleteDrawRecord(B.id)` を呼ぶ。`deleteRecordsAction({layerId:B})` は A の id に当たらず何もしない。飛翔線の子の記号も B から探すので消えない。レイヤ一覧の編集ボタンは作図状態に触れず、チップからの切り替え（`Home.tsx:1248-1257`）だけが破棄の確認をしている。保存・移動の経路は line.layerId を使っているので、削除だけが食い違っている | 安全 | `useDrawTool.ts:376-400, 511-528, 973-1004, 1404-1420`、`LayersTable.tsx:93`、`useLayers.ts:125-152`、`Home.tsx:1179-1195, 2418-2429, 3127-3140` | `deleteDraw`/`deleteDrawRecord` で drawLine を line.layerId ごとに分け、そのレイヤで `checkRecordsModifiable` を通し、そのレイヤの id で削除し、子の記号もそのレイヤから探す。移動先のデータ一覧も選択したレイヤにする。「編集レイヤが変わったら選択を破棄・確認する」案は挙動が変わるので判断 |
| E-M13 | 穴（内側のリング）のあるポリゴンをなげなわで移動・回転すると、外周だけが動いて穴が元の位置に残る。`convertPolygonFeatureToDrawLine` は外周の coords だけを drawLine に載せ、`moveFeaturesTransform`・`finishFeaturesTransform`・EDIT_MULTI の undo/redo も xy/latlon しか扱わない。`savePolygon` は `{...line.record, coords, centroid}` なので holes は変形前のまま保存される。`useDrawTool.ts` に holes を扱う箇所は無い。地図・3D・PDF・書き出しはどれも holes を使うので、穴が外周の外にずれた形が表示・出力される。編集中の SVG は外周しか描かないので、確定するまで気づけない。穴は取り込み（GeoJSON・CSV の WKT）や可視領域でできる | 安全 | `useDrawTool.ts:409-424, 1699, 1909-1978, 1265`、`Geometry.ts:117-123, 1909-1918`、`HomePolygon.tsx:142` | drawLine の要素に holes の xy・latlon を持たせ、移動・回転・undo/redo で外周と同じ変換をかけ、savePolygon で書き戻す。最小限なら、確定時に外周の変形前後から平行移動量と回転を求めて holes に適用する（EDIT_MULTI の latlonEntries にも holes を含める） |
| E-M14 | マップメモで、線を描いた直後（保存待ちの1秒以内）に Undo を押すと、1つ前の操作が取り消され、描いた線は履歴からもストアからも消える。`pressUndoMapMemo` はまず `flushPendingSave` で B をストアへ入れ、`setHistory(prev=>[...prev, addB])` を予約する。ところが続く処理は閉包の古い history（[addA]）を使い、非関数形の `setHistory(history.slice(0,-1))` が予約を上書きし、future=[addA] になる。`commitMemoLines` はストアの B を含む全件を読むが、`mergeMemoHistoryResult` は before にも after にも無い B を捨てる。結果、Undo 1回で A と B が消え、Redo で戻るのは A だけ。直前の操作が部分消去などでも同じく B が失われる（最初の1本のときは history が空なので起きない） | 安全 | `useMapMemo.ts:150-173, 300, 403, 557-559, 1048-1109` | 保存待ち（`timer.current !== undefined`）の Undo は、ストアに入れずにタイマーを止め、mapMemoLines を空にして return する（保存前の線を取り消す）。または flush の後で history・future・記録を ref か `store.getState()` から読み直し、setHistory/setFuture を関数形にする。保存前の線を future に積むにはレコードの id が無いので、前者が簡単 |
| E-M15 | ネイティブのデータ一覧で、並び順が変わった行のチェックボックスを押すと、別の行にチェックが付く。`DataRow` はレンダー時の `index = getIndex()` をハンドラに閉じ込めるが、`getIndex` は draggable-flatlist のキーごとに安定した関数で最新値を返すので、比較関数（121-142行）の prev/next が同じ値になり位置の変化を検知できない。降順⇔昇順の切り替え・ソート列の切り替え・絞り込み中の値の変更（isDragDisabled が変わらない遷移）で、チェックが前後とも同じなら再レンダーが省かれ、古い index のまま `changeChecked(旧index)` が呼ばれる（一時テストで確認）。UNSORTED との切り替えでは起きない。Web 版は index を比較しているので起きない。**票の割れ**: 3票中2票は行タップで別の記録の編集画面が開くとも主張したが、`gotoDataEdit` も同じ古いレンダーの props（旧 sortedRecordSet を閉じ込めた関数）なので index と組が崩れず、正しい記録が開く（`DataTable.tsx:74, 88, 99`、`Data.tsx:355-363` を確認）。影響はチェック操作に限る | 安全 | `DataTable.tsx:41, 60-64, 121-142`、`node_modules/react-native-draggable-flatlist/src/components/RowItem.tsx:40-42`、`DraggableFlatList.tsx:140-145, 197-202`、`useData.ts:218-219` | チェック操作をレコード id で行う（E-H4 の修正で同時に解消）。index を値の prop にして比較する案は、keyToIndexRef が layout effect で更新されるためソート直後のレンダーでまだ古い値になりうるので、それだけでは足りない可能性がある |
| E-M16 | 小数・負の数の列ソートが数値順にならない。`sortData` は DATETIME 以外を `toString().localeCompare(..., {numeric:true})` で比べ、format を受け取っていても数値列を区別しない。numeric は数字の連続を整数として比べるので、小数部は 5<25、マイナスは符号として扱われない。1.5, 1.25, -5, -10 の昇順は [-5, -10, 1.5, 1.25] になる（node で再現） | 安全 | `Data.ts:62-103`（81-83行）、`useData.ts:172` | format が INTEGER/DECIMAL/SERIAL で両方が `Number()` で有限値なら `a-b` で比べる。片方でも数値にならないとき（空欄・非数値）は今の localeCompare に戻して位置を保つ（空欄を末尾へ移すかは別の判断）。同値の二次ソートの判定も数値で揃える |
| E-M17 | 絞り込みやソートの対象列を改名・削除すると、絞り込み中の表示のまま全件が出る、またはソートが黙って外れドラッグもできなくなる。(a) `dataFilterPerLayer[layerId].fieldName` は改名・削除に追従しない（保存処理 `useLayerEdit.ts:206-223` も `updateFieldReferences` も触れない）。`filterRecords` は対象列が無いと全件を返すが、`isFiltering` は filterText だけで決まるので、バーには「樹種: スギ」と出続け、ドラッグも無効のまま。全選択しての削除・書き出し・地図表示は全件が対象になる（件数表示は全件の数になるので手がかりはある）。(b) `sortedName` は改名には追従するが削除では残り、`sortData` は並べ替えずに返すのに sortedOrder はそのままなので、アイコンが無いのにドラッグが無効になる（別の列見出しを一巡させれば戻る） | 安全 | `Layer.ts:85-, 128-129`、`useData.ts:79-81, 126, 225, 391-395`、`useLayerEdit.ts:180, 206-223`、`Data.ts:78-79, 829-832`、`pages/Data.tsx:156-162`、`DataTable.tsx:210`、`DataTable.web.tsx:276` | レイヤ保存時に renames で `dataFilterPerLayer` の fieldName を新しい名前へ移す。削除した列や絞り込めない形式に変えた列が対象なら絞り込みを解除する。`updateFieldReferences` で、削除された sortedName なら sortedName を外し sortedOrder を 'UNSORTED' にする。防御として `isFiltering` に「対象列が実在する」を加える（fieldName が '' と '_user_' は常に可） |

---

## low

| # | 内容 | 分類 | 箇所 | 修正案 |
|---|---|---|---|---|
| E-L1 | 連番と「前回値の引き継ぎ」に使う記録の集合が入口で違う。地図の作図は自分→名義なし→テンプレートの順に連結した集合（1b978849 で導入）を `getDefaultField` に渡すので、テンプレートが1件でもあれば前回値（配列の末尾）はテンプレートの最後の値になり、連番はテンプレートまで含めた最大値+1。一覧からの追加は自分の記録だけで計算する。テンプレートが SERIAL 1〜5 なら一覧からは1、地図からは6が振られ、一覧上で番号が重複する。ログイン前の記録でも同じ | 判断 | `useRecord.ts:178-215, 272-281`、`Data.ts:248-260, 293`、`useData.ts:306-309`、`useDrawTool.ts:1017-1038, 1101-1176, 1254-1293` | 前回値は自分の記録の末尾（または updatedAt 最大）、連番は画面に出る全記録の最大値+1、などの規則を決め、両方の入口が同じ抽出関数を使う |
| E-L2 | 属性の形式を変えても既定値が残り、新しい記録に不正な値が入る。`changeFieldFormat` は codeFieldId などは外すが defaultValue に触れない。STRING の既定値「未確認」のまま INTEGER に変えて保存すると、作図で作る記録の数値列に文字列が入り、データ編集では保存で止まる。TIMESTRING・TIMERANGE へ変えた場合は Format.ts が無検査で通すので不正な文字列のまま記録され、TIMESTRING の値設定画面では既定値を消せない | 安全 | `useLayerEdit.ts:441-468`、`Data.ts:294-305, 340-341`、`useFieldList.ts:131-138` | `changeFieldFormat` で、新しい形式に合わない defaultValue を外す |
| E-L3 | 作図のスタイル設定で「極太」を選ぶと、プレビューは太さ10、保存は20になる。`setPenWidthMarked` のプレビュー変換が「細2/中5/それ以外10」で極太の分岐が無い（コメントは useMapMemo と同じ対応と書いている）。新しく描いた手書きの線は line.style が優先されて10で保存され、後から描く線と選択して確定した線は20になる | 安全 | `Home.tsx:1349, 1362, 1410-1418, 1447-1456, 4056`、`useMapMemo.ts:283-298`、`HomeModalStyleSettings.tsx:155`、`useDrawTool.ts:1145, 1180, 2134-2156` | プレビュー変換に PEN_EXTRA_THICK→20 を足し、PenWidthType→数値の変換を1つの関数にまとめて両方から使う |
| E-L4 | 飛翔図で単独の行動位置（線に紐づかないスタンプ）を動かすたびに、選んだ詳細が既定値（不明）へ戻り、詳細モーダルがまた開く。移動では activeHandwritingIsNew=false だが、`finalizeHandwritingStroke` の行動属性の処理は wasNew を見ずに `fieldValues` を `behavior.defaultValue` で上書きし、`setPendingSymbolDetail` を呼ぶ。モーダルを閉じても値は戻らない（とまり・誇示・排斥など詳細のある8行動） | 安全 | `useDrawTool.ts:2299-2316, 2423-2523`（2505-2521行）, `2526-2536`、`HisyouBehavior.ts:26-33` | 行動属性の処理（既定値の代入と setPendingSymbolDetail）を `if (wasNew)` で囲む |
| E-L5 | 保存済みの行動記号を作図の「行動削除」で消しても、親の飛翔線に集約した行動の値（CHECK）が残る。`mergeBehaviorToParent` は足すだけで、外す処理がどこにも無い。削除は確定を待たずタップ時点でストアに反映される。地図上の記号と親の属性が食い違い、集計や書き出しに消した行動が残る | 判断 | `useDrawTool.ts:127-150, 1184-1207, 2209-2231` | 削除時に、同じ親に同じ行動・値の記号がほかに残っていなければ親の値から除く（Undo で記号を戻すときは親へ足し直す）。または親の値を子の記号から毎回集計し直す。手で入れた値と区別できないので判断 |
| E-L6 | 作図の削除は子の行動記号を権限判定に含めないので、テンプレート（または他人）名義に残った子記号が消えず、親のない記号として残る。テンプレートの飛翔線を一般メンバーが編集すると親だけが自分の名義へ移り（`moveRecordsToUserAction` は子を移さない）、作図で親を削除すると `deleteDraw` は自分の親だけ判定して通り、子への削除は所有権の規則で黙って block される。子はタップで選べず、なげなわで選んでも adminOnly で止まるので、一般メンバーには消す手段が無い。PRIVATE レイヤでは管理者も止まる。一覧の削除は withChildRecords で子も判定する | 判断 | `useDrawTool.ts:447-451, 973-1003, 1405-1418`、`recordOwnership.ts:120-131`、`useDataEdit.ts:366-377`、`useRecord.ts:334-346`、比較 `useData.ts:338-355` | (a) `deleteDraw` で同じレイヤの `_group` の子も `checkRecordsModifiable` の対象に含め、1件でも消せなければ全体を止めて理由を出す。または (b) テンプレートの親を持ち替えるとき子も一緒に持ち替える。どちらも挙動が変わる |
| E-L7 | マップメモで、ピンチで中断中の線や保存待ち（1秒以内）の線が、アカウントボタンから「プロジェクト」「設定」「ログイン」へ移ると保存されずに消える。これらの遷移で Home はアンマウントされ（TRACK_AUDIT T-H1 と同じ仕組み）、中断中の線は ref ごと消え、アンマウント時の処理は保存タイマーを止めるだけ。ツールやタブの切替では `flushPausedPenStroke` で確定しているのに、この遷移だけ抜けている。保存待ちは1秒の窓なので、主に起きるのは中断中の線 | 安全 | `useMapMemo.ts:193, 330-343, 374-399, 552-575, 1167-1177`、`Home.tsx:1264, 1298, 1469, 1705, 1723, 2398-2416`、`trackingLeaveGuard.ts:260-264` | `leaveHomeWithTrackingGuard` の navigate コールバックの中で `flushPausedPenStroke()` と保存待ちの即時保存を呼ぶ（flushPendingSave を戻り値に公開する。finishPenStroke 直後は state が未反映なので、新しい線を ref に持って即保存する） |
| E-L8 | マップメモの `_zoom` が、Web とネイティブで基準の違うズームで保存・比較され、同じメモの線の太さと記号の大きさが端末間で2倍ずれる。Web は maplibre（512px 基準、同じ縮尺で Google より1小さい）の zoom、ネイティブは Google の zoom をそのまま `_zoom` に保存し、それぞれの基準で比べる。iOS のズーム16で描いた線は Web の同じ縮尺で半分の太さになる。記号の基準 SYMBOL_BASE_ZOOM=14 も両方同じ値。PDF は `tiles.ts:165` で maplibre 用に z-1 しており、基準が違うことはコード内でも前提になっている | 判断 | `useMapMemo.ts:389, 544`、`useDrawTool.ts:108-111`、`useMapView.ts:107-133`、`Layer.ts:221-242`、`MapGl.web.ts:63-75` | Google（256px）基準に揃える。Web では保存時に +1、`MapGl.web` の stops と記号の縮小率は maplibre の zoom+1 で比べる。既存の `_zoom` はどちらで描いたか分からないので扱いを決める |
| E-L9 | 矢印付きのメモ線の途中を部分消去すると、分かれたどの断片にも矢印が付き、切れ目に余計な矢印が出る。断片は元の field（`_strokeStyle`）をそのまま引き継ぎ、描画はレコードごとに端点へ矢印を描く。ARROW_BOTH なら断片ごとに両端に付く | 判断 | `useMapMemo.ts:131-132, 823-880`（850-867行）、`HomeLine.tsx:147-164`、`HomeLine.web.tsx:47-51, 100-`、`types/index.d.ts:815` | ARROW_END は元の終点を含む最後の断片だけに残し、ほかは 'NONE'。ARROW_BOTH は始点側だけの種別（ARROW_START）を新設するか、始点側の矢印を諦めるかを決める |
| E-L10 | 飛翔図パレットのラインレイヤを開いてからメモタブ（またはポイントタブ）へ移ると、メモで選んでいた色・太さ・矢印が黙って既定値に戻る。ペン設定はメモとパレットで共有。リセットの effect は「直前が HISYOU、今が HISYOU 以外」なら無条件に戻し、MEMO タブでは editingLayer が undefined なので発火する。パレットの道具を一度も押していなくても起きる（21219676 の意図は矢印ボタンの無い普通のラインレイヤへの持ち越し防止） | 判断 | `Home.tsx:1009-1018, 1177-1195, 4187-4192`、`useMapMemo.ts:192, 206`、`HomeToolPalette.tsx:213-217` | パレットで設定を焼き込んだときだけ印を立て、焼き込む直前のペン設定を控えておき、リセット時はその値へ戻す。または行き先が MEMO なら戻さない（パレットの設定がメモに持ち越される） |
| E-L11 | 日時列などの絞り込みが、一覧の表示値ではなく保存されている生の値と照合する。DATETIME は `2026-11-23T10:23:45+09:00` で保存され一覧には `2026/11/23 10:23` と出るので、表示どおり入れると0件になる。候補も秒・オフセット付きの値が記録ごとに並ぶ。別のタイムゾーンの記録は日付部分も食い違いうる。SERIAL の 0（f18e4191 より前に列追加された記録）は一覧で空欄に見えるが「空白」では一致しない。ISO 形式で入れれば絞り込めるので回避策はある | 判断 | `Data.ts:230-248, 329-330, 818-823, 841-855`、`useData.ts:131, 297`、`DataTable.tsx:102`、`DataTable.web.tsx:132` | `matchesValue` に format を渡し `getFieldDisplayValue` を通した表示値で照合し、候補も表示値から作る。生の値と表示値のどちらかに一致すれば通す案なら既存の ISO 入力も残せる。日付単位にまとめるかも決める |
| E-L12 | 見出し行の全選択・全表示ボタンの状態が実際と食い違い、1回目のタップが空振りする。`checkedAll`・`visibleAll` は画面内の useState で、押したときだけ反転する。全選択→削除、記録の追加、ドラッグ並べ替え、行ごとのチェック、「地図で表示」の後などで checkList や visible が変わっても追従しない。全件非表示のレイヤで目を押すと、1回目は非表示にする操作になる。Web 版も同じ作り | 安全 | `DataTable.tsx:166-177`、`DataTable.web.tsx:185-195`、`useData.ts:187, 228, 276, 332, 365` | `checkedAll` を `checkList.length>0 && checkList.every(c=>c.checked)`、`visibleAll` を `sortedRecordSet.length>0 && sortedRecordSet.every(r=>r.visible)` から導出し、押したときはその反対を渡す（両版） |
| E-L13 | 絞り込み中に見出しの目ボタンを押すと、一覧に出ていない記録まで表示・非表示が切り替わる。`changeVisibleAll` は絞り込みを見ずに `setAllRecordsVisibilityAction` をレイヤ全体に送る。同じ見出しの全選択は絞り込み結果だけが対象なので範囲が食い違う。「地図で表示」を押していなければスナップショットが無く、絞り込みを解除しても戻らない | 判断 | `useData.ts:187-192, 209-221, 270-292`、`dataSet.ts:283-296`、`DataTable.tsx:173-176`、`DataTable.web.tsx:192-195` | 絞り込み中は `withChildRecords(sortedRecordSet)` だけを `dispatchVisibility` で更新する。または絞り込み中もレイヤ全体を切り替えるなら、初回にスナップショットを取り解除で戻せるようにする |
| E-L14 | 大量データで、列見出しのタップごとに絞り込みとソートがもう1回ずつ走り、比較のたびにロケール照合器を作り直す。`changeOrder` が dispatch した設定でレイヤが新しいオブジェクトになり、targetLayer 全体に依存する `filteredRecordSet` の useMemo と effect（391-395行）がもう一度走る。比較は毎回オプション付きの `localeCompare` で、5,000件で約110ms、`Intl.Collator` の使い回しで約7ms（node で実測）。**訂正**: 目ボタンでの再ソートはデータが実際に変わるので必要な処理で、無駄なのは見出しタップの二重実行と比較のコスト | 安全 | `useData.ts:129-133, 170-182, 391-395`、`Data.ts:75, 82` | モジュールで `new Intl.Collator(undefined,{numeric:true})` を1つ作り compare を使う（順序は同じ）。filteredRecordSet の useMemo と effect の依存を、targetLayer 全体ではなく field・sortedName・sortedOrder に絞る。または最後にソートした入力と条件を ref に控えて同じならスキップする |

---

## 反証されたもの

候補が丸ごと反証されたものは無い。候補の一部として退けたものを挙げる。

| 候補 | 退けた理由 |
|---|---|
| データ編集の「複製」が編集レイヤの確認と共有レイヤのロックを通らない（E-M3 の (b)） | 複製ボタンは `!isEditable` で無効になり（`DataEditButtons.tsx:53-56`、`useDataEdit.ts:145-148`）、実行中の COMMON は false なのでロックは守られている。残るのは「編集レイヤでないレイヤへの複製で切替確認が出ない」点だけで、データ編集は属性の保存にも編集レイヤを求めていないので、仕様の範囲。3票中2票が外すべき、1票が low とした |
| 並べ替え後に行をタップすると別の記録の編集画面が開く（E-M15 の追加主張） | 3票中2票が主張したが、メモ化で再レンダーが省かれた行は `gotoDataEdit` も同じ古いレンダーの関数（旧 sortedRecordSet を閉じ込めたもの）を持つので、index と組が崩れず正しい記録が開く。影響はチェック操作に限る |
| INTEGER の既定値 NaN は再起動後 null になり例外が出る（E-M6 の一部） | 既定値の null は `getDefaultFieldValue` の `?? 0` で 0 になり自然に直る。壊れた値として残るのは再起動までに作った記録だけ（3票とも同じ訂正） |
| 参照フィールドの値も TABLE と同じく消える（E-H3 の一部） | REFERENCE の値は表示用の 'Reference' だけで実データを持たないので、実害はほぼ無い |

---

## 直す順番の提案

1. **データが黙って失われる・戻るもの（安全に直せる）**: E-H3（TABLE の値が全件消える。`originalFormat === changedFormat` で元の値を返すだけ）、E-H4・E-M15（チェックを id で持つ。2件まとめて直る）、E-H1（位置編集後の古い形の書き戻し）、E-M9（作図確定で古い版が上書き・復活。属性の部分は安全、削除済みの扱いは判断）、E-M14（メモの Undo）、E-M2（← の破棄）、E-M1（データ編集からの削除で子が残る）。
2. **例外で止まるもの（安全に直せる）**: E-H2、E-M5、E-M6、E-L2。いずれも「undefined・null・NaN・形式に合わない値を空欄として扱う／作らない」で、`formattedInputs`・`sortData`・`changeFieldValue`・既定値の parse をまとめて直す。
3. **形が意図せず変わるもの（安全に直せる）**: E-M10（閉じ目の平滑化）、E-M13（穴の追従）、E-M12（削除のレイヤ取り違え）。いずれも `useDrawTool.ts` なので一緒に。
4. **レイヤ設定の取りこぼし（安全に直せる）**: E-M7（プリセット辞書）、E-M8（植生図の区分）、E-M17（絞り込み・ソートの列名追従）。
5. **一覧の表示・並び（安全に直せる）**: E-M16（数値ソート）、E-L12、E-L14。E-L14 の Collator は E-M16・E-H2 の `sortData` 修正と同時に入れる。
6. **方針を決めてから直すもの**: E-M4（形式変更時の値の残し方と確認）、E-M3（参照追加のロック）、E-M11・E-L5・E-L6（飛翔図の行動記号の削除とキャンセル・親の値・権限。3件は同じ領域なのでまとめて決める）、E-L1（連番と前回値の集合）、E-L8（`_zoom` の基準）、E-L9（矢印の種別）、E-L10、E-L11、E-L13。
7. **その他の low（安全に直せる）**: E-L3、E-L4、E-L7。

あわせて、飛翔図の子の記号の扱い（E-M1・E-M11・E-L5・E-L6）は「親を消す・持ち替えるときは子も同じ規則で扱う」という1つの方針にまとめると、入口ごとの食い違いを避けられる。

## 修正状況（2026-11-23、fix/remaining-audits）

【安全】の項目はすべて直した（E-H1〜E-H4、E-M1/2/5〜10/12〜17、E-L2〜4/7/12/14）。次の部分は挙動が変わるので直さず、判断待ちとした。
- E-M1: 他人名義の子があるとき、削除全体を止めるか（今は他人名義の子だけ黙って残る）
- E-M5: 「abc」のような数値にならない値を形式変更で `''` にするか元の文字列を残すか（今は NaN）
- E-M8: 既存の STRING の区分を LIST に変えるか
- E-M9: 作図の選択中にデータ一覧で削除された記録を、確定時に復活させないか／選択の自動解除
- E-H2/E-M16: 値の無い行をソートで末尾へまとめるか
- E-M12: 編集レイヤを切り替えたときに選択を破棄・確認するか
- E-L2: 文字列以外の形式（DATESTRING など）へ変えたとき既定値をすべて外している（確認推奨）
【判断】の項目（E-M3、E-M4、E-M11、E-L1、E-L5、E-L6、E-L8〜E-L11、E-L13）は未着手。
