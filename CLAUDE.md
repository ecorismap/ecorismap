# CLAUDE.md

ユーザーとは日本語で対話してください。

## プロジェクト概要

EcorisMapは、React Native + Expoで構築されたクロスプラットフォーム（iOS/Android/Web）フィールド調査アプリケーションです。屋外調査で地図上に位置情報とデータを記録できます。

## Claude Code設定

### スラッシュコマンド

| コマンド | 説明 |
|---------|------|
| `/commit` | 変更内容を確認してコミット作成 |
| `/tdd` | テスト駆動開発フロー |
| `/e2e` | Playwright E2Eテスト実行 |
| `/build-fix` | iOS/Android/Webビルドエラー解決 |
| `/code-review` | コードレビュー実行 |
| `/plan` | 機能実装計画作成 |
| `/refactor-clean` | リファクタリング実行 |
| `/platform-check` | プラットフォーム整合性チェック |
| `/coverage` | カバレッジレポート生成 |
| `/verify` | 包括的検証（ビルド・型・リント・テスト） |
| `/update-docs` | ドキュメント自動更新 |
| `/checkpoint` | チェックポイント管理 |
| `/learn` | パターン学習・抽出 |
| `/eval` | 評価駆動開発（定義・実行・レポート） |
| `/orchestrate` | 複雑タスク向けエージェントワークフロー |
| `/setup-pm` | パッケージマネージャー検出・設定 |
| `/update-codemaps` | コードマップ（構造情報）更新 |

### エージェント

| エージェント | 説明 |
|-------------|------|
| `code-reviewer` | コード品質・ベストプラクティスのレビュー |
| `code-refactoring-cleaner` | リファクタリング・デッドコード削除 |
| `e2e-runner` | Playwright E2Eテスト自動化 |
| `build-error-resolver` | 3プラットフォームのビルドエラー解決 |
| `security-reviewer` | セキュリティ観点でのコードレビュー |
| `planner` | 複雑な機能の実装計画立案 |
| `doc-updater` | ドキュメントの同期・更新 |
| `context-migration` | HomeContext分割作業の支援 |
| `architect` | システム設計・アーキテクチャ決定 |
| `tdd-guide` | TDDスペシャリスト（Red-Green-Refactor） |

### スキル（.claude/skills/）

| スキル | 内容 |
|--------|------|
| `react-native-patterns` | React Native + Expo開発パターン |
| `geospatial-data` | GeoJSON・地理空間データ処理 |
| `firebase-patterns` | Firebase認証・Firestore・Security Rules |
| `cross-platform` | iOS/Android/Web対応パターン |
| `tdd-workflow` | テスト駆動開発フロー |
| `virgil-encryption` | E3Kit暗号化パターン |

### ルールファイル（.claude/rules/）

| ファイル | 内容 |
|---------|------|
| `security.md` | Firebase認証、Virgil暗号化、セキュリティ要件 |
| `testing.md` | カバレッジ要件、テストパターン |
| `coding-style.md` | TypeScript、Atomic Design、状態管理 |
| `platform-specific.md` | クロスプラットフォーム対応規約 |
| `git-workflow.md` | コミット形式、PR手順 |
| `performance.md` | パフォーマンス最適化 |
| `geospatial.md` | 地理空間データ処理 |

### プラグイン設定（.claude/plugins/）

EcorisMap専用のClaude Code設定をプラグインとして提供しています。

| ファイル | 内容 |
|---------|------|
| `plugin.json` | プラグインメタデータとコンポーネントパス |
| `marketplace.json` | マーケットプレイスカタログ設定 |

### コンテキスト（.claude/contexts/）

動的システムプロンプト注入用のコンテキスト定義です。

| ファイル | 用途 |
|---------|------|
| `dev.md` | 開発モード - 実装・コード作成に注力 |
| `research.md` | リサーチモード - 探索・調査・学習 |
| `review.md` | レビューモード - PR・コード分析 |

### MCP設定（.claude/mcp-configs/）

MCPサーバーの設定カタログです。

| ファイル | 内容 |
|---------|------|
| `mcp-servers.json` | 推奨MCPサーバーと設定 |

### スクリプト（.claude/scripts/）

クロスプラットフォーム対応のNode.jsユーティリティです。

| ファイル | 内容 |
|---------|------|
| `lib/utils.js` | 共通ユーティリティ関数 |
| `lib/package-manager.js` | パッケージマネージャー抽象化 |
| `hooks/pre-commit.js` | コミット前自動チェック |
| `hooks/post-checkout.js` | ブランチ切り替え後処理 |
| `verify.js` | 包括的検証スクリプト |

### サンプル・テスト（.claude/examples/, .claude/tests/）

| ディレクトリ | 内容 |
|-------------|------|
| `examples/CLAUDE.md` | CLAUDE.md設定例 |
| `examples/user-CLAUDE.md` | ユーザー固有設定例 |
| `examples/statusline.json` | ステータスライン設定例 |
| `examples/sessions/` | セッション設定例 |
| `tests/lib/test-utils.js` | テストユーティリティ |
| `tests/hooks/hooks.test.js` | フックテスト |
| `tests/run-all.js` | 全テスト実行スクリプト |

## 開発コマンド

