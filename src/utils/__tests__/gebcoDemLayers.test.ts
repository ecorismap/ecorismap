import { colorReliefExpression } from '../gebcoDemLayers.web';

jest.mock('maplibre-contour', () => ({ __esModule: true, default: {} }));
jest.mock('fast-png', () => ({ encode: jest.fn() }));

describe('colorReliefExpression', () => {
  // maplibreのcolor-reliefは最上位がinterpolateでないと透明1色になり何も塗られない
  it('最上位がinterpolate式である', () => {
    expect(colorReliefExpression()[0]).toBe('interpolate');
  });

  it('NoData番兵の直前までは最高標高の色、番兵以上は透明', () => {
    const expr = colorReliefExpression();
    const stops = expr.slice(3);
    const n = stops.length;
    expect(stops[n - 2]).toBe(500000);
    expect(stops[n - 1]).toBe('rgba(0,0,0,0)');
    expect(stops[n - 4]).toBe(499999);
    expect(stops[n - 3]).toBe(stops[n - 5]);
  });
});
