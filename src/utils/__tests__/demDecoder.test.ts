import { parseDecodeResult } from '../../../modules/dem-decoder/src';

describe('dem-decoderの戻り値の解析', () => {
  it('先頭8個のFloat32をヘッダ、続きを標高として読む', () => {
    const buffer = new ArrayBuffer((8 + 4) * 4);
    const f = new Float32Array(buffer);
    f.set([2, 2, -5.5, 3776, 0.1, 1.5, 0.25, 0]);
    f.set([-5.5, 0, 100, 3776], 8);

    const result = parseDecodeResult(buffer);
    expect(result.width).toBe(2);
    expect(result.height).toBe(2);
    expect(result.min).toBe(-5.5);
    expect(result.max).toBe(3776);
    expect(Array.from(result.elevation)).toEqual([-5.5, 0, 100, 3776]);
    // 標高はヘッダの後ろを指すビュー（コピーしない）
    expect(result.elevation.buffer).toBe(buffer);
    expect(result.timing.decodeMs).toBeCloseTo(1.5);
  });
});