### 基本コマンド
```bash
# 依存関係インストール
yarn install

# 開発サーバー起動
yarn start          # Expo dev client
yarn ios           # iOS simulator
yarn android       # Android emulator
yarn web           # Web版

# 型チェック・リント
npx tsc --noEmit   # TypeScript（strictモード）
yarn lint          # ESLint

# テスト
yarn test          # 全テスト
yarn test:coverage # カバレッジ付き
yarn testemu       # Firebaseエミュレータ使用

# Firebaseエミュレータ
yarn emu           # エミュレータ起動
```

### ビルド
```bash
yarn build:web     # Webビルド
```

## アーキテクチャ

### 状態管理
- **Redux Toolkit**: グローバル状態（dataSet, layers, settings, user, projects, tileMaps, trackLog）
- **React Context**: 機能特化状態（HomeContextから小さなContextへ移行中）
- **Redux Persist**: 永続化（Mobile: AsyncStorage, Web: sessionStorage）

### ディレクトリ構造
```
src/
├── components/       # UIコンポーネント（Atomic Design）
│   ├── atoms/       # 基本要素
│   ├── molecules/   # 複合要素
│   ├── organisms/   # 複雑なコンポーネント
│   └── pages/       # フルページ
├── containers/      # ビジネスロジック（Redux/Context接続）
├── contexts/        # React Context（HomeContextから移行中）
├── hooks/           # カスタムフック
├── modules/         # Reduxスライス
├── utils/           # ユーティリティ関数
├── routes/          # ナビゲーション設定
├── constants/       # 定数、APIキー
├── i18n/           # 国際化設定
└── types/          # 型定義
```

### クロスプラットフォーム戦略
- プラットフォーム固有ファイル: `.web.ts` / `.web.tsx`
- 主要な分離対象:
  - アラート: Alert API vs sweetalert2
  - ファイル操作: RNFS vs browser APIs
  - PDF生成: expo-print vs browser print
  - 地図: react-native-maps vs maplibre-gl
  - Store: store.ts vs store.web.ts

### データアーキテクチャ
- **GeoJSON**ベースのデータ構造
- サポートフォーマット: GPX, KML, GeoJSON, CSV, JPEG (EXIF), SQLite3
- ローカルSQLite + Firebaseクラウド同期
- GDALサポート（react-native-gdalwarp）

## セキュリティ

### Firebase Security Rules
- 認証済みユーザー（email_verified）のみアクセス許可
- ロールベースアクセス制御: Owner > Admin > Member
- データ権限: PRIVATE, PUBLIC, COMMON, TEMPLATE
- ファイルアップロード: 20MB制限、PNG/JPEG/PDF/SQLite3のみ

### 暗号化
- Virgil E3Kitによるエンドツーエンド暗号化
- `encdata`/`encryptedAt`フィールドで暗号化データ管理

## テスト要件

### カバレッジ閾値
| ディレクトリ | 最低カバレッジ |
|-------------|---------------|
| `src/modules/**` | 60% |
| `src/utils/**` | 40% |
| `src/hooks/**` | 30% |
| global | 20% |

### テストパターン
- Jest + Testing Library
- Firebaseエミュレータでバックエンドテスト
- `jestSetupFile.js`でモック設定
- テストは`__tests__/`ディレクトリに配置

## 主要技術スタック

- **React Native 0.81.5** + **Expo 54**（Bare Workflow）
- **React 19.1.0**
- **TypeScript 5.9**（strictモード）
- **Redux Toolkit 2.2** + Redux Persist
- **Firebase 12**（Auth, Firestore, Storage, Functions）
- **React Native Maps 1.14** / **MapLibre GL 4.6**（Web）
- **GDAL**（react-native-gdalwarp）
- **i18next**（日本語/英語）
- **PMTiles**

## 重要な開発ノート

1. **Context移行**: HomeContext（86 props）から小さなContextへ移行中。詳細は`docs/MIGRATION_GUIDE.md`参照。

2. **ネイティブモジュール**: `react-native-gdalwarp`は手動インストール必要（GitHub Releasesからダウンロード）。

3. **APIキー**:
   - Google Maps: `local.properties`, `Maps.plist`
   - MapTiler: `src/constants/APIKeys.ts`
   - Firebase: `GoogleService-Info.plist`, `google-services.json`

4. **型安全性**: コミット前に`npx tsc --noEmit`必須。strictモード、implicit any禁止。

5. **プラットフォームテスト**: iOS/Android/Web全てで動作確認。

6. **Patch Packages**: `/patches`ディレクトリにパッチあり。`yarn install`で自動適用。

7. **パフォーマンス**: 大量GeoJSONはviewport culling、遅延読み込みを使用。

8. **Firebaseエミュレータポート**: Auth:9099, Firestore:8080, Storage:9199, Functions:5001

9. **Node.js**: >= 22 必須

10. **Package Manager**: Yarn 3.6.4

## Firebase Functions

`/functions`ディレクトリ:
- `ecorismap-func.ts` - メイン関数
- `virgil-func.ts` - 暗号化鍵管理
- `generate-virgil-jwt.ts` - JWT生成
- Node 20 runtime
- デプロイ: `npm run deploy`（functionsディレクトリから）
