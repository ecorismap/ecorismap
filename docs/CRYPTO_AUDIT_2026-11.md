# 暗号・鍵配布経路 監査結果（統合版）

対象は ecorismap（main）と ../functions です。どちらも読み取りのみで、ファイルの変更・ビルド・テスト・本番アクセスは行っていません。
survived 22件と contested 2件を、根本原因ごとに 13 の束へまとめました。深刻度には、反証役2人による見直しを反映しています。

## 深刻度の内訳
- **medium（3）**: 束1, 束2, 束3
- **low（9）**: 束4〜12
- **nit（1）**: 束13（contested。採用はするが衛生上の問題）

---

## 束1【medium】移行済みかどうかをキャッシュだけで判定し、keys の配布を project 確定より先に行う。二重移行で keys と dekPublicKey が対にならなくなり、恒久的に復号できなくなる
- **攻撃者**: (f) 事故。2台目の端末や別の管理者が、古い一覧のまま操作した場合。
  - (a) 悪意の管理者による意図的な実行は束から外した。管理者は rules:231-245 で全員の keys/{uid} を直接上書きでき、この経路で新しい能力を得ないため。
- **手順**
  1. 端末Yが一覧を取得する。getAllProjects が非dekの行を {scheme:'group'} としてキャッシュする（firestore.ts:327-329）。
  2. 別の端末Xで P を移行する（DEK1）。Y のキャッシュと Redux は group のまま残る。キャッシュを消すのは、プロジェクトを開く・ログアウト・移行失敗時だけ。
  3. Y でメンバー編集（useE3kitGroup.ts:153-165）または一括移行（useProjects.ts:205-232）を行う。冪等判定 getProjectCrypto（firestore.ts:1192-1193）が古い 'group' を返すので、判定をすり抜ける。
  4. 移行の続きで、decGroup で DEK1 の設定・COMMON を読もうとして失敗する。設定は isOK:false でスキップ、COMMON は null が除外されるだけで、処理は止まらない。
  5. DEK2 を生成し、distributeProjectDEK（:1211）が全員（オーナーを含む）の keys を DEK2 で上書きする。
  6. 結果は Y がオーナーか管理者かで分かれる。
     - **Y がオーナー**: rules:80-83 のオーナー分岐には keepsDekPublicKey が無い。dekPublicKey=DEK2 の書き込みが通り、DEK1 の暗号文は誰も開けなくなる。
     - **Y が管理者**: updateDoc は keepsDekPublicKey（rules:49-52,86）で拒否される。ただし keys の上書きは確定済みなので、keys は DEK2、doc は DEK1 という状態になる。isDEKKeyPair（:83-86）の照合が全員で不一致になる。
- **被害（可用性・恒久的）**: 次のものが全員にとって復号できなくなる。
  - プロジェクトメタ（一覧から消える）
  - 設定・COMMON・TEMPLATE（旧グループ暗号文は移行時に削除済み）
  - 移行後に書かれた PRIVATE/PUBLIC

  DEK1 は移行した端末のメモリにしか残らない。findStaleMemberKeys は時刻しか比べないので検知できない。救える手段は Firestore の1時間バージョン保持の窓だけ。
- **根拠**: src/lib/firebase/firestore.ts:94-102, 327-329, 1192-1193, 1197-1203, 1211→1216-1222, 83-86, 742-761 ／ src/hooks/useE3kitGroup.ts:153-165 ／ src/hooks/useProjects.ts:205-232 ／ firestore.rules:49-52, 78-95, 232-242
- **前提**: 未移行の group プロジェクト（約20件残）が対象。移行前に取得した一覧のまま、プロジェクトを開かずに操作した場合。2端末で同時に移行した場合も同じ順序問題が起きる。
- **修正方針（最小）**
  - **クライアント**
    - migrateProjectToDEK の冒頭で getDocFromServer を使い、cryptoScheme==='dek' なら即 return する。
    - 順序を入れ替える。runTransaction で「resource が非dek」を条件に cryptoScheme/dekPublicKey を確定させ、その後で keys を配布する（負けた側は keys を書かない）。
    - getAllProjects が dek の doc を見たら、group キャッシュを削除する。
  - **Rules**: resource が既に dek なら、オーナーにも keepsDekPublicKey を適用する（ローテーションは別経路にする）。
- **副作用・運用**
  - Rules の変更は yarn testrules と本番デプロイが必要。今後オーナーがローテーションを実装する場合は Admin/Functions 経由にする。
  - データ移行は不要。ただし既に被害を受けたプロジェクトが無いかを確認するとよい。対象は「keys と dekPublicKey が対にならないもの」。Admin スクリプトで公開鍵の一致を検査できる。

