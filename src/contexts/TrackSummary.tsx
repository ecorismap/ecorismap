import { createContext } from 'react';
import { TrackStatistics, ElevationProfilePoint } from '../utils/trackStatistics';

interface TrackSummaryContextType {
  statistics: TrackStatistics | null;
  profile: ElevationProfilePoint[];
  // 記録中の軌跡ログを表示中か（サマリーは定期的にライブ更新される）
  isRecording: boolean;
  gotoBack: () => void;
  // 軌跡(trk)+写真(wpt)のGPXと写真ファイルをzipでエクスポートする
  pressExportTrack: () => Promise<void>;
  isExporting: boolean;
  // エクスポート中の進捗メッセージ（ローディング表示用）
  exportProgress: string;
  // 軌跡上の写真表示（ネイティブのみ。Webでは常にfalse/0件）
  isTrackPhotoVisible: boolean;
  toggleTrackPhotoVisible: () => void;
  trackPhotoCount: number;
  isLimitedAccess: boolean;
  presentLimitedPicker: () => Promise<void>;
  // 軌跡の再生（3Dではカメラが追従する。2Dはマーカーとグラフのカーソルが進む）
  isReplaying: boolean;
  // 標高プロファイルが無い・全長0の軌跡は再生できない
  canReplay: boolean;
  toggleReplay: () => void;
}

export const TrackSummaryContext = createContext({} as TrackSummaryContextType);
