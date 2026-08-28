import { generateTrackSummarySVG } from '../trackSummaryImage';
import { buildElevationChart } from '../trackChart';
import { calcTrackStatistics, buildElevationProfile } from '../trackStatistics';

const T0 = Date.UTC(2026, 7, 28, 0, 0, 0);
const makeCoords = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    latitude: 35 + i * 0.001,
    longitude: 135,
    altitude: 100 + i * 10,
    timestamp: T0 + i * 60000,
  }));

describe('buildElevationChart', () => {
  it('2点未満・幅0ならnull', () => {
    expect(buildElevationChart(buildElevationProfile(makeCoords(1)), 800, 200)).toBeNull();
    expect(buildElevationChart(buildElevationProfile(makeCoords(10)), 0, 200)).toBeNull();
  });

  it('プロファイルの点数ぶんの座標とパスを返す', () => {
    const profile = buildElevationProfile(makeCoords(10));
    const chart = buildElevationChart(profile, 800, 200);
    expect(chart).not.toBeNull();
    expect(chart!.points).toHaveLength(profile.length);
    expect(chart!.linePath.startsWith('M')).toBe(true);
    expect(chart!.areaPath.endsWith('Z')).toBe(true);
    expect(chart!.yTicks.length).toBeGreaterThan(0);
  });

  it('パディングを変えると原点がずれる', () => {
    const profile = buildElevationProfile(makeCoords(10));
    const a = buildElevationChart(profile, 800, 200, { top: 0, right: 0, bottom: 0, left: 0 });
    const b = buildElevationChart(profile, 800, 200, { top: 0, right: 0, bottom: 0, left: 50 });
    expect(b!.points[0].x - a!.points[0].x).toBe(50);
  });
});

describe('generateTrackSummarySVG', () => {
  const coords = makeCoords(20);
  const statistics = calcTrackStatistics(coords)!;
  const profile = buildElevationProfile(coords);

  it('軌跡名と統計値を含むSVGを返す', () => {
    const svg = generateTrackSummarySVG('my track', statistics, profile);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain('my track');
    expect(svg).toContain(`${statistics.distanceKm.toFixed(2)} km`);
  });

  it('標高グラフのパスを描画する', () => {
    const svg = generateTrackSummarySVG('my track', statistics, profile);
    expect(svg).toContain('<path d="M');
  });

  it('軌跡名のXMLをエスケープする', () => {
    const svg = generateTrackSummarySVG('a<b>&"c"', statistics, profile);
    expect(svg).toContain('a&lt;b&gt;&amp;&quot;c&quot;');
    expect(svg).not.toContain('<b>');
  });

  it('プロファイルが空でも有効なSVGになる', () => {
    const svg = generateTrackSummarySVG('my track', statistics, []);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
  });
});
