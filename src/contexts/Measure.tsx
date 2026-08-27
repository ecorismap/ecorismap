import React, { createContext, useCallback, useMemo, useState, ReactNode } from 'react';
import { LocationType } from '../types';

interface MeasureContextType {
  // 測定モード中か（measureAの有無で導出）
  isMeasuring: boolean;
  // 起点（長押しポップアップの「距離を測定」で確定）
  measureA: LocationType | null;
  // 終点（地図タップで設定。再タップで置換）
  measureB: LocationType | null;
  startMeasure: (a: LocationType) => void;
  setMeasureB: (b: LocationType) => void;
  endMeasure: () => void;
}

export const MeasureContext = createContext<MeasureContextType>({
  isMeasuring: false,
  measureA: null,
  measureB: null,
  startMeasure: () => {},
  setMeasureB: () => {},
  endMeasure: () => {},
});

// B点タップのたびに更新されるため、MapViewContextには載せず専用Providerで
// 測定線・バナー・ポップアップだけが再レンダリングされるようにする
export function MeasureProvider({ children }: { children: ReactNode }) {
  const [measureA, setMeasureA] = useState<LocationType | null>(null);
  const [measureB, setMeasureB] = useState<LocationType | null>(null);

  const startMeasure = useCallback((a: LocationType) => {
    setMeasureA(a);
    setMeasureB(null);
  }, []);

  const endMeasure = useCallback(() => {
    setMeasureA(null);
    setMeasureB(null);
  }, []);

  const value = useMemo(
    () => ({ isMeasuring: measureA !== null, measureA, measureB, startMeasure, setMeasureB, endMeasure }),
    [measureA, measureB, startMeasure, endMeasure]
  );

  return <MeasureContext.Provider value={value}>{children}</MeasureContext.Provider>;
}