## 束2【medium】移行後も group キャッシュを持つ端末がグループ暗号で書き込む（暗号方式のダウングレード）
- **根本原因**: 束1と同じキャッシュの寿命の問題。これに加えて、enc が書き込み直前に doc を確かめない。
- **攻撃者**: (f) 事故。移行前からプロジェクトを開いたまま作業を続けている端末で起きる。副次的に (b)+(d) の経路もある。
- **手順**
  1. M が P を開き、group をキャッシュする。
  2. 別の管理者がメンバーを増減し、P が移行される。新メンバー N には DEK だけが配られ、N は Virgil グループに入らない。
  3. M の書き込みは encGroup（firestore.ts:117-124）で暗号化される。対象は uploadDataHelper、updateProject（:421-427）、uploadProjectSettings（:585）、現在地のアップロード。Virgil グループは残っているので暗号化は成功する。
  4. Rules（rules:128）は cryptoScheme の印が無い書き込みを許す。
  5. N は DEK での復号に失敗し、decGroup でも失敗して、データが黙って除外される。M が管理者でメタや設定を保存すると、P が N の一覧から消えるか、N が開けなくなる。
- **被害**
  - 可用性: 新メンバーがメタ・設定・データを読めない。PRIVATE/PUBLIC は M の自己移行で直るが、COMMON・設定・メタは誰かが保存し直すまで残る。
  - 機密性（副次的）: 束4の「除名者が Virgil グループに残る」と組み合わさると、除名者が (d) で入手した暗号文を読める。
- **根拠**: firestore.ts:96-102, 117-124, 129-141, 327-329, 421-427, 585 ／ useE3kitGroup.ts:76-91 ／ firestore.rules:128
- **修正方針**
  - **クライアント**: enc で group キャッシュを使う前に doc の cryptoScheme を確かめる。dek なら DEK を取り直し、取れなければ書き込みを失敗にする。キャッシュの無効化は束1と共通。
  - **Rules**: 親プロジェクトが dek のとき、data/settings の create/update に cryptoScheme=='dek' を必須にする。
- **副作用・運用**
  - Rules を強化すると、古いアプリの書き込みが拒否されうる。リリース後に段階的に適用する。
  - 既に印の無い COMMON・設定が残っていないかを Admin で棚卸しし、管理者端末で再保存するとよい。

## 束3【medium】鍵リセットと移行が原子的でなく、PIN 復元で台帳との照合をしない。古い鍵が「移行済み」のまま固定される
- **統合元**: ledger-identity A/B/C、pin-backup の古いバックアップ、functions-auth の keyVersion、contested「リセット後に台帳を publish しない」
- **攻撃者**: (f) 通信エラー・中断・本人の2端末での並行操作。(e) 端末紛失後のリセットの場合は機密性にも及ぶ。
- **手順**
  - **A（リセットが黙って取り消される）**
    1. resetEncryptKey（useAccount.ts:445-457）は e3kit を回転するだけで、台帳と KMS は旧鍵のまま残る。
    2. 続く backupEncryptPassword が中断・失敗すると、logout するだけで終わる（Account.tsx:126-140, 283-290）。
    3. 再ログイン時に migrated-need-restore となる（migration.ts:84-103）。元の PIN で旧鍵が復元され、台帳・keyStorage・KMS が旧鍵、e3kit が新鍵という状態になる。
  - **B（KMS だけ旧鍵が残る）**
    1. migrateIdentityKey は台帳 publish（migration.ts:121）の後で createKeyBackup（:126）を呼ぶ。後者だけが失敗する。
    2. 元の端末は次回 'migrated' に戻る（:99-103）が、バックアップは作り直されない。
    3. 別の端末で復元すると、restoreIdentityKeyV2（:140-160）が旧鍵を返す。コメントは「台帳と照合」としているが、実装は extractPublicKeyB64 だけで照合しない。旧鍵を保存し、マーカーを立てる。
    4. 以後は :79-81 で照合されずに 'migrated' が続く。
    5. changeEncryptPassword（useAccount.ts:384-398）は旧鍵を古い keyVersion のまま再バックアップする。commitKeyBackup（key-backup-func.ts:325-341）は keyVersion の形式しか見ずに set() する。
  - **C（複数端末）**: 端末Aでリセットしても、端末Bはマーカーにより 'migrated' のまま。新しいラップを開けず、利用者にも通知されない。
  - **contested の残り（採用・狭い）**: 台帳に対応する前の旧版アプリでリセットすると、台帳は更新されない。再共有は旧公開鍵へ包まれ、鮮度判定は 'ok' になる。新版の主シナリオは、強制ログアウトと復元フォームへの誘導で塞がれている（反証役1の指摘のとおり）。
