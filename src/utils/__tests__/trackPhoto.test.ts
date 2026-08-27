import {
  TRACK_PHOTO_TIME_MARGIN_MS,
  interpolateTrackPositionAtTime,
  matchPhotoTimesToTrack,
  parseImgDirectionFromExif,
  toTrueDirection,
} from '../trackPhoto';
import { LocationType } from '../../types';

const T0 = 1700000000000;

// 北方向へ等間隔に並ぶ軌跡を生成する（i点目 = 緯度35+0.001*i、時刻T0+intervalMs*i）
const makeTrack = (count: number, intervalMs = 10000): LocationType[] =>
  Array.from({ length: count }, (_, i) => ({
    latitude: 35 + 0.001 * i,
    longitude: 135,
    timestamp: T0 + intervalMs * i,
  }));

describe('interpolateTrackPositionAtTime', () => {
  it('2点の中間時刻で座標の中点を返す', () => {
    const track = makeTrack(2);
    const pos = interpolateTrackPositionAtTime(track, T0 + 5000);
    expect(pos).not.toBeNull();
    expect(pos!.latitude).toBeCloseTo(35.0005, 10);
    expect(pos!.longitude).toBeCloseTo(135, 10);
  });

  it('軌跡点と同時刻ならその点の座標を返す', () => {
    const track = makeTrack(5);
    const pos = interpolateTrackPositionAtTime(track, T0 + 30000);
    expect(pos!.latitude).toBeCloseTo(35.003, 10);
  });

  it('開始前でもマージン内なら先頭にクランプする', () => {
    const track = makeTrack(3);
    const pos = interpolateTrackPositionAtTime(track, T0 - TRACK_PHOTO_TIME_MARGIN_MS + 1000);
    expect(pos).toEqual({ latitude: 35, longitude: 135 });
  });

  it('終了後でもマージン内なら末尾にクランプする', () => {
    const track = makeTrack(3);
    const pos = interpolateTrackPositionAtTime(track, T0 + 20000 + TRACK_PHOTO_TIME_MARGIN_MS - 1000);
    expect(pos).toEqual({ latitude: 35.002, longitude: 135 });
  });

  it('マージン外はnull', () => {
    const track = makeTrack(3);
    expect(interpolateTrackPositionAtTime(track, T0 - TRACK_PHOTO_TIME_MARGIN_MS - 1)).toBeNull();
    expect(interpolateTrackPositionAtTime(track, T0 + 20000 + TRACK_PHOTO_TIME_MARGIN_MS + 1)).toBeNull();
  });

  it('timestampを持たない点はスキップして補間する', () => {
    const track: LocationType[] = [
      { latitude: 35, longitude: 135, timestamp: T0 },
      { latitude: 99, longitude: 99 }, // timestampなし
      { latitude: 35.001, longitude: 135, timestamp: T0 + 10000 },
    ];
    const pos = interpolateTrackPositionAtTime(track, T0 + 5000);
    expect(pos!.latitude).toBeCloseTo(35.0005, 10);
  });

  it('有効timestampが2点未満ならnull', () => {
    expect(interpolateTrackPositionAtTime([], T0)).toBeNull();
    expect(interpolateTrackPositionAtTime([{ latitude: 35, longitude: 135, timestamp: T0 }], T0)).toBeNull();
    expect(
      interpolateTrackPositionAtTime(
        [
          { latitude: 35, longitude: 135 },
          { latitude: 36, longitude: 135 },
        ],
        T0
      )
    ).toBeNull();
  });

  it('timestampが逆行する軌跡はnull（安全側）', () => {
    const track: LocationType[] = [
      { latitude: 35, longitude: 135, timestamp: T0 },
      { latitude: 35.001, longitude: 135, timestamp: T0 + 20000 },
      { latitude: 35.002, longitude: 135, timestamp: T0 + 10000 },
    ];
    expect(interpolateTrackPositionAtTime(track, T0 + 5000)).toBeNull();
  });

  it('記録の長い空白区間内も線形補間する', () => {
    const track: LocationType[] = [
      { latitude: 35, longitude: 135, timestamp: T0 },
      { latitude: 35.01, longitude: 135.01, timestamp: T0 + 60 * 60 * 1000 }, // 1時間の空白
    ];
    const pos = interpolateTrackPositionAtTime(track, T0 + 30 * 60 * 1000);
    expect(pos!.latitude).toBeCloseTo(35.005, 10);
    expect(pos!.longitude).toBeCloseTo(135.005, 10);
  });
});

