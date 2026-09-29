import { getPmtileMaximumNativeZ } from '../pmtileProps';

describe('getPmtileMaximumNativeZ', () => {
  it.each([
    [{ overzoomThreshold: 18, isVector: false }, false, 18],
    [{ overzoomThreshold: 18, isVector: false }, true, 16],
    [{ overzoomThreshold: 20, isVector: true }, true, 18],
    [{ overzoomThreshold: 17, isVector: true }, true, 17],
    [{ overzoomThreshold: 14, isVector: false }, true, 14],
  ])('%#: オフラインでは保存したレベルから拡大する', (map, isOffline, expected) => {
    expect(getPmtileMaximumNativeZ(map, isOffline)).toBe(expected);
  });
});
