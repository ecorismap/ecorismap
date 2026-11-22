# 軌跡の記録とバックグラウンド動作の監査（2026-11）

2026-11-22 実施。軌跡の記録とバックグラウンド動作で、次のことが起きる経路を探した。点が欠ける・消える。別のプロジェクトや別の名義へ保存される。記録が止まらない、または始まらない。電池を無駄に使う。クラッシュする。表示と記録が食い違う。

- **範囲**: `useLocation.ts`（記録の開始と停止、syncBackgroundService）、ヘッドレスタスク、`Location.ts`、`mmkvStorage`（記録中の点をチャンクで保存する処理）、`TrackLogSplitter.ts`、`src/lib/gnss/*` と `modules/gnss-receiver`（外部GNSS・NTRIP のネイティブ）、`useExternalGnss*`、`useGnssAveraging`、`track*.ts`、`trackingLeaveGuard.ts`、`Home.tsx`、`CurrentTrackLog`/`SavedTrackLog`、`projectBackup.ts`、`dataSetStorage.ts`、patches/ のうち background-geolocation に関わるもの。
- **方法**: 観点（ライフサイクル、信号と精度、永続化、外部GNSS、出力、画面操作、プラットフォーム差）ごとに候補を出し、重複をまとめた。各候補を3人が別々に検証し、実在するか、重大度、手順に訂正があるかを投票した。重大度と手順は3票の多数に従い、訂正は本文に反映した。既知・修正済みの問題（changePace が拒否されたとき MMKV が on にならない件、iOS の getCurrentPosition が古いキャッシュを返す件、bggeo v5 の型不整合、記録中の軌跡が設定保存に入らない件など）は対象外にした。
- **結果**: 確認 26件（**high 1、medium 9、low 16**）。反証 3件（重複を含めると候補6件）。
- コードは変更していない。手順はコードを読んで成り立つと確認したもので、実機では確かめていない（チャンクのつなぎ目の重複 T-L4 だけは、一時的な Jest テストで再現した）。
- **分類**: **安全に直せる**＝挙動の方針を変えずに直せる。**判断が要る**＝挙動や仕様を変えるので、どちらにするか決める必要がある。

---

## 優先して直すもの（high）

### T-H1. 記録中にプロジェクト一覧やアカウント画面へ移ると Home がアンマウントされる。点が欠け、M13 の記録ガードも素通りになる（iOS は戻ると記録が止まる）【判断が要る（当面の策は安全に直せる）】

- **手順**
  1. プロジェクトAで軌跡の記録を始める。
  2. ホームのアカウントボタンから「プロジェクト」「設定」「ログイン」のどれかを押す（`gotoProjects`・`gotoAccount`・`gotoLogin`）。記録中でも確認は出ずに画面が切り替わる。
  3. `RootScreenRenderer` は今の画面1つしか描かないので、Home がアンマウントされる。
     - `useLocation` のクリーンアップで onLocation の購読が外れる。ネイティブのサービスと GPS は動き続ける。
     - アプリは前面にあるので、ヘッドレスタスクも動かない。この間に届いた位置は JS 側で誰も受け取らない。SDK の DB には残るが、アプリは `getLocations` で読み戻さないので、軌跡から抜ける。
     - 同時に `registerTrackingLeaveHandler` のクリーンアップで handler が null になる。
  4. 一覧でプロジェクトBを選び、ProjectEdit の「開く」を押す。`leaveWithTrackingGuard('openProject')` は handler が null なので「記録していない」と判断し、確認も停止も保存もしないまま B を開く。Account 画面の強制ログアウト前の `stopTrackingBeforeForcedLogout` も、同じ理由で何もしない。
  5. Home に戻ると再マウントされ、初期化がもう一度走る。
     - **Android**: MMKV の trackingState が 'on' なので記録が戻る。チャンクには A で記録した点が残ったまま、B で記録が続く。止めて保存すると、B の軌跡レイヤに B の名義で入り、アップロードで B に共有される。
     - **iOS**: 初期化は savedTrackingState を 'off' に固定し、MMKV を 'off' に書き換える。サービスは動いている（`state.enabled`）ので `stopTracking()` が走り、「保存しますか」が出る。プロジェクトを変えずにアカウント設定を開いて戻っただけでも記録が止まる。記録していなくても GPS が ON なら止まる。
- **根拠**
  - `src/routes/index.tsx:49-83`（switch で今の画面1つだけを描く）
  - `src/containers/Home.tsx:507`（`useLocation` を呼ぶのは Home だけ）、`2386-2401`（`gotoProjects`・`gotoAccount`・`gotoLogin` に記録中の確認がない）、`2099-2124`（handler の登録と、アンマウント時の解除）
  - `src/utils/trackingLeaveGuard.ts:42-46, 69, 100-101, 164`（handler が null なら何もせず true を返す）
  - `src/containers/ProjectEdit.tsx:167`、`src/containers/Account.tsx:52-55`（Home がいない画面からガードを呼んでいる）
  - `src/hooks/useLocation.ts:1318-1330`（アンマウントで購読を外す）、`1205-1207, 1224-1226, 1280-1286`（iOS の再初期化で停止する）
- **影響**
  - 画面を離れていた間の軌跡が欠ける。表示は記録中のままで、Android の通知も記録中のままなので、気づけない。
  - 記録中の軌跡が別のプロジェクトや別の名義に保存・共有される。同期監査 M13 で防いだはずの事故が、ProjectEdit と Account の経路では一度も防げていない。Home の中のログアウトやプロジェクト終了は正しく動くので、問題に気づきにくい。
  - iOS では、画面を移って戻るだけで、利用者が止めていない記録が終わる。
  - その間も GPS は動いているのに記録されないので、電池が無駄になる。
- **修正案**
  - **根本策（判断が要る）**: 記録の持ち主を Home の寿命から切り離す。次のどちらか。
    - `RootScreenRenderer` で Home を常にマウントしておき、ほかの画面はその上に重ねる。
    - `useLocation` と leave の handler を、Routes や App 直下の常駐 Provider へ移す。
  - **当面の策（安全）**: `gotoProjects`・`gotoAccount`・`gotoLogin` の冒頭で、Home がまだマウントされているうちに `confirmTrackingLeave` と `finishTrackingBeforeLeave` を通す。記録中は、止めて保存するか移動をやめるかを選ばせる。いちばん小さく効く策。
  - 「ProjectEdit や Account で MMKV の trackingState を見る」だけでは足りない。そこで止めて保存するには `useLocation` が必要だが、Home がいない画面にはそれがない。
  - 「アンマウント時に flushTrackLog する」案は点の欠けを防げないので、効果が小さい。
  - iOS の初期化を Android と同じ復元にする案は、kill 後に再起動したときの方針（T-M4）まで変えてしまうので、ここでは使わない。