- **被害**
  - 可用性: 該当端末で、リセット後に再共有されたプロジェクトが開けない。自動回復も通知も無い。新鍵を持つ端末を失うと、その鍵でしか開けないデータ（オーナー単独のプロジェクトなど）を戻せない。
    - 補足: keyknox には新鍵が残る場合があり、理論上は救出できる。ただしアプリに導線が無い。
  - 機密性（A、限定的）: 漏れた旧鍵を失効させるためのリセットが無効になる。悪用には本人の認証で keys を読める必要がある。
- **根拠**: src/hooks/useAccount.ts:384-398, 445-457, 565-586 ／ src/containers/Account.tsx:126-140, 283-290 ／ src/lib/crypto/migration.ts:79-81, 84-104, 113-134, 140-160 ／ ../functions/src/key-backup-func.ts:310-344, 387
- **前提**: リセットか移行の途中で失敗・中断が起きること。A は元の PIN を覚えていること。C は複数端末で使っていること。
- **修正方針**
  - **クライアント**
    - restoreIdentityKeyV2 で isKeyConsistentWithLedger と keyVersion を照合し、合わなければ保存もマーカー立てもせず 'backup-stale' を返す。
    - getKeyMigrationState の 'migrated' 判定でも、毎回ローカル公開鍵と台帳を照合する（台帳の取得はキャッシュされるので安い）。あわせて status.keyVersion と台帳を比べ、ずれていれば再バックアップを促す。
    - migrateIdentityKey は「KMS バックアップ → 台帳 publish」の順にする。リセットは新鍵の生成・台帳・KMS を済ませてから e3kit を差し替える。中断したら backup を強制的に再開させる。
  - **Functions**: commitKeyBackup で publicKeys/{uid}.keyVersion と一致すること、既存より小さくないことを確かめる。
- **副作用・運用**
  - Functions のデプロイが必要。
  - 既存ユーザーで、台帳と KMS の keyVersion がずれている人を Admin で棚卸しする。該当者には鍵のある端末での再バックアップを案内する。
  - 照合を入れると、現在「黙って古い鍵」になっている端末が復元を求められる。一時的に問い合わせが増える可能性がある。

## 束4【low】移行の途中失敗が成功扱いになり、再試行もされない
- **攻撃者**: (f) 通信エラー・アプリ終了
- **手順**
  1. cryptoScheme='dek' を書き込む（firestore.ts:1215-1222）。
  2. その後の手順5の戻り値を見ていない。uploadProjectSettings は例外を握りつぶす（:586-591 → :1228 で無視）。uploadDataHelper の isOK:false も無視している（:927-934 → :1237, 1241）。settingsRes の失敗は黙ってスキップする（:1225）。
  3. 例外の場合でも、再実行すると :1192-1193 で即 return する。呼び出し元（useE3kitGroup.ts:164、useProjects.ts:232）は完了として扱う。
- **被害（可用性）**: 設定・COMMON・TEMPLATE がグループ暗号のまま残る。後から追加された DEK メンバーは開けない、または見えない。管理者が保存し直せば直るが、検知の仕組みが無い（自己移行は PRIVATE/PUBLIC だけが対象）。
- **修正方針（クライアント）**: 各 isOK を確認し、失敗なら移行全体を失敗として返す。migrationCompletedAt を別に持ち、冪等判定はこの印で行う。DEK プロジェクトを開いたとき、管理者端末で設定・COMMON・TEMPLATE のグループ暗号の残りを再暗号化する。
- **運用**: 既存の移行済みプロジェクトに残りが無いかを棚卸しする（Admin で cryptoScheme の印が無い COMMON・設定を数える）。

## 束5【low】updateProject の楽観ロックなし全置換で除名者が復帰する。鍵削除の順序と失敗無視も重なる
- **攻撃者**: (f) 管理者2人の同時編集・古い画面からの保存。得をするのは (b)。
- **手順**
  1. 管理者Bが古い ProjectEdit を開いている（route.params.project、ProjectEdit.tsx:41、useProjectEdit.ts:45-46）。
  2. 管理者Aが Y を除名する（removeMemberKey の結果は無視、useE3kitGroup.ts:188-190）。
  3. Bが保存する。古い members から membersUid/adminsUid を作り直す（useProjectEdit.ts:92-97, 174-179）。差分がゼロなので鍵操作は起きない。
  4. updateProject（firestore.ts:417-428）が無条件に updateDoc し、Rules（:78-94）にも版の条件が無い。Y が復帰する。
  5. keys/Y が消し残っていれば、Y は rules:214-224 によりそのまま DEK を読める。keys/Y が無くても、Y は data/Storage の読み取り権を取り戻し、元管理者なら書き込み権も戻る。
