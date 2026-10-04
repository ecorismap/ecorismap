import { isSightBlocked, sightSamples } from '../sightline';

// 緯度方向に並べた1次元の地形。目は緯度0、山頂は緯度0.1（約11km先）
const DISTANCE_M = 11120;
const eye = { latitude: 0, longitude: 0, altitude: 1000 };
const summit = { latitude: 0.1, longitude: 0, altitude: 2000 };
/** 緯度latの位置の標高。ridgeは[位置0〜1, 高さ]の尾根 */
const terrain =
  (ridge?: [number, number]) =>
  (latitude: number): number => {
    const t = latitude / 0.1;
    if (ridge && Math.abs(t - ridge[0]) < 0.02) return ridge[1];
    return 500;
  };

describe('sightSamples', () => {
  it('足元ほど細かく、山頂の手前の見逃し範囲は含めない', () => {
    const samples = sightSamples(DISTANCE_M);
    expect(Math.min(...samples)).toBeLessThan(0.002);
    // 11kmの4%=約445mは見逃すので、最後の点は1-0.04より手前
    expect(Math.max(...samples)).toBeLessThanOrEqual(0.96);
  });
});

describe('isSightBlocked', () => {
  it('間に何もなければ見える', () => {
    expect(isSightBlocked(terrain(), eye, summit, DISTANCE_M)).toBe(false);
  });

  it('途中の尾根が視線より高ければ隠れる', () => {
    // 視線は中間で1500m。そこに1800mの尾根がある
    expect(isSightBlocked(terrain([0.5, 1800]), eye, summit, DISTANCE_M)).toBe(true);
  });

  it('足元のすぐ先の斜面でも隠れる（等間隔だと飛ばしてしまう距離）', () => {
    expect(isSightBlocked(terrain([0.005, 1100]), eye, summit, DISTANCE_M)).toBe(true);
  });

  it('山頂のすぐ手前の肩・火口縁は遮蔽とみなさない', () => {
    // 山頂の2%手前に、視線より少し高い火口縁がある
    expect(isSightBlocked(terrain([0.98, 2010]), eye, summit, DISTANCE_M)).toBe(false);
  });

  it('標高が読み込めていない点は判定しない', () => {
    expect(isSightBlocked(() => null, eye, summit, DISTANCE_M)).toBe(false);
  });
});
