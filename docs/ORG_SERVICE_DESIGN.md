# 組織アカウントのサービス化 方式設計

策定日: 2026年8月17日

組織アカウント（Firebaseメール認証系統）を有償サービスとして提供するための方式設計。実装前の方針文書であり、実装時はこの文書をベースに詳細設計へ落とす。

## 決定事項（2026-08-17）

| 項目 | 決定内容 |
|------|---------|
| 導入方式 | **段階導入**。organizations基盤を先に作り、当面は請求書＋手動登録で運用開始。契約が増えたらStripeを後付け |
| 課金単位 | **組織定額＋シート上限**。組織ごとに年額/月額の定額、プランごとに登録可能ユーザー数（シート）の上限 |
| 設計原則 | シンプル・自動化可能・「終了できる設計」（サービス終了時の作業から逆算した開始条件を満たす） |

## 現状と課題

- 組織アカウントの登録制限は`beforeUserCreated` blocking function（functionsリポジトリ`src/auth-guard.ts`）のみ。許可リストは**Secret Managerの`ORG_ALLOWED_DOMAINS`/`ORG_ALLOWED_EMAILS`**（カンマ区切り、`parseList`で小文字化、`isAllowedEmail`で完全一致またはドメイン一致、両方空ならfail-closed）
- 許可リストの更新には`deploy-with-env.sh`によるシークレット再設定が必要＝**組織を1つ追加するたびに運営者の手作業＋デプロイ**。契約状態・期限・人数という概念がなく、課金と接続できない
- 同じSecretを`tile-func.ts`（`getTileSignatures`）が署名付きタイル配信の**既定の許可範囲**として二次利用している（`tileAccess/{layer}`でレイヤ単位に上書き可）
- 課金機能（Stripe・ライセンス制限）は2026-07に全削除済み（コミット09c693be）。プロジェクト数・メンバー数・容量の上限は一切なし（`projects/{id}.storage.count`で容量計測のみ）

## 設計の核心

**Secret Managerのフラットな許可リストを、Firestoreの`organizations`コレクション（契約単位）に置き換える。**

blocking functionがFirestoreを読むことで、組織の追加・停止・期限管理がデプロイ不要（＝スクリプトやwebhookから自動化可能）になる。契約状態（status/contractEnd）とシート数を持たせることで、Phase 2のStripe課金がwebhookでこのドキュメントを更新するだけで接続できる。

## 1. データモデル: `organizations/{orgId}`

```
name: string                    // 組織名（表示用）
status: 'trial'|'active'|'grace'|'suspended'
domains: string[]               // 許可ドメイン（小文字）
emails: string[]                // ドメイン外の個別許可メール（小文字）
plan: string                    // プラン識別子
seats: number                   // シート上限
seatCount: number               // 現在の登録ユーザー数（カウンタ）
contractEnd: Timestamp          // 契約終了日
note: string                    // 運用メモ（契約番号・担当者など）
createdAt, updatedAt: Timestamp
// Phase 2で追加: stripeCustomerId, stripeSubscriptionId
```

- **Firestore Rules**: `allow read, write: if false`（Admin SDKのみアクセス可。`tileAccess`/`keyBackups`と同じパターン）。許可ドメイン一覧・契約情報は秘匿情報であり、クライアントに読ませる必要がない
- **プロジェクトと組織は紐付けない**（最小設計）。課金はシート（ユーザー数）ベースなのでプロジェクトの数・構成は自由のまま。組織をまたぐプロジェクト共有も現状どおり可能。`projects`のスキーマ・Rules・E2E暗号の仕組みには一切手を入れない
- `domains`/`emails`は組織間で重複させない運用とする（重複時はどちらの契約か判定できないため、管理CLIの`add`/`update`で重複チェックを行う）

## 2. 登録・利用制限の実施点（enforcement）

| # | タイミング | 仕組み | 内容 |
|---|-----------|--------|------|
| 1 | 新規登録 | `beforeUserCreated`（改修） | Secret Manager読みから`organizations`のFirestoreクエリへ。`status in ['trial','active']`の組織の`domains`（array-contains ドメイン）または`emails`（array-contains メール）に一致すれば許可。あわせて**シート上限チェック**（`seatCount >= seats`なら拒否）と`seatCount`のトランザクションincrement |
| 2 | サインイン | `beforeSignIn`（新設） | 所属組織の`status`が`suspended`、または`grace`期間超過ならログイン拒否。`grace`中はログイン可（エクスポート用） |
| 3 | 既存セッション | 日次スケジュール関数（新設） | `beforeSignIn`はIDトークンの自動更新には発火しないため、既存セッションは締め出せない。日次で`suspended`組織のユーザーのリフレッシュトークンを失効（`admin.auth().revokeRefreshTokens`）→ 次回のトークン更新（最大1時間）で実効的にサインアウト |
| 4 | ユーザー削除 | Auth `onDelete`トリガ（新設） | 該当組織の`seatCount`をdecrement。カウンタの整合性は定期レポートスクリプトで実ユーザー数と照合（`count-key-migration.js`と同パターンの読み取り専用スクリプト） |