- 補足: 「ログアウト後に保存した軌跡は userId のないレコードになる」点は確かめていない。

---

## medium

| # | 内容 | 分類 | 箇所 | 修正案 |
|---|---|---|---|---|
| T-M1 | 位置情報の権限を拒否した状態で GPS・軌跡・コンパスのボタンを押しても、何も起きず案内も出ない。bggeo 5.8.x の `requestPermission` は拒否を reject（AuthorizationStatus の数値）で返すのに、`confirmLocationPermission` は resolve 前提で判定し、catch で console.error だけ出して undefined を返す。このため 457-458 行の `AlertAsync(permitAccessGPS)` と `openSettings` は、拒否のときに一度も実行されない。`disableLocationAuthorizationAlert: true` なので、iOS 標準の案内も出ない。記録中に設定で権限を外してアプリへ戻ったとき（1375 行の経路）も、権限がないという案内は出ない。テストは拒否を `mockResolvedValueOnce(0)` で表しているので、実際の動きを再現していない | 安全 | `useLocation.ts:449-462, 625`、呼び出し元 `Home.tsx:1936, 1956, 2007, 2131`、`useLocation.ts:1266, 1375`、bggeo `src/index.js:271-278`、`useLocation.test.ts:268, 285` | `requestPermission('location')` の呼び出しだけを個別に try/catch で囲む。reject の値が数値なら拒否として扱い、AlertAsync と openSettings を実行して undefined を返す。数値でない例外は今までどおり console.error。テストを `mockRejectedValueOnce(AuthorizationStatus.Denied)` に変え、アラートが出ることを確かめる |
| T-M2 | 軌跡の開始確認で OK を押してから記録状態になるまで、`toggleGPS('follow')` の完了を待つ（キャッシュがなければ getCurrentPosition が最大30秒、続く changePace が位置の取得まで待つ。キューの1操作の上限は90秒）。その間、軌跡ボタンは青のままで、押し直しを防ぐ仕組みもない。押し直して確認でもう一度 OK を押すと二重に開始し、2回目の `startTracking` 先頭の `clearStoredLocations()` が、1回目に記録を始めてから記録した点（チャンクと MMKV の現在地）を表示なしに消す | 安全 | `Home.tsx:1993-2010`、`HomeButtons.tsx:30-35`、`useLocation.ts:925-931, 150-168, 113, 937-952, 772-776` | `pressTracking` に useRef の処理中フラグを持たせて再入を防ぐ（これが中心）。補助として、MMKV の trackingState がすでに 'on' なら `startTracking` で clear を省く（判定は ref を書き換える前の MMKV の値で行う。`toggleTracking('on')` が先に ref を 'on' にするので ref では判定できない）。`toggleTracking('on')` を `toggleGPS` より前に動かす案は、`useLocation.ts:900-903` の MMKV 書き込みとの順序が変わるので確認が要る |
| T-M3 | GPS ON 中や記録中に GPS 設定で精度（高/中/低）を変えても、サービスに反映されない。サービスが動いている間は `ready({reset:false})` になり、ネイティブは2回目以降の設定を "Ignored config" として捨てる。`desiredAccuracy` と `distanceFilter` を setConfig する箇所もない。設定画面の注記は「GPSの起動時に反映」だが、記録中は GPS を OFF→ON にしてもサービスが止まらないので反映されない。記録を止めて GPS も OFF にするまで古い値のまま（設定は TSConfig に残るので kill をまたいでも同じ）。「低」にしても 2m 間隔の高精度で動き続けて電池を使い、「高」にしても 50m 間隔のまばらな軌跡になる | 安全 | `useLocation.ts:328-339, 613-636, 689-717`、`containers/GpsSettings.tsx:20-25`、bggeo Android `RNBackgroundGeolocationModule.java:406-414, 419-438`、iOS `RNBackgroundGeolocation.mm:191-221`、`i18n/ja/translation.json:1259` | `syncBackgroundService` の wantOn 側の setConfig に、`gpsAccuracyOption` の `desiredAccuracy` と `distanceFilter` を加える（フラット設定のまま）。`gpsAccuracy` が変わったとき、GPS ON 中か記録中なら sync を1回呼ぶ（キュー経由、初回マウントでは呼ばない）。挙動を変えたくなければ、注記を「GPSと軌跡の記録を止めてから起動したときに反映」に直すだけでもよい（3票中1票はこの扱いで low とした） |
| T-M4 | iOS で記録中にアプリが終了されたあと、再び起動すると記録を止める（意図した方針、a247d35b）。stopOnTerminate:false なので、利用者がスワイプで終了すると静止ジオフェンスが張られる。「常に」の許可があれば、そこから出たときにバックグラウンドで再起動され、初期化が trackingState を 'off' と読んで `stopTracking()` する。既定の「使用中のみ」の許可では再起動されず、次にアプリを開いたときに同じ分岐で止まる。終了前の点はチャンクに残り、確認ダイアログから保存できる。失われるのは、終了してから次に開くまでの記録。その間、iOS には常駐通知がないので、止まったことに気づけない | 判断 | `useLocation.ts:1205-1207, 1224-1226, 1280-1285, 620`、`Location.ts:170` | 案A: iOS も Android と同じく MMKV から復元する（1205-1206、1214、1232 の Android 限定を外す）。ただし初期化ではスワイプ終了とOSによる終了を区別できないので、意図して終了したのに記録が続く逆の問題が出る。また終了から再起動までの点は戻らない。案B: 停止は今のままにして、`checkUnsavedTrackLog` の確認文で「記録は中断されました（最後の点の時刻）」と示す（`trackMetadata.lastTimeStamp` を使う）。小さな変更で済むのは案B |
| T-M5 | 位置の許可が「おおよその位置」（Android 12以降）や「正確な位置情報オフ」（iOS 14以降）だと、軌跡の点が1点も保存されないのに、記録中の表示のまま進む。`confirmLocationPermission` は WhenInUse/Always なら 'granted' にして、精度の許可は見ていない。届く位置は精度が km 単位なので、`checkLocations` の 100m の条件で全部捨てられる。一方、現在地マーカーとカメラの追従は精度で弾かないので普通に動く。停止すると「有効な軌跡データが不足」が出るだけで、何も保存されない。記録中に知らせる経路はない（accuracyAuthorization、getProviderState、onProviderChange、requestTemporaryFullAccuracy をどこも使っていない） | 判断 | `useLocation.ts:448-455, 528-562, 1116-1118`、`Location.ts:241-243`、`AppConstants.tsx:472-475`、`ios/ecorismap/Info.plist` | 記録開始時と GPS ON 時、さらに onProviderChange で `getProviderState().accuracyAuthorization` を確かめる。Reduced なら、iOS は `requestTemporaryFullAccuracy`（Info.plist に `NSLocationTemporaryUsageDescriptionDictionary` を追加）、Android は正確な位置の許可へ設定画面で案内する。あわせて、記録中に点が続けて精度で捨てられていたら知らせる |
| T-M6 | GPS も軌跡も OFF なのに、外部受信機の接続と NTRIP が張られたままになる。`useExternalGnssAutoConnect` は GPS や記録の状態を見ずに、起動時と前面復帰時に接続し、NTRIP も始める。止めるのは設定画面の「切断」だけ。iOS は bluetooth-central のバックグラウンドモードがあるので、接続が保たれている間は受信機の通知（1〜10Hz）のたびにアプリが起こされ、NMEA の解析、NTRIP の通信、GGA の送信が続く。Android はバックグラウンドではいずれ凍結されるので、主な影響は iOS と、両OSの前面表示中 | 判断 | `useExternalGnssAutoConnect.ts:24-55`、`useExternalGnss.ts:117-121`、`lib/gnss/connection.ts:30`、`Info.plist:120-125`、`ios/BleLink.swift:246`、`ios/NtripClient.swift:441-445` | GPS OFF かつ記録していない状態でバックグラウンドへ移ったら `stopNtrip`（必要なら受信機の切断か通知の停止も）。前面に戻ったら `tryConnect` で張り直す。または自動接続を GPS ON か記録開始のときに限る（前面で受信品質を確かめる使い方に影響するので選ぶ）。どの案でも記録中は止めない。3票中1票は low |
| T-M7 | データ一覧で軌跡レイヤをエクスポートした zip を取り込み直すと、軌跡の点ごとの時刻・標高・精度・速度・FIX/FLOAT・楕円体高がすべて消える。LINE の GeoJSON は [経度, 緯度] の2次元だけを書き、`loadZip` は json と geojson（無ければ csv）だけを読んで、同じ zip の .gpx は使わない。ポイントには `restoreGnssCoords` があるが、線にはない。「置き換え」で取り込むと、手元の完全な軌跡がこの劣化版に置き換わる。既存の trackレイヤを置き換えた場合は、timestamp がないので軌跡サマリーが開かず DataEdit へ回る（新規レイヤとして取り込んだ場合はレイヤIDが変わるのでもともとサマリーには入らない）。標高グラフ、写真の時刻照合、測位品質の色分けも使えなくなる。インポート/エクスポート監査 L2 はポイントだけを直しており、この件は扱っていない | 判断 | `Geometry.ts:1644-1671, 1108-1109, 1189-1196, 666-675, 838-846, 799, 1934-`、`useGeoFile.ts:656-778, 908-951`、`Home.tsx:2744-2755` | (b) 既存の流れに沿う案: LineString の3番目に標高を書き、点ごとの時刻・精度・速度・fixQuality・楕円体高を配列のプロパティ（例 `_timestamps`）に入れ、EcorisMap が書き出したものなら取り込みで戻す。(a) 最小の案: LINE で同じ zip に .gpx があれば座標は gpx2Data から、属性は geojson から取る。ただし GPX も fixQuality と楕円体高を書いていないので、全部は戻らない。KML の LINE は標高だけ書けばよい。海抜0mは今の取り込みでは戻らない点に注意 |
| T-M8 | 設定の「バックアップから復元」「新規」「ファイルを開く」と、Google Drive から開く処理が記録ガードを通らない。(A) 復元は settings（projectId を含む）・layers・dataSet・user まで丸ごと置き換えるが、記録はそのまま続く。止めると、Aで記録した軌跡が復元先のプロジェクトBの軌跡レイヤに入り、ログイン中ならアップロードで B へ上がる（未ログインで他人のバックアップを復元した場合は、その uid で端末内に保存されるが、アップロードはできない）。(B) 新規は通常利用中のプロジェクトでも押せ、projectId を外すので、軌跡は名義なしの端末内データに保存される。(C) 端末内データや設定編集中に記録しながらファイルや Drive を開くと、読み込んだ別のデータへ保存される（名義の取り違えはないので影響は小さい） | 判断 | `Settings.tsx:208-231, 165-189, 99-148`、`useProjectBackup.ts:53, 59-101`、`useEcorismapFile.ts:400-430`、`GoogleDriveProjects.tsx:98-118`、`trackingLeaveGuard.ts` | `pressBackupSelect` は復元の前に `leaveWithTrackingGuard('openProject', …)` を通す。`pressClearData` は `leaveWithTrackingGuard('closeProject', …)` を通すか、通常利用中のプロジェクトでは禁止する。`openFileFromLocal` と Drive から開く処理は、確認のあとに `confirmTrackingLeave` と `finishTrackingBeforeLeave` を通す。Settings は Home の上のボトムシートで、Home はマウントされたままなので、T-H1 を直す前でもガードは効く見込み（実機では未確認）。Web は handler を登録しないので対象外 |
| T-M9 | プロジェクト設定の編集中に保存した軌跡が、「設定を保存」でテンプレートとして全メンバーへ配られる。設定モードでも記録は止められず、`addTrackRecord` は管理者の uid で軌跡レイヤ（PRIVATE）に保存する。`getTargetLayers('Template')` は PRIVATE/PUBLIC のレイヤを全部対象にして軌跡を除かないので、`mergeTemplateRecords` が管理者の軌跡を `userId:'template'`・表示名「管理者」・permission 'TEMPLATE' として送る。メンバーが開くと `fetchTemplateData` で全員の地図に出る。一度テンプレートになると、設定を保存するたびに送り直される。ガード経由（記録中に「設定を保存」）で止めた軌跡は、保存前の fullDataSet を使うので偶然送られないが、保証はない。ガードの文言「設定の編集中に保存した軌跡はアップロードされず…」とも食い違う | 判断（除外は安全） | `useRecord.ts:139-142, 363-398`、`modules/layers.ts:131-134`、`utils/Layer.ts:486-499`、`useRepository.ts:738, 749-783, 925-1005`、`useProject.ts:147`、`ProjectEdit.tsx:100-116`、`i18n/ja/translation.json:226` | Template のアップロードで `TRACK_LAYER_ID` を除外する（アップロード側だけで除き、`deleteCommonAndTemplateData` の削除対象には軌跡を残す。こうすると既に配られた軌跡テンプレートが次の保存で消える）。あわせて、設定モードでは記録開始を無効にするか、文言どおり破棄するかを決める |

