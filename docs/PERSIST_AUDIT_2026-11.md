# 設定保存・バックアップ・永続化の監査（2026-11）

2026-11-23 実施。アプリの状態を端末に保存し、起動時に読み戻し、バックアップから戻す処理で、次のことが起きる経路を探した。保存されない・壊れる・クラッシュする。戻したときに関係のない状態まで巻き戻る。データのクリアや移行で、消すべきでないものまで消える。保存と表示が食い違う。

- **範囲**: redux-persist と MMKV/AsyncStorage による永続化（migrate・version・blacklist、容量、書き込み失敗、破損）、自動バックアップ（`projectBackup.ts`・`useProjectBackup.ts`・バックアップからの復元）、設定の保存と読み込みの状態遷移（`.ecorismap` の入出力そのものは監査済みなので除く）、アプリ更新時のデータ移行（`demSourceMigration*`・`flipYTileCacheMigration`・`photoUriRebase`・旧形式の互換）、データのクリア、言語・単位などの設定、起動時の初期化順（`App.tsx` の onBeforeLift など）。主なファイルは `store.ts`・`store.web.ts`、`App.tsx`、`modules/*.ts`、`utils/mmkvStorage*.ts`、`utils/persistFlush.ts`、`utils/dataSetStorage.ts`、`utils/reduxPersistWebStorage.ts`、`utils/projectBackup.ts`、`hooks/useProjectBackup.ts`、`hooks/useEcorismapFile.ts`（clearEcorisMap）、`hooks/useProject.ts`（clearProject）、`containers/Settings.tsx`・`pages/Settings.tsx`。
- **方法**: 観点（永続化、バックアップ、設定、移行、起動）ごとに候補を出し、重複をまとめた。各候補を3人が別々に検証し、実在するか、重大度、分類、手順の訂正を投票した。重大度・分類・手順は3票の多数に従い、訂正は本文に反映した。既存の監査報告（インポート/エクスポート、同期、軌跡、暗号、写真、地図タイル）、メモリ、git log、テストで既知・修正済みのものは再報告していない。
- **結果**: 確認 13件（**high 1、medium 6、low 6**）。候補は22件あり、重複をまとめて13件にした。反証 0件。
- コードは変更していない。手順はコードとライブラリのソースを読んで成り立つと確認したもので、実機では確かめていない。
- **分類**: **安全に直せる**＝挙動の方針を変えずに直せる。**判断が要る**＝挙動や仕様を変えるので、どちらにするか決める必要がある。

---

## 優先して直すもの（high）

### S-H1. Web で新しいタブを開くと、利用規約モーダルの表示にあわせて、ほかのタブが取り込んだ PDF 地図と PMTiles の実体（共有の tilesDB）が全件消える【判断が要る】

- **原因**: 状態の保存先と地図実体の保存先で、タブの扱いがそろっていない。
  - redux-persist の保存先は、タブIDごとの別 DB（`reduxPersistWebStorage.ts:7-18`）。新しいタブは空の状態で始まるので、`settings.agreedTermsVersion` は初期値 `''`（`modules/settings.ts:45`）になる。`CURRENT_TERMS_VERSION`（`AppConstants.tsx:30`）と一致しないので、利用規約モーダルが開く。
  - 地図の実体を入れる Dexie の DB は固定名 `'tilesDB'` の1つだけ（`db.ts:19-34`）で、全タブが共有している。
  - `HomeModalTermsOfUse.tsx:41-49` の effect は、モーダルが開いていて Web のとき、`db.geotiff.clear()` と `db.pmtiles.clear()` を無条件に実行する。2024-08 のコミット 63063e51 で「ブラウザを開き直したら消す」目的で入ったもの。
- **手順**
  1. タブ A で PDF 地図（`db.geotiff`）か PMTiles ファイル（`db.pmtiles` の blob）を取り込んで表示する。
  2. 同じブラウザで新しいタブ B を開く。B では利用規約モーダルが開き、上の effect が tilesDB の2テーブルを全件消す。
  3. タブ A に戻る。読み込み済みのタイルはしばらく残るが、パン・ズームで新しく読むタイルは、`loadPDF`（`Home.web.tsx:330-340`）が `db.geotiff.get(mapId)` で何も得られず白紙になる。タブ A を再読み込みすると、`updatePmtilesURL`（`useMaps.ts:656-670`）も blob を見つけられず PMTiles も空白になる。地図は一覧（tileMaps）に残ったまま。
  4. `CURRENT_TERMS_VERSION` を上げたときも同じ。既存のタブを再読み込みするとモーダルが開き、そのタブ自身が取り込んだ地図が消える（同じタブの単なる再読み込みでは同意版が保たれるので消えない）。