describe('matchPhotoTimesToTrack', () => {
  it('複数写真を一括照合し、範囲外はnullになる', () => {
    const track = makeTrack(3);
    const results = matchPhotoTimesToTrack(track, [T0 + 5000, T0 - TRACK_PHOTO_TIME_MARGIN_MS - 1, T0 + 15000]);
    expect(results).toHaveLength(3);
    expect(results[0]!.latitude).toBeCloseTo(35.0005, 10);
    expect(results[1]).toBeNull();
    expect(results[2]!.latitude).toBeCloseTo(35.0015, 10);
  });

  it('軌跡が不正なら全てnull', () => {
    expect(matchPhotoTimesToTrack([], [T0, T0 + 1000])).toEqual([null, null]);
  });
});

describe('parseImgDirectionFromExif', () => {
  it('iOSのネスト形式（{GPS}）を読む', () => {
    const exif = { '{GPS}': { ImgDirection: 123.5, ImgDirectionRef: 'T' } };
    expect(parseImgDirectionFromExif(exif)).toEqual({ direction: 123.5, ref: 'T' });
  });

  it('Androidのフラット形式（double + string）を読む', () => {
    const exif = { GPSImgDirection: 250.25, GPSImgDirectionRef: 'M' };
    expect(parseImgDirectionFromExif(exif)).toEqual({ direction: 250.25, ref: 'M' });
  });

  it('Refがない場合はT扱い（補正しない安全側）', () => {
    expect(parseImgDirectionFromExif({ GPSImgDirection: 90 })).toEqual({ direction: 90, ref: 'T' });
  });

  it('有理数文字列("347/100")も解釈する', () => {
    expect(parseImgDirectionFromExif({ GPSImgDirection: '347/100', GPSImgDirectionRef: 'M' })).toEqual({
      direction: 3.47,
      ref: 'M',
    });
  });

  it('360以上は0-360に正規化する', () => {
    expect(parseImgDirectionFromExif({ GPSImgDirection: 365 })!.direction).toBe(5);
    expect(parseImgDirectionFromExif({ GPSImgDirection: 360 })!.direction).toBe(0);
  });

  it('方向がない・NaN・負値はnull', () => {
    expect(parseImgDirectionFromExif(null)).toBeNull();
    expect(parseImgDirectionFromExif(undefined)).toBeNull();
    expect(parseImgDirectionFromExif({})).toBeNull();
    expect(parseImgDirectionFromExif({ '{GPS}': {} })).toBeNull();
    expect(parseImgDirectionFromExif({ GPSImgDirection: NaN })).toBeNull();
    expect(parseImgDirectionFromExif({ GPSImgDirection: -1 })).toBeNull();
    expect(parseImgDirectionFromExif({ GPSImgDirection: 'abc' })).toBeNull();
  });
});

describe('toTrueDirection', () => {
  it('ref=Tはそのまま', () => {
    expect(toTrueDirection(123.4, 'T', -8)).toBe(123.4);
  });

  it('ref=Mは偏角を加算する（西偏=負）', () => {
    // 磁気方位5°・西偏8° → 真方位357°
    expect(toTrueDirection(5, 'M', -8)).toBe(357);
    // 磁気方位350°・東偏15° → 真方位5°
    expect(toTrueDirection(350, 'M', 15)).toBe(5);
  });
});