---

## low

| # | 内容 | 分類 | 箇所 | 修正案 |
|---|---|---|---|---|
| T-L1 | 軌跡ボタンで止めたとき、有効な点が2点未満で保存されなくても何も表示されない。`saveTrackLog` は `{isOK:true, message, layer:undefined}` を返すが、`pressTracking` は `!isOK` のときしかアラートを出さない。正常に保存できたときの「無効な点を除外した」警告も表示されない。離脱経路（`finishTrackingBeforeLeave`）は message を表示するので、経路によって違う。全点は2点以上あるが有効な点が2点未満のときはチャンクが残り、次の開始時にまた保存確認が出て、同じく無言で終わる | 安全 | `Home.tsx:2014-2033`、`useLocation.ts:1116-1118, 1155`、`trackingLeaveGuard.ts:120-124` | `if (!result.isOK \|\| result.message) await AlertAsync(result.message)` にする。保存できたときは、サマリーを開く前にアラートを出す |
| T-L2 | 軌跡ボタンで止めるときは「保存してから停止」の順なので、保存の途中に届いた点が消える。`saveTrackLog` は全点を読んだあと setTimeout(0) を挟んで `addTrackRecord` と `clearAllChunks` を行い、その間も記録は 'on' のまま。すき間に届いた onLocation の点はキャッシュに入り、最後の `clearAllChunks` で消える。欠けるのは全点を読んでから clear するまでの間に届いた点で、移動しながら止めたときに終わりの数点が欠ける。確認ダイアログを出している間の点は保存される。離脱経路の `stopAndSaveTrack` は先に止める順で、その JSDoc は「ボタンで止めるときと同じ」と書いているが、実際のボタン側は逆 | 安全 | `Home.tsx:2014-2022`、`useLocation.ts:1085-1140`、`Location.ts:442-487`、`trackingLeaveGuard.ts:169-190` | `pressTracking` を `toggleTracking('off')` → `toggleGPS('off')` → `saveTrackLog` の順にする。できれば `stopAndSaveTrack` を共通にする（サマリー表示に layer と record が要るので戻り値を広げる）。保存に失敗してもチャンクは残り、次の開始時に回収できる（今と同じ） |
| T-L3 | Android で、メモリだけにある未書き込みの点がヘッドレスタスクの `resetTrackLogCache()` で捨てられる。書き込みの判定は点が届いたときだけ（10点か3秒）で、後追いのタイマーはない。立ち止まると直前の1〜2点がメモリにだけ残る。既にバックグラウンドの状態から最近使ったアプリ画面でスワイプ終了すると、Activity は破棄されるがプロセスは FGS で生き残る。ヘッドレスは既存の ReactContext（同じ JS ランタイム）で動くので、キャッシュを共有したまま reset し、その点が二度と戻らない。`Location.ts:27-31` の「headless は別の JS コンテキスト」というコメントは、この場合に誤り。iOS やプロセスごと落ちた場合の最大3秒分の欠けは、間引きの割り切りの範囲 | 安全 | `Location.ts:27-34, 339-343`、`backgroundGeolocationHeadlessTask.ts:61`、`useLocation.ts:1321-1330, 1391-1396`、bggeo `HeadlessTaskManager.java:199-204` | ヘッドレスの先頭で `resetTrackLogCache()` の前に `flushTrackLog()` を呼ぶ（別ランタイムなら cache は null で何もしない）。アンマウント時の flush は補助として入れてもよい。'inactive' での flush は既にある（1391 行の正規表現）ので不要。タイマーでの後追い書き込みは、Android ではバックグラウンドで発火しない場合があるので主な対策にはならない。コメントも直す |
| T-L4 | チャンクの切り替え直後にキャッシュを読み直すと、つなぎ目の点が重複して保存される。切り替え時に新しいチャンクを [J]（前チャンクの末尾）で保存するが、`persistCache` は長さ1のとき slice(1) しない。次に MMKV から読み直すと `getCurrentChunk` が前チャンク末尾をさらに足して [J, J] になり、重複が固定される。ヘッドレス（Android）は点ごとに読み直すので、切り替えのたびに必ず起きる。メインでも、切り替え直後に次の点が来る前に kill→再起動したとき、または [J] の状態で `getAllTrackPoints` が連結したとき（末尾に J が1つ余分）に起きる。外部GNSSの区間は cleanupLine を素通りするので GPX にも重複した trkpt が出る。`totalPoints` は実際の点数より少なくなる【Jest で再現: ヘッドレス方式で1200点→連結1202点】 | 安全 | `Location.ts:92-95, 252-266, 300-342, 442-451`、`backgroundGeolocationHeadlessTask.ts:58-62` | `persistCache` を `currentChunkIndex > 0 ? currentChunk.slice(1) : currentChunk` にする（長さ1なら [] を保存）。`getCurrentChunk` は空のチャンクにもつなぎ目を補うので、読み戻しは [J] になって整合する |
| T-L5 | 記録中の 2D/3D 表示で、保存済みチャンクの境目（500点ごと）の1区間が描かれない。2番目以降のチャンクはつなぎ目を除いて保存され、表示用の `getTrackChunkForDisplay` は前チャンクの末尾を補わない。2D も 3D もチャンクごとに別の線で描くので、p500→p501 の線分がどこにもない。最新の境目だけは記録中のチャンクがつなぎ目を含むのでつながる。保存したレコードは連続しているので、表示と記録が食い違う | 安全 | `Location.ts:94, 300-319, 415-418`、`SavedTrackLog.tsx:104, 184-200`、`HomeTerrain3DTrack.tsx:91` | `getTrackChunkForDisplay(index)` で index>0 なら `getTrackChunk(index-1)` の末尾を先頭に足してから `simplifyLocations` にかける（先頭の点は必ず残る）。この1か所で 2D と 3D の両方が直る |
| T-L6 | getCurrentPosition や changePace の途中経過の位置（`sample:true`）がそのまま軌跡に入る。プラグインは「samples は保存すべきでない」と明記しているが、`handleBackgroundLocation` もヘッドレスも `sample` を見ていない。精度 100m 以下なら `checkLocations` を通り、30〜100m の破線区間として入る。起きるのは記録開始時（changePace は毎回、getCurrentPosition は新しいキャッシュがないとき）、前面復帰や kill 復帰の `moveCurrentPosition`、ヘッドレスの boot/terminate 後の changePace。開始や復帰の地点に数点の「ひげ」ができ、距離が少し増える | 判断 | `useLocation.ts:570-587, 150-168, 710, 839-845, 948-952, 1257, 1311`、`backgroundGeolocationHeadlessTask.ts:49-63`、bggeo `Location.d.ts:228-231` | `applyLocation` の軌跡保存の分岐でだけ `sample === true` を除外し、現在地の表示には使い続ける。ヘッドレスでも `checkAndStoreLocations` の前に除外する。記録される点が変わるので、入れるか選ぶ |
| T-L7 | 記録中に外部受信機（主に BLE）の接続が切れると、アプリを前面に戻すまで再接続しない。再試行のきっかけは起動・前面復帰・USB 装着だけで、リンクの切断を見て再試行する仕組みはない（前面で使っている最中に切れても同じ）。切断後は内蔵GPSで記録が続くので、点は欠けないが品質が RTK から内蔵GPSに落ちる。保存後は「測位品質」カラータイプで区間を見分けられる | 判断 | `useExternalGnssAutoConnect.ts:53-68`、Android `GnssSession.kt:83-94`、`BleLink.kt:47-56`、iOS `BleLink.swift:211-218`、`useLocation.ts:572-573` | autoConnect が ON でリンクエラーで切れたときだけ、GPS ON 中か記録中に限って、間隔を伸ばしながら `tryConnect` を呼ぶ（AppState を条件にしない）。iOS は時間切れのない `CBCentralManager.connect` を張ったまま待つ方式もある。間隔と電池への影響は方針として決める。NTRIP の扱いは T-L10 |
| T-L8 | 受信機が座標入りで測位品質0の GGA を1エポックでも出すと、5秒の猶予を待たずに内蔵GPSへ切り替わる。`buildFix` は座標があれば品質0でも fix を返し、ストアがそれで上書きし、`isExternalFixActive` は最新の fix の品質を見る。その瞬間に届いた内蔵GPSの点が軌跡に入り（標高は null）、次の有効エポックで受信機に戻る。座標を空で出す受信機（u-blox の既定など）では起きないので、受信機によって挙動が違う。影響は短い途切れのたびに内蔵GPSの点が1〜数点混ざる程度。交互にジグザグになるのはまれな最悪ケース | 安全 | `lib/gnss/externalGnssStore.ts:44-60, 84-88`、`lib/gnss/nmea.ts:138-142`、`useLocation.ts:570-587` | ストアに最後に使えた fix とその受信時刻（`lastUsableFix`）を別に持つ。`isExternalFixActive` は `link==='connected' && now - lastUsableFixAt <= EXTERNAL_FIX_STALE_MS`、`getActiveExternalFix` は `lastUsableFix` を返す。切断時にクリアする。表示用の `snapshot.fix` は品質0のまま残してよい。品質0を挟んでも5秒以内は true のままであることのテストを足す |
| T-L9 | Android で、受信機の測位標高と内蔵GPSの楕円体高が1本の軌跡に混ざり、切り替わる地点で標高が約30〜40m 段差になる。内蔵の標高を消すのは「今リンクが 'connected'」のときだけなので、(a) 内蔵で記録を始めて途中で受信機をつないだ場合の接続前、(b) 切断後、(c) 受信機で記録中に kill したあとのヘッドレス（標高を消していない。受信機のセッションはプロセスと一緒に消える）の点は楕円体高のまま残る。獲得標高・最高・最低、標高グラフ、GPX の ele が歪む。位置は欠けない。iOS は内蔵の値も標高なので軽い | 判断 | `useLocation.ts:576-584`、`backgroundGeolocationHeadlessTask.ts:51-62`、`trackStatistics.ts:87-104, 139-167`、`lib/gnss/toLocation.ts:46`、bggeo `Location.d.ts:27-33` | 保存時（`getAllTrackPoints` か `saveTrackLog`）に、Android で fixQuality を持つ点が1点でもある軌跡なら、fixQuality のない点の altitude を null にする（元の値は楕円体高の欄へ移してもよい）。記録中のライブサマリーにも同じ規則をかける。記録時に「このセッションで受信機の点を記録した」フラグで判定する方法では、接続前に記録済みの点は直せない。内蔵の標高を捨てる方針の判断が要る |
| T-L10 | 受信機のリンクが切れても NTRIP は動き続け、補正を受け取っては捨てる。`onLinkError` も `detachLink` も NTRIP を止めない。補正の受信処理は先に `rtcmBytes` と `lastCorrectionAt` を加算してから `target?.write` を呼ぶので、中継していない分まで受信量の表示が増える（説明は「受信機へ中継した補正の累計」）。VRS では GGA を送れなくなり、30秒で "no data" → 再接続を繰り返す。再接続のきっかけが来るまで（autoConnect OFF なら手で止めるまで）続く。無駄になるのは通信量（数KB/s 程度）と少しの電池 | 判断 | Android `GnssSession.kt:83-110, 127-142`、`NtripClient.kt` の runLoop、iOS `GnssSession.swift:132-160, 193-205`、`modules/gnss-receiver/src/index.ts:11-12`、`HomeGPSButton.tsx:132` | `onLinkError` と `detachLink` で `stopNtrip()` を呼ぶ（Android は lock の外、iOS は locked ブロックの外で呼んでデッドロックを避ける）。再接続時は `tryConnect` や手動接続の `startNtripIfEnabled` で張り直されるので整合する。受信機の差し替え経路でも startNtripIfEnabled が続くことを確かめる。または target が null のときは加算せず、一定時間リンクが戻らなければ止める |
| T-L11 | 受信機の切断後（または5秒以上の途絶後）、内蔵GPSの更新が来るまでの間に「現在地にポイント追加」や位置の修正をすると、古い外部受信機の位置が FIX 品質・楕円体高・古い時刻付きで保存される。ストアの fix は消えるが、`useLocation` の `currentLocation` は最後の外部位置のままで stale にもならない。内蔵GPSは distanceFilter（高 2m／中 10m／低 50m）分動くまで更新が来ない（静止中は無期限）。Home は `currentLocation` をそのまま preferred として使い、`getActiveExternalFix` の判定を通らない。座標のずれは最大で distanceFilter 程度。主な害は品質・精度・時刻が偽りになること | 安全 | `Home.tsx:1575-1585`、`useLocation.ts:479, 537-545, 331-337, 595-601`、`usePointTool.ts:37-39, 95-100`、`externalGnssStore.ts:57-60` | Home で `preferred?.gnss` があるのに `isExternalFixActive()` が false なら preferred を使わず `getCurrentPoint` で測り直す（最小）。根本的には、useLocation で外部が非アクティブになったことを検知して `currentLocation` から gnss を外し stale 扱いにし、内蔵GPSのワンショット取得を促す |
| T-L12 | Android で NTRIP を張り直すと、止めた旧クライアントの遅れた通知が新しい接続の状態を 'off'（や 'connected'）で上書きする。`stop()` は接続中・ヘッダ読み取り中（最大10秒＋30秒）の Socket を閉じられない（フィールドに入るのが openStream の後）。抜けた旧スレッドが最後に `onNtripState("off")` を呼び、リスナーのガード `ntrip == null && state != "off"` はこれを通す。新しい接続は補正を流しているのに状態が 'off' のまま固まる。NTRIP 表示が消え、`saveNtripSettings` の `ntrip !== 'off'` 判定もずれる。iOS は `ntripGeneration` で弾いている | 安全 | Android `GnssSession.kt:111-161`、`NtripClient.kt:200-238`、iOS `GnssSession.swift:168-176`、`useExternalGnss.ts:134`、`HomeGPSButton.tsx:130` | iOS と同じく、startNtrip と stopNtrip で世代番号を増やしてリスナーに捕捉させ、`onNtripState` と `onCorrection` で世代が違えば無視する。あわせて runLoop の openStream 直後に `if (!running) { s.close(); break }`、接続中の Socket を先にフィールドへ入れて stop() で閉じられるようにする |
| T-L13 | Android の NTRIP v2（chunked）で、読み取りの時間切れ（stream 中は soTimeout=1000ms）が起きると、読みかけのチャンクサイズ行を失う。`readChunkSize` はローカルの StringBuilder に溜めるので、サイズ行の途中で TCP の到着が1秒以上遅れると読んだ桁が捨てられる（例 "1a4" の "1" を失って 0xa4 と読む）。境界がずれ、壊れたバイトが受信機へ流れるか（RTCM の CRC で捨てられる）、NumberFormatException やサイズ0で再接続になる。補正が数秒〜バックオフ分途切れ、FIX が FLOAT に落ちることがある。起きるのはモバイル回線の再送などに限られ、まれ。iOS は `sizeLine` をインスタンスに持っていて問題ない | 安全 | Android `NtripClient.kt:96-125, 247, 258-262`、iOS `NtripClient.swift:201-217` | サイズ行の StringBuilder を `ChunkedInputStream` のフィールドにし、改行まで読み終えたときだけ取り出してクリアする。空行は再帰せずループで続ける（iOS と同じ形） |
| T-L14 | 記録中、500点ごとのチャンク切り替えで、`SavedTrackLog` が保存済みの軌跡を全部消して作り直し、共有の Loading を出し入れする。新しいチャンクが未読込になるので `isInitialLoading=true` になり、null を返して全 Polyline をアンマウントし、`setLoading(true)` → `setLoading(false)` を呼ぶ。この setLoading は Home の `setIsLoading` そのもの（参照カウントなし）なので、PDF 出力・データの送受信・可視領域の Loading（PDF では進捗と中止ボタンも）を処理の途中で消してしまう。Loading モーダル自体は 300ms 遅れて表示されるので、通常は一瞬も出ない。起きるのはアプリが前面にあるときだけ | 安全 | `SavedTrackLog.tsx:18-21, 75-91, 100, 135-154`、`Home.tsx:4117, 2545-2548, 2268, 2287, 951`、`useLocation.ts:510-525`、`StyledDialog.tsx:56-69` | null 返しと setLoading は、`loadedChunks` が空の初回だけにする。増えたチャンクは、既存の線を描いたまま裏で読み込んで足す。共有の setLoading を使い続けるなら参照カウント方式にする |
| T-L15 | 記録中に軌跡サマリーを開いたままにすると、点数が変わるたびに最短5秒間隔で全チャンクを読み直し、全体に cleanupLine（平滑化と簡略化）、統計、標高プロファイルを計算し直す。地物に当たらなかった地図タップでも同じ全点読み込みが走る。長い記録（数万点）ほど JS スレッドが占有される（Node での実測は3.6万点で約80ms、Hermes は未測定）。間隔は負荷を承知で決めた設計で、バックグラウンドでは走らない。3票中1票は「意図した設計で不具合ではない」とした | 安全（間隔を伸ばす案のみ） | `TrackSummary.tsx:37-39, 64-82, 96-97`、`Location.ts:442-459`、`Coords.ts:1362-1402`、`Home.tsx:2709-2721, 2830-2836` | 挙動を変えない案は、点数に応じて読み直しの間隔を伸ばす（例: 1万点超で15〜30秒）ことだけ。差分だけ処理する案は、cleanupLine が線全体に依存するので保存結果と一致しなくなる。タップの判定を生の点で行う案は、記録中の表示（生の点を間引いたもの）とむしろ一致するが、ポップアップの時刻・標高が平滑化前になる。cleanupLine の結果を totalPoints が変わったときだけ作り直してキャッシュする案もある |
| T-L16 | 記録中や GPS ON 中に端末の設定でアプリの通知をオフにすると、アプリに戻るたびに「GPSを許可してください」のアラートが出て設定画面へ飛ばされる。バックグラウンドへ移ると heading 購読を必ず外すので、前面復帰のたびに `confirmLocationPermission` が呼ばれ、Android では先に通知の許可を確かめる。設定画面から戻るのも前面復帰なので、通知を許可し直すまで繰り返す。heading も再購読されないので、方位盤とヘディングアップも動かない。記録そのものは続く。対象は Android 13以上に限らず、12以下でも通知をオフにすれば起きる。3票中1票は抜けられない繰り返しになるので medium とした | 安全 | `useLocation.ts:427-444, 1369-1383, 1398-1402`、expo-notifications `NotificationPermissionsModule.kt:56-104` | 前面復帰時の heading 再購読では、プロンプトを出さない方法で位置の許可だけを確かめる（既存の `ensureHeadingSubscriptionIfPermitted` 相当）。通知の確認と案内は `pressGPS`/`pressTracking` の開始時だけにする。通知が拒否されたときの文言を位置用と分ける |

