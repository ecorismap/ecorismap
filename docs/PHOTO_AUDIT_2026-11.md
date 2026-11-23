# 写真・添付ファイルの監査（2026-11）

2026-11-23 実施。写真の扱いで次のことが起きる経路を探した。写真が消える、取り違える、別の記録や別の名義に付け替わる。アップロードされない、または上げすぎる。消すべきファイルが残る（容量の浪費）、消してはいけないものを消す。表示できない。クラッシュする。他人の写真が見える、または見えない。セキュリティ上の穴がある。

- **範囲**: PHOTO 形式のフィールド、軌跡上の写真、写真のローカル保存・表示・クラウド同期・削除。主なファイルは `Photo.ts`、`photoUriRebase.ts`、`photoDownloadPath.ts`、`safePath.ts`、`usePendingPhotoCapture.ts`、`useDataEdit.ts`、`DataEdit.tsx`、`DataEditPhoto.tsx`・`DataEditModalPhotoView.tsx`、`useTrackPhotos.ts`、`trackPhoto.ts`、`HomeTrackPhoto*.tsx`、`contexts/TrackPhoto.tsx`、`lib/firebase/storage.ts`、`useRepository.ts`（写真のアップロードとダウンロード）、`File.ts`・`File.web.ts`、`useGeoFile.ts`・`useEcorismapFile.ts`（写真に関わる部分）、`Data.ts`・`Layer.ts`、`modules/dataSet.ts`・`recordOwnership.ts`、`storage.rules`、patches の expo-media-library と image-editor。
- **方法**: 観点（撮影と取り込み、ローカル保存、同期、表示、Web とプラットフォーム差、現場の操作、セキュリティ）ごとに候補を出し、重複をまとめた。各候補を3人が別々に検証し、実在するか、重大度、手順に訂正があるかを投票した。重大度と手順は3票の多数に従い、訂正は本文に反映した。`docs/IMPORT_EXPORT_AUDIT_2026-11.md` と `docs/SYNC_AUDIT_2026-11.md` で報告・修正済みの項目、メモリに記録済みの既知の問題（expo-media-library のルート import、RNFS.read、iOS の octet-stream、Live Photo の多重 resolve など）は対象外にした。
- **結果**: 確認 35件（**high 2、medium 16、low 17**）。反証 2件（重複を含めると候補5件）。
- コードは変更していない。手順はコードとライブラリのソースを読んで成り立つと確認したもので、実機では確かめていない。
- **分類**: **安全に直せる**＝挙動の方針を変えずに直せる。**判断が要る**＝挙動や仕様を変えるので、どちらにするか決める必要がある。

---

## 優先して直すもの（high）

### P-H1. iPhone のライブラリから選んだ写真（HEIC）が Storage Rules に拒否され、クラウドに一度も上がらない【判断が要る】

- **手順**
  1. iPhone（カメラ設定が既定の「高効率」＝HEIC）でプロジェクトを開き、データ編集の写真欄で「ライブラリから選ぶ」を押して、カメラロールの写真を選ぶ。
  2. `pickImage` は `quality:1`・`allowsEditing:false` で呼び、`preferredAssetRepresentationMode` を指定していない。expo-image-picker の既定は `.current` なので fastPath に入り、原本をその拡張子のままコピーする。名前は `EMAP_….heic` になる。`saveToStorage` はコピーするだけで変換しない（アプリ内で HEIC を JPEG にするのはエクスポート用の `convertPhotoForExport` だけ）。
  3. アップロードすると、暗号化ファイルも入力の拡張子を引き継いで `enc_….heic` になる。RNFB iOS は contentType を拡張子から決めるので `image/heic` で putFile する。
  4. `isValidPhotoContentType` は `image/png`・`image/jpeg` しか通さないので拒否される。
  5. 写真は `url:null` のまま残り、アップロードのたびに再試行して「一部の写真をアップロードできませんでした」が出る。
- **根拠**
  - `src/utils/Photo.ts:133-161`（pickImage。拡張子は `uri.split('.').pop()`）、`:86-91`（saveToStorage は名前を変えない）、`:55-67`（HEIC 変換はエクスポート専用）
  - `node_modules/expo-image-picker/ios/ImagePickerOptions.swift:44`（既定 `.current`）、`ios/MediaHandler.swift:128-147`（fastPath）、`ios/ImageUtils.swift:145-146`（public.heic は .heic のまま）
  - `src/lib/virgilsecurity/e3kit.ts:390-398`（encryptedOutputPath が拡張子を引き継ぐ）
  - `node_modules/@react-native-firebase/storage/ios/RNFBStorage/RNFBStorageModule.m:455-459`、`RNFBStorageCommon.m:62-74`（拡張子から MIME）
  - `storage.rules:72-74`（isValidPhotoContentType）
  - `src/hooks/useRepository.ts:696-704`（失敗は url:null のまま返して再試行）
- **影響**
  - iPhone のライブラリから付けた写真は、他のメンバー・Web・別端末に一切届かない。撮った端末を失うと写真も失われる。
  - 警告は毎回出るが、利用者には理由も直し方も分からない。
  - カメラで撮った写真は JPEG なので起きない。シミュレーターのサンプル写真も JPEG なので、スモークテストでは見つからない。9c46e011（iOS の octet-stream 修正）より前は iOS の写真がすべて拒否されていたので、この経路はこれまで見えていなかったと考えられる。
  - 同じ経路で WebP・GIF・TIFF・AVIF も拒否される（iOS は ImageUtils で元の拡張子のまま返る）。Android は `toImageFileExtension` が png/gif/bmp/webp/jpeg だけを返すので、WebP・GIF・BMP を選んだ場合に同じく拒否される（HEIC は Android では `.jpeg` 名になって通る。P-L1）。
  - Web の Chrome/Firefox で HEIC を選んだ場合の挙動（サムネイル作成で失敗するか）は検証で確かめていない（P-L13 を参照）。
- **修正案**
  - `pickImage` で、拡張子（または `asset.mimeType`）が jpg/jpeg/png 以外なら `manipulateAsync(uri, [], { format: JPEG, compress: 0.9 })` で変換し、名前を `.jpg` にしてから `saveToStorage` する。iOS だけなら `launchImageLibraryAsync` に `preferredAssetRepresentationMode: Compatible` を渡すのが最小（fastPath を外れて再エンコードになる）。Android の WebP など iOS 以外の分は、前者の変換が要る。
  - すでに `.heic`/`.webp` で保存されて `url:null` のまま残っている写真は、`uploadPhoto` の直前に同じ変換をかけて救う。
  - Rules に `image/heic` を足す案は、Web と Android で表示できないので勧めない。
  - 判断が要る点: 再エンコードで画質と EXIF が変わる。変換のタイミング（取り込み時か、アップロード時か）を決める必要がある。

### P-H2. クラウドデータ管理でデータを消すと、写真をアップロード者のフォルダごと消すため、残っている別の doc の写真まで消える【判断が要る】

- **手順**
  - **例A（テンプレートと自分のデータ）**
    1. 管理者 X が PUBLIC レイヤ L に、自分の記録（写真付き）とテンプレート（写真付き）を持っている。テンプレートの写真も `uploadPhoto` の `uid=user.uid` で上がるので、どちらも `projects/{p}/PHOTO/L/X/` に入る。
    2. クラウドデータ管理で「L / TEMPLATE / X」の行だけを選んで削除する。
    3. doc は permission と userId の組で1件だけ消えるが、写真は `deleteLayerPhotos(projectId, L, X)` が `PHOTO/L/X/` 以下を再帰的に全部消す。X の PUBLIC の記録の写真も消える。逆に PUBLIC を消せばテンプレートの写真が消える。
  - **例B（引き継いだ記録）**
    1. 管理者がメンバー A の記録を編集・削除して引き継ぐ。`takeOverRecordsAction` は名義だけを移し、写真の url/key は A のパスを指したまま。`updateStoragePhoto` は url がある写真を上げ直さない。
    2. その後、A のデータをクラウドデータ管理で消すと、`PHOTO/L/A/` が消え、管理者の doc にある記録の写真も見られなくなる。
