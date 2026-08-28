import { createContext } from 'react';
import { TrackStatistics, ElevationProfilePoint } from '../utils/trackStatistics';

interface TrackSummaryContextType {
  statistics: TrackStatistics | null;
  profile: ElevationProfilePoint[];
  // 記録中の軌跡ログを表示中か（サマリーは定期的にライブ更新される）
  isRecording: boolean;
  gotoBack: () => void;
  // 軌跡上の写真表示（ネイティブのみ。Webでは常にfalse/0件）
  isTrackPhotoVisible: boolean;
  toggleTrackPhotoVisible: () => void;
  trackPhotoCount: number;
  isLimitedAccess: boolean;
  presentLimitedPicker: () => Promise<void>;
}

export const TrackSummaryContext = createContext({} as TrackSummaryContextType);