- **影響**: 取り込んだ PDF 地図と PMTiles（Web ではここが唯一の保存先）が、確認なしに戻せない形で消える。タブ別 DB の設計は「2タブ目の起動が1タブ目のデータを消す」方式を不採用と明記しており、この clear はそれと矛盾する。地図タイル監査 M-H2 で `clearWebTileCache` は「blob や style を持つ行は残す」方針にしたが、この経路は全件消去のまま残っている。
- **重大度について**: 3票中1票は medium（元ファイルがあれば取り込み直せる）。多数に従い high とした。
- **修正案**（どれも実体の寿命の方針が変わるので判断が要る。共有 PC で残さないための安全弁という元の意図とあわせて決める）
  - 利用規約モーダルでの全件 clear をやめる。孤児の掃除が要るなら、`reduxPersistWebStorage` のタブロック（Web Locks）で生存しているタブを確かめ、どの生存タブの tileMaps にも無い mapId の行だけを消す。
  - または、tilesDB をタブIDつきの DB 名にし、閉じたタブの DB を `collectOrphanDatabases` と同じ方法で回収する。
  - または、clear を消して孤児が残るのを許す。

---

## medium

| # | 内容 | 分類 | 箇所 | 修正案 |
|---|---|---|---|---|
| S-M1 | 「バックアップから復元」が `dispatch(setSettingsAction(state.settings))` で settings を丸ごとスナップショットの値に置き換え、端末側の状態まで巻き戻す。同じく settings を差し替える「新規」（clearEcorisMap）と「ファイルを開く」は今の値を引き継ぐので、復元だけ扱いが違う。具体的には次のことが起きる。(1) **位置共有の自動再開**: clearProject は `isSynced:false` にする前にバックアップを保存するので、スナップショットには `isSynced:true`・projectId・memberLocation が入りうる。同じユーザーがログイン中に復元すると、useSyncLocation がリスナーを張り直し、GPS がオンなら60秒ごとに現在地をプロジェクトへ送る。利用者は共有をオンにしていない。未ログインで復元すると、古い memberLocation が他メンバーの現在位置として表示され続ける。(2) **保存範囲の食い違い**: `tileRegions` がスナップショット時点に戻る。「キャッシュをクリア」や flipY 移行でタイルを消した後に復元すると、タイルの無い範囲が「ダウンロード済み」と表示され、現場で地図が白くなる。逆に、スナップショット後にダウンロードした範囲の記録は消え、範囲単位で消せなくなる。flipY 移行（4a0cd212、未リリース）の前に作ったバックアップでは、移行の印があるので範囲は二度と外れない。(3) **既読・同意**: `lastSeenVersion`・`agreedTermsVersion`・`tutrials` が戻り、更新情報・利用規約の再同意・チュートリアルがまた出る。(4) **端末設定**: `externalGnss`（アンテナ高・NTRIP・自動接続）が古い値か undefined に戻る。受信機を接続したままなら、以後の標高がポール高ぶんずれる。`gpsAccuracy`・`mapListURL`・`proximityAlert`・`isTrackPhotoVisible`・`trackGnssColorAutoApplied` も戻る | 判断（下記の一部は安全） | `useProjectBackup.ts:108-117`、`useProject.ts:79-101`、`useSyncLocation.ts:76-113`、`useMaps.ts:212-236`、`useTiles.ts:139-156`、`flipYTileCacheMigration.ts:35-46, 84-99`、`HomeModalUpdateInfo.tsx:13-19`、`HomeModalTermsOfUse.tsx:15-16`、`useEcorismapFile.ts:388-398, 413-430`、`useLocation.ts:765, 912-918` | restoreBackup で settings を組み立ててから dispatch する。**安全に直せる部分**: `{...state.settings, isSynced:false, memberLocation:[], tileRegions:cur.tileRegions, tutrials:cur.tutrials, agreedTermsVersion:cur.agreedTermsVersion, lastSeenVersion:cur.lastSeenVersion, pendingPhotoCapture:cur.pendingPhotoCapture}`（cur は `store.getState().settings`）。tileRegions を引き継げば flipY の件も同時に解消する。**判断が要る部分**: externalGnss・gpsAccuracy・mapListURL・proximityAlert・isTrackPhotoVisible・trackGnssColorAutoApplied も引き継ぐか。引き継ぐキーの一覧は定数にし、S-M2 と共用する |
| S-M2 | 設定の「新規（データのクリア）」で、端末ごとの設定まで初期値に戻る。clearEcorisMap は `setSettingsAction({...settingsInitialState, tutrials, agreedTermsVersion, lastSeenVersion, mapRegion})` で全置換するので、`externalGnss` は undefined（settingsInitialState に無い。型定義では「端末ローカル」）、`gpsAccuracy` は HIGH、`proximityAlert`・`mapListURL`・`isOffline`・`tileRegions`・`isTrackPhotoVisible` は初期値になる。受信機を接続したまま実行すると、アンテナ高を `externalGnss?.antennaHeight ?? 0` で読むため、以後の点・軌跡・平均化の標高がポール高ぶん（1〜2m）高く記録され、利用者は気づけない。自動接続（lastDevice/autoConnect）と NTRIP の接続先も消える。GPS 精度は GPS オン中ならすぐ HIGH に切り替わる。オフラインモードはオンラインに戻り、保存範囲の記録だけが消えてタイルのファイルは残る。確認文は「現在のデータをクリアしますか？」で、端末設定まで消えるとは読めない。「ファイルを開く」は `...state.settings` を引き継ぐので経路で食い違う | 判断 | `useEcorismapFile.ts:393-399, 411-436`、`modules/settings.ts:10-57`、`types/index.d.ts:478-479`、`Settings.tsx:185-219`、`useLocation.ts:765-767, 910-918`、`usePointTool.ts:51`、`useGnssAveraging.ts:105`、`HomeGPSButton.tsx:37` | clearEcorisMap でも端末ローカルの設定を `store.getState().settings` から引き継ぐ。少なくとも externalGnss は残す。gpsAccuracy、proximityAlert（enabled と distanceThreshold。targetLayerIds はレイヤが消えるので空にする）、mapListURL、isOffline、tileRegions、isTrackPhotoVisible を残すかは方針で決める。キーの一覧は S-M1 と共用の定数にする |
| S-M3 | 陰影起伏・段彩の標高移行（Mapterhorn 統一、41f31e9d、未リリース）が、プロジェクトを開き直すたびに走り、移行後にダウンロードしたオフラインタイルと保存範囲を消す。移行は URL が Mapterhorn 以外か（`needsMapterhornUrl`）だけで判定し、移行済みの印を持たない。対象になると毎回 `dropTileRegions` と `removeTiles`（`TILE_FOLDER/{id}` をフォルダごと削除）を実行する。プロジェクトを閉じても tileRegions とタイルフォルダは残り、開き直すと `setTileMapsAction(tileMapsFromSettings)` がクラウドの旧 URL を入れるので、購読が再び発火して、Mapterhorn 形式で取り直したタイルを消す。開いたまま設定を再取得した場合は、`discardStaleTileSources` が手元の Mapterhorn URL とクラウドの旧 URL を「取得元の変更」と判定して先に消す。管理者が新版で設定を保存し直すまで、メンバー全員が開き直すたびに陰影・段彩のオフラインダウンロードを黙って失い、圏外の現場で気づく。旧版の `.ecorismap`、地図設定 JSON の読み込み、移行前のバックアップの復元でも同じ。Web はタイルを保存しないので実害なし | 安全 | `demSourceMigrationCore.ts:27-28, 40-58, 68-79`、`demSourceMigration.ts:13-15`、`useRepository.ts:1592-1621`、`useProject.ts:107-109`、`tileSourceCleanup.ts:19-36`、`tileSourceChange.ts:55-58`、`useTiles.ts:306`、`useMaps.ts:697, 713` | flipY 移行と同じく、旧タイルを消し終えた後（deleteAsync を await してから）に `TILE_FOLDER/{id}/.mapterhorn-dem` などの印を書く。印のある地図は URL と出典の書き換えだけにし、フォルダ削除と dropTileRegions はしない。URL の書き換えは同期のまま、削除だけを印の有無で決める。`useRepository.ts:1617` と `useMaps.ts:713` の `discardStaleTileSources` に渡す地図は、比べる前に `needsMapterhornUrl` の地図を `toMapterhornDemUrl` で正規化する。旧タイルを一度だけ捨てるという移行の目的は変わらない |
| S-M4 | persist:root の MMKV 書き込み失敗が同期の例外になり、タイマー内の未捕捉例外でアプリが落ちる。`reduxMMKVStorage.setItem` は `storage.set` を try で囲まずに呼ぶ。react-native-mmkv 4.3.1 は set が失敗すると `Failed to set value for key` を throw する。redux-persist は `storage.setItem(...).catch(onWriteFail)` と書いているので、Promise を返す前の同期例外は catch に届かず、`setInterval(processNextKey)` のコールバックから漏れる。背面移行時の `persistor.flush()` でも、dispatch(FLUSH) から同期で投げられ AppState リスナーへ抜ける。`ErrorUtils.setGlobalHandler` は無いので、リリースビルドでは致命扱いで落ちる。起きるのは、MMKV がファイルを2倍に広げる（ftruncate と zero-fill）必要があるときに空き容量が足りない場合だけで、写真やタイルを溜めた端末で起こりうる。いったん起きると、状態が変わるたび（約1秒後）に落ち続けるおそれがある。dataSet 側（`dataSetStorage.ts`）は try/catch でログだけにしているので落ちないが、書き込み失敗が利用者に伝わらない。iOS では容量不足が JS 例外ではなくネイティブ側の失敗として現れる可能性があり、JS 側の修正だけで防げるかは実機で未確認 | 安全（通知は判断） | `mmkvStorage.ts:18-23`、`node_modules/react-native-mmkv/cpp/HybridMMKV.cpp:126`、`node_modules/redux-persist/lib/createPersistoid.js:56-99`、`persistReducer.js:123-124`、`persistFlush.ts:13-25`、`store.ts:16-23`、`dataSetStorage.ts:96-105` | **安全**: `reduxMMKVStorage` の setItem・removeItem を `try { storage.set(...) } catch (e) { return Promise.reject(e); }` にする。onWriteFail に渡り、落ちなくなる。どちらでも保存はされないので、変わるのは落ちるかどうかだけ。flush 経路も Promise.all → .catch で受け止められる。**判断**: persistConfig に writeFailHandler を渡し、dataSet の書き込み失敗とあわせて「端末の空き容量が不足し保存できていません」と一度だけ知らせる |
| S-M5 | 「バックアップから復元」の確認文は「（現在の状態も自動バックアップされます）」と約束しているが、記録が0件のときはバックアップされない。restoreBackup は `saveProjectBackup(current,'beforeRestore')` の戻り値を見ずに置き換えへ進む。saveProjectBackup は `countRecords(dataSet)===0` なら trigger に関係なく保存せず false を返す。このため、記録は無いがレイヤ構成（属性・辞書・色分け）を作り込んだ、PDF 地図や PMTiles を取り込んだ、という状態から復元すると、settings・layers・tileMaps が戻せない形で置き換わる。取り込んだ地図のファイルは TILE_FOLDER に孤児として残る。5秒以内の同一トリガーの重複ガードやサイズ超過（S-L2）で false になった場合も、同じく黙って置き換わる | 判断 | `useProjectBackup.ts:95-119`、`projectBackup.ts:91-92`、`Settings.tsx:245-255`、`i18n/ja/translation.json:520`（en:329） | (a) `'beforeRestore'` に限り0件でも保存する（または layers/tileMaps が初期状態でなければ保存する）。世代を1つ消費し、0件のスナップショットが一覧に並ぶので方針判断が要る。(b) 確認文から約束の文言を外すか、条件付きにする。どちらでも、saveProjectBackup が false を返したら（理由を問わず）そのまま進めず警告する |
| S-M6 | 5世代そろった状態で復元すると、beforeRestore の保存で最古のバックアップが黙って消える。restoreBackup は復元前に必ず beforeRestore を保存し、saveProjectBackup は新しいメタを先頭に足して `splice(MAX_GENERATIONS=5)` ではみ出した世代を本体ごと消す。beforeRestore も同じ枠で数える。データを失ってから気づくまでに開閉を繰り返し、目的のデータが最古の P5 にあるとき、中身を確かめるために P1 を復元すると P5 が消える。P5 そのものを復元しても、P5 は index 5 に押し出されて一覧から消える（中身は読み込み済みのスナップショットから戻るが、やり直せない）。上限の5件は全ユーザーぶんを合わせて数える（一覧は uid で絞る）ので、別アカウントのバックアップが端末にあると、画面上5件未満でも押し出しが起きる。確認文は削除を告げない。起きる条件は、現在の記録が1件以上あり、直前の beforeRestore から5秒以上たっていること | 判断 | `useProjectBackup.ts:89-108`、`projectBackup.ts:49, 96-135`、`i18n/ja/translation.json:520` | beforeRestore を世代上限の数え方から外し、復元用の別枠1件として新しいもので上書きする。または、復元対象と一度も復元していない世代を押し出さない。最低限、上限に達しているときは確認文で「最も古いバックアップ（日時）が削除されます」と告げる |

