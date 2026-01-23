# チェックポイントコマンド

ワークフロー内でチェックポイントを作成・検証・一覧表示します。

## 使用方法

```
/checkpoint [create|verify|list|clear] [name]
```

## サブコマンド

| サブコマンド | 説明 |
|-------------|------|
| `create <name>` | 名前付きチェックポイント作成 |
| `verify <name>` | チェックポイントと比較検証 |
| `list` | 全チェックポイント表示 |
| `clear` | 古いチェックポイント削除（最新5件保持） |

## 機能

### チェックポイント作成

現在の状態を記録します：
- Gitコミットハッシュ
- テスト結果
- カバレッジ
- ファイル変更状態

```bash
/checkpoint create feature-start

# 出力例
チェックポイント作成: feature-start
  - Git SHA: abc1234
  - テスト: 全パス
  - カバレッジ: 45%
  - 変更ファイル: 0
```

### チェックポイント検証

チェックポイント以降の変更を比較します：

```bash
/checkpoint verify feature-start

# 出力例
チェックポイント検証: feature-start
========================================
ファイル変更:
  + src/utils/newUtil.ts (追加)
  M src/components/Map.tsx (変更)

テスト結果:
  - 新規テスト: 5件
  - 失敗: 0件

カバレッジ:
  - 開始時: 45%
  - 現在: 48% (+3%)
========================================
```

### チェックポイント一覧

```bash
/checkpoint list

# 出力例
チェックポイント一覧
========================================
1. feature-start
   - 作成: 2024-01-15 10:00
   - Git SHA: abc1234
   - ステータス: 有効

2. mid-implementation
   - 作成: 2024-01-15 14:00
   - Git SHA: def5678
   - ステータス: 有効
========================================
```

## 典型的なワークフロー

### 1. 機能開発開始時

```bash
/checkpoint create feature-login-start
```

### 2. 実装途中

```bash
/checkpoint create feature-login-progress
```

### 3. テスト段階

```bash
/checkpoint verify feature-login-start
```

### 4. PR前

```bash
/checkpoint verify feature-login-start
/verify pre-pr
```

## 保存場所

チェックポイント情報は `.claude/checkpoints.log` に記録されます。

```json
{
  "checkpoints": [
    {
      "name": "feature-start",
      "timestamp": "2024-01-15T10:00:00Z",
      "gitSha": "abc1234",
      "testStatus": "pass",
      "coverage": 45,
      "changedFiles": []
    }
  ]
}
```

## 注意事項

- チェックポイントはローカルにのみ保存
- `.claude/`ディレクトリは`.gitignore`に追加推奨
- 古いチェックポイントは定期的に`clear`で削除

## 関連コマンド

- `/verify` - 現在の状態を検証
- `/commit` - 変更をコミット
- `/tdd` - テスト駆動開発
