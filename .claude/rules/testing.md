# テストルール

EcorisMapプロジェクトのテスト要件とパターンです。

## カバレッジ要件

| ディレクトリ | 最低カバレッジ |
|-------------|---------------|
| `src/modules/**` | 60% |
| `src/utils/**` | 40% |
| `src/hooks/**` | 30% |
| global | 20% |

## テストコマンド

```bash
# 全テスト実行
yarn test

# カバレッジ付き
yarn test:coverage

# ウォッチモード
yarn test:coverage:watch

# Firebaseエミュレータ使用
yarn testemu
```

## テストパターン

### 1. Reduxスライステスト（modules/）

```typescript
import reducer, { actions, selectors } from './slice';

describe('sliceName', () => {
  it('初期状態が正しい', () => {
    expect(reducer(undefined, { type: 'unknown' })).toEqual(initialState);
  });

  it('アクションが正しく動作する', () => {
    const state = reducer(initialState, actions.someAction(payload));
    expect(state.property).toBe(expectedValue);
  });

  it('セレクタが正しい値を返す', () => {
    const state = { sliceName: mockState };
    expect(selectors.selectSomething(state)).toBe(expected);
  });
});
```

### 2. カスタムフックテスト（hooks/）

```typescript
import { renderHook, act } from '@testing-library/react-hooks';
import { useCustomHook } from './useCustomHook';

const wrapper = ({ children }) => (
  <Provider store={mockStore}>
    <SomeContext.Provider value={mockValue}>
      {children}
    </SomeContext.Provider>
  </Provider>
);

describe('useCustomHook', () => {
  it('初期値が正しい', () => {
    const { result } = renderHook(() => useCustomHook(), { wrapper });
    expect(result.current.value).toBe(expected);
  });

  it('更新が正しく動作する', async () => {
    const { result } = renderHook(() => useCustomHook(), { wrapper });
    await act(async () => {
      await result.current.update(newValue);
    });
    expect(result.current.value).toBe(newValue);
  });
});
```

### 3. ユーティリティテスト（utils/）

```typescript
import { utilFunction } from './util';

describe('utilFunction', () => {
  it('正常ケース', () => {
    expect(utilFunction(validInput)).toBe(expectedOutput);
  });

  it('エッジケース', () => {
    expect(utilFunction(edgeInput)).toBe(edgeOutput);
  });

  it('異常ケース', () => {
    expect(() => utilFunction(invalidInput)).toThrow();
  });
});
```

### 4. Firebaseテスト

```typescript
// エミュレータ使用が必須
// jestSetupFile.jsで設定されたモックを活用

describe('Firebase機能', () => {
  beforeAll(async () => {
    // エミュレータ接続
  });

  afterEach(async () => {
    // データクリーンアップ
  });

  it('認証フロー', async () => {
    // 認証テスト
  });

  it('Firestoreアクセス', async () => {
    // Security Rulesテスト
  });
});
```

## モックパターン

`jestSetupFile.js`に定義されたモックを活用：

- React Nativeモジュール（Alert, Platform等）
- Firebaseサービス
- Navigationモック
- プラットフォーム固有API

## TDD原則

1. **Red**: 失敗するテストを先に書く
2. **Green**: テストが通る最小限の実装
3. **Refactor**: コード品質の改善

## 注意事項

- テストファイルは`__tests__/`ディレクトリに配置
- ファイル名は`*.test.ts`または`*.test.tsx`
- 非同期処理は必ず`await`で待機
- タイムアウトは適切に設定（デフォルト5秒）
