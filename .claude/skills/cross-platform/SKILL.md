---
name: cross-platform
description: iOS/Android/Web対応のクロスプラットフォーム開発パターン。プラットフォーム固有ファイルの命名規則、Platform.select、コンポーネント分離など。プラットフォーム間の差異や.web.tsファイルについて質問があるときに使用。
---

# クロスプラットフォーム開発

EcorisMapにおけるiOS/Android/Web対応のベストプラクティスです。

## ファイル命名規則

### プラットフォーム固有ファイル

| 拡張子 | 対象 |
|--------|------|
| `*.web.ts` / `*.web.tsx` | Web専用 |
| `*.ios.ts` / `*.ios.tsx` | iOS専用 |
| `*.android.ts` / `*.android.tsx` | Android専用 |
| `*.ts` / `*.tsx` | Mobile & フォールバック |

### 解決順序

React Nativeバンドラーは以下の順序で解決：
1. `Component.web.tsx` (Web)
2. `Component.ios.tsx` (iOS)
3. `Component.android.tsx` (Android)
4. `Component.tsx` (フォールバック)

## 実装パターン

### パターン1: 完全分離

機能が大きく異なる場合に使用。

```
src/components/
├── Alert.ts       # Mobile (React Native Alert)
└── Alert.web.ts   # Web (sweetalert2)
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

// 使用側（どのプラットフォームでも同じ）
import { showAlert } from './Alert';
showAlert('タイトル', 'メッセージ');
```

### パターン2: 条件分岐

小さな差異の場合に使用。

```typescript
import { Platform } from 'react-native';

// Platform.select
const styles = {
  container: {
    padding: Platform.select({
      ios: 20,
      android: 16,
      web: 24,
      default: 20,
    }),
  },
};

// Platform.OS
const handleAction = () => {
  if (Platform.OS === 'web') {
    // Web固有の処理
  } else {
    // Mobile固有の処理
  }
};
```

### パターン3: コンポーネント分離

UIが異なる場合に使用。

```
src/components/
├── MapView.tsx      # Mobile (react-native-maps)
└── MapView.web.tsx  # Web (maplibre-gl)
```

## 主要な分離対象

| 機能 | Mobile | Web |
|------|--------|-----|
| アラート | `Alert` API | sweetalert2 |
| ファイル操作 | react-native-fs | File API / FileSaver |
| PDF生成 | expo-print | window.print / jsPDF |
| 地図表示 | react-native-maps | maplibre-gl |
| ストレージ | AsyncStorage | localStorage / sessionStorage |
| Store | store.ts | store.web.ts |
| 画像選択 | expo-image-picker | input[type="file"] |
| 位置情報 | expo-location | navigator.geolocation |

## Store設定

### Mobile（store.ts）

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';
import { persistStore, persistReducer } from 'redux-persist';

const persistConfig = {
  key: 'root',
  storage: AsyncStorage,
  whitelist: ['settings', 'user'],
};
```

### Web（store.web.ts）

```typescript
import { persistStore, persistReducer } from 'redux-persist';
import sessionStorage from 'redux-persist/lib/storage/session';

const persistConfig = {
  key: 'root',
  storage: sessionStorage,
  whitelist: ['settings', 'user'],
};
```

## スタイリング

### レスポンシブ対応

```typescript
import { Dimensions, useWindowDimensions } from 'react-native';

// フックを使用（推奨）
const { width, height } = useWindowDimensions();

// ブレークポイント
const isTablet = width >= 768;
const isDesktop = width >= 1024;

// スタイル切り替え
const containerStyle = {
  flexDirection: isTablet ? 'row' : 'column',
  padding: isDesktop ? 24 : 16,
};
```

### Web固有のスタイル

```typescript
// Platform.selectでWeb用スタイルを指定
const styles = StyleSheet.create({
  container: {
    ...Platform.select({
      web: {
        cursor: 'pointer',
        userSelect: 'none',
      },
      default: {},
    }),
  },
});
```

## テスト

### プラットフォーム別モック

```typescript
// jest.setup.js
jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios', // or 'android', 'web'
    select: (obj) => obj.ios || obj.default,
  },
}));

// テスト内でプラットフォーム切り替え
describe('Cross-platform component', () => {
  beforeEach(() => {
    Platform.OS = 'web';
  });

  it('renders web version', () => {
    // Web固有のテスト
  });
});
```

## チェックリスト

### 新規コンポーネント作成時
- [ ] Web版での動作を検討
- [ ] Platform固有コードは適切に分離
- [ ] 両プラットフォームでの動作確認

### 既存コンポーネント修正時
- [ ] `.web.*`ファイルの存在確認
- [ ] 対応するWeb版も修正が必要か確認
- [ ] プラットフォーム固有の動作テスト

## トラブルシューティング

### よくある問題

1. **Web版でモジュールが見つからない**
   - `.web.ts`ファイルの存在確認
   - webpack設定でextensions確認

2. **スタイルが効かない**
   - Platform.selectの使用確認
   - Web固有のCSSプロパティ確認

3. **イベントの違い**
   - onPress vs onClick
   - タッチイベント vs マウスイベント
