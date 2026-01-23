# プラットフォーム整合性チェックコマンド

iOS/Android/Web間のコード整合性をチェックします。

## 使用方法

```
/platform-check [対象ディレクトリまたはファイル]
```

## チェック項目

### 1. ファイル対応確認

#### .web.tsx ファイルの存在
```
Component.tsx があるとき、
Component.web.tsx が必要かチェック
```

### 2. Platform固有コードの確認

#### Platform.select/Platform.OS使用箇所
```typescript
// 適切な使用例
Platform.select({
  web: webImplementation,
  default: mobileImplementation,
});
```

### 3. インポートパスの確認

#### 正しいパターン
```typescript
// ✓ 正しい: 拡張子なし
import { Component } from './Component';

// ✗ 間違い: 拡張子指定
import { Component } from './Component.tsx';
```

### 4. 主要分離対象の確認

| 機能 | Mobile | Web | チェック |
|------|--------|-----|----------|
| アラート | Alert API | sweetalert2 | .web.ts存在 |
| ファイル | RNFS | browser APIs | .web.ts存在 |
| PDF | expo-print | browser print | .web.ts存在 |
| 地図 | react-native-maps | maplibre-gl | .web.tsx存在 |
| Store | store.ts | store.web.ts | 両方存在 |

## 診断フロー

### 1. ファイルスキャン
```
- .tsx ファイルの一覧取得
- 対応する .web.tsx の存在確認
```

### 2. コード解析
```
- Platform.select/OS の使用箇所
- プラットフォーム固有ライブラリの使用
```

### 3. 不整合の検出
```
- Web対応が必要だが .web.tsx がない
- Platform固有コードが分離されていない
```

## 引数

`$ARGUMENTS`が指定された場合、そのディレクトリ/ファイルをチェック。
指定なしの場合は、`src/`ディレクトリ全体をチェック。

## 出力形式

```markdown
## プラットフォーム整合性チェック結果

### 対象
[チェック対象]

### 結果サマリー
- 問題なし: X件
- 要確認: Y件
- 問題あり: Z件

### 問題あり

#### [ファイルパス]
- 問題: [説明]
- 推奨: [対応策]

### 要確認

#### [ファイルパス]
- 内容: [Platform固有コードの内容]
- 確認: [確認すべき点]

### 問題なし
[問題のないファイル一覧（省略可）]

### 推奨アクション
1. [アクション1]
2. [アクション2]
```

## 関連コマンド

- `/build-fix` - ビルドエラー解決
- `/code-review` - コードレビュー
