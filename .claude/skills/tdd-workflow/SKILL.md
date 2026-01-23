---
name: tdd-workflow
description: テスト駆動開発（TDD）のベストプラクティス。Red-Green-Refactorサイクル、カバレッジ要件、テストパターン、モックについて。TDDやテストの書き方について質問があるときに使用。
---

# TDDワークフロー

EcorisMapにおけるテスト駆動開発のベストプラクティスです。

## Red-Green-Refactorサイクル

### 1. Red（失敗するテストを書く）

```typescript
// 実装前にテストを書く
describe('calculateDistance', () => {
  it('should calculate distance between two points', () => {
    const point1 = { lat: 35.6812, lng: 139.7671 }; // 東京駅
    const point2 = { lat: 35.6586, lng: 139.7454 }; // 品川駅

    const distance = calculateDistance(point1, point2);

    expect(distance).toBeCloseTo(6.8, 1); // 約6.8km
  });

  it('should return 0 for same point', () => {
    const point = { lat: 35.6812, lng: 139.7671 };

    const distance = calculateDistance(point, point);

    expect(distance).toBe(0);
  });

  it('should throw error for invalid coordinates', () => {
    const invalid = { lat: 200, lng: 139 }; // 無効な緯度
    const valid = { lat: 35, lng: 139 };

    expect(() => calculateDistance(invalid, valid)).toThrow();
  });
});
```

### 2. Green（テストを通す最小限の実装）

```typescript
// テストが通る最小限のコード
export const calculateDistance = (
  point1: { lat: number; lng: number },
  point2: { lat: number; lng: number }
): number => {
  // バリデーション
  if (!isValidCoordinate(point1) || !isValidCoordinate(point2)) {
    throw new Error('Invalid coordinates');
  }

  // 同一点チェック
  if (point1.lat === point2.lat && point1.lng === point2.lng) {
    return 0;
  }

  // Haversine公式による距離計算
  const R = 6371; // 地球の半径（km）
  const dLat = toRad(point2.lat - point1.lat);
  const dLng = toRad(point2.lng - point1.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(point1.lat)) *
      Math.cos(toRad(point2.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};
```

### 3. Refactor（コード品質の改善）

```typescript
// 定数と型を分離
const EARTH_RADIUS_KM = 6371;

interface Coordinate {
  lat: number;
  lng: number;
}

// ヘルパー関数を分離
const toRadians = (degrees: number): number => degrees * (Math.PI / 180);

const haversineFormula = (
  coord1: Coordinate,
  coord2: Coordinate
): number => {
  const dLat = toRadians(coord2.lat - coord1.lat);
  const dLng = toRadians(coord2.lng - coord1.lng);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(coord1.lat)) *
    Math.cos(toRadians(coord2.lat)) *
    Math.sin(dLng / 2) ** 2;

  return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// メイン関数をシンプルに
export const calculateDistance = (
  point1: Coordinate,
  point2: Coordinate
): number => {
  validateCoordinate(point1);
  validateCoordinate(point2);

  if (isSamePoint(point1, point2)) {
    return 0;
  }

  return EARTH_RADIUS_KM * haversineFormula(point1, point2);
};
```

## カバレッジ要件

| ディレクトリ | 最低カバレッジ |
|-------------|---------------|
| `src/modules/**` | 60% |
| `src/utils/**` | 40% |
| `src/hooks/**` | 30% |
| global | 20% |

### 重要ロジックは100%目標

- 金融計算
- 認証・セキュリティ
- コアビジネスロジック
- データ変換・バリデーション

## テストパターン

### Reduxスライステスト

```typescript
import reducer, { actions, selectFeatures } from './featureSlice';

describe('featureSlice', () => {
  const initialState = {
    items: [],
    selectedId: null,
    loading: false,
  };

  describe('reducers', () => {
    it('should handle setFeatures', () => {
      const features = [{ id: '1', name: 'Test' }];

      const state = reducer(initialState, actions.setFeatures(features));

      expect(state.items).toEqual(features);
    });

    it('should handle selectFeature', () => {
      const state = reducer(initialState, actions.selectFeature('1'));

      expect(state.selectedId).toBe('1');
    });
  });

  describe('selectors', () => {
    it('should select all features', () => {
      const state = {
        features: { items: [{ id: '1' }], selectedId: null, loading: false },
      };

      expect(selectFeatures(state)).toEqual([{ id: '1' }]);
    });
  });
});
```

### カスタムフックテスト

```typescript
import { renderHook, act } from '@testing-library/react-hooks';
import { Provider } from 'react-redux';
import { useFeatureData } from './useFeatureData';

const wrapper = ({ children }) => (
  <Provider store={mockStore}>{children}</Provider>
);

describe('useFeatureData', () => {
  it('should return initial loading state', () => {
    const { result } = renderHook(() => useFeatureData('layer1'), { wrapper });

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toEqual([]);
  });

  it('should load data', async () => {
    const { result, waitForNextUpdate } = renderHook(
      () => useFeatureData('layer1'),
      { wrapper }
    );

    await waitForNextUpdate();

    expect(result.current.loading).toBe(false);
    expect(result.current.data.length).toBeGreaterThan(0);
  });
});
```

### 非同期テスト

```typescript
describe('async operations', () => {
  it('should fetch data', async () => {
    const mockData = [{ id: '1' }];
    jest.spyOn(api, 'fetchFeatures').mockResolvedValue(mockData);

    const result = await loadFeatures('layer1');

    expect(result).toEqual(mockData);
    expect(api.fetchFeatures).toHaveBeenCalledWith('layer1');
  });

  it('should handle errors', async () => {
    jest.spyOn(api, 'fetchFeatures').mockRejectedValue(new Error('Network error'));

    await expect(loadFeatures('layer1')).rejects.toThrow('Network error');
  });
});
```

## モックパターン

### Firebase モック

```typescript
// jestSetupFile.js
jest.mock('@react-native-firebase/auth', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    signInWithEmailAndPassword: jest.fn(),
    onAuthStateChanged: jest.fn(),
    currentUser: null,
  })),
}));

jest.mock('@react-native-firebase/firestore', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(),
        set: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      })),
    })),
  })),
}));
```

### ナビゲーションモック

```typescript
const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  setOptions: jest.fn(),
};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({ params: {} }),
}));
```

## テストコマンド

```bash
# 全テスト実行
yarn test

# カバレッジ付き
yarn test:coverage

# ウォッチモード
yarn test --watch

# 特定ファイル
yarn test path/to/file.test.ts

# Firebaseエミュレータ使用
yarn testemu
```

## アンチパターン

### 避けるべきこと

1. **実装ファースト**
   - テストより先に実装を書かない

2. **テストの省略**
   - 「簡単だから」とテストを省略しない

3. **実装詳細のテスト**
   - 内部実装ではなく振る舞いをテスト

4. **大きすぎるテスト**
   - 1テスト1アサーション原則

5. **モックの乱用**
   - 本当に必要な場合のみモック

## ベストプラクティス

1. **テストを先に書く**
2. **テストが失敗することを確認**
3. **最小限の実装で通す**
4. **リファクタリングはGreen状態で**
5. **エッジケースを網羅**
6. **意味のあるテスト名**
7. **Arrange-Act-Assert パターン**
