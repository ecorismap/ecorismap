import { buildPeakIndex, distanceM, PeakDataFile } from '../peakData';
import { layoutPeakLabels, nearBonus, ProjectedPeak, selectPeakCandidates, PeakLayoutOptions } from '../peakLabelLayout';

const data: PeakDataFile = {
  attribution: 'test',
  fields: ['lon', 'lat', 'ele', 'name', 'rank'],
  rows: [
    [138.72733, 35.36064, 3776, '富士山', 1],
    [138.23883, 35.67431, 3193, '北岳', 1],
    [138.751, 35.3455, 2693, '宝永山', 4],
    [139.24361, 35.62517, 599, '高尾山', 2],
  ],
};

const peak = (name: string, x: number, rank: number, extra: Partial<ProjectedPeak> = {}): ProjectedPeak => ({
  key: name,
  name,
  rank,
  ele: 1000,
  distance: 10000,
  latitude: 35,
  longitude: 138,
  x,
  y: 400,
  ...extra,
});

const options: PeakLayoutOptions = {
  width: 400,
  leftInset: 0,
  bandTop: 100,
  columnWidth: 20,
  charHeight: 15,
  minStem: 12,
  maxLabels: 40,
  previous: new Set(),
};

describe('distanceM', () => {
  it('緯度1度はおよそ111km', () => {
    expect(distanceM(35, 138, 36, 138)).toBeCloseTo(111195, -2);
  });
});

describe('buildPeakIndex', () => {
  it('半径内の山だけを返す', () => {
    const index = buildPeakIndex(data);
    // 富士山の山頂から10km以内には富士山と宝永山だけ
    const names = index
      .query(35.36064, 138.72733, 10000)
      .map((p) => p.name)
      .sort();
    expect(names).toEqual(['宝永山', '富士山']);
    // 100kmに広げると北岳・高尾山も入る
    expect(index.query(35.36064, 138.72733, 100000)).toHaveLength(4);
  });
});

describe('selectPeakCandidates', () => {
  it('ランクごとの距離上限を超える小さな山は外す', () => {
    const index = buildPeakIndex(data);
    // 河口湖あたりから。宝永山（ランク4、上限15km）は約18km先なので外れる
    const viewpoint = { latitude: 35.5, longitude: 138.76 };
    const names = selectPeakCandidates(index.query(viewpoint.latitude, viewpoint.longitude, 150000), viewpoint).map(
      (p) => p.name
    );
    expect(names).toContain('富士山');
    expect(names).toContain('北岳');
    expect(names).not.toContain('宝永山');
  });

  it('立っている山自体は出さない', () => {
    const index = buildPeakIndex(data);
    const viewpoint = { latitude: 35.36064, longitude: 138.72733 };
    const names = selectPeakCandidates(index.query(viewpoint.latitude, viewpoint.longitude, 150000), viewpoint).map(
      (p) => p.name
    );
    expect(names).not.toContain('富士山');
  });
});

describe('layoutPeakLabels', () => {
  it('横に重なる山は重要な方だけ残す', () => {
    const placed = layoutPeakLabels([peak('小さな峰', 200, 4), peak('主峰', 210, 1), peak('離れた山', 300, 4)], options);
    expect(placed.map((p) => p.name).sort()).toEqual(['主峰', '離れた山']);
  });

  it('近くの小さな山は、同じ方向の遠くの主要峰より優先する', () => {
    const placed = layoutPeakLabels(
      [peak('遠くの主要峰', 200, 2, { distance: 30000 }), peak('目の前の山', 205, 4, { distance: 3000 })],
      options
    );
    expect(placed.map((p) => p.name)).toEqual(['目の前の山']);
  });

  it('近さの上乗せは10km以遠で0、5kmで2段、約3.75km以内で2.5段', () => {
    expect(nearBonus(12000)).toBe(0);
    expect(nearBonus(10000)).toBe(0);
    expect(nearBonus(5000)).toBe(2);
    expect(nearBonus(1000)).toBe(2.5);
  });

  it('同じランク・同じ距離なら高い山を優先する', () => {
    const placed = layoutPeakLabels(
      [peak('低い', 200, 2, { ele: 900 }), peak('高い', 205, 2, { ele: 1500 })],
      options
    );
    expect(placed.map((p) => p.name)).toEqual(['高い']);
  });

  it('直前に出ていた山は同じランクなら残す（ちらつき防止）', () => {
    const placed = layoutPeakLabels([peak('前から', 200, 2, { ele: 900 }), peak('新顔', 205, 2, { ele: 1500 })], {
      ...options,
      previous: new Set(['前から']),
    });
    expect(placed.map((p) => p.name)).toEqual(['前から']);
  });

  it('ただし1段以上重要な山には譲る', () => {
    const placed = layoutPeakLabels([peak('前から', 200, 3), peak('主峰', 205, 2)], {
      ...options,
      previous: new Set(['前から']),
    });
    expect(placed.map((p) => p.name)).toEqual(['主峰']);
  });

  it('ラベルは帯の上端に揃い、山頂が帯にかかるときは山頂の真上へずらす', () => {
    const [low] = layoutPeakLabels([peak('富士山', 100, 1, { y: 400 })], options);
    expect(low.labelTop).toBe(100);
    expect(low.labelHeight).toBe(3 * 15);
    // 山頂がy=150だと帯（100〜145）＋引き出し線12にかかるので上へ逃がす
    const [high] = layoutPeakLabels([peak('富士山', 100, 1, { y: 150 })], options);
    expect(high.labelTop).toBe(150 - 12 - 45);
  });

  it('画面の上に収まらない山と画面外の山は出さない', () => {
    const placed = layoutPeakLabels([peak('見上げすぎ', 100, 1, { y: 30 }), peak('画面外', 500, 1)], options);
    expect(placed).toHaveLength(0);
  });

  it('左端のボタン列には置かない', () => {
    const placed = layoutPeakLabels([peak('ボタンの下', 30, 1), peak('右', 200, 1)], { ...options, leftInset: 56 });
    expect(placed.map((p) => p.name)).toEqual(['右']);
  });

  it('表示数の上限を守る', () => {
    const many = Array.from({ length: 10 }, (_, i) => peak(`山${i}`, i * 30, 2));
    expect(layoutPeakLabels(many, { ...options, maxLabels: 3 })).toHaveLength(3);
  });
});