- **根拠**
  - `src/hooks/useCloudDataManagement.ts:65-88`（行は permission+userId の組）、`:229-236`、`:268-279`（deleteCloudData: doc は組ごと、写真はフォルダごと）、`:320-328`（deleteLayerDefinition）
  - `src/lib/firebase/storage.ts:273-274`（写真のパスは `PHOTO/{layer}/{uid}/{photoId}`）、`:508-533`（deleteLayerPhotos の再帰削除）
  - `src/lib/firebase/firestore.ts:584-597`（TEMPLATE の削除）、`:811-812`（管理者の TEMPLATE と PUBLIC は同じ userId で別の doc）
  - `src/hooks/useRepository.ts:963-978`、`:717-719`（url がある写真は再アップロードしない）
  - `src/modules/dataSet.ts:162-188`（takeOverRecordsAction）
  - `storage.rules:11, 34-36`（管理者は list/delete を許可）
- **影響**
  - 消していない doc の写真の実体が消え、全員で表示できなくなる。手元の写真は url があるので上げ直されず、元に戻す手段がない。
  - 管理者がテンプレートと自分のデータを同じレイヤに持つのは普通の運用なので、正規の管理操作で起きやすい。
  - 逆に、COMMON にまとめた記録の写真のように別の uid のフォルダにあるものは消えず、孤児として残る。
- **修正案**
  - `deleteCloudData` では、消す doc を復号して写真の url（Storage パス）を集める。同じレイヤで残る doc（ほかの permission、ほかの名義の引き継いだ記録）が参照している写真を除いてから、パスで1件ずつ消す。URL からパスを読むのは `photoDownloadPath.ts` の正規表現が使える。
  - フォルダごとの削除は、レイヤの定義を消すとき（そのレイヤの全 doc を消す `deleteLayerDefinition`）だけに限る。
  - 当座の策: 同じ layerId・userId の組の行がほかに残る場合はフォルダごとの削除を見送る（写真が孤児として残る代わりに消失は防げる。ただし例Bは防げない）。

---

## medium

