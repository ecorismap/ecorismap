# パフォーマンス改善案：大量データの処理

## 問題点
大量のポイント、ライン、ポリゴンデータを読み込むと、データ一覧などの表示パフォーマンスが低下する。

## 改善案

### 1. DataTableコンポーネントの最適化

#### 現在の問題
- DraggableFlatListに最小限の最適化プロパティしか設定されていない
- ページネーションが実装されていない
- レンダリングアイテムが重い（ネストされたビューと条件付きレンダリング）

#### 改善案
```tsx
// src/components/organisms/DataTable.tsx の改善案

// 1. 最適化プロパティの追加
<DraggableFlatList
  data={sortedRecordSet}
  initialNumToRender={15}
  maxToRenderPerBatch={10}      // 追加：バッチごとのレンダリング数
  windowSize={10}               // 追加：ビューポート外のウィンドウサイズ
  updateCellsBatchingPeriod={50} // 追加：更新のバッチ処理期間
  removeClippedSubviews={true}
  getItemLayout={(data, index) => ({
    length: 45, // 固定の行高さ
    offset: 45 * index,
    index,
  })}
  keyExtractor={(item) => item.id} // 安定したキーの使用
  // ... 他のプロパティ
/>

// 2. レンダリング関数の最適化
const renderItem = useCallback(({ item, drag, isActive }: RenderItemParams<RecordType>) => {
  return <MemoizedDataRow item={item} drag={drag} isActive={isActive} />;
}, []);

// 3. メモ化されたデータ行コンポーネント
const MemoizedDataRow = React.memo(({ item, drag, isActive }) => {
  // 現在のレンダリングロジック
}, (prevProps, nextProps) => {
  // カスタム比較関数で不要な再レンダリングを防ぐ
  return prevProps.item.id === nextProps.item.id &&
         prevProps.isActive === nextProps.isActive;
});
```

### 2. ページネーションの実装

```tsx
// src/hooks/useData.ts に追加

const PAGE_SIZE = 50;

export const useData = () => {
  const [currentPage, setCurrentPage] = useState(1);
  
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    const endIndex = startIndex + PAGE_SIZE;
    return sortedRecordSet.slice(startIndex, endIndex);
  }, [sortedRecordSet, currentPage]);
  
  const loadMore = useCallback(() => {
    if (currentPage * PAGE_SIZE < sortedRecordSet.length) {
      setCurrentPage(prev => prev + 1);
    }
  }, [currentPage, sortedRecordSet.length]);
  
  // ... 他のロジック
};
```

### 3. 地図表示の最適化

#### ポイントのクラスタリング
```tsx
// src/components/organisms/HomePoint.tsx の改善案

const useClusteredPoints = (points: PointRecordType[], zoom: number) => {
  return useMemo(() => {
    if (zoom > 15) return points; // ズームレベルが高い場合はクラスタリングしない
    
    // クラスタリングアルゴリズムの実装
    // 例：supercluster ライブラリの使用を検討
    return clusterPoints(points, zoom);
  }, [points, zoom]);
};
```

#### ビューポートカリング
```tsx
// src/hooks/useMapView.ts に追加

const useVisibleFeatures = (features: RecordType[], mapBounds: BoundsType) => {
  return useMemo(() => {
    return features.filter(feature => {
      // 地物が現在のビューポート内にあるかチェック
      return isFeatureInBounds(feature, mapBounds);
    });
  }, [features, mapBounds]);
};
```

### 4. データ処理の最適化

```tsx
// src/hooks/useData.ts の改善案

// ソート済みデータのメモ化
const sortedData = useMemo(() => {
  return sortData(recordSet, sortedName, sortedOrder);
}, [recordSet, sortedName, sortedOrder]);

// 検索・フィルタリングのデバウンス
const debouncedSearch = useMemo(
  () => debounce((searchTerm: string) => {
    // 検索ロジック
  }, 300),
  []
);
```

### 5. React.memoとuseMemoの活用

```tsx
// コンポーネントレベルの最適化
export const DataTable = React.memo(() => {
  // コンポーネントロジック
}, (prevProps, nextProps) => {
  // プロパティの比較
  return prevProps.data.length === nextProps.data.length;
});

// 計算結果のメモ化
const expensiveCalculation = useMemo(() => {
  return processLargeDataSet(data);
}, [data]);
```

### 6. 遅延読み込みの実装

```tsx
// 写真フィールドの遅延読み込み
const LazyPhoto = React.lazy(() => import('./PhotoField'));

// 使用例
<Suspense fallback={<View style={styles.photoPlaceholder} />}>
  <LazyPhoto uri={photoUri} />
</Suspense>
```

### 7. Web Worker の活用（Web版のみ）

```typescript
// src/utils/workers/dataProcessor.worker.ts
self.addEventListener('message', (event) => {
  const { data, operation } = event.data;
  
  switch (operation) {
    case 'SORT':
      const sorted = heavySortOperation(data);
      self.postMessage({ result: sorted });
      break;
    case 'FILTER':
      const filtered = heavyFilterOperation(data);
      self.postMessage({ result: filtered });
      break;
  }
});
```

## 実装の優先順位

1. **即効性の高い改善**（すぐに実装可能）
   - DraggableFlatListの最適化プロパティ追加
   - React.memoの適用
   - keyExtractorの最適化

2. **中期的な改善**（1-2週間）
   - ページネーション/無限スクロールの実装
   - データ処理のメモ化
   - ビューポートカリング

3. **長期的な改善**（1ヶ月以上）
   - ポイントクラスタリング
   - Web Workerの実装
   - データベースレベルの最適化

## 期待される効果

- **初期レンダリング時間**: 50-70%短縮
- **スクロールパフォーマンス**: 60-80%改善
- **メモリ使用量**: 30-50%削減
- **1000件以上のデータ**: スムーズに表示可能

## テスト方法

1. React DevTools Profilerでレンダリング時間を計測
2. 1000件、5000件、10000件のデータでパフォーマンステスト
3. メモリ使用量のモニタリング
4. ユーザビリティテスト（実際の操作感）