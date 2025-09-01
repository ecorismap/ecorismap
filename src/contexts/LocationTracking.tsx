import React from 'react';
import { TrackingStateType, MemberLocationType, LayerType, RecordType, TrackMetadataType } from '../types';

export interface LocationTrackingContextType {
  trackingState: TrackingStateType;
  trackMetadata: TrackMetadataType;
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