- **付随（部分失敗）**: 鍵の削除が updateProject より先に走る（ProjectEdit.tsx:302-304）。updateProject が失敗すると、membersUid に居るのに鍵が無いメンバーが残る（'unknown' 扱い、:1579）。
- **被害**: 機密性・完全性の一時的な誤復活。Y はメンバー一覧に表示されるので、完全に隠れるわけではない。
- **修正方針**
  - **クライアント**: updateProject を runTransaction にし、encryptedAt または版番号の一致を確かめる。membersUid は「サーバーの現在値＋今回の差分」で作る。鍵の削除は updateProject の成功後に行い、失敗したら知らせる。membersUid に居て keys が無いメンバーに専用のバッジを出す。
  - **Rules（任意）**: 版を+1する条件を足す。
- **運用**: データ移行は不要。

## 束6【low】除名時に DEK を作り直さない。グループ方式からの移行が除名をきっかけに走ると、除名対象者にも新 DEK が配られ、Virgil グループからも外されない
- **攻撃者**: (b) + (d)（暗号文の別途入手が必要）
- **手順**
  1. 除名時の処理は keys/Y の削除だけ（useE3kitGroup.ts:188-189、firestore.ts:214 のコメントでも認めている）。
  2. 移行経路では、migrateProjectToDEK(originalProject) が originalProject.membersUid（除名対象を含む）へ配る（firestore.ts:1189, 1211）。
  3. 長い再暗号化（:1218-1241）が終わるまで Y は membersUid に残るので、keys/Y を読める（rules:214-224）。
  4. DEK 分岐は deleteGroupMembers を呼ばないので、Y は Virgil グループに残る。
- **被害**: 機密性（前方失効の欠如）。除名後に書かれたデータを、暗号文を入手すれば復号できる。除名前のデータは在籍中に読めたものなので、新たな被害ではない。
- **修正方針**
  - **クライアント（低コスト・優先）**: 移行時の配布先を「original と update の両方に残る uid」に限定する。DEK 分岐でも、移行直後に deleteGroupMembers を呼ぶ。
  - **中期**: 除名時の DEK ローテーション（オーナーまたは版付き）を入れる。少なくとも、設計資料と UI に「除名後も旧 DEK で復号されうる」ことを明記する。
- **運用**: ローテーションを入れると COMMON・TEMPLATE・設定の再暗号化が必要になる（PRIVATE/PUBLIC は既存の遅延自己移行で対応）。

## 束7【low】鮮度判定がクライアント時計同士の時刻比較で、ラップに使った鍵世代を記録していない。台帳キャッシュに TTL も無い
- **統合元**: ledger-identity キャッシュ、reshare の実行中に相手がリセットするケース、local-keys キャッシュ
- **攻撃者**: (f) 長時間セッション・並行操作・端末時計のずれ
- **手順**
  1. 管理者端末の ledgerCache（publicKeys.ts:17-42、TTL なし）に、メンバー M の旧鍵が入っている。
  2. M が鍵をリセットする。
  3. 管理者が同じセッションで次のいずれかを行う。どれもキャッシュの旧公開鍵でラップし、encryptedAt=now で保存する。
     - M の追加：addMemberKey（firestore.ts:193-212）
     - M を含むプロジェクトの作成・移行：distributeProjectDEK
     - 一括再共有：キャッシュのクリアは冒頭1回だけ（useE3kitGroup.ts:259-264）
  4. 判定 encryptedAt < createdAt（:1584）は 'ok' になり、findStaleMemberKeys も検出しない。
  5. createdAt（publicKeys.ts:73）と encryptedAt は Rules で request.time に縛られていない（rules:230-245, 274-280）。そのため時計がずれても同じ誤判定になる。
- **被害（可用性）**: M が開けないのに、バッジにも一括再共有にも出ない。手動の単発再共有で回復できる。機密性への影響は無い。
- **修正方針**
  - **クライアント**: keys/{uid} に recipientKeyVersion（必要なら公開鍵ハッシュも）を保存し、鮮度は世代の一致で判定する。ラップ直前に getDocFromServer で台帳を読むか、対象 uid のキャッシュを消す。一括再共有の後に再判定する。
  - **Rules**: keys.encryptedAt と publicKeys.createdAt/updatedAt を request.time と一致させる（新規書き込み分から適用）。
- **運用**: 既存の keys には recipientKeyVersion が無い。未設定は時刻比較にフォールバックする互換扱いにする。

## 束8【low】明示ログアウト後も、復号済みの共有データの平文スナップショットが端末に残り、未ログイン状態から復元できる
- **攻撃者**: (e) ロック解除済みの端末を物理的に操作できる人。(b) の「除名前の内容を持ち続ける」はエクスポートなどと同じなので外した。
- **手順**
  1. pressLogout（Home.tsx:2090-2093）は、鍵の削除の後に clearProject を呼ぶ。clearProject は無条件に saveProjectBackup を実行する（useProject.ts:69-83）。
  2. 保存先は暗号化なしの MMKV 'ecorismap-backup'（projectBackup.ts:58-60, 96-135）で、最大5世代。
  3. 未ログインなら全件を一覧に出し、uid を照合せずに復元できる（useProjectBackup.ts:49-52, 66-71）。テスト useProjectBackup.test.tsx:185 がこの挙動を仕様として固定している。
