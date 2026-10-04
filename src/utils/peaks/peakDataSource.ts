/**
 * 山頂データの読み込み（ネイティブ）。
 *
 * ネイティブはバンドルに同梱済みなので、モジュールを使う時点まで評価を遅らせるだけでよい。
 * 動的import()はMetroのネイティブでは「Requiring unknown module」で失敗するため使わない
 * （Webは遅延読み込みで別チャンクにする: peakDataSource.web.ts）。
 */
import type { PeakDataFile } from './peakData';

export const loadPeakDataFile = async (): Promise<PeakDataFile> =>
  require('../../presets/data/gsi_peaks.json') as PeakDataFile;
