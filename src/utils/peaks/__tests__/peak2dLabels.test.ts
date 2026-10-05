import { Peak } from '../peakData';
import { isPeaksUrl, PEAKS_URL, peakLabelText, selectPeak2DLabels } from '../peak2dLabels';

const peaks: Peak[] = [
  { latitude: 35.36064, longitude: 138.72733, ele: 3776, name: '富士山', rank: 1 },
  { latitude: 35.3455, longitude: 138.751, ele: 2693, name: '宝永山', rank: 4 },
  { latitude: 35.62517, longitude: 139.24361, ele: 599, name: '高尾山', rank: 2 },
];
// 富士山周辺（高尾山は範囲外）
const bounds = {
  northEast: { latitude: 35.45, longitude: 138.85 },
  southWest: { latitude: 35.25, longitude: 138.6 },
};

describe('selectPeak2DLabels', () => {
  it('縮尺に応じて主要な山から出す（小さな山はz10から）', () => {
    expect(selectPeak2DLabels(peaks, bounds, 8).map((p) => p.name)).toEqual(['富士山']);
    expect(
      selectPeak2DLabels(peaks, bounds, 14)
        .map((p) => p.name)
        .sort()
    ).toEqual(['宝永山', '富士山']);
  });

  it('画面外の山は出さない', () => {
    expect(selectPeak2DLabels(peaks, bounds, 14).map((p) => p.name)).not.toContain('高尾山');
  });

  it('同じ格子に入る山は、重要な方だけ残す', () => {
    const summit: Peak = { latitude: 35.36064, longitude: 138.72733, ele: 3775, name: '剣ヶ峯', rank: 4 };
    expect(selectPeak2DLabels([summit, ...peaks], bounds, 14).map((p) => p.name)).not.toContain('剣ヶ峯');
  });

  it('表示文字は山名と標高', () => {
    expect(peakLabelText(peaks[0])).toBe('富士山 3776');
  });
});

describe('isPeaksUrl', () => {
  it('山名エントリのURLを見分ける', () => {
    expect(isPeaksUrl(PEAKS_URL)).toBe(true);
    expect(isPeaksUrl('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png')).toBe(false);
    expect(isPeaksUrl(undefined)).toBe(false);
  });
});