- **被害（機密性・限定的）**: ログアウトで「端末を手放せる状態になった」という期待が崩れる。ネイティブのみ（Web は no-op）。
- **修正方針（クライアント）**: 次のいずれか。
  - 明示ログアウトではスナップショットを作らないか、ログアウトする uid の分を削除する。
  - 暗号化プロジェクトのスナップショットは、同じ uid の認証済みユーザーにだけ一覧表示・復元を許す。
  - MMKV に encryptionKey（Keychain/Keystore）を設定する。
- **運用**: 既存テストの仕様を変更する。既存のスナップショットの扱いを決める必要がある。

## 束9【low】強制ログアウト経路で eThree が前ユーザー名義のまま残る
- **攻撃者**: (f) 同じプロセス内でアカウントを切り替えた場合
- **手順**
  1. Account.tsx:139/210/268/287/293/337 の経路は logout() だけを呼び、eThree を破棄しない（useAccount.ts:252-259）。
  2. 別アカウント B でログインすると、initializeUser（e3kit.ts:56-71）が userId を照合せずに早期 return する。
  3. その結果、次のことが起きる。
     - 台帳に未登録のメンバー M へは、e3kit へのフォールバック（crypto/index.ts:34-53 → e3kit.ts:321-326）で A の鍵が署名し、wrapperUid=B のラップが書かれる。M は開けない（判定は 'unknown'）。
     - B が新規ユーザーなら、移行フォームへ誤って誘導され、登録できない。
- **被害（可用性）**: アプリの再起動と再共有で回復できる。
- **修正方針（クライアント）**: initializeUser で eThree.identity !== userId なら破棄して再初期化する。logout() でインスタンスの参照も破棄する（ローカル鍵は消さない）。

## 束10【low】復元失敗のカウンタがバックアップの作り直しでリセットされない
- **攻撃者**: (f) PIN を忘れた正規ユーザー
- **手順**
  1. restore で10回失敗すると、24時間ロックになる（key-backup-func.ts:132-143）。
  2. 鍵リセットと新 PIN で commit しても、restore 系のカウンタは触られない（:310-344）。
  3. そのため新 PIN でも locked になる。ロックが明けた後も、一度打ち間違えると再び24時間ロックになる。
  4. PIN 変更（useAccount.ts:380-392）も restore を経由するので拒否される。
- **被害**: 可用性（最長24時間、繰り返しうる）。deleteKeyData のコメント（:399-401）にある「照合先のバックアップごとに数える」という設計意図とも食い違う。
- **修正方針**
  - **Functions**: commit のトランザクション内で restoreFails/restoreTotalFails/restoreLockUntil をリセットする。KEK ウィンドウの記録は残す。
  - **クライアント（任意）**: PIN 変更はローカル鍵と台帳の照合で本人確認する。
- **運用**: Functions のデプロイが必要。

## 束11【low】beginKeyBackup が検証なしに KEK を返すため、旧4桁 PIN では blob が漏れたときに約3週間で総当たりされる
- **攻撃者**: (d) keyBackups の blob の漏洩と、本人の Firebase 認証の奪取の両方がそろう者
- **手順**
  1. 漏洩した encPrivateKey/salt を入手する。
  2. PIN 候補ごとに beginKeyBackup({k}) を呼ぶ（:295-304）。KEK が無条件に返る。
  3. 制限は1時間20回のウィンドウだけ（:42-45）で、restore の失敗カウンタは消費されない。
  4. 4桁なら 10^4/480 ≒ 21日で尽きる。移行ユーザーは4桁のまま使える（backup.ts:60）。
- **被害**: 機密性。識別秘密鍵が漏れ、過去分を含む全 DEK を復号できる。受容済みの「認証が奪われた場合」を超えて過去分の復号に及ぶので、指摘に含めた。
- **修正方針**: 元の案（begin 専用の nonce で KEK を別系統にする）は成り立たない。blob は restore の KEK で開ける必要があるため（反証役の指摘）。代わりに次の対策を取る。
  - **Functions**: 既存のバックアップがある場合、begin を restore と同じ失敗カウンタに計上する。または「直前に restore が成功したセッション」だけに begin を許す。
  - **クライアント**: 4桁 PIN のユーザーに、期限付きで6桁化を強制する。
- **運用**: 4桁 PIN のユーザー数を棚卸しし、案内する。

