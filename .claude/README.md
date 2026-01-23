# Claude Code設定

EcorisMapプロジェクトのClaude Code設定ディレクトリです。

## インストール方法

### 方法1: プラグインとしてインストール（推奨）

Claude Code内で実行：
```
/plugin install ecorismap-claude-config
```

### 方法2: settings.jsonに直接設定

`~/.claude/settings.json`に追加：
```json
{
  "extraKnownMarketplaces": {
    "ecorismap-claude-config": {
      "source": { "type": "local", "path": ".claude" }
    }
  },
  "enabledPlugins": {
    "ecorismap-claude-config": true
  }
}
```

### 方法3: 手動コピー

```bash
# エージェント
cp .claude/agents/*.md ~/.claude/agents/

# コマンド
cp .claude/commands/*.md ~/.claude/commands/

# ルール
cp .claude/rules/*.md ~/.claude/rules/

# スキル
cp -r .claude/skills/* ~/.claude/skills/

# フック（settings.jsonにマージ）
# .claude/hooks/hooks.json の内容を追加
```

### MCP設定

`.claude/mcp-configs/mcp-servers.json`の`mcpServers`セクションを
`~/.claude/settings.json`にコピーし、プレースホルダーを置換：

- `YOUR_GITHUB_TOKEN_HERE` → GitHubパーソナルアクセストークン
- `YOUR_PROJECT_PATH_HERE` → プロジェクトパス

## ディレクトリ構造

```
.claude/
├── agents/           # カスタムエージェント定義
├── commands/         # スラッシュコマンド定義
├── rules/            # コーディング規約・ルール
├── skills/           # 開発スキル・パターン集
├── hooks/            # イベントフック設定
├── scripts/          # 自動化スクリプト
├── plugins/          # プラグイン設定
├── contexts/         # コンテキスト定義
├── mcp-configs/      # MCPサーバー設定
├── examples/         # 設定例・テンプレート
├── tests/            # 設定テスト
├── README.md         # このファイル
├── CONTRIBUTING.md   # 貢献ガイド
└── .gitignore        # 除外設定
```

## クイックスタート

### スラッシュコマンドの使用

```bash
/commit          # コミット作成
/tdd             # TDD開発フロー
/code-review     # コードレビュー
/verify          # 包括的検証
/orchestrate feature [説明]  # 機能開発ワークフロー
```

### エージェントの呼び出し

エージェントはTask toolで自動的に呼び出されます：

- `code-reviewer` - コードレビュー
- `tdd-guide` - TDD開発支援
- `security-reviewer` - セキュリティレビュー
- `planner` - 実装計画立案

## 設定一覧

### エージェント（10種）

| エージェント | 説明 |
|-------------|------|
| architect | システム設計・アーキテクチャ決定 |
| build-error-resolver | ビルドエラー解決 |
| code-refactoring-cleaner | リファクタリング支援 |
| code-reviewer | コード品質レビュー |
| context-migration | Context分割支援 |
| doc-updater | ドキュメント更新 |
| e2e-runner | E2Eテスト実行 |
| planner | 実装計画立案 |
| security-reviewer | セキュリティレビュー |
| tdd-guide | TDD開発ガイド |

### コマンド（18種）

| コマンド | 説明 |
|---------|------|
| build-fix | ビルドエラー解決 |
| checkpoint | チェックポイント管理 |
| code-review | コードレビュー実行 |
| commit | Gitコミット作成 |
| coverage | カバレッジレポート |
| e2e | E2Eテスト実行 |
| eval | 評価駆動開発 |
| learn | パターン学習 |
| orchestrate | ワークフロー実行 |
| plan | 機能計画作成 |
| platform-check | プラットフォーム整合性 |
| refactor-clean | リファクタリング |
| setup-pm | パッケージマネージャー設定 |
| tdd | TDD開発フロー |
| update-codemaps | コードマップ更新 |
| update-docs | ドキュメント更新 |
| verify | 包括的検証 |

### ルール（7種）

| ルール | 説明 |
|--------|------|
| coding-style | コーディングスタイル |
| geospatial | 地理空間データ処理 |
| git-workflow | Gitワークフロー |
| performance | パフォーマンス最適化 |
| platform-specific | クロスプラットフォーム |
| security | セキュリティ要件 |
| testing | テスト要件 |

## カスタマイズ

### 新しいコマンドの追加

1. `commands/`に`.md`ファイルを作成
2. コマンド名、説明、手順を記載
3. `$ARGUMENTS`で引数を参照可能

### 新しいエージェントの追加

1. `agents/`に`.md`ファイルを作成
2. YAMLフロントマターでメタデータを設定
3. プロンプト本文を記載

### 新しいルールの追加

1. `rules/`に`.md`ファイルを作成
2. ルール内容をMarkdownで記載
3. CLAUDE.mdのルールファイル一覧を更新

## テスト実行

```bash
# 全テスト実行
node .claude/tests/run-all.js

# 詳細出力
node .claude/tests/run-all.js --verbose

# 特定テストのみ
node .claude/tests/run-all.js --filter=hooks
```

## 詳細ドキュメント

- [CONTRIBUTING.md](./CONTRIBUTING.md) - 貢献ガイド
- [examples/](./examples/) - 設定例
- [CLAUDE.md](../CLAUDE.md) - プロジェクト設定

## 関連リンク

- [Claude Code公式ドキュメント](https://docs.anthropic.com/claude-code)
- [EcorisMapリポジトリ](https://github.com/ecorismap/ecorismap)
