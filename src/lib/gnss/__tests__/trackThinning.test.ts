import { GNSS_TRACK_KEEPALIVE_MS, shouldRecordGnssTrackPoint, trackThinningDistance } from '../trackThinning';

// 緯度方向に約1mずらす量
const ONE_METER_LAT = 1 / 111_320;
const at = (northMeters: number, timestamp: number, accuracy: number) => ({
  latitude: 35 + northMeters * ONE_METER_LAT,
  longitude: 139,
  timestamp,
  accuracy,
});

describe('trackThinningDistance', () => {
  it('精度に合わせる場合はFIXで約10cm、FLOATで約1m、上限は10m', () => {
    expect(trackThinningDistance('adaptive', 2, 0.014)).toBe(0.1);
    expect(trackThinningDistance('adaptive', 2, 0.5)).toBe(1);
    expect(trackThinningDistance('adaptive', 2, 30)).toBe(10);
  });

  it('距離で間引く場合は指定距離、すべて記録なら0', () => {
    expect(trackThinningDistance('distance', 5, 0.014)).toBe(5);
    expect(trackThinningDistance('all', 5, 0.014)).toBe(0);
  });
});

describe('shouldRecordGnssTrackPoint', () => {
  it('新しい記録の最初の点は必ず記録する', () => {
    expect(shouldRecordGnssTrackPoint(null, at(0, 1000, 0.014), 'distance', 5)).toBe(true);
  });

  it('すべて記録なら動いていなくても記録する', () => {
    expect(shouldRecordGnssTrackPoint(at(0, 1000, 0.014), at(0, 2000, 0.014), 'all', 2)).toBe(true);
  });

  it('FIXで止まっている間のcm単位のばらつきは間引き、10cm以上動けば記録する', () => {
    const last = at(0, 1000, 0.014);
    expect(shouldRecordGnssTrackPoint(last, at(0.03, 2000, 0.014), 'adaptive', 2)).toBe(false);
    expect(shouldRecordGnssTrackPoint(last, at(0.15, 2000, 0.014), 'adaptive', 2)).toBe(true);
  });

  it('距離で間引く場合は指定距離まで動くまで記録しない', () => {
    const last = at(0, 1000, 0.014);
    expect(shouldRecordGnssTrackPoint(last, at(1.5, 2000, 0.014), 'distance', 2)).toBe(false);
    expect(shouldRecordGnssTrackPoint(last, at(2.5, 2000, 0.014), 'distance', 2)).toBe(true);
  });

  it('止まっていても30秒ごとに1点は記録する', () => {
    const last = at(0, 1000, 0.014);
    expect(shouldRecordGnssTrackPoint(last, at(0, 1000 + GNSS_TRACK_KEEPALIVE_MS - 1, 0.014), 'distance', 5)).toBe(
      false
    );
    expect(shouldRecordGnssTrackPoint(last, at(0, 1000 + GNSS_TRACK_KEEPALIVE_MS, 0.014), 'distance', 5)).toBe(true);
  });
});
