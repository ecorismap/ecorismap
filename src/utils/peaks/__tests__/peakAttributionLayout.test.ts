import { peakAttributionPosition } from '../peakAttributionLayout';

describe('peakAttributionPosition', () => {
  it('ネイティブではセーフエリア下端の分だけ持ち上げ、地図の出典行の1行上に置く', () => {
    // Pixel 8a のジェスチャーナビゲーション相当
    expect(peakAttributionPosition(24, false)).toEqual({ bottom: 38, right: 15 });
  });

  it('ナビゲーションバーが無くても地図の出典行とは重ならない', () => {
    const { bottom } = peakAttributionPosition(0, false);
    expect(bottom).toBeGreaterThanOrEqual(13);
  });

  it('Webは従来の位置のまま', () => {
    expect(peakAttributionPosition(0, true)).toEqual({ bottom: 4, right: 6 });
  });
});