## 束12【low】getVirgilJwt と鍵バックアップの関数が email_verified を確かめない。メールアドレスの先取り登録で鍵状態を仕込める
- **攻撃者**: (c) 許可アドレス（ecorismap+*@gmail.com、許可ドメイン）を、受信箱を持たないまま登録する者
- **手順**
  1. auth-guard は文字列の照合だけ（auth-guard.ts:44-61, 81-84）なので、未検証のアカウントを作れる。
  2. getVirgilJwt（virgil-func.ts:27-41）でカードと keyknox を登録する。
  3. begin/commit（requireAuth は uid だけを見る、key-backup-func.ts:259-264）で、攻撃者だけが知る PIN の keyBackups/{uid} を作る。
  4. 正規の持ち主はパスワード再設定で uid を取り戻しても、知らない PIN の復元を求められる（migration.ts:84-91）。
  5. lookupUidByEmail（ecorismap-func.ts:87-96）は未検証の uid も返す。
- **被害**: 可用性・完全性（鍵のリセットが必要になる嫌がらせ）。Rules が email_verified を必須にしているので、機密性は守られる。
- **修正方針（Functions）**: requireAuth と getVirgilJwt で email_verified===true を必須にする（拒否メッセージは固定文言）。getUidsByEmails/getUidByEmail は、相手が未検証なら null を返す。
- **運用**: Functions のデプロイが必要。既存の未検証アカウントに keyBackups/カードが無いかを棚卸しする。

## 束13【nit・contested 採用】再共有の実行時にメンバーが在籍しているかを再確認しない
- **攻撃者**: (f) 除名とすれ違った場合
- **内容**: 古い候補リストから、addMemberKey（firestore.ts:193-212）が除名済み uid の keys を作り直す（Projects.tsx:261-264、useE3kitGroup.ts:262-269、rules:231-245）。
- **評価**: 読み取りは在籍中に限られる。DEK はローテーションされていないので、新しい秘密も渡らない。実害は無く、後片付け（衛生）の問題にとどまる。
- **修正方針**: addMemberKey の冒頭でサーバーの membersUid を確かめる（新規追加の経路はフラグで許可する）。Rules では keys の update を宛先の在籍時に限る。

---

## テストが無く、書くべき関数（優先順・重複除去済み）

1. **migrateProjectToDEK**（src/lib/firebase/firestore.ts）
   - キャッシュが group でもサーバー上が dek なら何もしない（keys も dekPublicKey も不変）。
   - 2つの移行を並行して走らせても、keys と dekPublicKey が対になる。
   - 管理者の再移行で updateDoc が拒否されたとき、keys が上書きされない。
   - 設定の取得・書き戻し失敗、uploadDataHelper の isOK:false で全体を失敗にする。
   - 途中で例外が出た後の再実行で、残りを再暗号化する。
   - 配布先に除名対象を含めない。
   - UsersNotFoundError のメンバーはスキップする。
   - settingsMeta（editorUid/encryptedAt）を保持する。
2. **getProjectCrypto / enc / dec / loadProjectDEKForCurrentUser**（firestore.ts）
   - group キャッシュの後にサーバー側が dek になったとき、enc がグループ暗号を使わない。
   - getAllProjects が dek を見たら、group キャッシュを無効化する。
   - dec のフォールバック（ownerUid を照会名義に使う、dekPrivateKey が undefined のとき）。
   - enc で dekPublicKey が無ければ例外にする。
   - isDEKKeyPair が false のときの挙動。
   - FUNC_ENCRYPTION=false のときは常に group。
   - ログアウトでキャッシュをクリアする。
3. **restoreIdentityKeyV2 / getKeyMigrationState / migrateIdentityKey**（src/lib/crypto/migration.ts）
   - 台帳と食い違う鍵（古い KMS）を保存せず、マーカーも立てない。
   - keyVersion の不一致を扱う。
   - マーカーとローカル鍵があっても、台帳が回転していれば 'migrated' にしない。
   - 台帳 publish が成功し backup が失敗した後の状態と、別端末での復元。
   - isKeyConsistentWithLedger の各分岐（台帳未登録・不正な鍵・一致・不一致）。
4. **updateE3kitGroupMembers（DEK 分岐と移行分岐）**（src/hooks/useE3kitGroup.ts）
   - add/remove が正しい uid で呼ばれる。
   - addMemberKey が途中で失敗したら、その後の処理に進まない。
   - removeMemberKey の失敗を扱う（修正後）。
   - 移行の配布先に除名対象を含めない。
   - DEK 分岐でも Virgil グループから外す。
   - migrateRes が失敗したら addMemberKey を呼ばない。
   - サーバー上が dek なら再移行しない。
   - デッドコードの deleteE3kitGroupMembers は削除するか、テストを書く。
