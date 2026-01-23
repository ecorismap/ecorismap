# コーディングスタイル

EcorisMapプロジェクトのコーディング規約です。

## TypeScript

### 厳密モード（strict: true）

- `any`型の使用禁止（やむを得ない場合はコメントで理由を明記）
- null/undefinedの適切な処理（オプショナルチェーニング、nullish coalescing）
- 暗黙のany禁止

### 型定義

```typescript
// 共通型は src/types/ に配置
// コンポーネントPropsは同一ファイル内で定義

interface ComponentProps {
  required: string;
  optional?: number;
}

// 外部ライブラリ型は @types/* を使用
```

### 型チェック

```bash
npx tsc --noEmit
```

## React/React Native

### Atomic Design

```
src/components/
├── atoms/       # 基本要素（Button, Input, Icon, Text）
├── molecules/   # 複合要素（FormField, Card, ListItem）
├── organisms/   # 複雑なコンポーネント（Form, Modal, MapView）
└── pages/       # フルページ
```

### コンテナ/プレゼンテーショナル分離

| ディレクトリ | 責務 |
|-------------|------|
| `containers/` | ビジネスロジック、Redux/Context接続 |
| `components/` | UI表示のみ、propsで受け取る |

### 状態管理

| 種類 | 用途 | 実装 |
|------|------|------|
| グローバル状態 | アプリ全体で共有 | Redux Toolkit |
| 機能特化状態 | 特定機能で共有 | React Context |
| ローカル状態 | コンポーネント内 | useState/useReducer |

### Hooks使用規則

```typescript
// 依存配列を正確に
useEffect(() => {
  // 処理
}, [dependency1, dependency2]);

// クリーンアップを忘れずに
useEffect(() => {
  const subscription = subscribe();
  return () => subscription.unsubscribe();
}, []);

// 不要な再計算を防止
const memoizedValue = useMemo(() => compute(a, b), [a, b]);
const memoizedCallback = useCallback(() => handle(a), [a]);
```

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

## インポート順序

```typescript
// 1. React/React Native
import React, { useState, useEffect } from 'react';
import { View, Text } from 'react-native';

// 2. 外部ライブラリ
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';

// 3. 内部モジュール（絶対パス）
import { selectUser } from '../modules/user';
import { formatDate } from '../utils/format';

// 4. 相対インポート
import { LocalComponent } from './LocalComponent';

// 5. 型インポート
import type { DataType } from '../types';
```

## ESLint

```bash
yarn lint
```

設定に従い、自動修正可能な問題は修正されます。

## コメント

- 自明なコードにはコメント不要
- 複雑なロジックには「なぜ」を説明
- TODOコメントには担当者と期限を記載

```typescript
// TODO(username): 期限 - 説明
```

## パフォーマンス考慮

- 大量データ処理時はメモ化を検討
- リストレンダリングには`keyExtractor`を適切に設定
- 不要な再レンダリングをReact DevToolsで確認
