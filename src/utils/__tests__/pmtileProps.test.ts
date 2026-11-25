import { getPmtileMaximumNativeZ } from '../pmtileProps';

describe('getPmtileMaximumNativeZ', () => {
  it.each([
    [{ overzoomThreshold: 18, isVector: false }, false, 18],
    [{ overzoomThreshold: 18, isVector: false }, true, 16],
    [{ overzoomThreshold: 20, isVector: true }, true, 18],
    [{ overzoomThreshold: 17, isVector: true }, true, 17],
    [{ overzoomThreshold: 14, isVector: false }, true, 14],
    [{ overzoomThreshold: 18, maximumZ: 10, isVector: true }, false, 10],
    [{ overzoomThreshold: 18, maximumZ: 15, isVector: true }, true, 15],
    [{ overzoomThreshold: 15, maximumZ: 22, isVector: true }, false, 15],
    [{ overzoomThreshold: 18, maximumZ: NaN, isVector: true }, false, 18],
  ])('%#: オフラインでは保存したレベルから拡大する', (map, isOffline, expected) => {
    expect(getPmtileMaximumNativeZ(map, isOffline)).toBe(expected);
  });
});