---

## 反証されたもの

- **GPS だけ ON（記録なし）でアプリを kill・端末を再起動・バックグラウンドにすると、高精度GPSが動き続ける**（4件を統合）: 意図した仕様。ヘッドレスの条件 `getGpsState() !== 'off'` は 66b6bb68 で GPS のみの場合も明示して入れたもので、回帰テスト（`backgroundGeolocationHeadlessTask.test.ts:79-85`）で固定されている。Android の初期化も GPS のみの状態を kill 後に戻す作り。バックグラウンドでの継続は接近通知のため。変えるかどうかは方針の選択で、不具合ではない。
- **iOS の接続処理が並行キューで動くので、自動接続と手動接続が重なると片方のタイムアウトがもう片方を切る**: ネイティブ側だけ見れば起こりうるが、手順が成り立たない。`attachLink` は接続待ちの前に 'connecting' を通知し、接続ボタンは connecting の間は無効、切断ボタンは connected のときしか出ない。自動接続側も未接続でなければ何もしない。重なりうるのは数ミリ秒の隙だけ。
- **記録中は破線や半透明で描いていた低精度区間が、保存すると実線になる**: 保存後の軌跡は通常のラインレイヤとしてレイヤのスタイルで描く設計。破線表示を入れた 17bfd235 は記録中の描画だけを対象にしており、保存後の品質表示はカラータイプ「測位品質」として別に実装している。accuracy は保存したデータに残る。表示方針の範囲。