補足:

- **クライアント側の受け皿は実装済み（2026-08-18）**: `beforeSignIn`拒否時、アプリは`BLOCKING_FUNCTION_ERROR_RESPONSE`を`auth/signin-restricted`に正規化し「組織アカウントの利用が制限されているため、ログインできません」と案内する（`sign-in.ts`/`sign-in.web.ts`/`useAccount.ts`）。サーバー側は一瞬で切り替えられるがアプリの普及には数ヶ月かかるため、enforcement開始に先行してリリースしておく
- blocking function内のFirestoreクエリは組織数が高々数十〜数百の規模では性能上の問題にならない（blocking functionのタイムアウトは7秒）
- fail-closedの原則は維持する: クエリ結果ゼロ＝拒否。`organizations`が空でも全開放にはならない
- `tile-func.ts`の既定許可範囲も`organizations`読み（`status in ['trial','active','grace']`の全組織のdomains/emails）に追従させ、Secret依存を完全に排除する

## 3. 契約ライフサイクルと状態遷移

```
trial ──入金確認──▶ active ──contractEnd到来──▶ grace ──猶予期間満了──▶ suspended
（試用・新規登録可）  （正規契約）              （ログイン・エクスポート可、  （ログイン不可、
                                              新規ユーザー登録不可）        トークンも日次失効）
```

- `active → grace`、`grace → suspended`の遷移は日次スケジュール関数が`contractEnd`と猶予期間から自動判定して更新する（手動運用でも期限切れの取りこぼしがない）
- 入金確認による`trial → active`・契約更新（`contractEnd`延長）はPhase 1では管理CLI、Phase 2ではStripe webhookが行う

### E2E暗号との関係（grace期間が必須である理由）

共有プロジェクトのデータはE2E暗号化されており、**ログインできなくなる＝復号手段を失う**ことに直結する。運営者はデータを復号できないため、「後からデータだけ渡す」ことは構造的に不可能。したがって:

- **grace期間（例: 契約終了後30〜60日）を契約条項として保証**し、その間にデータのエクスポート（GeoJSON/GPX等の標準フォーマット）を案内する
- これは「終了できる設計」（サービスEOL時の逆算）の契約単位版でもある。サービス全体の終了時も同じ手順（全組織をgraceへ→告知→エクスポート期間→停止）が使える

### 容量・その他の上限

- ストレージ容量は**ソフトリミット**とする: 既存の`storage.count`計測を使い、定期レポートで超過組織を検出→運営から連絡。Storage Rulesでのハードリミットはプロジェクトと組織の紐付けが必要になり複雑さに見合わないため**不採用**
- プロジェクト数の上限も設けない（課金保護はシート上限で足りる）

## 4. Phase 1: 請求書＋手動運用（自動化の範囲）

手動なのは「入金確認して組織を登録する」瞬間だけで、以降の登録受付・期限管理・締め出しはすべて自動で回る。

- **管理CLI** `scripts/org-admin.js`（functionsリポジトリ。Admin SDK＋ADC認証、`seed-public-keys.js`と同じ運用パターン）:
  - `add` — 組織追加（domains/emailsの組織間重複チェック、**公開メールプロバイダのドメイン拒否**付き）
  - `update` — プラン・シート数・contractEnd・status変更、個別メールの追加/削除
  - `suspend` — 即時停止（トークン失効も実行）
  - `list` — 一覧（status・シート消化・期限）
  - `report` — 期限30日前の組織、シートカウンタと実ユーザー数の照合、容量超過の検出
