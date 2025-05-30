# ecorismap プロジェクト改善提案

このドキュメントは、ecorismapプロジェクトの包括的な分析に基づいて特定された改善点をまとめたものです。

## 🔴 高優先度の改善点（影響度：大）

### 1. テストカバレッジと品質
- **カバレッジレポートの未設定**: Jestセットアップにカバレッジ設定が不足
- **テストファイル命名の不統一**: `.test.ts`と`.spec.ts`パターンが混在
- **E2Eテストフレームワークの欠如**: DetoxやMaestroなどのモバイルテストツールが未導入
- **統合テストの不足**: ほとんどがユニットテストのみ

**推奨アクション:**
```json
{
  "jest": {
    "collectCoverage": true,
    "coverageThreshold": {
      "global": {
        "branches": 70,
        "functions": 70,
        "lines": 70,
        "statements": 70
      }
    }
  }
}
```

### 2. TypeScript設定の強化
- **最小限のtsconfig**: ベース設定を拡張し、2つのオプションのみ
- **厳密オプションの欠如**: `strictNullChecks`、`noImplicitAny`などが未設定
- **パスエイリアスの未設定**: `../../../utils/Data`のようなインポートを改善可能
- **宣言マップの欠如**: より良いIDE支援のための`declarationMap`が未設定

**推奨アクション:**
```json
{
  "compilerOptions": {
    "baseUrl": "./",
    "paths": {
      "@/*": ["src/*"],
      "@components/*": ["src/components/*"],
      "@utils/*": ["src/utils/*"],
      "@hooks/*": ["src/hooks/*"]
    },
    "strictNullChecks": true,
    "noImplicitAny": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "declarationMap": true
  }
}
```

### 3. セキュリティ脆弱性
- **古い依存関係**: 複数のパッケージ更新が必要（例：`react-native-web@0.19.12`）
- **セキュリティスキャンの欠如**: CI/CDスクリプトに`npm audit`などが未実装
- **APIキー管理**: テンプレートファイルから手動管理が示唆される
- **依存関係の脆弱性スキャンなし**: パッケージスクリプトに未実装

**推奨アクション:**
```json
{
  "scripts": {
    "audit": "npm audit --audit-level=moderate",
    "audit:fix": "npm audit fix",
    "audit:ci": "npm audit --audit-level=moderate --production"
  }
}
```

### 4. ビルド設定
- **本番ビルド最適化の欠如**: terser、bundle analyzerが未設定
- **Webのソースマップ無効化**: `GENERATE_SOURCEMAP=false`でデバッグ能力が低下
- **環境別ビルドの欠如**: 全環境で単一のビルド設定
- **CI/CDスクリプトの欠如**: 自動ビルド/テスト/デプロイスクリプトなし

## 🟡 中優先度の改善点（影響度：中）

### 5. コード品質と一貫性
- **ESLint複雑度ルール無効**: `//complexity: ["error", 10]`がコメントアウト
- **コンソール警告のみ**: `no-console: "warn"`は本番環境ではerrorにすべき
- **pre-commitフックなし**: コード品質強制のためのhusky/lint-stagedが未設定
- **13個のTODO/FIXMEコメント**: 技術的負債が体系的に追跡されていない

**推奨アクション:**
```bash
npm install --save-dev husky lint-staged
npx husky init
```

### 6. パフォーマンス最適化
- **大きなバンドルサイズ**: 150以上の依存関係で明確なバンドル最適化なし
- **コード分割戦略なし**: ルート/機能の遅延読み込みが未実装
- **パフォーマンス監視なし**: React DevTools Profiler設定などが未実装
- **重い依存関係**: 複数の大きなライブラリ（GDAL、PDF.jsなど）

**推奨アクション:**
```json
{
  "scripts": {
    "analyze": "webpack-bundle-analyzer ./web-build/stats.json",
    "analyze:size": "size-limit"
  }
}
```

### 7. ドキュメント
- **APIドキュメントの欠如**: JSDocやTypeDoc設定なし
- **アーキテクチャ図なし**: 複雑なマルチプラットフォームアプリに視覚的ドキュメントが必要
- **限定的なインラインドキュメント**: TODO/FIXME検索結果に基づく
- **貢献ガイドラインなし**: CONTRIBUTING.mdが未作成

### 8. 依存関係管理
- **混在するバージョン**: 一部は正確なバージョン、他は範囲指定
- **patch-packageの使用**: 10以上のパッチは上流の問題を示唆
- **大きな依存関係ツリー**: 150以上の直接依存関係（統合を検討）
- **プラットフォーム固有の依存関係の混在**: より良い整理が可能

## 🟢 低優先度の改善点（あれば良い）

### 9. 開発者体験
- **Storybookなし**: コンポーネント開発/ドキュメントに有用
- **VS Codeワークスペース設定なし**: チーム一貫性のための`.vscode`フォルダなし
- **デバッグ設定なし**: デバッグ用のlaunch.jsonが未設定
- **限定的なnpmスクリプト**: より多くのユーティリティスクリプトを追加可能

### 10. プロジェクト構造
- **深いネスト**: 一部のインポートは3-4レベルの深さになる可能性
- **混在する命名規則**: ファイルにPascalCaseとcamelCaseが混在
- **大きなコンポーネントファイル**: pagesフォルダは潜在的に大きなコンポーネントを示唆
- **バレルエクスポートなし**: よりクリーンなインポートのためのindex.tsファイルが欠如

## 📋 具体的な実装手順

### 即座に実施すべきアクション

1. **テストカバレッジの追加**
2. **TypeScript設定の強化**
3. **セキュリティスキャンの追加**
4. **pre-commitフックのセットアップ**
5. **バンドル分析の追加**

### 長期的な改善

- より良い組織化のためのモノレポ構造（NxまたはTurborepo）への移行
- 段階的なロールアウトのための機能フラグの実装
- パフォーマンス監視の追加（Sentry、LogRocket）
- Storybookでコンポーネントライブラリの作成
- GitHub Actionsなどでの適切なCI/CDパイプラインの実装

## 実装優先順位

1. **第1フェーズ（1-2週間）**
   - テストカバレッジ設定
   - TypeScript設定強化
   - セキュリティスキャンスクリプト
   - pre-commitフック

2. **第2フェーズ（2-4週間）**
   - ビルド最適化
   - パフォーマンス分析ツール
   - 依存関係の更新と整理

3. **第3フェーズ（1-2ヶ月）**
   - E2Eテストフレームワーク
   - ドキュメント整備
   - CI/CDパイプライン構築

4. **第4フェーズ（継続的）**
   - コンポーネントライブラリ化
   - パフォーマンス監視
   - アーキテクチャの継続的改善