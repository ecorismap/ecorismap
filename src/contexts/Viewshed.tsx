import React, { createContext, useCallback, useMemo, useState, ReactNode } from 'react';
import { ViewshedPreviewResult } from '../utils/viewshedPreview';

export type { ViewshedPreviewResult };

interface ViewshedContextType {
  // 表示中の計算結果（作成順）。消去までメモリのみで保持（レイヤ化はしない）
  viewshedResults: ViewshedPreviewResult[];
  hasViewshedPreview: boolean;
  addViewshedResult: (result: ViewshedPreviewResult) => void;
  clearViewshedResults: () => void;
}

export const ViewshedContext = createContext<ViewshedContextType>({
  viewshedResults: [],
  hasViewshedPreview: false,
  addViewshedResult: () => {},
  clearViewshedResults: () => {},
});

// 可視領域の一時表示状態。複数の観測点の結果を重ねて保持し、消去でまとめて消す。
// MapViewContextには載せず専用Providerでプレビューとバナーだけが
// 再レンダリングされるようにする（Measureと同方式）
export function ViewshedProvider({ children }: { children: ReactNode }) {
  const [viewshedResults, setViewshedResults] = useState<ViewshedPreviewResult[]>([]);

  const addViewshedResult = useCallback((result: ViewshedPreviewResult) => {
    setViewshedResults((prev) => [...prev, result]);
  }, []);

  const clearViewshedResults = useCallback(() => {
    setViewshedResults([]);
  }, []);

  const value = useMemo(
    () => ({
      viewshedResults,
      hasViewshedPreview: viewshedResults.length > 0,
      addViewshedResult,
      clearViewshedResults,
    }),
    [viewshedResults, addViewshedResult, clearViewshedResults]
  );

  return <ViewshedContext.Provider value={value}>{children}</ViewshedContext.Provider>;
}
