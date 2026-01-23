# 評価駆動開発コマンド

評価基準を定義し、コードの品質を継続的にチェックします。

## 使用方法

```
/eval [サブコマンド] [オプション]
```

## サブコマンド

### define - 評価定義の作成

新しい評価基準を定義します。

```
/eval define [評価名]
```

#### 評価定義の例

```yaml
# .claude/evals/auth-flow.yaml
name: auth-flow
description: 認証フローの評価
criteria:
  - name: security
    description: セキュリティ要件
    checks:
      - email_verified確認が必須
      - パスワードハッシュの適切な処理
      - セッション管理の安全性
    weight: 40
  - name: ux
    description: ユーザー体験
    checks:
      - エラーメッセージが明確
      - ローディング状態の表示
      - 入力バリデーションの即時フィードバック
    weight: 30
  - name: code_quality
    description: コード品質
    checks:
      - TypeScript型安全性
      - テストカバレッジ60%以上
      - ESLintエラーなし
    weight: 30
```

### check - 評価の実行

定義された評価基準に基づいてチェックを実行します。

```
/eval check [評価名またはall]
```

#### チェック実行の流れ

1. 評価定義の読み込み
2. 関連コードの特定
3. 各チェック項目の実行
4. スコア計算
5. 結果レポート生成

### report - レポート生成

評価結果の詳細レポートを生成します。

```
/eval report [評価名] [--format=markdown|json|html]
```

#### レポートフォーマット

```markdown
## 評価レポート: [評価名]

### サマリー
- **総合スコア**: 85/100
- **評価日時**: 2024-01-15 10:30
- **対象ファイル数**: 12

### カテゴリ別スコア

| カテゴリ | スコア | 重み | 加重スコア |
|---------|--------|------|-----------|
| security | 90% | 40% | 36pt |
| ux | 80% | 30% | 24pt |
| code_quality | 83% | 30% | 25pt |

### 詳細

#### ✅ パスした項目
- [security] email_verified確認が必須
- [security] パスワードハッシュの適切な処理
- [ux] エラーメッセージが明確

#### ⚠️ 改善が必要な項目
- [ux] ローディング状態の表示
  - **現状**: 一部画面でローディング表示なし
  - **推奨**: 全ての非同期処理にローディングインジケータを追加

#### ❌ 失敗した項目
- [code_quality] テストカバレッジ60%以上
  - **現状**: 45%
  - **必要なアクション**: 認証関連テストの追加

### 推奨アクション
1. テストカバレッジを60%以上に向上
2. ローディング状態の表示を追加
```

### list - 一覧表示

定義された評価の一覧を表示します。

```
/eval list
```

## 組み込み評価基準

### EcorisMap標準評価

| 評価名 | 対象 | 説明 |
|--------|------|------|
| `security-basic` | 全体 | 基本的なセキュリティチェック |
| `typescript-strict` | TypeScript | 型安全性チェック |
| `coverage-targets` | テスト | カバレッジ要件チェック |
| `platform-compat` | コンポーネント | クロスプラットフォーム互換性 |
| `performance` | 全体 | パフォーマンス関連チェック |

## カスタム評価の作成

### 1. 評価ファイルの作成

`.claude/evals/`ディレクトリに評価定義を作成します。

### 2. チェック関数の定義

```typescript
// .claude/evals/custom-eval.ts
export const customChecks = {
  async checkFeature(files: string[]): Promise<CheckResult> {
    // チェックロジック
    return {
      passed: true,
      message: 'チェック通過',
      details: []
    };
  }
};
```

### 3. 評価の実行

```
/eval check custom-eval
```

## 引数

`$ARGUMENTS`で以下を指定可能：

- `define [名前]` - 新規評価定義
- `check [名前|all]` - 評価実行
- `report [名前]` - レポート生成
- `list` - 一覧表示

## CI/CD統合

### GitHub Actionsでの使用

```yaml
- name: Run Evaluations
  run: |
    claude /eval check all --format=json > eval-results.json

- name: Check Thresholds
  run: |
    node scripts/check-eval-thresholds.js eval-results.json
```

## 注意事項

- 評価基準は定期的に見直してください
- 重みは合計100%になるように設定
- チェック項目は具体的で測定可能なものに