---

## 直す順番の提案

1. **T-H1 の当面の策**（`gotoProjects`・`gotoAccount`・`gotoLogin` で記録中なら止めて保存するか選ばせる）。点の欠けと別プロジェクトへの保存を、いちばん小さな変更で止められる。根本策（記録の持ち主を Home の外へ出す）は方針を決めてから。
2. **安全に直せる medium**: T-M2（二重開始で点が消える）、T-M1（権限拒否で何も出ない）、T-M3（精度設定が反映されない）。
3. **点の欠落・重複を防ぐ安全な low**: T-L2（停止の順序）、T-L4（つなぎ目の重複）、T-L3（ヘッドレスの reset 前に flush）、T-L1（2点未満の無言終了）、T-L5（表示の切れ目）。
4. **判断が要る medium**: T-M9（設定中の軌跡がテンプレートで配られる。軌跡レイヤの除外だけは先に安全に入れられる）、T-M8（設定画面の復元・新規・開くにガードを通す）、T-M5（おおよその位置）、T-M7（エクスポート zip の往復）、T-M6（GPS OFF 中の外部受信機）、T-M4（iOS の終了後の扱い）。
5. **外部GNSSの安全な low**: T-L8、T-L11、T-L12、T-L13。
6. **残りの low**: T-L14、T-L16、T-L15（安全）、T-L6、T-L7、T-L9、T-L10（判断）。