5. **updateProject（同時編集）と saveUpdatedProject/pressSaveProject**（firestore.ts、src/containers/ProjectEdit.tsx）
   - 古い membersUid による除名者の復帰の回帰テスト。
   - 版が一致しなければ拒否する（修正後）。
   - updateProject が失敗したら keys を消さない（順序）。
   - 差分だけを適用する。
   - Rules テストとして、復帰後に消し残った keys を読めるか（A-KEY-15 の逆）。
6. **commitKeyBackup / beginKeyBackup / restoreKeyBackup / getKeyBackupStatus / deleteKeyData**（../functions/src/key-backup-func.ts。callable 本体はエミュレータでのテストが無い）
   - keyVersion が台帳と違う、または既存より小さいときは拒否する（修正後）。
   - commit で restore 系カウンタをリセットする（修正後）。
   - restore の並行実行で、事前計上によってロックを超えられない。
   - バックアップが無いときも試行を計上する。
   - 誤 PIN では KEK も blob も返さない。
   - 成功でカウンタをリセットする。
   - KEK ウィンドウの21回目で resource-exhausted になる。
   - begin を失敗カウンタに計上する（修正後）。
   - 書き込み先は auth.uid に固定する。
   - email_verified=false なら拒否する（修正後）。
   - deleteKeyData で history まで再帰削除し、ウィンドウの記録は残す。
   - status は kekVerifier と blob を返さない。
7. **wrapDEKForMember / unwrapDEK（ファサード）**（src/lib/crypto/index.ts）
   - 台帳の鍵でラップし、e3kit を呼ばない。
   - 台帳未登録・throw・自分の鍵が無いときは e3kit へフォールバックする。
   - 現行鍵 → history → e3kit の順に試す。
   - wrapperUid を偽った署名は開封できない。
   - ENABLE_KEY_LEDGER=false のときは常に e3kit。
8. **getMemberKeyFreshness / findStaleMemberKeys**（firestore.ts）
   - 各判定分岐（needs-reshare/ok/unknown/権限エラー/ENABLE_KEY_LEDGER=false）。
   - encryptedAt が文字列（旧データ）のとき NaN で 'ok' になる問題。
   - キャッシュの旧鍵、keys と dekPublicKey が対にならないケースを検出できないことの明示。
   - recipientKeyVersion による比較（修正後）。
   - 6件以上の並行処理と進捗表示。
   - 台帳の取得が throw したときの扱い。
   - membersUid に居て keys が無いメンバーの検出（修正後）。
9. **addMemberKey / distributeProjectDEK / removeMemberKey**（firestore.ts。ユニットテストが無い）
   - 未ログイン・group 方式・DEK 未取得・wrap が throw したときは setDoc しない。
   - wrapperUid は書き手の uid。
   - 最新の台帳鍵でラップする（キャッシュ問題の回帰テスト）。
   - UsersNotFoundError だけスキップし、他のエラーでは全体を失敗にする。
   - 宛先が在籍していなければ中止する（修正後）。
   - removeMemberKey の reject で isOK:false を返す。
10. **resetEncryptKey / backupEncryptPassword / changeEncryptPassword / restoreEncryptKey / migrateEncryptKey / initializeEncript / logout / deleteLocalEncryptKeys / deleteUserAccount**（src/hooks/useAccount.ts）
    - リセット後に backup を中断・失敗した状態から再ログインしたとき、旧鍵を復元しない。
    - changeEncryptPassword で createKeyBackup が失敗したら、e3kit 側の PIN だけを変えない。
    - restoreEncryptKey の V2 と keyknox の分岐。
    - logout で3種類のキャッシュをクリアし、eThree を破棄する（修正後）。
    - deleteLocalEncryptKeys は例外が出ても purge まで進む。
    - アカウント削除が途中で失敗したときの状態。
11. **initializeUser（native）・cleanupEncryptKey/purgeLocalKeys（web）**（src/lib/virgilsecurity/e3kit.ts, e3kit.web.ts）
    - identity が違えば再初期化する。
    - hasLocalPrivateKey が例外を投げたらインスタンスを破棄する。
    - web で cleanup が失敗しても purge まで進む。
    - decryptEThree/encryptEThree の groupOwnerUid での照会と、失敗をキャッシュしないこと。
12. **migrateProjectsToDEK / dekMigratableProjects**（src/hooks/useProjects.ts）
    - オーナーかつ非 dek だけが対象。
    - サーバー上が dek ならスキップする。
    - 一部失敗のとき failedNames に入り、成功分だけ Redux を更新する。
13. **createKeyBackup / restoreKeyBackup / getKeyBackupStatus / normalizeError**（src/lib/crypto/backup.ts）
    - エラーコードの変換（locked/wrong-pin/not-found/too-many-requests/error）。
    - begin と commit に同じ k を渡す。
    - lockedUntil が未来なら callable を呼ばない。
    - salt が無ければ not-found。
    - iterations をそのまま渡す。
