# 調査タイルの署名付き配信

調査ごとのタイル（自社サーバー上）を、許可した組織ドメインのユーザーだけが取得できるようにする仕組み。
プリセットのタイル（S3+CloudFront、公開前提）は対象外。

## 全体の流れ

```
アプリ ──① 署名を要求 ──> Firebase Functions (getTileSignatures)
                              認証 / email_verified / 許可ドメイン照合
       <─② 署名を受け取る ──┘

アプリ ──③ 署名付きURLでタイル取得 ──> www.ecoris.co.jp/map/survey/... (_gate.php)
                                         HMAC検証 → survey_tiles/ から配信
```

署名の検証はサーバー側で計算し直して行うため、発行済み署名を保存する必要はない。

## サーバーを増やす場合

他組織が自分のサーバーにゲートウェイを設置する場合も、`survey/` `survey_tiles/` 一式を
配って別の秘密鍵を置いてもらえばよい。こちら側の対応は `TILE_HMAC_SECRETS` に
「URLプレフィックス -> 秘密鍵」を1件足すだけで、**コード変更もアプリ更新も不要**。

```
TILE_HMAC_SECRETS='{
  "https://www.ecoris.co.jp/map/survey/": "...",
  "https://other.example/tiles/":         "..."
}'
```

どのURLが署名を要するかの判定はFunctions側（`parseTileUrl`）に集約してあり、
アプリはタイル/スタイルのURLを渡して返ってきたクエリを付けるだけ。アプリ側に
サーバーの規約を持たせていないので、この構成が崩れない。

なお認可（誰に見せるか）は常にこちらのFunctionsが判断する。他組織が独自のユーザー管理で
認可したい場合は別の設計（各組織が署名APIを持つ）になるが、EcorisMapのIDトークンを
他組織側で検証する必要が生じるため、現状は中央方式のほうが現実的。

## サーバー側のファイル配置

WebARENA共有ホスティング（FTPSのみ、シェル無し、**PHP 5.6.20**）。

```
/ssl/home/map/survey/               公開。ゲートウェイ
    .htaccess                       RewriteRuleで _gate.php へ振り分け
    _gate.php                       HMAC検証 + Range対応の配信
/ssl/home/map/survey_tiles/         直アクセス拒否。実体
    .htaccess                       Require all denied
    tile_secret.php                 HMAC秘密鍵（コミット禁止）
    <レイヤ名>/{z}/{x}/{y}.png       z/x/y形式
    <レイヤ名>.pmtiles               PMTiles形式
    <スタイル名>.json                ベクタタイルのスタイル
    <名前>.pdf                       PDF地図
```

このディレクトリの `survey/` `survey_tiles/` がサーバー上の同名ディレクトリに対応する。
`tile_secret.php` は `.example` のみ置いてある。

PHPが5.6系なので、`??` / `declare(strict_types)` / スカラー型宣言は使えない。

### 公開URL

```
https://www.ecoris.co.jp/map/survey/<レイヤ名>/{z}/{x}/{y}.png?expires=..&sig=..
https://www.ecoris.co.jp/map/survey/<レイヤ名>.pmtiles?expires=..&sig=..
https://www.ecoris.co.jp/map/survey/<スタイル名>.json?expires=..&sig=..
https://www.ecoris.co.jp/map/survey/<名前>.pdf?expires=..&sig=..
```

PDFはアプリが自分でダウンロードし、ローカルタイルに変換してから使う（変換後はサーバーへ
アクセスしない）。Firebase Storage経由の `pdf://` は別経路なので署名の対象外。

レイヤ名に日本語を使う場合はURL側だけpercent-encodeする（署名は生の文字列に対して計算する）。

## 署名の仕様

```
署名対象   : "<expires>:<レイヤ名>"
方式       : HMAC-SHA256 → base64url（+ → -、/ → _、末尾の = を除去）
クエリ     : ?expires=<UNIX秒>&sig=<署名>
有効期限   : 90日（tile-func.ts の SIGNATURE_TTL_SEC）
上限       : 91日（_gate.php の TTL_MAX。時計ずれの余裕として1日分多い）
```

レイヤ名の決め方（`_gate.php` と `tile-func.ts` の `parseTileUrl` で揃えてある）:

