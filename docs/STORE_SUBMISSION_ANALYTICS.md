# ストア提出時の対応（Firebase Analytics導入に伴う）

2026-07-13にFirebase Analytics（GA4、測定ID: G-647FD9ZHZ1）を導入した。
次回ストア提出時に以下の申告更新が必要。

## 導入した構成（申告の前提）

- 収集するもの: 利用状況データ（画面表示・セッション・アプリ起動等の自動収集イベント）、
  アプリインスタンスID、IPアドレス（Google側で都市レベルの地域推定に使用）、端末情報（機種・OS）
- 収集しないもの:
  - **IDFA（iOS広告ID）**: Podfileで `$RNFirebaseAnalyticsWithoutAdIdSupport = true` → **ATT許可ダイアログ不要**
  - **Android広告ID（AdId）/ SSAID**: firebase.jsonで収集無効化済み
  - 広告系シグナル: `ad_storage` / `ad_user_data` / `ad_personalization` すべてfalse
- ユーザーIDとの紐付けなし（`setUserId`は未使用）。カスタムイベントなし（自動収集のみ）
- 位置情報・調査データはAnalyticsには送信しない

---

## 1. App Store Connect「Appのプライバシー」

「App Privacy」セクションに以下を**追加**する（Firebase Auth/Firestore等の既存申告は変更しない）。

| データの種類 | 項目 | 設定 |
|---|---|---|
| 識別子 | デバイスID | 収集する（アプリインスタンスID・IDFV） |
| 使用状況データ | 製品の操作 | 収集する（画面表示、セッション等） |
| 位置情報 | おおよその位置情報 | 収集する（IPアドレスからの地域推定）※ |

各項目の詳細設定（3項目とも共通）:
- 利用目的: **「分析」のみ**（「デベロッパの広告またはマーケティング」等は選ばない）
- ユーザーのアイデンティティに紐付け: **いいえ**
- トラッキングに使用: **いいえ**（IDFA不使用・クロスアプリ追跡なしのため）

※「おおよその位置情報」はIP由来の地域推定を保守的に申告するもの。提出前に
Googleの公式ガイド <https://firebase.google.com/docs/ios/app-store-data-collection-information>
の最新の記載を確認すること。

その他:
- App Review審査の「広告識別子（IDFA）を使用しますか？」→ **いいえ**
- ATT（AppTrackingTransparency）の実装・Info.plistの`NSUserTrackingUsageDescription`は**不要**

## 2. Google Play Console「データセーフティ」

「アプリのコンテンツ > データセーフティ」に以下を**追加**する。

| データの種類 | 設定 |
|---|---|
| アプリのアクティビティ > アプリ内でのユーザー操作 | 収集する |
| デバイスまたはその他のID | 収集する（アプリインスタンスID） |
| 位置情報 > おおよその位置情報 | 収集する（IP由来）※上記と同様に公式ガイドを確認 |

各項目の詳細設定（共通）:
- 共有: **共有しない**（Googleは委託先＝サービスプロバイダとしての処理）
- 処理が一時的: いいえ
- 必須/任意: **必須**（アプリ内にオプトアウトなし）
- 利用目的: **分析**
- 転送時の暗号化: **はい**
- 削除リクエスト: ユーザーが削除をリクエストできる仕組み → 問い合わせ窓口（map@ecoris.co.jp）経由

参考: <https://firebase.google.com/docs/android/play-data-disclosure>

## 3. プライバシーポリシー追記案【2026-07-13 対応済み・公開済み】

`website/public/policy_ja.html` の「3. 外部送信」節に以下を追記する
（現行ポリシーは既にIPアドレス・識別子の収集とトラフィック測定目的を記載済みのため、
Google Analyticsの明示とオプトアウト案内のみ追加すれば足りる）。

### 日本語（policy_ja.html）

> **Google アナリティクスの利用について**
>
> 本サービスでは、サービスの利用状況の把握及び品質改善のため、Google LLCが提供する
> Google アナリティクス（アプリではFirebase向けGoogle アナリティクス）を使用しています。
> Google アナリティクスは、Cookieまたはアプリの識別子（アプリインスタンスID）を用いて、
> 個人を特定しない形で利用状況（閲覧ページ・画面、利用時間、端末の種類、IPアドレスに
> 基づくおおよその地域等）を収集します。広告目的の識別子（ADID/IDFA）は収集しません。
> 収集された情報はGoogleのプライバシーポリシーに基づいて管理されます。
>
> - Google プライバシーポリシー: https://policies.google.com/privacy
> - Google アナリティクスの利用規約: https://marketingplatform.google.com/about/analytics/terms/jp/
> - ウェブサイトでの計測を無効にしたい場合は、Google アナリティクス オプトアウト
>   アドオン（https://tools.google.com/dlpage/gaoptout?hl=ja）をご利用ください。

### 英語（policy_en.html）

> **Use of Google Analytics**
>
> This service uses Google Analytics (Google Analytics for Firebase in the mobile apps),
> provided by Google LLC, to understand usage and improve service quality.
> Google Analytics collects usage information (pages/screens viewed, session duration,
> device type, approximate region based on IP address, etc.) in a form that does not
> identify individuals, using cookies or an app instance ID. Advertising identifiers
> (ADID/IDFA) are not collected. The collected information is handled in accordance
> with Google's Privacy Policy.
>
> - Google Privacy Policy: https://policies.google.com/privacy
> - Google Analytics Terms of Service: https://marketingplatform.google.com/about/analytics/terms/us/
> - To opt out of measurement on the website, you can use the Google Analytics
>   Opt-out Browser Add-on (https://tools.google.com/dlpage/gaoptout).

補足: 現行ポリシー1章には「ADID、IDFAその他の識別子」を収集する旨の記載があるが、
本アプリは広告IDを収集しない構成のため、改定時に「（現在、広告目的の識別子は
収集していません）」等の注記を検討してもよい。

## 4. 提出時チェックリスト

- [ ] `package.json` / `app.json` のバージョン更新
- [ ] App Store Connect「Appのプライバシー」更新（上記1）
- [ ] App Review質問のIDFA使用 → いいえ
- [ ] Google Play「データセーフティ」更新（上記2）
- [x] プライバシーポリシー改定＋改定日更新（上記3、websiteリポジトリ）→ 2026-07-13デプロイ済み。
      あわせて1章の識別子記載を実態に合わせ修正（ADID/IDFA→アプリインスタンスID）、
      2章の「広告の配信、表示及び効果測定のため」を削除（広告配信・広告IDは不使用のため）
- [ ] 提出ビルドでDebugView確認（iOS: `-FIRDebugEnabled` / Android: `adb shell setprop debug.firebase.analytics.app jp.co.ecoris.ecorismap`）
- [ ] リリース後、GA4リアルタイムでiOS/Androidストリームの計測を確認
