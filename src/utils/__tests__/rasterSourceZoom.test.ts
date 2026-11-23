import { rasterSourceMaxzoom } from '../rasterSourceZoom';

describe('rasterSourceMaxzoom', () => {
  it('固定ズームが表示上限より低ければ固定ズームを使う（それ以上は拡大表示）', () => {
    expect(rasterSourceMaxzoom({ maximumZ: 22, overzoomThreshold: 18 })).toBe(18);
    expect(rasterSourceMaxzoom({ maximumZ: 22, overzoomThreshold: 15 })).toBe(15);
  });

  it('固定ズームが表示上限より高ければ表示上限を使う', () => {
    expect(rasterSourceMaxzoom({ maximumZ: 16, overzoomThreshold: 18 })).toBe(16);
  });

  it('片方が欠けた古いデータでも数値を返す', () => {
    expect(rasterSourceMaxzoom({ maximumZ: 22, overzoomThreshold: undefined as unknown as number })).toBe(22);
    expect(rasterSourceMaxzoom({ maximumZ: undefined as unknown as number, overzoomThreshold: 18 })).toBe(18);
  });
});
