# ログイン・暗号化 方針まとめ

策定日: 2026年7月19日

ログイン(認証)と暗号化(鍵管理)に関する方針の整理。DEK移行の設計時にこの文書をベースに詳細設計へ落とす。

## 現状

### ログイン(2系統・単一ビルド)
- **Google連携**: 個人ユーザー向け。Google Drive(`drive.file`)に個人プロジェクトを保存
- **組織アカウント**: Firebaseメール認証。`beforeUserCreated` blocking function(`auth-guard.ts`)で登録制限(許可リスト: Secret Managerの`ORG_ALLOWED_DOMAINS`/`ORG_ALLOWED_EMAILS`)
- Identity Platformへのアップグレードは**完了済み**(2026-07-13確認)

### 暗号化
- 共有プロジェクトはVirgil E3Kitによるグループ暗号化(`encdata`/`encryptedAt`)
- 秘密鍵のバックアップ/復元はPINベース(Virgil Keyknox + Pythia。総当たりはVirgilサーバー側でレート制限)
- **DEK(エンベロープ暗号)移行はPhase i/ii実装済み**(ブランチ`feature/dek-admin-member-add`、フラグ`CREATE_DEK_PROJECTS`/`ENABLE_DEK_MIGRATION`は既定OFF)。プロジェクト毎のDEKでデータを暗号化し、DEKをメンバー各自の公開鍵でラップして`projects/{id}/keys/{uid}`に置く方式
- 2026-06のDEK設計時の判断は「**Virgilは維持**」(Cards=公開鍵の真正性、Keyknox/Pythia=PIN鍵復元という難所を任せるため。グループ機能のみDEK化)
- 課題: Virgil Securityのサービス継続性に不安

## 方針

### 1. 組織アカウントにTOTP方式の2段階認証(MFA)を導入

| 項目 | 決定内容 |
|------|---------|
| 対象 | 組織アカウント(メール認証)のみ。Google連携ユーザーはGoogleアカウント側の2FAに委ねる(アプリ側の実装不要) |
| 方式 | **TOTP(認証アプリ)一択。SMSは不採用** |
| 適用 | 全員一律強制ではなく**組織管理者が自組織に必須化できるオプトイン** |

SMS不採用の理由: フィールド調査は圏外でのログインがあり得る(TOTPは登録後オフラインでコード生成可能)。SMSは通数課金があり、電話番号という余計な個人情報を抱える。

**技術検証済み(2026-07-19)**: 追加パッケージ不要で実装可能。
- `@react-native-firebase/auth` 24.1.1: `TotpMultiFactorGenerator`(`generateSecret`/`assertionForEnrollment`/`assertionForSignIn`)、`TotpSecret`(`generateQrCodeUrl`)あり。モジュラーAPIからエクスポート済み
- `firebase` 12.0.0(Web): `TotpMultiFactorGenerator`あり
- 現状`src/`にMFA関連コードはなく、純粋な新規実装

実装ステップ:
1. GCPコンソール(Identity PlatformのMFA設定)でTOTPプロバイダを有効化
2. 登録UI(QRコード表示 → 認証アプリ登録 → コード確認)
3. サインインUI(resolverでのコード入力) — Web/iOS/Android 3プラットフォーム
4. **リカバリーフロー**: 端末紛失時に組織管理者の依頼でCloud Functions(Admin SDK)からMFA解除。Firebaseにリカバリーコード機能はないため必須。「管理者によるメンバー管理」機能と同じ管理画面に載せる(設計上の山場はここ)

### 2. パスキーは現時点で不採用

- Firebase Auth(Identity Platform)がパスキーをネイティブサポートしていない。自前実装はWebAuthnサーバー(Functions + SimpleWebAuthn等)+カスタムトークン発行の構成になり、認証の最重要部分の自作は過大
- 組織ユーザーは「会社のWindows PC + 現場のiPhone」などエコシステム跨ぎが多く、パスキー同期が効かない場面のUXも難あり
- **Firebaseが正式サポートしたら乗り換えを再検討**。セキュリティチェックシートの「MFA対応」要件はTOTPで満たせる

### 3. TOTPとPINは別レイヤー(TOTPはPIN対策の代替にならない)

- **TOTP** = ログイン(認証)を守る。暗号鍵の守りには寄与しない
- **PIN** = 秘密鍵バックアップ(暗号化)を守る。E2E暗号化は「サーバー側のデータが漏れても読めない」が前提であり、ログインを経由しない漏洩(Rules設定ミス・運営事故・内部者)に対する最後の砦はPINの強度とレート制限だけ
- したがって**TOTP導入を理由にPIN強化計画を軽くしない**

