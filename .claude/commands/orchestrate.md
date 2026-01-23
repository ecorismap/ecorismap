# オーケストレーションコマンド

複雑なタスクに対して複数のエージェントを協調させてワークフローを実行します。

## 使用方法

```
/orchestrate [ワークフロー名] [タスク説明]
```

## 定義済みワークフロー

### feature - 新機能開発

新機能の実装に最適化されたワークフローです。

```
/orchestrate feature [機能の説明]
```

#### 実行フロー

```
1. planner エージェント
   ↓ 実装計画の立案
2. tdd-guide エージェント
   ↓ テスト駆動開発
3. code-reviewer エージェント
   ↓ コードレビュー
4. security-reviewer エージェント
   ↓ セキュリティレビュー
5. doc-updater エージェント（必要に応じて）
   ↓ ドキュメント更新
```

#### 例

```
/orchestrate feature ユーザーのプロフィール画像アップロード機能を追加
```

### bugfix - バグ修正

バグ修正に最適化されたワークフローです。

```
/orchestrate bugfix [バグの説明]
```

#### 実行フロー

```
1. Explore エージェント
   ↓ 問題箇所の特定
2. tdd-guide エージェント
   ↓ 再現テスト作成 → 修正 → リグレッションテスト
3. code-reviewer エージェント
   ↓ 修正のレビュー
```

#### 例

```
/orchestrate bugfix ログイン時にローディングが消えない問題を修正
```

### refactor - リファクタリング

既存コードの改善に最適化されたワークフローです。

```
/orchestrate refactor [リファクタリング対象と目標]
```

#### 実行フロー

```
1. planner エージェント
   ↓ リファクタリング計画
2. code-refactoring-cleaner エージェント
   ↓ コード改善実行
3. tdd-guide エージェント
   ↓ リグレッションテスト確認
4. code-reviewer エージェント
   ↓ リファクタリング結果のレビュー
```

#### 例

```
/orchestrate refactor HomeContextを小さなContextに分割
```

### security - セキュリティ強化

セキュリティ改善に最適化されたワークフローです。

```
/orchestrate security [対象領域]
```

#### 実行フロー

```
1. security-reviewer エージェント
   ↓ セキュリティ監査
2. planner エージェント
   ↓ 改善計画立案
3. tdd-guide エージェント
   ↓ セキュリティテスト作成 → 実装
4. security-reviewer エージェント
   ↓ 改善結果の検証
```

#### 例

```
/orchestrate security Firebase認証周りのセキュリティ強化
```

### migration - マイグレーション

データ構造や依存関係の移行に最適化されたワークフローです。

```
/orchestrate migration [移行内容]
```

#### 実行フロー

```
1. Explore エージェント
   ↓ 影響範囲の調査
2. planner エージェント
   ↓ 移行計画
3. context-migration エージェント
   ↓ 段階的移行実行
4. code-reviewer エージェント
   ↓ 移行結果のレビュー
5. tdd-guide エージェント
   ↓ リグレッションテスト
```

#### 例

```
/orchestrate migration AsyncStorageからMMKVへの移行
```

## カスタムワークフロー

### 定義方法

`.claude/workflows/`ディレクトリにワークフロー定義を作成できます。

```yaml
# .claude/workflows/custom-workflow.yaml
name: custom-workflow
description: カスタムワークフロー

steps:
  - agent: planner
    input: "{{task}}"
    output: plan

  - agent: tdd-guide
    input: "{{plan}}"
    condition: "plan.requires_code"

  - agent: code-reviewer
    input: "最新の変更をレビュー"

checkpoints:
  - after: planner
    require_approval: true

  - after: tdd-guide
    validate:
      - tests_pass
      - coverage_threshold
```

### 実行

```
/orchestrate custom-workflow [タスク説明]
```

## ワークフロー制御

### チェックポイント

各エージェント完了後にユーザー確認を挿入できます。

```
/orchestrate feature --checkpoint-after=planner
```

### スキップ

特定のエージェントをスキップできます。

```
/orchestrate feature --skip=doc-updater
```

### ドライラン

実行せずにワークフローを確認できます。

```
/orchestrate feature --dry-run
```

## 出力フォーマット

### ワークフロー進捗

```
📋 ワークフロー: feature
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[✅] Step 1/5: planner
     実装計画を立案しました

[🔄] Step 2/5: tdd-guide
     テスト作成中...

[⏳] Step 3/5: code-reviewer
[⏳] Step 4/5: security-reviewer
[⏳] Step 5/5: doc-updater

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
進捗: 40% (2/5 完了)
```

### 最終レポート

```markdown
## 🎉 ワークフロー完了: feature

### 実行サマリー
- **開始**: 2024-01-15 10:00
- **完了**: 2024-01-15 10:30
- **実行時間**: 30分

### エージェント結果

| エージェント | 状態 | 主な成果 |
|-------------|------|---------|
| planner | ✅ | 5ステップの実装計画 |
| tdd-guide | ✅ | 12テスト追加、カバレッジ65% |
| code-reviewer | ✅ | 3件の改善提案 |
| security-reviewer | ✅ | 問題なし |
| doc-updater | ⏭️ スキップ | ドキュメント更新不要 |

### 成果物
- `src/components/ProfileImage.tsx` - 新規
- `src/hooks/useImageUpload.ts` - 新規
- `__tests__/useImageUpload.test.ts` - 新規

### 次のステップ
1. PR作成を検討
2. iOS/Android/Webでの動作確認
```

## 引数

`$ARGUMENTS`で以下を指定：

```
/orchestrate [ワークフロー名] [タスク説明] [オプション]

ワークフロー名:
  - feature    新機能開発
  - bugfix     バグ修正
  - refactor   リファクタリング
  - security   セキュリティ強化
  - migration  マイグレーション

オプション:
  --checkpoint-after=[agent]  指定エージェント後に確認
  --skip=[agent]              指定エージェントをスキップ
  --dry-run                   ドライラン
  --parallel                  可能な限り並列実行
```

## 注意事項

- 各エージェントの結果は次のエージェントに引き継がれます
- エラーが発生した場合、ワークフローは一時停止します
- 長時間のワークフローは`--checkpoint-after`を活用してください
