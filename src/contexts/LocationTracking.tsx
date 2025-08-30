import React from 'react';
import { TrackingStateType, MemberLocationType, LayerType, RecordType, TrackLogType } from '../types';

export interface LocationTrackingContextType {
  trackingState: TrackingStateType;
  trackLog: TrackLogType;
  memberLocations: MemberLocationType[];
  pressTracking: () => void;
  pressSyncPosition: () => void;
  pressDeletePosition: () => void;
  editPositionMode: boolean;
  editPositionLayer: LayerType | undefined;
  editPositionRecord: RecordType | undefined;
  finishEditPosition: () => void;
  // 擬似GPS関連（開発用）
  useMockGps?: boolean;
  toggleMockGps?: (enabled: boolean, config?: any) => Promise<void>;
  mockGpsProgress?: { current: number; total: number; percentage: number };
}

export const LocationTrackingContext = React.createContext<LocationTrackingContextType>(
  {} as LocationTrackingContextType
);
