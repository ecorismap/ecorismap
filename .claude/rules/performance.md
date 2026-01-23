# パフォーマンスルール

EcorisMapのパフォーマンス最適化に関する規約です。

## 一般原則

### レンダリング最適化

#### 不要な再レンダリング防止
```typescript
// useMemo - 計算結果のメモ化
const processedData = useMemo(() => {
  return heavyComputation(data);
}, [data]);

// useCallback - コールバックのメモ化
const handleClick = useCallback(() => {
  doSomething(id);
}, [id]);

// React.memo - コンポーネントのメモ化
const MemoizedComponent = React.memo(Component);
```

#### 依存配列の適切な設定
```typescript
// 必要な依存のみ含める
useEffect(() => {
  fetchData(id);
}, [id]); // 不要な依存を含めない
```

### リストレンダリング

#### FlatList使用
```typescript
<FlatList
  data={items}
  renderItem={renderItem}
  keyExtractor={item => item.id}
  getItemLayout={getItemLayout}  // 固定高さの場合
  initialNumToRender={10}
  maxToRenderPerBatch={10}
  windowSize={5}
/>
```

#### 仮想化
- 大量リストは`FlatList`/`SectionList`を使用
- Webでは`react-window`等を検討

## GeoJSON処理

### 大量データの注意点

#### ビューポートカリング
```typescript
// 表示範囲内のフィーチャーのみ処理
const visibleFeatures = features.filter(f =>
  isWithinBounds(f.geometry.coordinates, viewport)
);
```

#### データの遅延読み込み
```typescript
// 必要に応じてチャンク読み込み
const loadMoreFeatures = async () => {
  const nextChunk = await fetchFeatures(offset, limit);
  setFeatures(prev => [...prev, ...nextChunk]);
};
```

#### 簡略化
```typescript
// 低ズームレベルでは形状を簡略化
import { simplify } from '@turf/simplify';
const simplified = simplify(feature, { tolerance: 0.01 });
```

### メモリ管理

#### 大きなオブジェクトの解放
```typescript
useEffect(() => {
  const largeData = loadLargeGeoJSON();

  return () => {
    // クリーンアップでメモリ解放
    largeData = null;
  };
}, []);
```

## 非同期処理

### 並列処理
```typescript
// 独立した処理は並列実行
const [data1, data2] = await Promise.all([
  fetchData1(),
  fetchData2(),
]);
```

### デバウンス/スロットル
```typescript
// 検索入力などはデバウンス
const debouncedSearch = useMemo(
  () => debounce(handleSearch, 300),
  []
);

// スクロールイベントはスロットル
const throttledScroll = useMemo(
  () => throttle(handleScroll, 100),
  []
);
```

## 画像最適化

### サイズ制限
- サムネイル: 200x200以下
- プレビュー: 800x800以下
- 元画像: 必要に応じてリサイズ

### 遅延読み込み
```typescript
// 画面外の画像は遅延読み込み
<Image
  source={{ uri }}
  loading="lazy" // Web
/>
```

## Firebase最適化

### クエリ最適化
```typescript
// 必要なフィールドのみ取得
const snapshot = await firestore()
  .collection('items')
  .where('userId', '==', uid)
  .orderBy('createdAt', 'desc')
  .limit(20)
  .get();
```

### キャッシュ活用
```typescript
// オフラインキャッシュの有効化
const snapshot = await firestore()
  .collection('items')
  .get({ source: 'cache' }); // または 'server'
```

### バッチ操作
```typescript
// 複数の書き込みはバッチで
const batch = firestore().batch();
items.forEach(item => {
  const ref = firestore().collection('items').doc();
  batch.set(ref, item);
});
await batch.commit();
```

## 計測とモニタリング

### React DevTools
- Profilerでレンダリング計測
- Highlightで再レンダリング可視化

### パフォーマンス計測
```typescript
console.time('operation');
// 処理
console.timeEnd('operation');
```

### メモリ監視
- Chrome DevToolsのMemoryタブ
- ヒープスナップショットの比較

## チェックリスト

- [ ] 不要な再レンダリングがないか確認
- [ ] 大量データは仮想化されているか
- [ ] GeoJSONは適切にカリングされているか
- [ ] 非同期処理は効率的か
- [ ] メモリリークがないか確認