---

## low

| # | 内容 | 分類 | 箇所 | 修正案 |
|---|---|---|---|---|
| S-L1 | ログイン中に未ログイン時（uid:null）のバックアップを復元すると、Redux 上だけログアウト状態になる。一覧はログイン中でも `meta.uid==null` のものを出し、checkRestorable はスナップショットの uid が undefined なら照合せずに通す。復元は `setUserAction(state.user)`・`setProjectsAction(state.projects)` で user を uid undefined、projects を [] にする。Firebase の currentUser と E3Kit の鍵はそのまま残り、ネイティブには認証状態を Redux に合わせ直す処理が無い（Home.tsx:631/2067/2300 の判定は逆向きの食い違いしか見ない）。user は永続化されるので再起動しても食い違いは残る。ログアウトボタンは Redux のログイン状態でしか出ないため、もう一度ログインするまで鍵削除付きのログアウトができない。データは失われず、再ログインで戻る | 安全 | `useProjectBackup.ts:54-57, 75-82, 117-118`、`projectBackup.ts:121`、`sign-in.ts`、`HomeAccountButton.tsx` | restoreBackup で `getAuthUid() !== undefined` かつ `snapshot.state.user.uid === undefined` のときは、setUserAction と setProjectsAction を出さず今の user と projects を残す（settings・layers・tileMaps・dataSet・dataSync だけ戻す）。照合を入れた e3a9c8d9 の意図「認証 uid と Redux 上の uid の食い違いを防ぐ」の範囲に収まる。3票中1票は「復元を断ってログアウトを案内する」案も含め判断としたが、多数に従い安全とした |
| S-L2 | スナップショットが MAX_SNAPSHOT_SIZE（5,000万文字）を超えるか保存で例外が出ると、黙ってバックアップを飛ばし、そのまま破棄・置き換えに進む。saveProjectBackup は console.log して false を返すだけで、呼び出し元5か所（新規・閉じる・ファイルを開く・プロジェクトを開く・復元）はどれも戻り値を見ない。記録中に置き換えると、軌跡のガードは「保存した軌跡は置き換え前の自動バックアップに残り…戻せます」（stopTrackingBackupNote）と無条件に案内するので、事実と食い違う。到達の目安は全レイヤ合計で約19万〜50万点（1秒間隔の連続記録でおよそ2〜3週間分を消さずに溜めた端末）で、ふつうはまず起きない。データが大きいほど失ったときの損害が大きいのに、その利用者だけ救済が無言で働かない | 判断（案内文の差し替えは安全） | `projectBackup.ts:52-53, 107-111, 131-135`、`Settings.tsx:194`、`useProject.ts:81`、`useEcorismapFile.ts:376`、`useRepository.ts:1573`、`useProjectBackup.ts:97`、`trackingLeaveGuard.ts:136-141`、`i18n/ja/translation.json:230` | (1) 安全: saveProjectBackup の戻り値を「保存した／0件または重複ガードで不要／失敗（理由）」に分け、失敗のときは stopTrackingBackupNote の約束を出さない。(2) 判断: 失敗のときは破棄・置き換えの前に「自動バックアップを作れませんでした。続けますか（先にファイルへ保存を推奨）」と確認する |
| S-L3 | ネイティブで、閉じる・復元・開くの直後に dataSet（persist:dataSet）と残りの状態（persist:root）の書き込みが数秒ずれ、その間にフォアグラウンドのまま落ちると食い違った状態で起動する。redux-persist（throttle:1000）は変わったトップレベルキーを1秒に1つずつ処理し、キューが空になって初めて persist:root を書く。dataSet は専用の購読が最初の変更から1秒後に書く。clearProject では root 側4キーで約4秒後、復元では6キーで約6秒後。persistFlush は background/inactive への移行でしか走らないので、JS の致命的エラー・jetsam・電源断では書かれない。閉じた直後に落ちると、projectId・layers・dataSync の基準値は閉じる前のまま、記録0件で起動する。これは同期監査 S1 と同じ「基準値あり＋手元が空」で、基準値がクラウドと一致すれば高速パスに入り、1件記録してアップロードするとクラウドの自分の記録がその1件で全置換されうる。開く側では、新しい dataSet と古い layers の組み合わせになり、見えない記録が残る。閉じる直前の projectClose バックアップから手で戻せる | 安全 | `store.ts:16-24, 40-43`、`dataSetStorage.ts:17-18, 88-119`、`node_modules/redux-persist/es/createPersistoid.js:31-84`、`useProject.ts:77-113`、`persistFlush.ts:13-27`、`useRepository.ts:896-923` | 複数スライスを置き換える処理（clearProject・restoreBackup・openEcorisMapFile・clearEcorisMap）の直後に `persistor.flush()` を呼び、dataSet の保留分も同時に書く（dataSetStorage は flush をエクスポートする）。または dataSet の flush の中で persistor.flush() も呼ぶ。書き込みのタイミングが変わるだけで画面の挙動は変わらない。MMKV の2キーなので完全に原子的にはならず、窓をほぼ0にする対策である |
| S-L4 | Web で言語を変えると、redux-persist の書き込み待ちを確定せずに即リロードし、直前の編集が戻りうる。pressLanguageSelect は Web で setStoredLanguage の直後に `window.location.reload()` を呼び、`persistor.flush()` を呼ばない。store.web は throttle:1000 で dataSet を含む全状態を persist:root（IndexedDB の非同期 put）に書くので、変えたキー数×約1秒が経つ前に reload すると書き込みが始まっていないか中断される。アンロード時の visibilitychange で flush が走っても put の完了は保証されない。未同期の変更があれば beforeunload の離脱確認が出るので、黙って戻るのは同期済みの変更（クラウドから取り戻せる）か、確認で OK を押した場合 | 安全 | `containers/Settings.tsx:371-382`、`store.web.ts:7-14, 25`、`reduxPersistWebStorage.ts:174-177`、`createPersistoid.js:57-86`、`UnsyncedChangesGuard.web.tsx` | Web 分岐で reload の前に store.web の persistor を flush し、完了を待つ: `try { await persistor.flush(); } catch {} window.location.reload();`。ネイティブは再起動の案内だけなので変更不要 |
| S-L5 | flipY 移行（4a0cd212、未リリース）が複数の地図をまとめて処理し、保存範囲を最後にまとめて外すので、途中で終了すると移行済みの地図の範囲が二度と外れない。migrateFlipYTileCache はタイルを消した直後に印（`.xyz-tile-cache-js`）を書いて true を返すが、`dropTileRegions(store, migrated)` はループの後に1回だけ。地図 A の印を書き、地図 B の大量削除中に終了すると、A の範囲は残ったまま保存される。次の起動では A に印があるので false が返り、A は migrated に入らない。ファイルの有無から範囲を見直す処理もない。A のタイルは消えたまま「保存済み」と表示され続け、オフラインで A が出ない。起動時のほか、複数地図をまとめてダウンロードする前（useTiles.ts:406）にも同じ形で呼ばれる。条件は flipY の地図が2つ以上ダウンロード済みで、移行中に終了すること | 安全 | `flipYTileCacheMigration.ts:35-45, 62-73`、`tileCacheCleanup.ts:36-43`、`tileSourceChange.ts:85-91`、`persistFlush.ts:13-25`、`App.tsx:52`、`useTiles.ts:406` | ループの中で、地図ごとに true が返った直後に `dropTileRegions(store, [id])` を dispatch する。印は dispatch の後に書く（印の書き込みを migrateFlipYTileCache の外に出すか、コールバックで渡す）。dispatch 後の永続化は既存の背面移行時の flush で足りる。正常に終わる場合の結果は今と同じ |
| S-L6 | Web の設定画面に、効果のない「GPS設定」（精度選択）が表示される。GPS設定ボタンには Platform 条件がない（直後の接近通知とバックアップは Web で隠している）。gpsAccuracy は保存されるが、読むのは useLocation の bggeo 向け設定だけで、Web ではスタブ（全メソッド no-op）か `Platform.OS === 'web'` で return している。Web の位置取得は GeolocateControl で、positionOptions を渡していないので maplibre の既定（enableHighAccuracy:false）のまま。T-M3 修正後の注記「設定は変更するとすぐに反映されます」と食い違い、効いていると誤解させる。外部GNSSの欄は Web では出ないので、Web で見えるのは効かない精度選択だけ | 安全 | `pages/Settings.tsx:45, 53-59`、`containers/GpsSettings.tsx:20-25`、`lib/backgroundGeolocation.web.ts:15-23`、`useLocation.ts:914`、`Home.web.tsx:934-941`、`i18n/ja/translation.json:1291` | GPS設定ボタンを接近通知と同じく `Platform.OS !== 'web' &&` で隠す（Web の動作は何も変わらない）。Web でも精度を効かせる場合は、GeolocateControl に `positionOptions={{ enableHighAccuracy: gpsAccuracy === 'HIGH' }}` を渡し注記も見直す。こちらは Web の測位挙動が変わるので判断が要る |

