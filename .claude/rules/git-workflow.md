# Gitワークフロー

EcorisMapプロジェクトのGit運用規約です。

## ブランチ戦略

### メインブランチ
- `main` - 本番リリース用

### 開発ブランチ
- `feature/*` - 新機能開発
- `fix/*` - バグ修正
- `refactor/*` - リファクタリング

## コミットメッセージ

### 形式
```
[種類] 変更内容の要約

詳細な説明（必要に応じて）
```

### 種類
| 種類 | 用途 |
|------|------|
| 追加 | 新機能 |
| 修正 | バグ修正 |
| 改善 | 既存機能の改善 |
| リファクタ | コード整理 |
| テスト | テスト追加・修正 |
| ドキュメント | ドキュメント更新 |
| 依存関係 | パッケージ更新 |

### 例
```
追加: ログイン画面のバリデーション機能

- メールアドレス形式チェック
- パスワード強度チェック
- エラーメッセージの日本語化
```

## コミット前チェック

### 必須
```bash
# 型チェック
npx tsc --noEmit

# リント
yarn lint

# テスト
yarn test
```

### 推奨
```bash
# カバレッジ確認
yarn test:coverage
```

## プルリクエスト

### タイトル形式
```
[種類] 変更内容の要約
```

### 本文テンプレート
```markdown
## 概要
[変更内容の説明]

## 変更内容
- [変更点1]
- [変更点2]

## テスト
- [ ] 型チェック通過
- [ ] リント通過
- [ ] テスト通過
- [ ] iOS動作確認
- [ ] Android動作確認
- [ ] Web動作確認

## 関連Issue
#XXX
```

## 禁止事項

### コミットしてはいけないファイル
- `.env*`
- `google-services.json`
- `GoogleService-Info.plist`
- `src/constants/APIKeys.ts`

### 禁止コマンド
```bash
# 強制プッシュ（mainブランチ）
git push --force origin main

# フック無視
git commit --no-verify
```

## Claude Codeの動作ルール

### コミット実行
- コミットはユーザーからの明示的な指示（`/commit`コマンドなど）がある場合のみ実行
- 作業完了時に自動的にコミットを提案・実行しない
- ステージング（`git add`）も明示的な指示がある場合のみ実行

### プッシュ実行
- プッシュはユーザーからの明示的な指示がある場合のみ実行

## .gitignore

### 必須除外
```
# 環境設定
.env*
*.local

# 認証情報
google-services.json
GoogleService-Info.plist
src/constants/APIKeys.ts

# ビルド成果物
node_modules/
dist/
build/
*.ipa
*.apk
*.aab

# IDE
.idea/
.vscode/
*.swp
```

## マージ戦略

### feature → main
- Squash and merge（コミット履歴を整理）
- PRタイトルがマージコミットメッセージになる

### hotfix → main
- Merge commit（履歴を保持）

## バージョン管理

### セマンティックバージョニング
```
MAJOR.MINOR.PATCH
```

- MAJOR: 後方互換性のない変更
- MINOR: 後方互換性のある機能追加
- PATCH: バグ修正

### 更新ファイル
- `package.json`
- `app.json` (Expo)