| # | 内容 | 分類 | 箇所 | 修正案 |
|---|---|---|---|---|
| P-M1 | Android でカメラ中に MainActivity が破棄されると、同じ編集の中で先に付けた写真と未保存の入力が消え、先の写真のファイルが孤児になる。`pendingPhotoCapture` に残るのは `{layerId, recordId, fieldName}` だけで、編集中の `targetRecord` と `temporaryAddedPhotoList` は useState にしかない。復帰した `usePendingPhotoCapture` は Redux の保存済みの記録に新しい写真だけを足して保存する。写真1のファイルを消すのは `cancelUpdate` だけで、アンマウント時は `setIsEditingRecord(false)` しかしないので残る。写真1がなくても、文字の項目など未保存の入力は失われる。ファイルは、プロジェクトのレイヤならレイヤ削除（`deleteLayerPhotos`）で消えるが、LOCAL では残る | 判断 | `usePendingPhotoCapture.ts:61-90`、`useDataEdit.ts:78, 84-85, 194-198, 252-271, 461-466`、`DataEdit.tsx:298-303`、`useLayerEdit.ts:251-258` | 撮影の前に、編集中の写真項目の配列と `temporaryAddedPhotoList`/`temporaryDeletePhotoList`（できれば記録全体の下書き）を `pendingPhotoCapture` に入れる。復帰時はそれを土台に写真を足して保存する。下書きを残さない場合でも、復帰時に `temporaryAddedPhotoList` の残りを `deleteLocalPhoto` すれば孤児は防げる |
| P-M2 | iOS で写真ライブラリの権限を「許可しない」（またはスクリーンタイムで制限）にすると、カメラもライブラリ選択も何も起きず、案内も出ない。`takePhoto` は最初に `requestMediaLibraryPermissionsAsync()`（読み書き）を要求し、granted でなければ undefined を返す。`pickImage` も同じ。`DataEdit` は undefined なら黙って戻る。ネイティブの `launchCameraAsync` はカメラの権限しか要らず、iOS 14以降の PHPicker（allowsEditing:false）は権限なしで動く。カメラロールへのコピーは `saveToStorage` が自分で権限を取って失敗を握りつぶす任意の処理なので、撮影を止める理由はない。カメラの権限を拒否した場合も無言。「選択した写真のみ」は granted 扱いで影響しない。Android は 13以降でも `writeOnly=false` で READ_MEDIA_IMAGES を要求するので、拒否すると同じく止まる（3票中1票は13以降は影響なしとした。要確認）。9以下はネイティブ側が WRITE_EXTERNAL_STORAGE を必須にしているので、直せるのは案内だけ | 判断 | `Photo.ts:183-188, 133-136, 92-110`、`expo-image-picker/ios/ImagePickerPermissionRequesters.swift:94-122`、`ImagePickerModule.kt:290-299`、`DataEdit.tsx:275-276, 303-306` | `takePhoto` はカメラの権限だけを確かめる。`pickImage` の権限要求は外す（Android 12以下はネイティブが必要とするかを確かめる）。拒否されたときは理由を返し、DataEdit で「設定で許可してください」と Alert を出す |
| P-M3 | Web でライブラリから選んだ写真の名前に拡張子が付かず（`EMAP_…_.`）、ZIP に書き出して取り込み直すと写真が戻らない。expo-image-picker 56 の Web は uri に blob: URL を返すので、data: URI 前提の `uri.split(';')[0].split('/')[1]` が空文字になる。書き出しでは sanitize-filename が末尾の `.` を落とし、ZIP 内は `EMAP_…` になる。取り込み側の `restorePhotosFromZip` と `findPhotoFileKey` はベース名の完全一致なので照合に失敗する。書き出したファイルにも拡張子がなく、PC や GIS で開けない | 安全 | `Photo.ts:151-153`、`expo-image-picker/src/ExponentImagePicker.web.ts:215-237`、`File.web.ts:111-112`、`File.ts:69`、`General.ts:98`、`useGeoFile.ts:339-356`、`useEcorismapFile.ts:246` | Web では `result.assets[0].mimeType`（image/jpeg→jpg、image/png→png）から拡張子を決め、無ければ `fileName` の拡張子、それも無ければ jpg。既存の末尾 `.` 付きの名前のために、照合の両側に同じ正規化（sanitize）をかける。Web の fetch→blob→createObjectURL の包み直しは不要（実害なし） |
| P-M4 | Web で追加した写真は blob: URL でしか持たないので、アップロード前の再読み込みやタブの破棄で原画が失われ、以後アップロードもできない。redux-persist は「リロード＝同じタブID＝復元」の設計で dataSet を戻すが、blob: URL は前のページの寿命で無効になる。写真を作り直す処理はない（pmtiles にはある）。再読み込み後は `hasLocalPhotoFile` が false、拡大表示はサムネイル代用、書き出しは黙って写真を落とし、アップロードは毎回失敗する。ZIP や .ecorismap から取り込んだ写真も同じ。通常の F5 では未同期の記録があれば beforeunload の確認が出るが、文言は写真の消失を伝えず、記録は戻るので利用者は進めやすい。黙って消えるのは次の2つ。(a) Chrome のメモリセーバーやモバイルブラウザによるタブの破棄からの復帰（beforeunload が出ない）。(b) 写真だけアップロードに失敗した後の再読み込み（記録は uploaded:true、レイヤは markLayerUploaded になり、`hasUnsyncedChanges` は写真の url:null を見ない） | 判断（当面の策は安全） | `Photo.ts:151-157, 14-24`、`store.web.ts:7-14`、`reduxPersistWebStorage.ts:12`、`photoUriRebase.ts:9`、`useMaps.ts:617-629`、`useRepository.ts:696-704, 1076`、`File.web.ts:65-90`、`unsyncedChanges.ts:131-149`、`UnsyncedChangesGuard.web.tsx:30-39`、`useEcorismapFile.ts:193`、`useGeoFile.ts:360` | 当面（安全）: `hasUnsyncedChanges` で、自分の記録に `url===null` かつ uri が blob: の写真があれば「未同期あり」とする。恒久策（判断）: 写真の Blob を Dexie（`utils/db.ts`）に photo.id をキーとして保存し、寿命は redux-persist と同じタブ単位にする。復元時か表示・アップロードの直前に object URL を作り直して uri を付け替える。補助として、blob が無効と分かったら「原画が失われた」と表示する |
| P-M5 | Web で .ecorismap やレイヤ ZIP から取り込んだ写真は型のない Blob になり、アップロードが `application/octet-stream` として Rules に拒否される。`new Blob([buffer])` に type がなく、blob: URL を fetch した Blob も type が空。暗号文の Blob は `file.type` を引き継ぐので空になり、`uploadBytes` は metadata なしなので octet-stream で送る。レイヤ ZIP の取り込みは常に url:null なので必ず失敗する。.ecorismap は元が未アップロード（url:null）の写真だけが失敗する。Drive 個人プロジェクトの経路は確かめていない | 安全 | `useEcorismapFile.ts:188-193`、`useGeoFile.ts:357-360, 396-398`、`e3kit.web.ts:283-298`、`e3kit-browser.ts:82`、`storage.ts:292-293`、`@firebase/storage/dist/index.esm.js:1755-1758`、`storage.rules:72-74` | 取り込み時に拡張子から type を付ける（jpg/jpeg→image/jpeg、png→image/png）。根本策として `uploadPhoto` の Web 経路で `uploadBytes(ref, payload, { contentType })` を明示する（写真名を引数に足す。分からなければ image/jpeg） |
| P-M6 | 設定の「キャッシュをクリア」が写真フォルダ（`documentDirectory/projects`）を丸ごと消し、端末内だけの写真や未アップロードの写真の原画も消える。撮影・ライブラリ選択・取り込み・自分のダウンロードの保存先はすべてこの中にある。LOCAL の記録と、プロジェクトでまだ上げていない写真（url:null）は実体を失い、未アップロード分はアップロードが失敗し続ける。確認文は「すべてのキャッシュ（地図と写真）」で、マニュアルは「記録データやレイヤは削除されません」と書き、FAQ は地図が出ないときにこのボタンを案内している。撮影写真は権限があればカメラロールにもコピーがあり、ライブラリから選んだ写真は元がライブラリに残るので、端末から完全に消えるのは権限なしの撮影や取り込み写真などに限られる。ただし記録との紐づけは切れ、付け直すには手作業で探すしかない。利用者が確認を経て行う操作なので medium（3票中1票は high） | 判断 | `containers/Settings.tsx:320-345`（`:329-334`）、`:307-319`（未使用の pressClearPhotoCache）、`components/pages/Settings.tsx:66`、`AppConstants.tsx:82`、`i18n/ja/translation.json:517`、website `11-settings.md:46`・`16-faq.md:26` | 消すのはクラウドから取り直せる写真だけにする（url と key があるダウンロード分で、他人の uid フォルダか `photoId_` 付きの名前）。`LOCAL/` と自分の url===null の写真は残す。判定は Redux の dataSet の写真を走査して行う。少なくとも、消す前に端末内だけの写真の枚数を示して確認する。未使用の `pressClearPhotoCache` も直すか消す。マニュアルの記述と合わせる |
| P-M7 | プロジェクト削除とアカウント削除で、Storage の写真・PDF・スタイル・辞書が1件も消えない。`deleteProjectStorageData` は `listAll(projects/{id})` の items だけを消すが、実体はすべて `PHOTO/`・`PDF/`・`STYLE/`・`DICTIONARY/` のサブフォルダにあるので items は空で、何も消さずに isOK:true になる。その後 project doc が消えるので Rules の isMember/isAdmin が成り立たず、アプリからは二度と消せない。functions の `recursiveDelete` は Firestore だけ。Rules テスト L-STO-05 は直下に置いたファイルしか確かめていない。写真は暗号化済みで DEK も doc と消えるので、新たに読める人は出ない（URL と鍵を手元に残している元メンバーは取得・復号できる可能性がある）。実害は容量と課金、削除・サービス終了時に「消した」と言えないこと（3票中1票は high） | 安全 | `storage.ts:383-393, 406-414`（対比 `:494-503` の再帰版）、`useRepository.ts:1394-1406`、`useAccount.ts:693-704`、`../functions/src/ecorismap-func.ts:165-187` | `deleteProjectStorageData` を `deleteStorageFolderRecursive(ref(storage, \`projects/${projectId}\`))` に置き換える（順序は Storage が先のまま）。object-not-found は成功扱い。L-STO-05 を実際の配置で再帰削除するテストに直す。二重の守りとして functions の recursiveDelete に `bucket.deleteFiles({prefix})` を足す。既存の孤児は Admin スクリプトで一度掃除する |
| P-M8 | 記録の複製（DataEdit の「複製」）が写真の id・uri・url・key をそのまま共有する。`copyRecord` は field を浅くコピーする。(a) 複製側を削除するか写真を外して保存すると、`deleteLocalPhoto` が共有ファイルを消し、元の記録の原画も失われる（LOCAL では戻らない。未アップロードなら以後アップロードが失敗し続ける）。(b) 未アップロードの写真を持つ記録を複製してアップロードすると、同じパスへ並行に putFile が走る。Rules は create と delete しか許さないので、2回目は上書きとして拒否され、片方の記録は url:null のまま永久に失敗し続ける（鍵の食い違いにはならない）。(c) 他メンバーの記録を複製すると url は持ち主のパスを指したまま。持ち主が写真を外すか記録を消してアップロードすると、参照の照合は持ち主の dataToUpload しか見ないので Storage から消え、複製側の写真が取れなくなる。撮影写真はカメラロールにも残るので medium | 判断 | `useDataEdit.ts:468-485, 209-219, 279, 365-366`、`DataEdit.tsx:174-178`、`DataEditButtons.tsx:23, 53-56`、`Photo.ts:116-130`、`useRepository.ts:696, 976-980, 1033-1045`、`storage.ts:270-298`、`storage.rules:4-11` | `copyRecord` で写真ごとに新しい id を振り、手元に原画があれば別名で `copyAsync` して uri を差し替え、url と key は null にして改めて上げさせる。原画がない他人の写真は、先にダウンロードするか複製から外す（仕様の判断）。保険として `deleteLocalPhoto` の前に、ストアの全記録（全名義）に同じ uri の参照が残っていないかを確かめる |
| P-M9 | 管理者が他メンバーの写真を外す・その記録を削除すると、Storage の削除が自分の uid のパスに向き、元の写真が残る。引き継いだ記録の写真の url は撮影者のパスのままだが、`pendingPhotoDeletes` には photo.id だけを積み、削除は常に `deleteStoragePhoto(project, layer, user.uid, photoId)`。そこに実体はないので object-not-found になり、console.error で終わる。管理者が不適切な写真を消したつもりでも実体と token 付き URL が残り、以前の url と key を持つメンバーの端末からは取得・復号できる | 安全 | `useRepository.ts:692-695, 712-715, 1033-1045`、`storage.ts:394-404`、`photoDownloadPath.ts:15-25`、`recordOwnership.ts:120-131, 143-147`、`dataSet.ts:163-188`、`storage.rules:9-11` | `pendingPhotoDeletes` に photo.id と `photoUploaderUid(photo.url) ?? user.uid` を組で積み、その uid のパスを消す。url を使うのは、URL のパスの projectId・layerId が今のものと一致し、末尾が photo.id と一致するときだけ。一般メンバーが拒否された場合は無視してよい。注意: パスを直すと P-M10 の「共有している写真を消す」経路が実際に動き出すので、P-M10 の参照確認の拡張と一緒に入れる |
| P-M10 | テンプレートの記録とその写し（テンプレートを編集して自分の名義にしたもの）が同じ写真の実体を共有しているのに、写真を消す前の参照確認が今回送る集合しか見ない。(a) 管理者がテンプレートの写真を外す・記録を消すと、メンバーの写しが参照する実体が消える。(b) 管理者が通常モードで自分の写しの写真を外す・写しを消すと、クラウドのテンプレートが参照する実体が消え、全員で表示できなくなる。テンプレートの写真は管理者の uid の下にあり、写しも同じ url を持ち、url があるので上げ直されない。`photoUploaderUid` が自分かを見るだけでは防げない（テンプレートを上げたのも管理者） | 判断 | `recordOwnership.ts:70, 106-109, 140-147`、`dataSet.ts:139-156`、`useRepository.ts:692-695, 711-715, 1033-1045`、`useDataEdit.ts:227`、`storage.ts:274, 395-404`、`storage.rules:11` | 最小: 消す前に、そのレイヤの手元の全集合（template、自分、他人）で同じ photo.id の参照がないかを確かめる。ほかのメンバーのクラウドだけにある写しまで守るには、次のどちらかが要る。テンプレートを写すとき（copy）に写真に新しい id を振り、url/key を null にして写しの持ち主の名義で上げ直す。またはテンプレート由来の写真は自動で消さず、クラウドデータ管理からだけ消す |
| P-M11 | 写真の一括取得で、暗号ファイルの一時保存先が固定名 `cacheDirectory/temp` なのに、レイヤ内の全写真の `fetchPhoto` が Promise.all で同時に走る。Android の expo-file-system legacy は応答ごとに `file.delete()` してから同じパスへ書き込むので、写真 A の鍵で写真 B の暗号文や書きかけのファイルを復号することになり失敗する。失敗した側は temp を消すので、まだ読んでいない別の写真まで巻き込む。鍵は写真ごとなので取り違えは起きないが、どれが失敗するかは毎回変わり、失敗は黙って捨てられる（uri が入らず、サムネイルしか出ない）。iOS で同じことが起きるかはソースでは確かめていない | 安全 | `storage.ts:336-346, 352-381`、`useRepository.ts:1526-1555, 1563-1575`、`expo-file-system/android/.../FileSystemLegacyModule.kt:613-616`、`e3kit.ts:406` | ダウンロード先を1回ごとに一意なパスにする（例 `${cacheDirectory}photo_${ulid()}`）。成功・失敗とも自分の暗号文の一時ファイルと、コピーし終えた復号済みファイルだけを消す。必要なら同時実行数に上限（4件程度）。辞書（temp.sqlite）・PDF・スタイルの固定名も、並行に呼ばれる経路があるか確かめて揃える |
| P-M12 | アップロードに失敗した写真（url:null、uri は撮影者の端末のパス）が付いた記録を管理者が引き継ぐと、その写真は二度とクラウドに上がらない。引き継ぎは写真をそのまま写し、updatedAt を元の版より新しくする。管理者のアップロードは、手元にないファイルを読もうとして毎回失敗し、警告が出る。撮影者側で後から再アップロードしても写真のアップロードは記録の updatedAt を進めないので、取得時に引き継いだ版（url:null）が勝つ。撮影者が先に取得していれば、記録は管理者の名義に移っているので撮影者からはもう送られない。上がっていた実体は孤児として残る。iOS の写真が全件拒否されていた時期の記録でまとめて起きうる | 判断 | `dataSet.ts:162-188`、`recordTakeover.ts:81-100`、`Data.ts:700`、`useRepository.ts:676-723, 696-704`、`recordOwnership.ts:114, 129, 149`、`photoUriRebase.ts:86` | (a) 引き継ぐときに url:null で uri が自分の写真フォルダの外にある写真があれば、引き継ぎを止めて警告するか、写真欄は元の持ち主の版を優先する。(b) `resolveTakeoverCandidates` かマージで、同じ photo.id について引き継いだ版が url:null・元の版に url/key があれば写す。(c) `updateStoragePhoto` で uri が自分の写真フォルダの外にある写真はアップロードを試みず、失敗としても数えない（P-M13 と同じ修正） |
| P-M13 | 他人の記録に入っている写真 uri を、パスを検証せずに自分の端末で暗号化してアップロードする。uri は Firestore にそのまま上がり、受け手でも消されない。COMMON の統合（全員分を自分の名義で送る）と、管理者による他人の記録の編集（引き継ぎ）で、`updateStoragePhoto` が `uri があり url===null` だけを見て `uploadPhoto` する。正当な利用では、手元にないファイルなので毎回失敗の警告が出る。悪用すれば、メンバーが PUBLIC の記録の uri に管理者の端末上の写真フォルダのパスを書いておき、管理者が編集か COMMON 化したときにそのファイルをこのプロジェクトへ上げさせ、url/key で読み出せる。iOS は起動時の `runPhotoUriRebase` が他人の記録の uri も管理者のコンテナへ付け替えるので、コンテナ UUID を知らなくても成り立つ。ただしほかのプロジェクトの projectId・layerId と秒単位のファイル名を知る必要があり、前提は狭い。Web は CORS に縛られるのでほぼ成り立たない。削除（`Photo.ts:116-121`）と書き出し（`useGeoFile.ts:969`）には `isUriInsideFolder` があるのに、アップロードだけない（3票中1票は low） | 安全 | `useRepository.ts:696-711, 964-978`、`Data.ts:472-499, 607-608`、`recordOwnership.ts:143-147`、`storage.ts:273-297`、`e3kit.ts:390-411`、`photoUriRebase.ts:29-38, 95-114`、`storage.rules:5-8` | アップロードするのは、ネイティブでは `isUriInsideFolder(uri, \`${PHOTO_FOLDER}/${project.id}/${layerId}/${uid}\`)` か `${PHOTO_FOLDER}/LOCAL/${layerId}/` の配下で実在するものだけ、Web では blob: のものだけ。それ以外は url:null のまま返し、失敗の件数に数えない。iOS の `runPhotoUriRebase` も自分の名義の記録だけに限る。受信時に他人の url:null の写真の uri を落とす案もある |
| P-M14 | 写真ビューアで削除の確認ダイアログを出してキャンセルすると、表示中の写真と削除の対象がずれる。StyledDialog の表示中は `useModalYieldingToDialog` が shown=false を返し、RN Modal（Web は react-native-web の ModalAnimation）が子をアンマウントする。戻ると ImageViewer は開いた時点の `initialIndex`（A）で作り直されるが、`onChange` はスワイプ時しか呼ばれないので `selectedPhoto` は C のまま。画面には A、ヘッダーは「3 / 3」、ダウンロードボタンの有無も C に従う。ここで削除を確定すると C が消える。ダウンロードの確認はキャンセルしてもビューアが閉じるので、ずれは削除のキャンセルでだけ起きる | 安全 | `DataEditModalPhotoView.tsx:22, 33, 39-58, 75-76, 79, 108-119`、`StyledDialog.tsx:56-69, 131`、`react-native/Libraries/Modal/Modal.js:248, 278-288`、`react-native-image-zoom-viewer/built/image-viewer.component.js:155-156, 182-183, 265-268, 304-311`、`DataEdit.tsx:329-334, 340-378` | shown が false から true に戻ったら `photos.findIndex(({index}) => index === photo.index)` で `initialIndex` を取り直す。または表示位置を ref に持ち、`key={shown ? 'on' : 'off'}` でマウントを区切ってマウント時だけ index に反映する（同じマウント中に index を変えると飛ぶ） |
| P-M15 | iOS で軌跡写真のサムネイル作成が、iCloud にだけある原画をネットワークから原寸で取り寄せる。`getAssetInfoAsync(shouldDownloadFromNetwork:false)` で localUri が取れない写真（と Live Photo）は ph:// のまま `createThumbnail` に渡る。expo-image-manipulator の iOS 実装は ph:// を `isNetworkAccessAllowed=true`・`targetSize=原寸`・`highQualityFormat` で要求し、縮小はその後。コメントの「巨大DLを避け、無ければサムネイルなし」と逆の動きになる。キャッシュはセッション内・最大200件で、照合対象は最大500件なので、200件を超えると開き直すたびに取り直す。端末にある Live Photo は通信なし（原寸デコードの負荷だけ）。メモリ不足で落ちるという点は1枚ずつ処理するので根拠が弱い（3票中1票は low） | 判断 | `useTrackPhotos.ts:19-29, 186-206`、`Photo.ts:33-41`、`expo-image-manipulator/ios/ImageManipulatorUtils.swift:17-18, 46-67` | ph:// のサムネイルは PHImageManager に小さい targetSize（長辺300px程度）・`isNetworkAccessAllowed=false`・`.opportunistic` で要求する（image-manipulator へのパッチで、原寸が要る `createPreviewImage`/`convertPhotoForExport` とはオプションで切り替える、または小さな専用ネイティブ関数）。取れなければサムネイルなし。JS だけでできる部分として、localUri がない非 Live Photo は ph:// を渡さずサムネイルなしにする |
| P-M16 | 写真を上げたあとでデータの書き込みに失敗すると、上げた url/key を捨て、次回は同じパスへ新しい鍵で全部上げ直す。写真は `uploadDataHelper` の前に上がり、`staleExpectation`・サイズ超過・通信失敗・COMMON の片付け失敗で早期 return すると、手元へ反映する `updateRecordsAction` まで届かない（COMMON をまとめる経路は成功時に `updateDataAction` で反映される）。失敗とやり直しのたびに通信量と時間を浪費する（圏外の現場で重い）。本番の Storage Rules が既存オブジェクトへの上書きを update として扱うなら、Rules に update がないので2回目以降は拒否され、写真が恒久的に共有できなくなる。この点は票が割れた（2票は本番では拒否されうるとし、1票は公式ドキュメント上ファイル内容の書き込みは create なので拒否されないとした）。本番での挙動は未確認。上げすぎの部分はどちらでも起きる | 判断 | `useRepository.ts:973-980, 1004-1031, 1083-1091`、`storage.ts:273-298`、`storage.rules:5-7`、`attack_storage.test.ts:131-135` | 本番（テスト用プロジェクト）で同じ photo.id への再アップロードが通るかを一度確かめる。写真の url/key は、上げられた時点で `updateRecordsAction` で写真欄だけ手元に反映する（uri は残す）。上書きが拒否されると分かれば、Rules に本人の `allow update`（create と同じ contentType・サイズ条件）を足して `yarn testrules`、または試行ごとに別パスへ上げる。A-STO-07 のコメントに本番との差を明記する |