---

## 反証されたもの

なし（候補22件のうち重複をまとめて13件とし、すべて3票とも実在と判定された）。

重複としてまとめたもの:

- S-M1: 復元で settings を全置換する件として、tileRegions（2件）、端末ローカル設定（2件）、既読・同意、位置共有の自動再開、flipY 移行前バックアップ、端末ローカル（総括）の8件を1件にした。
- S-M2: 「データをクリア」で端末設定が戻る件の2件。
- S-L1・S-L2・S-L3: それぞれ2件。

---

## 直す順番の提案

1. **データが消えるもの（安全に直せる）**: S-M3（標高移行の再実行でオフラインタイルが消える）。未リリースの移行なので、0.7.0 を出す前に直しておくと、出荷後に全メンバーで繰り返し起きるのを避けられる。S-L5（flipY 移行の範囲外し）も同じく未リリースの移行で、修正が小さいので一緒に。
2. **クラッシュ（安全に直せる）**: S-M4 の setItem/removeItem の reject 化。数行で済み、挙動は落ちるかどうかしか変わらない。
3. **復元の安全な部分**: S-M1 の安全に直せる部分（isSynced/memberLocation を落とす、tileRegions・既読・同意を引き継ぐ）と S-L1（uid:null 復元で user/projects を残す）。どちらも restoreBackup の同じ箇所なのでまとめて直す。位置共有の自動再開を止めるのが最優先。
4. **永続化のタイミング（安全に直せる）**: S-L3（置き換え直後の persistor.flush）、S-L4（Web の言語変更前の flush）。S-L3 は同期監査 S1 の修正をディスク上でも成り立たせる。
5. **方針を決めてから直すもの**:
   - S-H1（Web の利用規約モーダルでの tilesDB 全消去）。共有 PC の安全弁をどう扱うか決める。データが消える high なので、方針が決まりしだい先に。
   - S-M1 の判断部分と S-M2（どの設定を端末ローカルとみなすか）。引き継ぐキーの定数を1つ決めれば、新規・復元の両方に使える。少なくとも externalGnss は両方で残す方向が自然。
   - S-M5・S-M6・S-L2（復元前バックアップの扱い）。beforeRestore を別枠にすれば S-M6 は解消し、S-M5 の0件スキップ外しも世代を圧迫しなくなる。saveProjectBackup の戻り値を区別する変更は S-M5・S-L2 で共通なので一緒に。
   - S-M4 の通知部分（writeFailHandler）。
6. **表示の食い違い**: S-L6（Web の GPS 設定を隠す）。1行で済むので、ほかの修正と一緒に入れてよい。

## 修正状況（2026-11-23、fix/remaining-audits）

【安全】の項目はすべて直した（S-M3、S-M4 の安全な部分、S-L1、S-L2 の案内文、S-L3 以降の安全な low）。次は判断待ち。
- S-M4: MMKV への書き込み失敗を利用者に知らせるか
- S-L2: バックアップを取れなかったときに破棄・置き換えを止めるか（保存結果の3分け）
- S-L6: Web の現在地に精度を渡すか
【判断】の項目（S-H1、S-M1、S-M2、S-M5、S-M6）は未着手。
