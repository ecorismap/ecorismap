import { createContext } from 'react';
import { LineRecordType } from '../types';
import { TrackStatistics, ElevationProfilePoint } from '../utils/trackStatistics';

interface TrackSummaryContextType {
  record: LineRecordType | undefined;
  statistics: TrackStatistics | null;
  profile: ElevationProfilePoint[];
  gotoBack: () => void;
  // 軌跡上の写真表示（ネイティブのみ。Webでは常にfalse/0件）
  isTrackPhotoVisible: boolean;
  toggleTrackPhotoVisible: () => void;
  trackPhotoCount: number;
  isLimitedAccess: boolean;
  presentLimitedPicker: () => Promise<void>;
}

export const TrackSummaryContext = createContext({} as TrackSummaryContextType);
