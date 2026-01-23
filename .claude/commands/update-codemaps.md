# コードマップ更新コマンド

プロジェクトのコードマップ（構造情報）を更新します。

## 使用方法

```
/update-codemaps [オプション]
```

## 機能

### コードマップとは

コードマップは、プロジェクトの構造を把握するためのメタデータです。以下の情報を含みます：

- ディレクトリ構造
- 主要なモジュールと依存関係
- エクスポートされるシンボル
- コンポーネント階層

### 生成される情報

#### 1. ディレクトリ構造

```yaml
src/
├── components/           # UIコンポーネント
│   ├── atoms/           # 基本要素 (Button, Input, etc.)
│   ├── molecules/       # 複合要素 (FormField, Card, etc.)
│   ├── organisms/       # 複雑なコンポーネント
│   └── pages/           # フルページ
├── containers/          # ビジネスロジック
├── contexts/            # React Context
├── hooks/               # カスタムフック
├── modules/             # Reduxスライス
├── utils/               # ユーティリティ
└── types/               # 型定義
```

#### 2. モジュール依存グラフ

```
modules/
├── dataSet.ts
│   └── depends: [types/DataType, utils/format]
├── layers.ts
│   └── depends: [types/Layer, modules/dataSet]
└── user.ts
    └── depends: [types/User, services/firebase]
```

#### 3. エクスポートシンボル

```typescript
// src/modules/dataSet.ts
export {
  // Reducerアクション
  addData,
  updateData,
  deleteData,

  // Selectors
  selectAllData,
  selectDataById,

  // Types
  DataSetState
}
```

#### 4. コンポーネント階層

```
pages/
└── HomeScreen
    ├── organisms/MapContainer
    │   ├── molecules/MapControls
    │   └── atoms/ZoomButton
    └── organisms/DataPanel
        ├── molecules/DataList
        └── atoms/DataItem
```

## 出力先

コードマップは以下の場所に保存されます：

```
.claude/
├── codemaps/
│   ├── structure.yaml       # ディレクトリ構造
│   ├── dependencies.yaml    # 依存関係
│   ├── exports.yaml         # エクスポートシンボル
│   └── components.yaml      # コンポーネント階層
```

## 使用例

### 全体更新

```
/update-codemaps
```

### 特定ディレクトリのみ

```
/update-codemaps src/modules
/update-codemaps src/components
```

### 依存関係のみ

```
/update-codemaps --deps-only
```

### 差分更新

```
/update-codemaps --incremental
```

## 出力フォーマット

### 更新完了メッセージ

```
📊 コードマップ更新完了

更新されたファイル:
  ✅ structure.yaml (142 エントリ)
  ✅ dependencies.yaml (89 モジュール)
  ✅ exports.yaml (256 シンボル)
  ✅ components.yaml (67 コンポーネント)

変更点:
  + 3 新規ファイル
  ~ 5 変更されたファイル
  - 1 削除されたファイル

最終更新: 2024-01-15 10:30:00
```

### エラー時

```
⚠️ コードマップ更新中にエラーが発生しました

エラー:
  - src/components/Broken.tsx: 構文エラー (line 42)

部分的に更新されたファイル:
  ✅ structure.yaml
  ✅ dependencies.yaml
  ❌ exports.yaml (スキップ)
  ❌ components.yaml (スキップ)

修正後に再実行してください:
  /update-codemaps --force
```

## 活用方法

### コード探索時

```
/update-codemaps
# その後
「認証関連のコードを探して」
→ コードマップを参照して効率的に検索
```

### リファクタリング時

```
/update-codemaps
# 依存関係を確認してからリファクタリング
/refactor-clean src/modules/user.ts
```

### 新規参入者向け

```
/update-codemaps
# プロジェクト構造の概要を把握
```

## 引数

`$ARGUMENTS`で以下を指定可能：

- なし - 全体更新
- `[パス]` - 特定ディレクトリのみ更新
- `--deps-only` - 依存関係のみ更新
- `--exports-only` - エクスポートシンボルのみ更新
- `--incremental` - 変更されたファイルのみ更新
- `--force` - エラーを無視して強制更新
- `--dry-run` - 実際には更新せず変更内容を表示

## 注意事項

- 大規模なプロジェクトでは更新に時間がかかる場合があります
- TypeScriptのコンパイルエラーがあると一部情報が欠落する可能性があります
- コードマップは`.gitignore`に含まれています（各開発者がローカルで生成）
- 定期的な更新を推奨（大きな変更後、新機能追加後など）