| URL | レイヤ名 |
|---|---|
| `<prefix><名前>/{z}/{x}/{y}.png` | 最初のパスセグメント |
| `<prefix><名前>.pmtiles` | 拡張子を除いたファイル名 |
| `<prefix><名前>.json` | 拡張子を除いたファイル名（ベクタタイルのスタイル） |
| `<prefix><名前>.pdf` | 拡張子を除いたファイル名（アプリがローカルタイルに変換する） |

**スタイルJSONはタイル本体と別のレイヤ名になる。** 例えば `R7小田野沢_判読図.pmtiles` と
`R7小田野沢_判読図_塗.json` は別々に署名を取る。`tileAccess` で範囲を上書きする場合は
両方に登録が必要（既定のままなら不要）。

**署名はユーザーを識別しない。** 同じレイヤ・同じ期限なら誰が取得しても同じ値になるため、
転送されれば期限内は第三者も使える。誰に発行したかは `getTileSignatures` のログにしか残らない。

## 許可設定

**既定の公開範囲は組織アカウントのログインと同じ**（`ORG_ALLOWED_DOMAINS` / `ORG_ALLOWED_EMAILS`）。
`survey_tiles/` にタイルを置くだけで、組織アカウントのユーザーは使えるようになる。
不特定多数には出ないので、通常はこれで足りる。

レイヤごとに範囲を変えたいときだけ、Firestoreに上書き設定を作る。

```
tileAccess/<レイヤ名>
    allowedDomains: ["client.or.jp"]   許可するドメインの配列
    allowedEmails:  []                 ドメイン外の個別許可（任意）
```

- **登録があると、それが唯一の判断基準になる**（既定にはフォールバックしない）。
  範囲を絞ることも、発注元など他組織に広げることもできる
- 組織アカウントにも見せ続けたいなら `allowedDomains` に `ecoris.co.jp` を含めること。
  含め忘れると自社から見えなくなる
- 空の登録（`allowedDomains: []`, `allowedEmails: []`）は全拒否を意味する
- Security Rulesでクライアントからの読み書きは全面禁止。FunctionsがAdmin SDKで読む
- 権限の無いレイヤはエラーではなく黙って除外される（存在有無を漏らさないため）

登録はFirebaseコンソールから手動で行う。判定ロジックは `functions/src/tile-func.ts` の
`isLayerAllowed`（テストは `functions/test/tile-func.test.js`）。

## 秘密鍵のローテーション

流出時や権限を一斉に切りたいときの手段。**発行済みの署名が全て即座に無効になる。**

1. `openssl rand -hex 32` で新しい値を生成
2. サーバーの `/ssl/home/map/survey_tiles/tile_secret.php` を差し替え
3. `functions/secrets.env` の `TILE_HMAC_SECRETS` 内の該当プレフィックスの値を更新し、`npm run deploy`
   （`secrets.env` では値をシングルクォートで囲むこと。`source` でJSONのダブルクォートが消える）
4. アプリ側は403を受けて署名を取り直す

2と3の間はタイルが403になるので、続けて実施すること。

## 制約

- **一度ダウンロードしたタイルは回収できない。** 端末内のキャッシュはサーバーを経由しないため、
  後から権限を剥奪しても見え続ける。オフライン利用を認める以上は原理的に防げない
- **性能は未検証。** PMTilesはRangeで部分取得するので軽いが、z/x/yタイルは1画面で数十
  リクエスト飛ぶ。1リクエストにつきPHPプロセスが1つ起動するため、同時利用者が増えたら
  CloudFrontを前段に置く（オリジンはこのままでよく、`.htaccess` にカスタムヘッダー検査を足す）

## 動作確認

```bash
# 署名を手で作る（SECRET は tile_secret.php の値）
node -e '
const crypto = require("crypto");
const secret = "SECRET", layer = "レイヤ名";
const expires = Math.floor(Date.now() / 1000) + 3600;
const sig = crypto.createHmac("sha256", secret).update(`${expires}:${layer}`).digest("base64")
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
console.log(`?expires=${expires}&sig=${sig}`);
'
```

| 確認項目 | 期待 |
|---|---|
| 正しい署名 | 200 |
| 署名なし | 403 |
| 署名を1文字改変 | 403 |
| 期限切れ | 410 |
| 有効期限が91日超 | 400 |
| `survey_tiles/` へ直アクセス | 403 |
| PMTilesの `Range: bytes=0-126` | 206 + `Content-Range` |
