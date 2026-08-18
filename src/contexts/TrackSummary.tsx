import { createContext } from 'react';
import { LineRecordType } from '../types';
import { TrackStatistics, ElevationProfilePoint } from '../utils/trackStatistics';

interface TrackSummaryContextType {
  record: LineRecordType | undefined;
  statistics: TrackStatistics | null;
  profile: ElevationProfilePoint[];
  gotoBack: () => void;
}

export const TrackSummaryContext = createContext({} as TrackSummaryContextType);