---

## T-H1 の修正状況（2026-11-22、ブランチ fix/track-screen-leave）

当面の策（安全）で直した。根本策（Home の常駐、`useLocation` と leave の handler の Provider 化）は未着手。コミットはしていない。実機では確かめていない。

### 変更内容

- **ホームを離れる前のガード**（`src/containers/Home.tsx` の `gotoProjects`・`gotoAccount`・`gotoLogin`）
  - `leaveHomeWithTrackingGuard(navigate)` を通してから移る。記録中は「この画面を離れると記録が続けられないため、止めて保存してから移りますか」と確認する（`Home.confirm.stopTrackingBeforeLeaveHome`）。了承したら止めて保存し、通常利用中のプロジェクトではアップロードし終えてから移る。キャンセル、保存の失敗、アップロードの失敗のときは移らず、記録を続ける。
  - 記録していないとき（GPS だけ ON を含む）は、確認なしに移る。
  - 移る処理は引数で渡す。ガードが true のときだけ、止め終わったあとに1回だけ呼ぶ。こうすると、ガードを抜かしたり await を付け忘れたりする配線の誤りが起きにくい。この順序は単体テストで確かめている。
- **記録ガードの二重実行の防止**（`src/utils/trackingLeaveGuard.ts` の `leaveWithTrackingGuard`）
  - 止めて保存する途中で、`toggleTracking('off')` が記録の状態を先に 'off' にする。そのため、保存やアップロードが終わる前に2回目の呼び出しが来ると「記録していない」とみなされ、素通りしていた。例えば、ログインボタンを押し直したり、アカウントメニューから押し直したりした場合である。
  - モジュールの実行中フラグを置いた。実行中の呼び出しは何もせず false を返す。ホームの3経路、ログアウト、プロジェクトの終了、設定の保存・破棄、ProjectEdit の「開く」のすべてに効く。
  - 取りやめられないログアウト（`stopTrackingBeforeForcedLogout`）にはフラグを効かせていない。呼び出し元の Account はログアウトを止められず、戻り値も見ないからである。この経路は Account 画面にしかなく、ホームのガードと同時には走らない。
