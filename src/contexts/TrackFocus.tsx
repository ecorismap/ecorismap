import React, { createContext, useMemo, useState, ReactNode } from 'react';
import { ElevationProfilePoint } from '../utils/trackStatistics';

// 標高グラフと地図マーカーの連動用のフォーカス地点。
// indexはプロファイル内のインデックス（グラフのカーソル位置に対応）
export interface TrackFocusPointType extends ElevationProfilePoint {
  index: number;
}

interface TrackFocusContextType {
  // TrackSummary表示中のグラフカーソル位置。非表示時はnull（マーカーも消える）
  trackFocusPoint: TrackFocusPointType | null;
  setTrackFocusPoint: (point: TrackFocusPointType | null) => void;
}

export const TrackFocusContext = createContext<TrackFocusContextType>({
  trackFocusPoint: null,
  setTrackFocusPoint: () => {},
});

// 高頻度（グラフのドラッグ中）に更新されるため、MapViewContextには載せず専用Providerで
// グラフとマーカーだけが再レンダリングされるようにする
export function TrackFocusProvider({ children }: { children: ReactNode }) {
  const [trackFocusPoint, setTrackFocusPoint] = useState<TrackFocusPointType | null>(null);

  const value = useMemo(() => ({ trackFocusPoint, setTrackFocusPoint }), [trackFocusPoint]);

  return <TrackFocusContext.Provider value={value}>{children}</TrackFocusContext.Provider>;
}
