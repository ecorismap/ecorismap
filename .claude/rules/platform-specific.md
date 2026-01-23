# クロスプラットフォームルール

EcorisMapのiOS/Android/Web対応における規約です。

## ファイル命名規則

### プラットフォーム固有ファイル

| 拡張子 | 対象 |
|--------|------|
| `*.web.ts` / `*.web.tsx` | Web専用 |
| `*.ts` / `*.tsx` | Mobile & fallback |

### 解決順序
React Nativeバンドラーは以下の順序で解決：
1. `Component.web.tsx` (Web)
2. `Component.tsx` (Mobile & fallback)

## 実装パターン

### パターン1: 完全分離

機能が大きく異なる場合に使用。

```
Alert.ts       # Mobile (React Native Alert)
Alert.web.ts   # Web (sweetalert2)
```

```typescript
// Alert.ts (Mobile)
import { Alert as RNAlert } from 'react-native';
export const showAlert = (title: string, message: string) => {
  RNAlert.alert(title, message);
};

// Alert.web.ts (Web)
import Swal from 'sweetalert2';
export const showAlert = (title: string, message: string) => {
  Swal.fire({ title, text: message });
};
```

### パターン2: 条件分岐

小さな差異の場合に使用。

```typescript
import { Platform } from 'react-native';

const handleAction = Platform.select({
  web: () => webHandler(),
  default: () => mobileHandler(),
});
```

### パターン3: コンポーネント分離

UIが異なる場合に使用。

```
MapView.tsx      # Mobile (react-native-maps)
MapView.web.tsx  # Web (maplibre-gl)
```

## 主要な分離対象

| 機能 | Mobile | Web |
|------|--------|-----|
| アラート | `Alert` API | sweetalert2 |
| ファイル操作 | react-native-fs | browser APIs |
| PDF生成 | expo-print | browser print |
| 地図表示 | react-native-maps | maplibre-gl |
| ストレージ | AsyncStorage | sessionStorage |
| Store | store.ts | store.web.ts |

## Store設定

| ファイル | 用途 |
|----------|------|
| `src/store.ts` | Mobile用Redux store |
| `src/store.web.ts` | Web用Redux store |

差異:
- ミドルウェア設定
- Persist設定（AsyncStorage vs sessionStorage）

## チェックリスト

新規コンポーネント作成時：
- [ ] Web版での動作を検討
- [ ] Platform固有コードは適切に分離
- [ ] 両プラットフォームでの動作確認

既存コンポーネント修正時：
- [ ] `.web.*`ファイルの存在確認
- [ ] 対応するWeb版も修正が必要か確認
- [ ] プラットフォーム固有の動作テスト

## 注意事項

### インポート
```typescript
// 正しい: 拡張子なしでインポート
import { Component } from './Component';

// バンドラーが適切なファイルを選択
// Web: Component.web.tsx
// Mobile: Component.tsx
```

### テスト
```typescript
// プラットフォーム固有のモックを設定
jest.mock('react-native', () => ({
  Platform: {
    OS: 'web', // or 'ios', 'android'
    select: jest.fn((obj) => obj.web || obj.default),
  },
}));
```

### デバッグ
```typescript
import { Platform } from 'react-native';
console.log('Current platform:', Platform.OS);
```
