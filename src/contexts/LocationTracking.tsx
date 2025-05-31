import React from 'react';
import { TrackingStateType, MemberLocationType, LayerType, RecordType } from '../types';

export interface LocationTrackingContextType {
  trackingState: TrackingStateType;
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