---

## low

| # | 内容 | 分類 | 箇所 | 修正案 |
|---|---|---|---|---|
| P-L1 | Android でカメラを HEIF 保存にした端末（Galaxy の高効率画像など）の写真をライブラリから選ぶと、quality:1 の RawImageExporter が原本をそのままコピーし、`toImageFileExtension` が image/heif を `.jpeg` にフォールバックするので、中身 HEIF のまま `EMAP_….jpeg` になる。Rules は通るが、Web の Chrome/Edge/Firefox で表示できず、書き出した .jpeg は PC や GIS で開けない。`convertPhotoForExport` は拡張子だけで判定するので、書き出し時の変換も効かない | 判断 | `expo-image-picker/android/.../MediaHandler.kt:50-56`、`ImagePickerUtils.kt:95-105`、`exporters/RawImageExporter.kt:14`、`Photo.ts:137-142, 159-161, 58-62` | P-H1 と同じ変換で、判定は拡張子ではなく `asset.mimeType`（なければ先頭バイトの ftyp）で行い、jpeg/png 以外は JPEG にしてから `.jpg` で保存する。既存データのために `convertPhotoForExport` も中身で判定する |
| P-L2 | Android でライブラリ選択中に Activity が破棄されると、`pressPickPhoto` は `pendingPhotoCapture` を残さないので選んだ写真 X は回収されず、編集画面が閉じて選択が黙って失われる。X は image-picker の `pendingMediaPickingResult` に残り、保留はキャンセルでも新しい起動でも消えない（読み出しでだけ消える）。後で別の記録 B のカメラ中にもう一度破棄が起き、新しい成功で上書きされなければ、復帰時に X が B の写真として保存され、カメラロールにも複製される。2回の破棄が要り、復帰後の画面で見えるので low（3票中1票は medium） | 安全 | `DataEdit.tsx:269-280, 282-310`、`ImagePickerModule.kt:90-107, 235-238`、`AppContextActivityResultRegistry.kt:313-337`、`usePendingPhotoCapture.ts:35-37, 48-90`、`Photo.ts:204-213` | `takePhoto`・`pickImage` の起動直前に `getPendingResultAsync()` を一度呼んで古い保留を捨てる（最小で取り違えを防ぐ）。選択の消失も救うなら `pendingPhotoCapture` に `source: 'camera' \| 'library'` を残し、library の回収は `saveCapturedPhoto`（カメラロールへ複製）ではなく pickImage と同じ保存経路にする |
| P-L3 | 写真の保存処理（コピーとサムネイル作成、撮影時はカメラロール保存も）の間に処理中表示や操作の無効化がない。その間に次の記録へ進むと、未編集なので確認なしで B に切り替わったあと、古い `addPhoto` が A＋写真で `targetRecord` を上書きする（番号は B、中身と id は A）。B のつもりで入力して保存すると A が上書きされる。画面を閉じた場合は、アンマウント時の `setIsEditingRecord(false)` の後に true に戻り、レイヤ・地図の画面や地物のタップが「変更を破棄」の警告で止まる。別の記録の編集を開いて閉じるか再起動で戻る。追加した写真は孤児になる（閉じた場合のみ） | 安全 | `DataEdit.tsx:269-307, 380-394, 500-527`、`useDataEdit.ts:133-151, 193-198, 242-273`、`Home.tsx:2423-2440, 2665, 3601` | 処理中は撮影・選択・記録の切り替え・戻るを無効にする。あわせて開始時の記録 id とマウント状態を ref に控え、終わったときに違えば `deleteLocalPhoto` して何もしない。関数形の setState にするだけでは B に写真が付く別の取り違えになるので足りない |
| P-L4 | 軌跡写真で「写真を追加選択」（限定アクセス）から写真を足しても、軌跡を開き直すまで表示されない。照合の effect は `[coords, enabled, applyTrackPhotos]` だけで、保存済みの軌跡では coords が変わらない。記録中の軌跡はそのうち出る。iOS の `presentLimitedLibraryPicker` は表示した時点で戻る | 安全 | `useTrackPhotos.ts:71-75, 78-171`、`containers/TrackSummary.tsx:154-157`、`components/pages/TrackSummary.tsx:179-185`、`expo-media-library/ios/MediaLibraryModule.swift:70-78`、`expo-media-library/src/legacy/MediaLibrary.ts:543-545` | 再照合用の tick を effect の依存に加える。Android 14以降は await のあとに tick を増やす。iOS は await 直後では早すぎるので、限定アクセスの間だけ `MediaLibrary.addListener` を登録するか AppState の active 復帰で tick を増やす |
| P-L5 | データ一覧の一括削除と作図ツールの削除（なげなわを含む）で、端末の写真ファイルを消さない。`useData.deleteRecords` は `deleteRecordPhotos` をマップメモの分岐の中でしか呼ばず（0c93f6c8 でたまたまこの中に入り、833ef72a で挙動維持のまま残った）、`deleteDrawRecord` にはない。データ編集画面から消したときとだけ結果が違う。プロジェクトのレイヤならレイヤ削除で消える | 判断 | `useData.ts:356-364`、`useDrawTool.ts:973-1003, 1405-1420`、`Home.tsx:3132-3145`、対比 `useDataEdit.ts:365` | block 判定を通ったあと deletedRecords 全件（子を含む）と `deleteDrawRecord` の line.record と子に `deleteRecordPhotos` を呼ぶ（`deleteDrawRecord` に layer を渡す）。P-M8 のとおり複製で uri を共有しうるので、参照が残る写真は消さないガードを先に入れる。挙動を変えるので確認が要る |
| P-L6 | プロジェクトで、まだアップロードしていない写真（url:null）を外すと、`removePhoto` は配列から取り除かず `{...photo, uri:undefined}` を残す（SelectedPhoto の hasLocal/index/fieldName も混ざる）。`updateStoragePhoto` の分岐はこれに当たらず else でそのまま返すので、サムネイルの base64 ごとクラウドに上がり、以後も消えない。画面には出ないが、一覧の「N pic」に数えられ、CSV・GeoJSON・KML に名前が出て、ZIP を取り込むと「見つからない写真」になり、doc の容量を食う | 安全 | `useDataEdit.ts:209-235`、`useRepository.ts:696-719`、`Data.ts:237-239`、`Geometry.ts:1010, 1094, 1572-1575`、`DataEditPhoto.tsx:49-51`、`DataEditModalPhotoView.tsx:29` | `removePhoto` で url===null ならプロジェクトでも splice で取り除く（uri:undefined の印は url がある写真だけ）。残す項目に SelectedPhoto の余分なキーを入れない。`updateStoragePhoto` で `uri===undefined && url===null` を undefined として返し、既存の項目を次回のアップロードで片付ける |
| P-L7 | 編集中に追加した写真を保存前に外すと、`removePhoto` は追加済み一覧から外すだけで削除一覧にも入れず、保存でも破棄でもファイルを消さない。撮り直しのたびに原画が孤児として溜まる（プロジェクトでなくても起きる。ネイティブのみ）。プロジェクトでは P-L6 の見えない項目も残る | 安全 | `useDataEdit.ts:211-219, 279-281, 461-466` | addedPhoto が見つかった分岐で `deleteLocalPhoto(photo.uri)` を呼ぶ（まだ記録に保存されていないので即時に消してよい） |
| P-L8 | プロジェクト外（LOCAL）でレイヤを削除しても、`deleteLayerPhotos` は projectId===undefined ですぐ戻るので、`PHOTO_FOLDER/LOCAL/{layerId}/` の写真（撮影・取り込み）が残る。孤児を掃除する処理もなく、消すにはキャッシュの全消去しかない（P-M6 のとおり消しすぎる）。設定モードでレイヤを削除するとその場でフォルダが再帰削除され、破棄しても戻らない点は付随的な問題として残る（破棄では記録自体も捨てられ、クラウドの写真は再ダウンロードできるので影響は小さい） | 安全 | `useLayerEdit.ts:252-259`、`LayerEdit.tsx:75-86`、`useDataEdit.ts:94-99`、`useEcorismapFile.ts:225`、`useGeoFile.ts:345`、`Home.tsx:2391-2398` | projectId がないときは `isSafePathSegment(layerId)` を確かめてから `${PHOTO_FOLDER}/LOCAL/${layerId}` を `deleteAsync({idempotent:true})`。設定モード側も直すなら、削除したレイヤ id を控えて `saveProjectSetting` 成功後に消す |
| P-L9 | レイヤ編集で PHOTO 項目を削除する、または PHOTO から別の形式に変えると、全記録の写真の配列が消える（戻しても [] になる）が、端末のファイルも Storage の写真も消さない。外れた写真は `updateStoragePhoto` の対象にもならない。値が消えること自体は他の形式と同じ仕様。端末側はレイヤ削除まで、Storage 側はクラウドデータ管理でレイヤ単位に消すまで残る。削除の場合は確認も出ない | 判断 | `useLayerEdit.ts:168-200, 449-468, 500-516`、`Data.ts:119-170`、`LayerEdit.tsx:65-72`、`useRepository.ts:690-722` | `updateDataOfTheLayer` で消える PHOTO の値の各 uri に `deleteLocalPhoto`（写真フォルダの外は消さないので安全）。Storage 側は外れた写真の id を次回アップロードの削除予約に積む仕組みが要る。写真の件数を示す確認を出すかは方針判断 |
| P-L10 | iOS でアプリ更新（コンテナ UUID の変更）を挟んだ自動バックアップを復元するか、同じ端末で写真なしで書き出した .ecorismap を開くと、uri が古いコンテナを指したまま入る。`runPhotoUriRebase` は起動時の onBeforeLift でしか呼ばれない。次に起動するまで写真が無い扱い（サムネイル代用・書き出しで落ちる・アップロード失敗）。その間に記録を消すと、ファイルは消えず、次の起動でも回収されない孤児になる | 安全 | `photoUriRebase.ts:93, 103, 110-115`、`App.tsx:47-51`、`useProjectBackup.ts:88-121`、`useEcorismapFile.ts:240-262` | `restoreBackup` の `setDataSetAction` の後と、`openEcorisMapFile` の dispatch の後にも `runPhotoUriRebase(store)` を呼ぶ（冪等で、iOS 以外は何もしない） |
| P-L11 | 写真の一時ファイルを消さない。(1) `uploadPhoto` が作る暗号化コピー（iOS は `cacheDirectory/enc_*`、Android は virgil の cacheDir/UUID）。(2) `fetchPhoto` の復号済み平文（tmp/UUID）。`downloadPhoto` と書き出しの `File.ts` はコピー後に元を残す。(3) 軌跡写真のビューアは1枚開くと、needsPreviewFile の全写真について原寸・品質0.9の JPEG を順に書き出し、追い出しても閉じても消さない（`createThumbnail` の出力も残るが小さい）。固定名の 'temp' は上書きなので溜まらない。OS がキャッシュや tmp を片付けるまで、写真の枚数分の原寸の複製が残る。他人の写真の平文も写真フォルダの外に残る（アプリのサンドボックス内）。同じ形の残りが `fetchPhotoPDF` とスタイル取得にもある | 安全 | `storage.ts:243-248, 270-302, 331-347, 359-381, 459-464`、`e3kit.ts:388-416, 439-451`、`File.ts:209-238`、`HomeTrackPhotoModal.tsx:20-33, 67-86`、`Photo.ts:33-53`、`react-native-virgil-crypto/ios/FSUtils.m:15-21`、`android/.../utils/FS.java:99-105` | `uploadPhoto` は putFile の finally で encUri を `deleteAsync({idempotent:true})`（Web は不要）。`downloadPhoto` と書き出しはコピー・ZIP 追加の後に復号済みファイルを消す。ビューアはプレビューを表示中と前後1枚に限り、閉じたときと Map から追い出したときに `deletePhotoFile` する。作るサイズも画面の2〜3倍に縮めるとよい |
| P-L12 | 軌跡 X のサマリーを開いたまま地図上の別の軌跡 Y をタップすると、同じ TrackSummary が key なしで使い回され、`useTrackPhotos` は「表示中の再照合」として Y の走査とサムネイル生成が全部終わるまで X の写真を出し続ける。その間にエクスポートすると、件数の確認にも同梱にも X の写真が X の座標で入る。走査が終われば自動で差し替わり、データは壊れないので low（3票中1票は medium） | 安全 | `BottomSheetContent.tsx:70, 96`、`BottomSheetNavigationContext.tsx:163-168`、`useTrackPhotos.ts:65-69, 135, 158-172`、`containers/TrackSummary.tsx:154-161, 183-260`、`Home.tsx:2768-2798` | TrackSummary に記録単位の key（recordId か 'recording'）を付けて作り直す。または `useTrackPhotos` に軌跡の識別子を渡し、変わったら `applyTrackPhotos([])` して漸進表示からやり直す（selectedPhoto・展開中のクラスタも消す）。エクスポートでは照合した軌跡が今の記録と同じか確かめる |
| P-L13 | 写真が多いグループを展開すると、iOS（Google Maps）でマーカーごと消える。`spiderRadius` に上限がなく、展開マーカーの一辺は (半径+20)×2pt。3倍解像度では22枚以上、2倍では34枚以上で iconView が 1024px を超え、何も描かれない（実測済みの既知の制約）。タップ判定は配置の計算だけで行うので、見えない場所をタップすると写真が開く。ズームインすればグループが分かれて辿り着ける。Android は数百枚規模で巨大なビットマップになる（試算で、実測していない）（3票中1票は medium） | 判断 | `trackPhoto.ts:120`、`HomeTrackPhotoMarkers.tsx:23, 63-77, 89-127`、`components/pages/Home.tsx:583`、`containers/Home.tsx:2685-2706`、メモリ ios-gms-marker-icon-1024px-limit | 一辺を `MAX_MARKER_ICON_PX`（1000/PixelRatio、`PointMarkerContent.tsx` と同じ基準）以下に収める。超える枚数は多重の円に並べるか、展開せずにグループの範囲へズームインする。タップ判定は同じ `spiderOffsets` を共有する |
| P-L14 | サムネイルを作れない画像を選ぶと、何も知らせず写真が付かない。Web の Chrome/Firefox で HEIC を選ぶと、image-manipulator の Web 実装が Image 要素で読めず reject し、`pickImage` の catch が console.log して undefined を返し、DataEdit は黙って戻る。Windows で HEIC の MIME が空なら、その前に image-picker の `readFile` が「Unsupported file type」で投げて同じ結果になる。ネイティブで manipulateAsync が失敗して孤児ファイルが残るという点は、具体的な手順を示せていない | 判断 | `Photo.ts:33-41, 133-170, 175-198`、`expo-image-manipulator/src/web/utils.web.ts:22-38`、`expo-image-picker/src/ExponentImagePicker.web.ts:163, 216-246`、`DataEdit.tsx:275-277`、対比 `useGeoFile.ts:312-325` | Web では選んだ時点で形式を見て、表示できない形式（HEIC など）は「このブラウザでは扱えない形式」と知らせる（thumbnail:null で付けても表示できない）。サムネイル作成の失敗そのものは `createImportedPhotoThumbnail` と同じく thumbnail:null で付ける（pickImage と saveCapturedPhoto の両方）。catch では理由を返して Alert を出す |
| P-L15 | 同じアカウントを2台で使い、同じレイヤで同じ秒に撮ると、写真名（秒単位）と保存先が同じになる。端末1が相手の記録 R2 を取得すると、`photoDownloadTarget` は自分の写真として `{uid}/EMAP_….jpg` を返し、`downloadPhoto` は同名ファイルがあれば中身を確かめずに使うので、R2 の uri が R1 の原画を指す。R2 の写真や記録を消すと R1 の原画が端末から消える（クラウドとカメラロールには残る）。起きるのは、プロジェクトを開き直して写真を取得したときか、R2 でダウンロードボタンを押したとき（マージ自体では写真を取らない）。Android ではアプリ領域の絶対パスが同じになりやすく、同期で届いた uri そのものが手元の別の写真を指すこともある | 判断 | `photoDownloadPath.ts:12, 44-47, 53`、`storage.ts:362-365`、`Photo.ts:116-121, 153, 160, 177`、`useRepository.ts:1531-1541`、`DataEdit.tsx:355-370` | 撮影・選択時の写真名に photo.id か ULID を入れて衝突自体をなくす（同期で届いた uri の経路も塞がる。`photoUriRebase` や書き出し・取り込みへの影響を確認する）。既存データには、自分の写真でも同じ photo.id の記録が手元になければ `${photoId}_${name}` に保存する |
| P-L16 | プロジェクトで削除した写真（uri:undefined の印、url と key は残る）が、次のアップロードまで書き出しに含まれる。`generateExportGeoData` は `photo.uri \|\| photo.url` で判定するので、url を使ってクラウドから取得し ZIP に入れ、`generateProperties` は名前も属性に出す。画面とアップロードは削除済みとして扱うのに、書き出しだけが含める | 安全 | `useDataEdit.ts:225-228`、`useGeoFile.ts:957-981`、`File.ts:206-215`、`File.web.ts:84-92`、`Geometry.ts:1572-1575` | 写真の収集と `generateProperties` で `uri === undefined` の写真を飛ばす（Web はアップロード後に uri が null になるので、null は従来どおり書き出す。厳密に `=== undefined` で判定）。.ecorismap のバックアップは削除の印を復元後に確定させる必要があるので、ZIP に同梱するファイルだけを除き、記録の印は残す |
| P-L17 | Android 10 だけ、軌跡上の写真のサムネイル・拡大表示・書き出しが失敗する。AndroidManifest に `requestLegacyExternalStorage` がなく（bare 構成なので expo-media-library の config plugin が付けない）、targetSdk 29以上の Android 10 ではスコープストレージで他アプリが作った DCIM の写真を file:// のパスで開けない。11以降はパス読み取りが戻る。PHOTO フィールドの写真はアプリ専用フォルダなので影響しない。Android 10 での実際の失敗は確かめていない | 安全 | `useTrackPhotos.ts:42-53, 152-153, 201-206`、`HomeTrackPhotoModal.tsx:93-96`、`android/app/src/main/AndroidManifest.xml:38`、`android/build.gradle:8-10`、`expo-media-library/plugin/src/withMediaLibrary.ts:25-27` | `<application>` に `android:requestLegacyExternalStorage="true"` を付ける（11以降は無視される）。マージ後のマニフェストに入ったか確かめ、Android 10 のエミュレータでカメラアプリの写真のサムネイル・拡大表示・KMZ 書き出しを確認する |