14. **publishPublicKeyToLedger / getPublicKeyFromLedger / getPublicKeyHistoryFromLedger / clearPublicKeyLedgerCache**（src/lib/firebase/publicKeys.ts）
    - 新規なら v1、同じ鍵なら書き込まない、別の鍵なら history 退避と+1 を同一バッチで行う。
    - publish でキャッシュを無効化する。
    - 並列の取得を1回にまとめる。
    - 失敗はキャッシュしない。
    - history は降順で返す。
15. **clearProject / Home.pressLogout / useProjectBackup**（src/hooks/useProject.ts, src/containers/Home.tsx, src/hooks/useProjectBackup.ts）
    - 明示ログアウトで暗号化プロジェクトのスナップショットが残らない（または他 uid から復元できない）。
    - 鍵の削除がログアウトより先に走る順序。
    - 未認証時に暗号化プロジェクトのスナップショットを一覧に出さない（既存テストの :185 を見直す）。
16. **checkedProject / updateProjectMembers / deleteMember / changeAdmin**（src/hooks/useProjectEdit.ts）
    - membersUid/adminsUid を正しく作り直す。
    - 削除・降格したメンバーが両方の配列から外れる。
    - NO_ACCOUNT は membersUid に入らない。
    - 作り直されたアカウントの uid を差し替える。
17. **reshareMemberKeys / pressReshareKeysOK / pressCheckStaleKeys**（src/hooks/useE3kitGroup.ts, src/containers/Projects.tsx）
    - 実行中に台帳が更新された場合。
    - 除名済みの uid はスキップする。
    - 中止時の skipped の件数。
    - 失敗したプロジェクト名の表示。
    - アーカイブ済みプロジェクトのラベル。
18. **getVirgilJwt / getUidsByEmails / getUidByEmail / authGuardBeforeUserCreated**（../functions/src/virgil-func.ts, ecorismap-func.ts, auth-guard.ts）
    - 未認証・未検証なら拒否する。
    - identity は auth.uid に固定する。
    - 入力の上限・形式。
    - 相手が未検証なら null を返す（修正後）。
    - 両方の secret が空なら全件拒否する（fail-closed）。
    - メールが無ければ拒否する。
    - enforceAppCheck=true。
19. **saveIdentityPrivateKey / loadIdentityPrivateKey / deleteIdentityPrivateKey**（src/lib/crypto/keyStorage.ts, keyStorage.web.ts）
    - uid ごとに分かれる。
    - load の失敗は undefined を返す。
    - IndexedDB が使えないときの挙動。
    - Keychain の accessible 指定を固定する。
20. **isDEKKeyPair（ネイティブ）**（src/lib/virgilsecurity/dek.ts）
    - 本物の鍵ペアで true、偽造なら false、壊れた base64 なら false。
    - 現状テストは web 版だけで、firestore.test では常に true を返すモックになっている。
21. **Rules テストの追加**（firestore.rules）
    - 既に dek のプロジェクトでオーナーが dekPublicKey を差し替える場合（修正後は拒否）。
    - dek プロジェクトで cryptoScheme の印が無い data/settings の書き込みを拒否する（修正後）。
    - keyBackups/keyBackupAttempts（rules:326-331）が全面拒否であることを確かめる attack テスト（現状は無い）。

---

## 受容済み事項の確認
- **F4（メンバーはオーナー宛ての keys を書ける）**
  - 前提は崩れていない。
  - ただし管理者・オーナーが keys を既存値と無関係に上書きできることが、束1の事故で「全員が恒久的に復号できない」状態を作る土台になっている。
  - 悪意による経路は新しい能力ではないとして束から外したが、事故対策（順序・トランザクション）は必要。
- **F10、管理者による他管理者の除名・外部 uid の追加、付け替え分岐、削除直後の ID 再作成の窓**: 今回の調査では、これらを足掛かりに被害が拡大する経路は見つからなかった。束13も、在籍中に限る読み取りによって無害化されている。
- **DEK 方式のデータに署名が無い**: 前提は維持される。束9で wrapperUid と署名者がずれる事故はあるが、可用性の問題にとどまる。
- **本人の認証が奪われたら台帳を差し替えられる**
  - 前提自体は維持される。
  - ただし束11では、認証の奪取と blob の漏洩が重なると、過去分を含めた識別秘密鍵の奪取まで広がる。4桁 PIN では、key-backup-func.ts:43 のコメントにある「オラクル化を実用不能にする」が成り立たない。受容の範囲を超える部分として指摘に含めた。
- **「除名しても DEK を作り直さない」**: 受容リストにも docs/AUTH_ENCRYPTION_POLICY.md にも明記されておらず、コードのコメント（firestore.ts:214）にしかない。受容するなら設計資料に明記すべき（束6）。
