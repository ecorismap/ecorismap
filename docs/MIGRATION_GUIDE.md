# HomeContext Split Migration Guide

## Status: 移行完了（2026-07）

モノリシックな `HomeContext`（約86 props）から小さなContextへの分割は**完了済み**です。
旧 `src/contexts/Home.tsx` は削除されました。本ドキュメントは現在のContext構成のリファレンスと、
新しいContextを追加する際のベストプラクティスとして残しています。

## 現在のContext構成（11分割）

`src/containers/Home.tsx` が全Contextのプロバイダを構成しています。

| Context | ファイル | 責務 |
|---------|---------|------|
| MapViewContext | `src/contexts/MapView.tsx` | 地図表示状態・地図操作 |
| DrawingToolsContext | `src/contexts/DrawingTools.tsx` | 描画ツール（ポイント/ライン/ポリゴン編集） |
| PDFExportContext | `src/contexts/PDFExport.tsx` | PDF出力設定 |
| LocationTrackingContext | `src/contexts/LocationTracking.tsx` | GPS・トラッキング状態 |
| ProjectContext | `src/contexts/Project.tsx` | プロジェクト状態・操作 |
| SVGDrawingContext | `src/contexts/SVGDrawing.tsx` | SVG描画 |
| TileManagementContext | `src/contexts/TileManagement.tsx` | タイルダウンロード管理 |
| MapMemoContext | `src/contexts/MapMemo.tsx` | 地図メモ（ペン・スタンプ・消しゴム） |
| DataSelectionContext | `src/contexts/DataSelection.tsx` | データ選択状態 |
| InfoToolContext | `src/contexts/InfoTool.tsx` | 情報表示ツール |
| AppStateContext | `src/contexts/AppState.tsx` | アプリ全般状態・ナビゲーション |

## 残課題

- `DrawingToolsContext`（約49フィールド）は依然大きく、再分割の余地がある
- `src/containers/Home.tsx`（2600行超）に全フックとプロバイダが集中しており、
  コンテナ分割は中期課題

## ベストプラクティス（新Context追加時）

### 1. Context値は必ずuseMemoでメモ化する

```tsx
const tileManagementValue = useMemo(
  () => ({
    // values...
  }),
  [/* dependencies */]
);
```

### 2. コンポーネントは必要なContextだけを購読する

```tsx
import { useContext } from 'react';
import { MapMemoContext } from '../../contexts/MapMemo';
import { AppStateContext } from '../../contexts/AppState';

const MyComponent = () => {
  const { currentMapMemoTool, penColor } = useContext(MapMemoContext);
  const { user } = useContext(AppStateContext);
};
```

### 3. 関連するデータは同じContextにまとめる

```tsx
// Good: 地図メモ関連は1つのContextに
const { penColor, penWidth, currentTool } = useContext(MapMemoContext);

// Avoid: 関連データを複数Contextに分散させる
const { penColor } = useContext(ColorContext);
const { penWidth } = useContext(WidthContext);
```

## テスト

### Contextのモック

```tsx
const mockMapMemoContext = {
  currentMapMemoTool: 'PEN',
  penColor: '#000000',
  // ... other values
};

const wrapper = ({ children }) => (
  <MapMemoContext.Provider value={mockMapMemoContext}>
    {children}
  </MapMemoContext.Provider>
);

const { result } = renderHook(() => useSomething(), { wrapper });
```

### パフォーマンス確認

React DevTools Profilerで再レンダリング数を確認する:
1. 変更前のプロファイルを記録
2. 変更後のプロファイルを記録
3. コンポーネントのレンダー回数を比較