### 4. PIN保護: Pythia再実装は不採用、KMS+レート制限方式で代替

現行(Virgil利用中)はPythiaの保護があるため**PINは現状維持でよい**。脱Virgil(DEK移行)後は以下で代替する。

- Pythiaプロトコル自体の再実装は**非推奨**(ペアリング暗号ベースの研究レベルプロトコル。実装ミス=全ユーザー鍵漏洩)
- Pythiaの実益は「①ブロブが漏れてもオフライン総当たり不可 ②サーバー側レート制限」の2点であり、GCP部品で再現可能

**推奨構成(数日規模)**:
```
1. クライアント: k = Argon2(PIN, salt) を計算しFunctionsへ
2. Functions: Firestoreの試行カウンタ確認(例: 5回失敗で1時間ロック、10回で管理者解除必須)
3. Functions: Cloud KMSのMAC鍵で KEK = HMAC(kms_key, k + uid) を計算して返却
4. クライアント: KEKで秘密鍵ブロブを復号
```
- HMAC鍵はCloud KMS(エクスポート不能)に置く → ブロブ+Functionsコードが漏れても1試行ごとにKMS呼び出しが必要=オフライン総当たり不可がインフラの性質として担保。監査ログも残る
- Security Rulesでブロブへのクライアント直接読み取りは禁止(Functions経由のみ)
- OPRF(RFC 9497)で「サーバーもPINを知らない」性質まで実装する案は**不採用**: Web版は運営がホスティングするJSを配布する構造上、悪意ある運営者への耐性はどのみち成立せず、割に合わない
- PINは**6桁化+弱PIN拒否**(連番・同一数字等)をDEK移行と同時に実施(既定方針の通り)

### 5. 中期的に脱Virgilへ拡張(方向性の更新)

2026-06のDEK設計では「Virgil維持」と判断したが、その根拠は「Keyknox/Pythia(PIN鍵復元)という難所を任せられる」ことだった。上記4のKMS方式でPythia相当を自前確立できる見通しが立ったため、**中期的には脱Virgilまで進める方向に更新**する(最終判断は実装フェーズの設計時)。

- DEK方式でもVirgil依存は残る(鍵ペア管理・公開鍵配布=Cards・PINバックアップ=Keyknox/Pythia・JWT発行)。ただしデータ本体は自前AES(DEK)になるため、Virgil終了時も「鍵ペア差し替え+DEK再ラップ」だけで逃げられる構造にはなっている(実装済みPhase i/iiはこの避難経路として既に価値がある)
- 脱Virgil時の構成:
  - 鍵ペア生成: libsodium/tweetnacl
  - 公開鍵配布: Firestoreのユーザードキュメント(書き込みはSecurity Rulesで制限。Cards代替)
  - 秘密鍵バックアップ: 上記4のKMS方式(Keyknox/Pythia代替)
  - Virgil JWT発行(`generate-virgil-jwt.ts`)は不要になる
- これでE3Kitのネイティブモジュール依存ごと排除できる
- 実装済みのDEK Phase i/ii(段階移行・dual-read)はそのまま活かす。置換対象は鍵ペア/バックアップ層のみ

### 6. 事業(有料化)との関係

- MFA(TOTP)は自治体・大手コンサルの調達要件/セキュリティチェックシートの定番項目であり、**組織向け有料プランの構成要素**になり得る(SSO・監査ログと並ぶ)
- 有料化するなら、顧客への継続性の約束の観点から脱Virgilを先に済ませるのが望ましい

## 実装順序(案)

1. TOTP MFA(コンソール有効化 → 登録/サインインUI → 管理者によるMFA解除フロー)
2. DEK Phase i/iiのロールアウト(実装済み。Rulesデプロイ → 読み込み対応版の全配布 → フラグON)
3. 脱Virgil(自前鍵ペア + KMS方式PINバックアップ + 6桁PIN化・弱PIN拒否)
4. (1のMFA解除フローと3の管理者ロック解除フローは、管理者メンバー管理画面として共通設計にする)

## 注意事項

- **AuthenticationのApp Check enforceは厳禁**(iOSの検証済み比率が上がるまで。有効化するとiOSログインが全滅する)。MFA有効化自体はenforceと独立なので問題ないが、同じコンソール周りを触る際に注意
- MFAのリカバリーフローがないまま必須化すると現場担当者が締め出される。リカバリー実装を先行させること