---

## 反証されたもの

| 候補 | 反証の理由 |
|---|---|
| Activity 破棄からの撮影復帰が、他人の記録やテンプレートの記録を元の名義のまま保存し、写真がアップロードされずに消える（重複2件） | `usePendingPhotoCapture` が元の userId で投げる `updateRecordsAction` は、ストアの前段 `resolveRecordOwnershipActions`（`modules/index.ts:35-40`、`recordOwnership.ts:83-152`）で置き換えられる。写真を足すと中身の変更と判定され、管理者が PUBLIC の他人の記録なら引き継ぎ、テンプレートなら自分の名義への持ち替えになり、自分のバケットに入ってアップロードされる。変更が許されない組み合わせは更新ごと捨てられる。`recordOwnership.ts:16` のコメントにもこの経路が対象として明記されている |
| iOS のカメラで撮った写真に撮影位置と撮影時刻の EXIF が残らない（カメラロールのコピーも同じ） | カメラ撮影では `image.jpegData` で書き直すので DateTimeOriginal などが落ちるのは事実。ただし UIImagePickerController の mediaMetadata にはもともと GPS が入らないので、「GPS が消える」「asset.exif を書き戻せば撮影地が残る」は誤り。アプリは保存・表示・同期・書き出しのどこでも EXIF を読まず、軌跡写真はカメラロールの creationTime（保存直後なのでほぼ撮影時刻）で照合する。写真の消失や取り違えにはつながらず、ライブラリの仕様による制約（EXIF の付与は機能追加の判断）にとどまる |

