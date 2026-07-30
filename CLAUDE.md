# CLAUDE.md

ユーザーとは日本語で対話してください。

## プロジェクト概要

EcorisMapは、React Native + Expoで構築されたクロスプラットフォーム（iOS/Android/Web）フィールド調査アプリケーションです。屋外調査で地図上に位置情報とデータを記録できます。

## アーキテクチャの要点

- **状態管理**: グローバル=Redux Toolkit、機能特化=React Context。旧HomeContext（86 props）は11の機能別Contextへ分割済み（2026-07完了）。構成と新規Context追加のベストプラクティスは`docs/MIGRATION_GUIDE.md`参照。
- **データ**: GeoJSONベース。サポートフォーマット: GPX, KML, GeoJSON, CSV, JPEG (EXIF), SQLite3。ローカルSQLite + Firebaseクラウド同期。GDAL（react-native-gdalwarp）。
- **クロスプラットフォーム**: プラットフォーム固有処理は`.web.ts(x)`ファイルで分離（詳細は`cross-platform`スキル参照）。

## 非自明な開発コマンド

```bash
yarn testemu       # Firebaseエミュレータを使ったテスト
yarn testrules     # Security Rulesテスト（jest.rules.config.js、Java 21必須）
yarn emu           # Firebaseエミュレータ起動
yarn keys:apply    # keys/ディレクトリのAPIキー類を一括反映
```

標準コマンド（start/ios/android/web/test/lint/build:web等）は`package.json`のscripts参照。

## 重要な開発ノート

1. **ネイティブモジュール**: `react-native-gdalwarp`は手動インストール必要（GitHub Releasesからダウンロード）。

2. **APIキー**:
   - Google Maps: `local.properties`, `Maps.plist`
   - MapTiler: `src/constants/APIKeys.ts`
   - Firebase: `GoogleService-Info.plist`, `google-services.json`
   - キー類は`keys/`ディレクトリ（gitignore対象）に配置し`yarn keys:apply`で一括反映

3. **型安全性**: コミット前に`npx tsc --noEmit`必須。strictモード、implicit any禁止。

4. **プラットフォームテスト**: iOS/Android/Web全てで動作確認。

5. **Patch Packages**: `/patches`ディレクトリにパッチあり。`yarn install`で自動適用。

6. **パフォーマンス**: 大量GeoJSONはviewport culling、遅延読み込みを使用。

7. **Firebaseエミュレータポート**: Auth:9099, Firestore:8080, Storage:9199, Functions:5001

8. **ログイン**: 単一ビルド（旧`FUNC_LOGIN`フラグは廃止）。Google連携（Google Drive個人プロジェクト）と組織アカウント（Firebaseメール認証、blocking functionで登録制限）の2系統。

## Firebase Functions

別リポジトリ [ecorismap/functions](https://github.com/ecorismap/functions) で管理（ローカルでは`../functions`）:
- `ecorismap-func.ts` - メイン関数
- `virgil-func.ts` - 暗号化鍵管理
- `generate-virgil-jwt.ts` - JWT生成
- `auth-guard.ts` - 組織アカウント登録制限（`beforeUserCreated` blocking function、許可リストはSecret Managerの`ORG_ALLOWED_DOMAINS`/`ORG_ALLOWED_EMAILS`）
- Node 20 runtime
- デプロイ: `npm run deploy`（functionsディレクトリから）
