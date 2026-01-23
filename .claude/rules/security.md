# セキュリティルール

EcorisMapプロジェクトにおけるセキュリティ遵守事項です。

## 必須チェック項目

### 1. 認証・認可

#### Firebase Authentication
- 全ての保護されたリソースアクセス前に認証状態を確認
- `email_verified === true` の確認が必須
- UIDベースのアクセス制御を徹底

#### ロールベースアクセス制御
```
Owner > Admin > Member
```
- Owner: 全権限
- Admin: メンバー管理、データ編集
- Member: データ閲覧、自分のデータ編集

### 2. データ保護

#### 暗号化
- Virgil E3Kitを使用した共有プロジェクトの暗号化
- `encdata`フィールドには暗号化データを格納
- `encryptedAt`フィールドで暗号化タイムスタンプを記録
- 鍵管理は`virgil-func.ts`のパターンに従う

#### センシティブデータ
以下のファイルは絶対にコミットしない：
- `.env*`
- `google-services.json`
- `GoogleService-Info.plist`
- `src/constants/APIKeys.ts`（開発/本番切り替え用）

### 3. Firebase Security Rules

#### 基本原則
- 認証済みユーザー（email_verified）のみアクセス許可
- ドキュメント所有者の確認
- permissionフィールドによるアクセス制御

#### permission値
| 値 | 説明 |
|---|---|
| PRIVATE | 作成者のみアクセス可能 |
| PUBLIC | 全員閲覧可能 |
| COMMON | プロジェクトメンバー共有 |
| TEMPLATE | テンプレートとして公開 |

#### ルール変更時
```bash
# 必ずエミュレータでテスト
yarn testemu
```

### 4. ファイルアップロード

#### サイズ制限
- 最大20MB

#### 許可ファイルタイプ
- PNG, JPEG（画像）
- PDF（ドキュメント）
- SQLite3（データベース）

### 5. 禁止事項

- APIキーのハードコード（環境変数を使用）
- Firebase Admin SDKのクライアント側使用
- 認証なしでのFirestoreアクセス
- Security Rulesテストなしでのルール変更

## 脆弱性発見時の対応

1. 即座に作業を中断
2. 問題の範囲を特定
3. 認証情報が漏洩した場合はローテーション
4. 修正をコミットする前にセキュリティレビューを実施