---

## 直す順番の提案

1. **P-H1（HEIC が上がらない）**。iPhone の普通の操作で写真がメンバーに届かない。`preferredAssetRepresentationMode: Compatible` を渡すだけでも iOS の大半は止まる。続けて jpeg/png 以外の変換（P-L1 の Android HEIF も同じ処理）と、既存の url:null の写真のアップロード直前変換を入れる。
2. **P-H2（クラウドデータ管理の消しすぎ）**。正規の管理操作で戻らない消失が起きる。当座の策（同じ組の行が残るときはフォルダ削除を見送る）を先に入れ、そのあと url 単位の削除に変える。
3. **写真を消してしまう／共有を壊すもの**: P-M10（テンプレート写真の共有）、P-M8（複製の共有）、P-M14（ビューアのずれで別の写真を消す）、P-M6（キャッシュのクリア）。P-M8 と P-M10 は「同じ実体を参照する記録があるか確かめてから消す」を共通の部品にすると、P-M9（パスの修正）と P-L5 も安全に入れられる。P-M9 は P-M10 の参照確認と一緒に入れる（単独で入れると共有中の写真を消す経路が動き出す）。
4. **上がらない・上げすぎ**: P-M5（Web の取り込みの contentType）、P-M3（Web の拡張子）、P-M11（固定名の temp）、P-M13・P-M12（他人の uri を上げない、引き継ぎの写真）、P-M16（まず本番の上書き挙動を確認）。P-M5・P-M3・P-M11・P-M13 は安全に直せて小さい。
5. **Web の原画の寿命（P-M4）**。当面の `hasUnsyncedChanges` の修正は小さく安全。Dexie への保存は設計判断として別に進める。
6. **Android の Activity 破棄（P-M1・P-L2）** と **権限（P-M2）**。P-L2 は `getPendingResultAsync()` の空読みだけで取り違えを防げる。
7. **P-M7（プロジェクト削除の Storage）** と残りの low（孤児ファイル・一時ファイル・表示の不整合）。P-M7 は1行の置き換えで済むが、既存の孤児の掃除スクリプトも合わせて用意する。P-M15 は通信量の問題なので、ネイティブ側の対応とまとめて扱う。

