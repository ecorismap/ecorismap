import { selectSeaLabels, SEA_LABEL_MIN_ZOOM, SEA_LABEL_MAX_ZOOM } from '../seaLabels';
import { ViewportBounds } from '../ViewportCulling';

// 日本周辺（東北沖）
const TOHOKU: ViewportBounds = {
  northEast: { latitude: 40, longitude: 145 },
  southWest: { latitude: 36, longitude: 140 },
};

describe('selectSeaLabels', () => {
  it('表示ズーム範囲外では空', () => {
    expect(selectSeaLabels(TOHOKU, SEA_LABEL_MIN_ZOOM - 1)).toEqual([]);
    expect(selectSeaLabels(TOHOKU, SEA_LABEL_MAX_ZOOM + 1)).toEqual([]);
  });

  it('範囲内のラベルが選ばれ、上限件数を超えない', () => {
    const labels = selectSeaLabels(TOHOKU, 7);
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.length).toBeLessThanOrEqual(50);
    for (const l of labels) {
      expect(l.name).not.toBe('');
      // 10%バッファ込みの範囲内
      expect(l.lat).toBeGreaterThan(35);
      expect(l.lat).toBeLessThan(41);
    }
  });

  it('間引きは世界座標の格子に固定され、ビューポートをずらしても同じ点が選ばれる', () => {
    const a = selectSeaLabels(TOHOKU, 7);
    const shifted: ViewportBounds = {
      northEast: { latitude: 40.3, longitude: 145.3 },
      southWest: { latitude: 36.3, longitude: 140.3 },
    };
    const b = selectSeaLabels(shifted, 7);
    // 両方の(狭い方の)共通範囲に入る点は同一の選定結果になる
    const inCommon = (l: { lat: number; lon: number }) =>
      l.lat >= 36.5 && l.lat <= 39.5 && l.lon >= 140.5 && l.lon <= 144.5;
    const aKeys = new Set(a.filter(inCommon).map((l) => l.key));
    const bKeys = new Set(b.filter(inCommon).map((l) => l.key));
    expect(aKeys).toEqual(bKeys);
  });

  it('ズームが上がると格子が細かくなり選ばれる件数が増える（同一の狭い範囲で）', () => {
    const narrow: ViewportBounds = {
      northEast: { latitude: 34.5, longitude: 140.2 },
      southWest: { latitude: 32.5, longitude: 138.8 },
    };
    const low = selectSeaLabels(narrow, 6).length;
    const high = selectSeaLabels(narrow, 9).length;
    expect(high).toBeGreaterThanOrEqual(low);
  });
});