- **申請の受付**: 既存の問い合わせ導線（メール/Webフォーム）を窓口とし、申請テンプレート（組織名・許可ドメイン・個別メール・想定人数・担当者連絡先）を用意して`add`へそのまま流し込めるようにする
- **運用フロー**: 申請 → 内容確認・見積 → 請求書 → 入金確認 → `org-admin.js add`（または`update`で更新）。以降は自動
- **組織の登録・変更にUIは作らない**: 契約が月数件のうちはCLIで十分で、管理画面は作る・守るコストに見合わない。Firestoreコンソールでの直接編集はバリデーションが効かないため原則使わない（閲覧のみ）。組織側管理者によるセルフ管理UIも当面作らず、依頼を受けて運営が`update`する
- **ドメイン審査は手動を維持（セキュリティ要件）**: ①申請がそのドメインのメールアドレスから来ていることで代表者性を確認 ②`gmail.com`等の公開メールプロバイダをドメインとして登録すると事実上の全開放になるため、目視＋CLIのチェックで拒否（個別メールとしての登録は可）
- 期限アラートは`report`の定期実行（またはスケジュール関数から運営者へメール）で拾う

## 5. Phase 2: Stripe後付け

Phase 1の`organizations`ドキュメントがそのまま受け皿になるため、追加するのは決済とwebhookのみ。

- **Stripe Billing**: Product/Price＝プラン、年額（または月額）サブスクリプション。カード払い＝Checkout/Payment Link、**請求書払い＝Stripe Invoicing（`collection_method: 'send_invoice'`）**で両対応。日本のB2B需要（請求書・銀行振込）もStripe内で完結する
- **webhook function**（新設）: `invoice.paid` → `status: 'active'`＋`contractEnd`延長、`customer.subscription.deleted`/支払い失敗 → 状態遷移はPhase 1と同じ日次判定に委ねる。組織との対応は`stripeCustomerId`で引く
- 申込は当初は問い合わせベース（運営がStripe顧客を作成）でよい。申込フォーム→Checkoutのセルフサーブ化は需要を見て判断
- セルフサーブ化しても**ドメインの審査は運営の承認ステップとして残す**（申込→決済→`trial`で仮登録→運営がドメイン確認して承認、まで圧縮するのがゴール）。個別メールの追加は審査リスクが低く、将来のセルフ化候補
- 過去のStripe Firestore Extension（`ext-firestore-stripe-payments`、v1時代に使用・削除済み）は**再利用しない**。個人向けBtoC設計でorganizationsモデルと合わないため、素のwebhook実装とする

## 6. 移行手順（実装フェーズのロードマップ）

1. `organizations`コレクション＋Rules追加（アプリリポジトリ`firestore.rules`に`allow read, write: if false`＋Rulesテスト）
2. `auth-guard.ts`改修: Firestore読みを主、**Secret読みをフォールバックとして併読**（移行中の安全弁）。`parseList`/`isAllowedEmail`の純粋関数は流用。ユニットテスト＋エミュレータテスト。**エラーメッセージの`'Signup is restricted'`という文字列は維持すること**（既存クライアントが`sign-in.ts`で文字列判定して案内表示している）
3. 現行Secretの内容を`organizations`へ投入するシードスクリプト（既存契約を1組織ドキュメント化）
4. 本番で動作確認後、Secretフォールバックを削除。**`tile-func.ts`の既定許可範囲も`organizations`読みへ追従**
5. `beforeSignIn`＋日次スケジュール関数（状態遷移・トークン失効）＋Auth `onDelete`カウンタ
6. `org-admin.js`＋`report`（期限・整合性・容量）
7. （Phase 2）Stripe webhook＋Invoicing

各ステップは独立してデプロイ可能で、ステップ4までは既存ユーザーへの挙動変化がない（許可リストの置き場が変わるだけ）。

## 7. 未決事項（要判断）

- **プラン・価格の具体値**: シート数の刻み（例: 10/30/100）、trial期間の長さ
- **grace期間の日数**: 契約条項と連動（30〜60日を想定）
- **利用規約の改訂**: 現行規約は無償前提。有償化に伴う条項（対価・支払い・解除・データ取り扱い）と、保留中の賠償上限の論点をあわせて整理する
- **組織向け付加価値**: TOTP MFAの組織必須化オプション（`AUTH_ENCRYPTION_POLICY.md`の方針。SSO・監査ログと並ぶ有料プラン構成要素になり得る）をどのプランに載せるか
- **既存無償利用組織の扱い**: 現行の許可リスト掲載組織を移行時にどのstatus/プランで登録するか

## 関連文書

- `docs/AUTH_ENCRYPTION_POLICY.md` — ログイン・暗号化の全体方針（TOTP MFA・脱Virgil）
- `docs/SECURITY_TODO.md` — セキュリティ棚卸し（blocking functionのinvoker権限の注意点など）
- functionsリポジトリ `src/auth-guard.ts` / `src/tile-func.ts` — 現行の許可リスト実装
