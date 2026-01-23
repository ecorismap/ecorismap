# ドキュメント更新コマンド

プロジェクトの主要な設定ファイルを基に、ドキュメントを自動生成・更新します。

## 使用方法

```
/update-docs [対象]
```

## 引数

| 引数 | 説明 |
|------|------|
| `all` | 全ドキュメント更新（デフォルト） |
| `readme` | README.mdのみ |
| `claude` | CLAUDE.mdのみ |
| `api` | APIドキュメントのみ |

## 処理内容

### 1. package.jsonスクリプト解析

`package.json`のscriptsセクションを読み込み、利用可能なコマンドの一覧を生成。

```json
// 入力例
{
  "scripts": {
    "start": "expo start",
    "ios": "expo run:ios",
    "android": "expo run:android"
  }
}
```

```markdown
// 出力例
| コマンド | 説明 |
|---------|------|
| `yarn start` | Expo開発サーバー起動 |
| `yarn ios` | iOSシミュレータ起動 |
| `yarn android` | Androidエミュレータ起動 |
```

### 2. 環境変数の抽出

`.env.example`がある場合、環境変数の一覧を生成。

### 3. ディレクトリ構造の更新

`src/`ディレクトリの構造を解析し、アーキテクチャドキュメントを更新。

### 4. 依存関係の確認

`package.json`から主要な依存関係を抽出し、技術スタックセクションを更新。

### 5. 陳腐化したドキュメント検出

最終更新から90日以上経過したドキュメントを特定し、レビュー対象としてリスト化。

```bash
# 90日以上更新のないmdファイルを検索
find docs/ -name "*.md" -mtime +90
```

## 更新対象ファイル

| ファイル | 内容 |
|----------|------|
| `CLAUDE.md` | Claude Code用のプロジェクト情報 |
| `README.md` | プロジェクト概要 |
| `docs/ARCHITECTURE.md` | アーキテクチャ説明 |
| `docs/CONTRIBUTING.md` | コントリビューションガイド |
| `docs/API.md` | API仕様 |

## 情報源

以下のファイルを唯一の情報源として使用し、ドキュメントの正確性と最新性を保証：

- `package.json` - スクリプト、依存関係
- `tsconfig.json` - TypeScript設定
- `app.json` - Expo設定
- `firebase.json` - Firebase設定
- `.env.example` - 環境変数（存在する場合）

## 差分表示

更新前後の差分を表示し、変更内容を確認できます。

```diff
- ## 技術スタック
- - React Native 0.70
+ ## 技術スタック
+ - React Native 0.79.5
```

## 注意事項

- 自動生成されたセクションは手動で編集しない
- カスタムコンテンツは専用セクションに記載
- 機密情報（APIキー等）はドキュメントに含めない

## 関連コマンド

- `/verify` - 変更後の検証
- `/commit` - 変更のコミット