- **ホームがいない画面での防御**（MMKV の trackingState が 'on' のまま handler が null のとき）
  - ホームを離れる前に必ず止めるので、通常は起きない。取りこぼした経路があっても素通りしないための防御である。ProjectEdit の「開く」は案内を出して進めない。Account の強制ログアウトは通知を出してからログアウトする。
  - 案内の文言は OS で分けた。iOS はホームに戻ると記録が止まり、未保存の軌跡を保存するか尋ねる（`useLocation` の初期化）ので、「ホームで止めてから」とは案内せず、その確認に従うよう案内する（`Home.alert.stopTrackingFromHomeIos`・`trackingContinuesAfterForcedLogoutIos`）。Android は、ホームに戻ると記録が再開するので、そこで止めるよう案内する。
- **テスト**: `src/utils/__tests__/trackingLeaveGuard.test.ts` に次のケースを足した。ホームを離れるときの確認・停止・アップロード・移動の順序。キャンセルや失敗のときは移らないこと。二重実行の防止。ホームがいない画面での防御（iOS・Android・Web）。

### 残る制限

- **根本策は未着手**: 記録の持ち主は今も Home である。ホームの外で記録を続けることはできず、ホームを離れるには記録を止める必要がある。プロジェクト一覧やアカウント画面を見るたびに記録が切れる。運用上の不便が大きければ、根本策の方針を決める。
- **ホーム以外からの遷移**: ホームの上のボトムシート（設定、レイヤ、データ一覧など）は Home をアンマウントしないので対象外である。ホームのアカウントボタン以外に Root 画面へ移る経路が今後増えたら、同じガードを通す必要がある。今のところ、Root 画面へ移る経路はこの3つと、ガード済みのプロジェクト設定の保存・破棄（ProjectEdit へ移る）である。
- **iOS で GPS のみ ON のとき**: 記録していないときは確認なしに移るので、iOS で GPS だけ ON にしてプロジェクト一覧などへ移って戻ると、再初期化で GPS が止まる（T-H1 の手順5）。記録は失われないが、利用者が切っていない GPS が OFF になる。iOS の再初期化を直すか、根本策で対処する。
- **Android の通知**: 記録を止めてから移るので、移った先で通知が「記録中」のまま残ることはない。ただし、記録せずに GPS だけ ON で移った場合は、GPS の購読が外れたまま通知が出続ける（電池への影響は T-H1 の影響の項と同じ）。
- **実行中フラグの前提**: 確認ダイアログ（ConfirmAsync）が必ず解決することを前提にしている。解決しないまま残ると、以後の記録ガードがすべて false を返す。今の AlertAsync・ConfirmAsync は必ず解決する。
- **実機での確認**: iOS・Android とも未確認。確認する点は次のとおり。記録中にプロジェクト一覧、アカウント設定、ログインへ移るときに確認が出ること。止めて保存（とアップロード）したあとに移ること。キャンセルしたら記録が続くこと。押し直しても二重に進まないこと。