---

## 修正状況

### P-H1（2026-11-23、fix/photo-heic-upload）

- 方針: HEIC のまま受け入れる案は、Web（Chrome/Edge/Firefox）と Android 7・8 で原画を表示できないため採らず、JPEG に変換して EXIF を引き継ぐ。
- 変換は新しいローカルネイティブモジュール `modules/photo-converter` で行う。
  - iOS: ImageIO の `CGImageDestinationAddImageFromSource` で、元のメタデータ（EXIF・GPS・TIFF・向き）をそのまま引き継いで JPEG（品質0.9、原寸）に書き出す。
  - Android: `BitmapFactory` で展開して JPEG に書き、`ExifInterface` で元のタグを書き戻す（寸法・圧縮など画像の構造を表すタグは除く）。画素は回転させず、向きはタグのまま。
  - ネイティブモジュールが無い環境（Web・古いビルド）と、ファイルとして読めない uri（iOS の ph://）では、従来どおり expo-image-manipulator で変換する（EXIF は落ちる）。
- 変換の判断は、ファイル先頭のバイト（JPEG/PNG の印）で行い、読めないときだけ拡張子で行う。Android のライブラリは HEIF を中身のまま `.jpeg` の名前で返すため（P-L1）、拡張子だけでは見逃す。
- 取り込み時（`pickImage`・`saveCapturedPhoto`）に変換して `EMAP_….jpg` で保存し、変換の一時ファイルは消す。変換に失敗したときは元の形式のまま保存する。
- すでに `.heic` 等で保存された写真は、`uploadPhoto`（ネイティブ）で暗号化の直前に同じ変換をかけて送る。記録の写真名は変えない。
- 書き出し時の HEIC→JPEG 変換（`convertPhotoForExport`、軌跡の写真付き書き出し）も同じ変換を使うので、書き出した写真にも EXIF が残るようになった。
- Web: `mimeType` から拡張子を決め（P-M3 の一部）、jpeg/png 以外は JPEG に変換してから保存する（EXIF は落ちる）。Web で HEIC を選んだ場合はブラウザが読めないので従来どおり付かない（P-L14 は未対応）。
- テスト: `src/utils/__tests__/Photo.test.ts`（ネイティブ変換と代替、中身による判定、ライブラリの HEIC/JPEG、書き出し変換）、`src/lib/firebase/__tests__/storage.uploadPhoto.test.ts`（送る前の変換と一時ファイルの後始末）。
- 実機相当の確認:
  - iOS シミュレーター: 位置・高度・撮影日時・機種・向き（6）を入れた HEIC をライブラリから選ぶと、`EMAP_….jpg`（JPEG）で保存され、すべての値がそのまま残った。サムネイルは向きを反映して出る。一時ファイルは残らない。
  - Android エミュレーター: 同じ HEIC が `.jpeg` 名の HEIF として渡され、中身で判定して JPEG に変換された。撮影日時・機種・向きは残った。位置（GPS）は 0 になったが、ピッカーが渡した時点の写しですでに 0 だった（Android の写真ピッカーは位置情報を消して渡す。ACCESS_MEDIA_LOCATION と元ファイルの取得が要る。この修正とは別の、以前からの挙動）。
  - クラウドへのアップロードは未確認（ログインが要る）。

