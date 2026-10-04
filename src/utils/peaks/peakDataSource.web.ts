/**
 * 山頂データの読み込み（Web）。初期バンドルを太らせないよう、初めて眺望に入ったときに読む
 */
import type { PeakDataFile } from './peakData';

export const loadPeakDataFile = async (): Promise<PeakDataFile> => {
  const module = await import('../../presets/data/gsi_peaks.json');
  return (module.default ?? module) as unknown as PeakDataFile;
};
