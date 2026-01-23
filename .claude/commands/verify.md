# 検証コマンド

コードベースの包括的な検証を実行します。

## 使用方法

```
/verify [quick|full|pre-commit|pre-pr]
```

## 引数

| 引数 | 説明 |
|------|------|
| `quick` | ビルドと型チェックのみ |
| `full` | 全チェック（デフォルト） |
| `pre-commit` | コミット関連チェック |
| `pre-pr` | セキュリティスキャン付きの全チェック |

## 検証項目

### 1. ビルド確認

```bash
# Web版ビルド
yarn build:web
```

### 2. 型チェック

```bash
npx tsc --noEmit
```

### 3. リント確認

```bash
yarn lint
```

### 4. テストスイート

```bash
yarn test
yarn test:coverage
```

### 5. console.log監査

ソースファイル内の`console.log`を検索し、本番コードに残っていないか確認。

```bash
grep -r "console.log" src/ --include="*.ts" --include="*.tsx"
```

### 6. センシティブファイルチェック

以下のファイルがコミットされていないか確認：
- `.env*`
- `google-services.json`
- `GoogleService-Info.plist`
- `src/constants/APIKeys.ts`

### 7. Git状態

```bash
git status
git diff --stat
```

## 出力形式

```
========================================
        検証レポート
========================================

ビルド:        ✓ PASS / ✗ FAIL
型チェック:    ✓ PASS / ✗ FAIL
リント:        ✓ PASS / ✗ FAIL
テスト:        ✓ PASS / ✗ FAIL
カバレッジ:    XX%
console.log:   ✓ なし / ✗ 検出
センシティブ:  ✓ 安全 / ✗ 要確認

========================================
PR準備完了:    YES / NO
========================================
```

## カバレッジ要件

| ディレクトリ | 最低カバレッジ |
|-------------|---------------|
| `src/modules/**` | 60% |
| `src/utils/**` | 40% |
| `src/hooks/**` | 30% |
| global | 20% |

## 検証が失敗した場合

1. **ビルドエラー**: `/build-fix`コマンドで解決
2. **型エラー**: エラーメッセージに従って修正
3. **リントエラー**: `yarn lint --fix`で自動修正
4. **テスト失敗**: `/tdd`コマンドでテスト修正
5. **console.log検出**: 本番コードから削除

## プラットフォーム別確認

全プラットフォームでの動作確認が推奨されます：

- [ ] iOS: `yarn ios`
- [ ] Android: `yarn android`
- [ ] Web: `yarn web`
