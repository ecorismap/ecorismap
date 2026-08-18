import {
  calcTrackStatistics,
  buildElevationProfile,
  smoothAltitudes,
  ELEVATION_GAIN_THRESHOLD,
} from '../trackStatistics';
import { LocationType } from '../../types';

// trackStatisticsが依存するLocation.tsのMMKV依存をモック
jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => ({
    set: jest.fn(),
    getString: jest.fn(() => null),
    delete: jest.fn(),
    clearAll: jest.fn(),
    getAllKeys: jest.fn(() => []),
  })),
}));

jest.mock('../mmkvStorage', () => ({
  trackLogMMKV: {
    setChunk: jest.fn(),
    getChunk: jest.fn(() => null),
    removeChunk: jest.fn(),
    setMetadata: jest.fn(),
    getMetadata: jest.fn(() => null),
    setCurrentLocation: jest.fn(),
    getCurrentLocation: jest.fn(() => null),
    setTrackingState: jest.fn(),
    getTrackingState: jest.fn(() => 'off'),
  },
  storage: {
    set: jest.fn(),
    getString: jest.fn(),
    delete: jest.fn(),
    clearAll: jest.fn(),
    getAllKeys: jest.fn(() => []),
  },
  reduxMMKVStorage: {
    setItem: jest.fn(() => Promise.resolve(true)),
    getItem: jest.fn(() => Promise.resolve(null)),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}));

// 北方向へおよそ meters[i] 間隔で並ぶトラックを生成する（緯度1度≒111.19km）
const makeTrack = (
  count: number,
  options?: {
    stepMeters?: number;
    altitude?: (i: number) => number | null | undefined;
    speed?: (i: number) => number | null | undefined;
    startTime?: number;
    intervalMs?: number;
  }
): LocationType[] => {
  const stepMeters = options?.stepMeters ?? 100;
  const startTime = options?.startTime ?? 1700000000000;
  const intervalMs = options?.intervalMs ?? 10000;
  return Array.from({ length: count }, (_, i) => ({
    latitude: 35 + (i * stepMeters) / 111190,
    longitude: 135,
    altitude: options?.altitude ? options.altitude(i) : 100,
    speed: options?.speed ? options.speed(i) : 1,
    timestamp: startTime + i * intervalMs,
  }));
};

describe('smoothAltitudes', () => {
  it('空配列は空配列を返す', () => {
    expect(smoothAltitudes([])).toEqual([]);
  });

  it('一定値はそのまま', () => {
    expect(smoothAltitudes([100, 100, 100, 100, 100])).toEqual([100, 100, 100, 100, 100]);
  });

  it('スパイクが平滑化される', () => {
    const smoothed = smoothAltitudes([100, 100, 150, 100, 100]);
    expect(Math.max(...smoothed)).toBeLessThan(150);
  });
});

describe('calcTrackStatistics', () => {
  it('平坦＋閾値未満のノイズでは獲得標高が0になる', () => {
    const track = makeTrack(100, { altitude: (i) => 100 + (i % 2 === 0 ? 3 : -3) });
    const stats = calcTrackStatistics(track);
    expect(stats.ascent).toBe(0);
    expect(stats.descent).toBe(0);
  });

  it('単調上昇100mでおよそ100mの獲得標高になる', () => {
    const track = makeTrack(101, { altitude: (i) => 100 + i });
    const stats = calcTrackStatistics(track);
    expect(stats.ascent).toBeGreaterThan(90);
    expect(stats.ascent).toBeLessThanOrEqual(100);
    expect(stats.descent).toBe(0);
    expect(stats.maxAltitude).toBeGreaterThan(190);
    expect(stats.minAltitude).toBeLessThan(110);
  });

  it('上昇後下降で両方が累積される', () => {
    const track = makeTrack(201, { altitude: (i) => (i <= 100 ? 100 + i : 200 - (i - 100)) });
    const stats = calcTrackStatistics(track);
    expect(stats.ascent).toBeGreaterThan(90);
    expect(stats.descent).toBeGreaterThan(90);
  });

  it('閾値ちょうどの変化は累積される', () => {
    const altitudes = [100, 100 + ELEVATION_GAIN_THRESHOLD];
    // smoothingの影響を受けないよう定常区間を挟む
    const track = makeTrack(20, { altitude: (i) => (i < 10 ? altitudes[0] : altitudes[1]) });
    const stats = calcTrackStatistics(track);
    expect(stats.ascent).toBeGreaterThan(0);
  });

  it('標高が全て欠損なら標高系はnull', () => {
    const track = makeTrack(10, { altitude: () => null });
    const stats = calcTrackStatistics(track);
    expect(stats.ascent).toBeNull();
    expect(stats.descent).toBeNull();
    expect(stats.maxAltitude).toBeNull();
    expect(stats.minAltitude).toBeNull();
    expect(stats.distanceKm).toBeGreaterThan(0);
  });

  it('0点・1点では距離0で時間・速度系はそれぞれ妥当な値になる', () => {
    const empty = calcTrackStatistics([]);
    expect(empty.distanceKm).toBe(0);
    expect(empty.startTime).toBeNull();
    expect(empty.durationSeconds).toBeNull();
    expect(empty.averageSpeedKmh).toBeNull();

    const single = calcTrackStatistics(makeTrack(1));
    expect(single.distanceKm).toBe(0);
    expect(single.durationSeconds).toBe(0);
    expect(single.averageSpeedKmh).toBeNull();
  });

  it('所要時間と平均速度が計算される', () => {
    // 100m間隔×100区間=10km、10秒間隔×100区間=1000秒
    const track = makeTrack(101, { intervalMs: 10000 });
    const stats = calcTrackStatistics(track);
    expect(stats.durationSeconds).toBe(1000);
    expect(stats.distanceKm).toBeCloseTo(10, 1);
    // 10km / (1000/3600 h) = 36 km/h
    expect(stats.averageSpeedKmh).toBeCloseTo(36, 0);
  });

  it('最高速度はm/sからkm/hに変換され負値は除外される', () => {
    const track = makeTrack(10, { speed: (i) => (i === 5 ? 10 : i === 6 ? -1 : 1) });
    const stats = calcTrackStatistics(track);
    expect(stats.maxSpeedKmh).toBeCloseTo(36, 5);
  });

  it('速度が全て欠損ならnull', () => {
    const track = makeTrack(10, { speed: () => null });
    expect(calcTrackStatistics(track).maxSpeedKmh).toBeNull();
  });

  it('timestampが全て欠損なら時間系はnull', () => {
    const track = makeTrack(10).map(({ timestamp: _timestamp, ...rest }) => rest);
    const stats = calcTrackStatistics(track);
    expect(stats.startTime).toBeNull();
    expect(stats.endTime).toBeNull();
    expect(stats.durationSeconds).toBeNull();
    expect(stats.averageSpeedKmh).toBeNull();
  });
});

describe('buildElevationProfile', () => {
  it('累積距離が単調増加しmaxPoints以下に間引かれる', () => {
    const track = makeTrack(1000, { altitude: (i) => 100 + i * 0.1 });
    const profile = buildElevationProfile(track, 300);
    expect(profile.length).toBeGreaterThan(2);
    expect(profile.length).toBeLessThanOrEqual(301); // simplifyLocationsは終点保証で+1になりうる
    for (let i = 1; i < profile.length; i++) {
      expect(profile[i].distanceKm).toBeGreaterThan(profile[i - 1].distanceKm);
    }
    // 総距離はおよそ 999×100m = 99.9km
    expect(profile[profile.length - 1].distanceKm).toBeCloseTo(99.9, 0);
  });

  it('標高欠損点は距離には寄与するがプロファイルには載らない', () => {
    const track = makeTrack(10, { altitude: (i) => (i % 2 === 0 ? 100 : null) });
    const profile = buildElevationProfile(track);
    expect(profile.length).toBe(5);
    // 欠損点を挟んだ区間の距離も積算される（点間100m×2）
    expect(profile[1].distanceKm).toBeCloseTo(0.2, 3);
  });

  it('標高のある点が2点未満なら空配列', () => {
    expect(buildElevationProfile([])).toEqual([]);
    expect(buildElevationProfile(makeTrack(10, { altitude: () => null }))).toEqual([]);
    expect(buildElevationProfile(makeTrack(10, { altitude: (i) => (i === 0 ? 100 : null) }))).toEqual([]);
  });
});
