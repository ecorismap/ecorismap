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
}

export const LocationTrackingContext = React.createContext<LocationTrackingContextType>(
  {} as LocationTrackingContextType
);