---

## 安全な項目の修正状況（2026-11-22、ブランチ fix/track-safe）

コミットはしていない。実機では確かめていない。この節は軌跡ボタン（Home の `pressTracking`）まわりの T-M2・T-L1・T-L2 と、その組み込みへのレビュー指摘への対応を記す。

### T-M2・T-L1・T-L2（軌跡ボタンの処理）

- **本体を切り出した**（`src/utils/trackingPress.ts` の `runTrackingPress`）。Home の `pressTracking` は Web の案内のあと、状態・文言・依存（`checkUnsavedTrackLog`、`ConfirmAsync`、`AlertAsync`、`waitForModalTransition`、`confirmLocationPermission`、`toggleGPS`、`toggleTracking`、`saveTrackLog`、開始後の作図タブ処理、サマリーを開く処理）を渡して呼ぶだけにした。
- **T-M2（二重開始）**: 処理中フラグを開始用と停止用に分けた（`trackingPressFlagsRef`）。
  - 開始側（trackingState が 'off'）は、開始中か停止・保存中なら始めず、「軌跡の記録を開始または停止している途中です」と知らせる（`Home.alert.trackBusy`、ja/en）。停止中も対象にしたのは、`toggleTracking('off')` が先に状態を 'off' にするので、保存し終わる前の押し直しが開始側へ入るため。
  - 停止側（trackingState が 'on'）は、**開始の処理中でも**従来どおり確認を出して止めて保存できる。開始は `toggleTracking('on')` が先にボタンを記録中の表示にしたあと、`startTracking`（サービス遷移）と位置の取得を数十秒待つことがあり、最初の修正（全体を1つのフラグで包む）ではこの間の停止が黙って捨てられていた（レビュー指摘）。停止の二重実行だけ停止用フラグで防ぐ。
  - 補助の `startTracking` の clear 省略（MMKV の trackingState が 'on' なら消さない）は前回の変更のまま。
- **T-L2（停止の順序）**: 停止は離脱時と同じ `stopAndSaveTrack`（`toggleTracking('off')` → `toggleGPS('off')` → `saveTrackLog`）を使う。
- **T-L1（知らせ）**: `getTrackSaveNotice` で、失敗に加え「点が足りず保存しなかった」「無効な点を除いた」などの文言も、サマリーを開く前に `waitForModalTransition` を挟んで AlertAsync で出す。保存しなかったときはサマリーを開かない。
- **テスト**（`src/utils/__tests__/trackingPress.test.ts`）: 開始の順序、開始中の押し直しは始めず知らせること、開始中でも停止は確認して止めて保存できること、停止は止めてから保存すること、キャンセル、知らせがあればサマリーより先にアラートを出すこと、保存しなかったときはサマリーを開かないこと、停止・保存中の押し直しは開始も停止も重ねないこと。

### 残る制限・実機で確かめること

- 開始の途中で停止したとき、開始側の残り（`startTracking` の続き、`moveCurrentPosition`、作図タブを閉じる処理）は停止の後にも走る。サービス遷移は `syncBackgroundService` のキュー（最新の意図に合わせる）が整えるので記録は 'off' に収束し、残りは表示だけの処理だが、実機で次を確かめる。屋内など衛星をつかめない場所で開始を OK し、記録中の表示になってすぐ停止→保存したとき、通知・GPS・ボタンが止まった状態に揃うこと。保存の確認（点が足りない知らせ）が出ること。
- 開始中・停止中の押し直しで「処理中です」の案内が出ること（iOS でダイアログが重ならないこと）。
- 処理中フラグは ConfirmAsync・AlertAsync・保存処理が必ず解決する前提。解決しないまま残ると以後のボタンが案内だけになる（今の実装は必ず解決する）。

### そのほかの安全な項目

| # | 変更 | 残る制限・実機で確かめること |
|---|---|---|
| T-M1 | `confirmLocationPermission` で `requestPermission` の reject（AuthorizationStatus の数値）を拒否として扱い、案内と設定画面を出す | 5.8.x が実機で数値で reject すること |
| T-M3 | `syncBackgroundService` の setConfig に `desiredAccuracy`・`distanceFilter` を加え、精度を変えたら GPS ON／記録中に sync を1回呼ぶ。GPS 設定の注記を「すぐに反映」に直した | 稼働中のサービスに setConfig した値がすぐ効くこと |
| T-L16 | 前面復帰と起動時の復元は `resubscribeHeadingForService`（位置の許可だけを確認、案内は許可が戻るまで一度だけ、設定画面は開かない）に置き換え。通知の拒否は文言を分けた | 通知オフで戻っても方位盤が回り、アラートが繰り返さないこと |
| T-L3 | `flushPendingTrackLog()`（未書き込みの点があるときだけ書く）をヘッドレスの reset 前と useLocation のアンマウント時に呼ぶ | ヘッドレスが同じランタイムで動くかは推定 |
| T-L4 | `persistCache` で2番目以降のチャンクはつなぎ目を除いて保存 | 修正前に重複して保存された点は1つ残る |
| T-L5 | `getTrackChunkForDisplay` で前チャンクの末尾を先頭に足す（2D・3D） | 境目がつながって描かれること |
| T-L14 | `SavedTrackLog` は初回だけ隠して Loading を出し、増えたチャンクは描いたまま足す | — |
| T-L15 | サマリーの再計算間隔を点数で伸ばす（1万点超15秒、3万点超30秒） | 長い記録での負荷と体感 |
| T-L8 | 外部GNSSストアに最後に使えたエポック `lastUsableFix` を持ち、品質0を挟んでも5秒の猶予内は外部を使う | 品質0の GGA を出す受信機での確認 |
| T-L11 | 現在地ポイント追加・位置修正で、使えなくなった外部受信機の位置を捨てて測り直す（`dropInactiveExternalLocation`） | Home 以外で `currentLocation` を使う経路は未対応 |
| T-L12 | Android `GnssSession` に NTRIP の世代を持たせ、古いクライアントの状態・補正を無視。接続中・ヘッダ読み取り中も stop で Socket を閉じる。iOS も補正に世代判定を追加 | ネイティブはビルド・実機未確認 |
| T-L13 | Android `ChunkedInputStream` のサイズ行をフィールドに溜め、時間切れでも続きから読む | 回線遅延での再現は未確認 |
| T-M9（除外） | 「設定を保存」のテンプレートのアップロードから軌跡レイヤを除く（削除対象には残すので、配られた軌跡のテンプレートは次の保存で消える） | 設定モード中に記録を止めるかどうか（判断）は未対応 |
