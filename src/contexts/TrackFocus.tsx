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
}

export const TrackFocusContext = createContext<TrackFocusContextType>({
  trackFocusPoint: null,
});

/**
 * フォーカス地点を「消す・動かす」側だけのコンテキスト。
 *
 * 値と同じコンテキストに載せると、地図ドラッグ時のクリアのためにsetterだけを使う
 * Homeコンテナまでが、なぞるたび・リプレイのたびに再レンダリングされてしまう
 * （setterはuseStateのものなので、こちらの値は作り直されない）
 */
type TrackFocusSetter = (point: TrackFocusPointType | null) => void;

export const TrackFocusSetterContext = createContext<TrackFocusSetter>(() => {});

// 高頻度（グラフのドラッグ中・リプレイ中）に更新されるため、MapViewContextには載せず
// 専用Providerでグラフとマーカーだけが再レンダリングされるようにする
export function TrackFocusProvider({ children }: { children: ReactNode }) {
  const [trackFocusPoint, setTrackFocusPoint] = useState<TrackFocusPointType | null>(null);

  const value = useMemo(() => ({ trackFocusPoint }), [trackFocusPoint]);

  return (
    <TrackFocusSetterContext.Provider value={setTrackFocusPoint}>
      <TrackFocusContext.Provider value={value}>{children}</TrackFocusContext.Provider>
    </TrackFocusSetterContext.Provider>
  );
}
