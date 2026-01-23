# 学習コマンド

セッション中に解決した非自明な問題から再利用可能なパターンを抽出します。

## 使用方法

```
/learn [カテゴリ]
```

## 引数

| 引数 | 説明 |
|------|------|
| `error` | エラー解決パターン |
| `debug` | デバッグ技法 |
| `workaround` | 回避策 |
| `pattern` | プロジェクト固有パターン |
| なし | 全カテゴリから自動検出 |

## 抽出対象

### 1. エラー解決パターン

問題の原因と修正方法を記録。

```markdown
## TypeScript型エラー: Property does not exist

### 問題
`Property 'foo' does not exist on type 'Bar'`

### 原因
型定義の不足または誤り

### 解決策
```typescript
// 型アサーション
(object as ExtendedType).foo

// 型ガード
if ('foo' in object) {
  object.foo
}

// 型定義の拡張
interface ExtendedBar extends Bar {
  foo: string;
}
```
```

### 2. デバッグ技法

ツールの組み合わせや診断方法を記録。

```markdown
## React Nativeレンダリング問題のデバッグ

### 手順
1. React DevToolsのProfilerを開く
2. 「Record why each component rendered」を有効化
3. 操作を実行
4. 再レンダリングの原因を特定

### 典型的な原因
- 依存配列の誤り
- オブジェクト/配列の参照変更
- Context値の不要な更新
```

### 3. 回避策

ライブラリの癖やAPI制限への対処を記録。

```markdown
## react-native-maps: マーカーが更新されない

### 問題
state更新後もマーカー位置が反映されない

### 回避策
```typescript
<Marker
  key={`marker-${feature.id}-${feature.updatedAt}`}
  coordinate={...}
/>
```

### 理由
react-native-mapsはマーカーの更新を検知しにくいため、
keyを変更して強制的に再マウントさせる
```

### 4. プロジェクト固有パターン

アーキテクチャ判断や規約を記録。

```markdown
## HomeContext移行パターン

### 背景
HomeContextが86 propsに肥大化

### パターン
1. 関連する状態をグループ化
2. 新しいContextを作成
3. HomeContextから段階的に移行
4. 依存コンポーネントを更新

### 参照
docs/MIGRATION_GUIDE.md
```

## 出力形式

学習内容は `.claude/learned/` ディレクトリに保存されます。

```
.claude/learned/
├── errors/
│   └── typescript-type-errors.md
├── debug/
│   └── react-native-rendering.md
├── workarounds/
│   └── react-native-maps-markers.md
└── patterns/
    └── context-migration.md
```

## 処理フロー

1. **セッション振り返り** - 今回解決した問題を特定
2. **価値判定** - 再利用可能かを評価
3. **下書き作成** - パターンをドキュメント化
4. **ユーザー確認** - 内容の確認を取得
5. **保存** - ファイルとして保存

## 除外対象

以下は学習対象外：
- 単純なタイプミス
- シンタックスエラー
- 一時的な問題（APIの一時停止など）
- プロジェクト外部の問題

## 活用方法

保存されたパターンは次のセッションで参照できます：

```bash
# 特定のパターンを検索
grep -r "マーカー" .claude/learned/

# エラーパターンを確認
cat .claude/learned/errors/*.md
```

## 注意事項

- 機密情報（APIキー、認証情報）を含めない
- 具体的なコード例を含める
- 原因と解決策を明確に記述
- 関連ドキュメントへの参照を追加

## 関連コマンド

- `/tdd` - テスト駆動開発
- `/code-review` - コードレビュー
- `/update-docs` - ドキュメント更新
