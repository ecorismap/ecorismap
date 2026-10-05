import { Peak } from '../peakData';
import { selectPeak3DCandidates, thinPeak3DLabels, ProjectedPeak3D } from '../peak3dLabels';

const peaks: Peak[] = [
  { latitude: 35.36064, longitude: 138.72733, ele: 3776, name: '富士山', rank: 1 },
  // 2693mの宝永山は標高の上限が効いてしまうので、同じ場所に小さな山を置く
  { latitude: 35.3455, longitude: 138.751, ele: 900, name: '裾野の山', rank: 4 },
  { latitude: 35.62517, longitude: 139.24361, ele: 599, name: '高尾山', rank: 2 },
];
const center = { latitude: 35.5, longitude: 138.76 };

describe('selectPeak3DCandidates', () => {
  it('縮尺の規則（小さな山はz10から）と距離上限（小さな山は15km）で選ぶ', () => {
    expect(selectPeak3DCandidates(peaks, center, 8).map((p) => p.name)).toEqual(['富士山', '高尾山']);
    // z12でも裾野の山（ランク4）は約18km先なので距離上限で外れる
    expect(selectPeak3DCandidates(peaks, center, 12).map((p) => p.name)).toEqual(['富士山', '高尾山']);
    expect(selectPeak3DCandidates(peaks, { latitude: 35.4, longitude: 138.76 }, 12).map((p) => p.name)).toContain(
      '裾野の山'
    );
  });

  it('高い山はランクの上限より遠くまで出す', () => {
    // 那須あたりから約226km先の富士山（上限約278km）
    expect(selectPeak3DCandidates(peaks, { latitude: 37.12, longitude: 140.0 }, 8).map((p) => p.name)).toEqual(['富士山']);
  });
});

const projected = (name: string, rank: number, x: number, y: number, ele = 1000): ProjectedPeak3D => ({
  latitude: 35,
  longitude: 138,
  ele,
  name,
  rank,
  key: name,
  text: `${name} ${ele}`,
  x,
  y,
});

describe('thinPeak3DLabels', () => {
  const options = { boxWidth: 100, boxHeight: 24, maxLabels: 40 };
  it('画面上で重なる山は、重要な方・高い方を残す', () => {
    const result = thinPeak3DLabels(
      [projected('小さな峰', 4, 200, 200), projected('主峰', 1, 240, 210), projected('離れた山', 4, 400, 200)],
      options
    );
    expect(result.map((p) => p.name).sort()).toEqual(['主峰', '離れた山']);
  });
  it('縦に離れていれば横が近くても両方出す', () => {
    const result = thinPeak3DLabels([projected('上', 2, 200, 100), projected('下', 2, 210, 300)], options);
    expect(result).toHaveLength(2);
  });
  it('表示数の上限を守る', () => {
    const many = Array.from({ length: 10 }, (_, i) => projected(`山${i}`, 2, i * 150, 100));
    expect(thinPeak3DLabels(many, { ...options, maxLabels: 3 })).toHaveLength(3);
  });
});
