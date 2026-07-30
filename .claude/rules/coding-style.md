# コーディングスタイル

EcorisMapプロジェクトのコーディング規約です。

## TypeScript

- strictモード。`any`型の使用禁止（やむを得ない場合はコメントで理由を明記）
- 共通型は`src/types/`に配置、コンポーネントPropsは同一ファイル内で定義
- コミット前に`npx tsc --noEmit`必須

## コンポーネント設計

- Atomic Design: `atoms/`（基本要素）→ `molecules/` → `organisms/` → `pages/`
- `containers/`=ビジネスロジック（Redux/Context接続）、`components/`=UI表示のみ（propsで受け取る）
- 状態管理の使い分け: グローバル=Redux Toolkit、機能特化=React Context、ローカル=useState/useReducer

## ファイル命名規則

| 種類 | 命名 | 例 |
|------|------|-----|
| コンポーネント | PascalCase.tsx | `MapView.tsx` |
| コンテナ | PascalCase.tsx | `MapContainer.tsx` |
| フック | camelCase.ts | `useMapData.ts` |
| ユーティリティ | camelCase.ts | `formatDate.ts` |
| 型定義 | PascalCase.ts | `DataType.ts` |
| テスト | *.test.ts(x) | `useMapData.test.ts` |
| Web専用 | *.web.ts(x) | `MapView.web.tsx` |

## コメント

- 自明なコードにはコメント不要。複雑なロジックには「なぜ」を説明
- TODOコメント形式: `// TODO(username): 期限 - 説明`
