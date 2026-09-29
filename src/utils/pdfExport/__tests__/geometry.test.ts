import { computePageLayout, getEquivalentZoom, getPaperSize, getTileScale } from '../geometry';

describe('getPaperSize', () => {
  it('横向きは幅と高さを入れ替える', () => {
    const p = getPaperSize('A4', 'LANDSCAPE');
    expect(p.widthMillimeter).toBe(297);
    expect(p.heightMillimeter).toBe(210);
  });
});

describe('getEquivalentZoom', () => {
  const layout = computePageLayout({
    paperSize: 'A4',
    orientation: 'PORTRAIT',
    scale: '10000',
    center: { latitude: 35, longitude: 135 },
  });

  it('タイルのズームを変えても用紙の縮尺に相当するズームは変わらない', () => {
    const z15 = getEquivalentZoom(15, getTileScale(layout, 15));
    const z17 = getEquivalentZoom(17, getTileScale(layout, 17));
    expect(z15).toBeCloseTo(z17, 10);
  });

  it('1:10,000（北緯35度）は地図のズーム15.5前後に相当する', () => {
    const z = getEquivalentZoom(16, getTileScale(layout, 16));
    expect(z).toBeGreaterThan(15.5);
    expect(z).toBeLessThan(15.6);
  });
});