### P-H2（2026-11-23、fix/cloud-delete-photos）

- クラウドデータ管理で行を消すとき、写真を持ち主のフォルダごと消すのをやめ、残すデータが参照していない写真だけをパスを指定して消す（`deletePhotosOfDeletedData`、`src/utils/cloudPhotoCleanup.ts`）。
  - 候補: 消すデータの持ち主のフォルダにある写真（照合データを読む前に一覧を取る）と、消すデータが参照している写真（引き継いだ記録の写真など、別の人のフォルダにあるもの）。
  - 残す: 消さないデータ（他人の PRIVATE も含めてレイヤの全データを復号する。`downloadLayerDataGroups`）と、データを消した後にもう一度読んだデータが参照している写真。
  - 照合できないとき（取得・復号に失敗、一覧にある残すデータを読めていない）は、そのレイヤの写真を消さない（孤児になるが消失はしない）。
  - 照合を始めた時刻の10分前より後に上がった写真は消さない（大きいデータの書き込み途中で、照合に入っていない写真を守る）。
  - データの削除が途中で失敗しても、消せた分の写真は片付け、消せなかった人の写真は残す。
- レイヤ定義の削除は、レイヤのデータを layerId だけの条件で全部消し（画面を開いた後に上がったデータも含む）、消せたときだけレイヤの写真フォルダを丸ごと消す。データ管理の行削除で残した写真もここで片付く。
- 2回の敵対レビュー（3観点）の指摘を反映した。
- テスト: `src/utils/__tests__/cloudPhotoCleanup.test.ts`、`src/hooks/__tests__/useCloudDataManagement.photos.test.ts`（例A・例B・写したテンプレート・読めないデータ・復号できないデータ・消している間に上がったデータ）、`src/hooks/__tests__/useCloudDataManagement.deleteOrder.test.ts`（読む順番、途中失敗、時刻の条件、レイヤ定義の削除）。
- 実機・エミュレータでの確認は未実施（Storage と Firestore の実データが要る）。

### medium（2026-11-23、fix/photo-medium）

方針（ユーザーの判断）: P-M6 は写真を一切消さない／P-M8・P-M10 は写真を新しい id で別にする／P-M4 は離脱確認だけ。ほかは修正案のとおり。修正後に3観点の敵対レビューを2回行い、指摘14件（実在を確認したもの）をすべて直した。

| # | 修正 |
|---|---|
| P-M1 | 撮影の前に編集中の下書き（記録・足した/外した写真）を `pendingPhotoCapture.draft` に残し、復帰時はそれを土台に写真を足して保存する。付け先が消えていれば写真ファイルを消す。テンプレートの写しの規則（写真の切り離し・外したファイルを消さない）も通す。付け先は墓標でない記録の集合から選ぶ |
| P-M2 | 撮影はカメラの権限だけを要求し、拒否されたら設定を開く案内を出す。ライブラリ選択の権限要求は外した（expo-image-picker のネイティブは不要） |
| P-M3 | ZIP 取り込みの写真名の照合を、書き出しと同じ正規化（NFC＋sanitize-filename）で両側にかける |
| P-M4 | Web で、このページで作った blob: の未アップロード写真があれば離脱確認を出す |
| P-M5 | Web で取り込む写真の Blob に種類を付け、アップロードで contentType を明示する |
| P-M6 | 「キャッシュをクリア」は地図だけを消す（確認文も変更、未使用の写真キャッシュ削除は削除） |
| P-M7 | プロジェクト削除で Storage の `projects/{id}` を再帰的に消す（functions 側は未変更） |
| P-M8・P-M10 | 複製とテンプレートの写しで写真に新しい id を振り、原画をコピー（手元に無ければクラウドから取得）して写した人の名義で上げ直す。取得できなければ元を参照したまま残して知らせる。写してよい原画は自分の写真か取得先に限る。Storage から消す前に、手元の全集合で同じ写真の参照が残っていないかを確かめる。保存の連打を防ぐ |
| P-M9 | 写真の Storage 削除は、url の uid（プロジェクト・レイヤ・写真 id が一致するときだけ）に向ける |
| P-M11 | 写真の取得で一時ファイルを1回ごとに別の名前にし、自分の一時ファイルだけを消す |
| P-M12 | 引き継いだ版が url:null で元の版に url/key があれば受け継ぐ |
| P-M13 | アップロードするのは、自分の写真フォルダ（自分・テンプレート・名義なしの記録なら LOCAL も）にあり読める写真だけ。COMMON の統合では書き換える前の名義で判定する |
| P-M14 | 写真ビューアの削除確認をキャンセルしたあと、表示中の写真の位置で作り直す |
| P-M15 | iOS の軌跡写真で、端末に原画が無い（iCloud のみ）写真はサムネイルを作らない |
| P-M16 | 写真が上がった時点で url/key を手元に反映し、データの書き込みに失敗しても上げ直さない（Rules は変えていない） |

残り: 圏外で写しを作って元の実体を参照したまま、別の端末で元が消されると写しの写真が消える（知らせは出す）。テンプレートの写しをデータ一覧・作図など保存以外の経路で作ったときは写真を共有したまま（Storage の実体は参照確認で守る）。実機・エミュレータでの確認は未実施。
