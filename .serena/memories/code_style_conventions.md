# EcorisMap コーディング規約

## TypeScript
- **strict mode** を使用
- 型安全性を重視（anyの使用を避ける）
- インターフェース名は大文字で開始

## React/React Native
- 関数コンポーネントを使用
- React.memoで最適化
- カスタムフックは`use`プレフィックス

## ファイル構成
- Atomic Designパターン:
  - atoms: 基本要素
  - molecules: 複合コンポーネント
  - organisms: 複雑なコンポーネント
  - pages: 完全なページ
- プラットフォーム固有ファイルは`.web.ts`拡張子を使用

## 命名規則
- コンポーネント: PascalCase
- 関数・変数: camelCase
- 定数: UPPER_SNAKE_CASE
- ファイル名: コンポーネントと同じ（PascalCase.tsx）

## インポート順序
1. React関連
2. 外部ライブラリ
3. 内部モジュール
4. 型定義

## 注意事項
- 日本語でのコメント・返答OK
- セキュリティキーやシークレットをコミットしない
- プラットフォーム間の互換性を考慮