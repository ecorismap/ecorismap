import { deflate } from 'pako';
import { decodePngLite } from '../pngLite';

/** テスト用に最小限のPNGバイナリを組み立てる（CRCはデコーダが検証しないためダミー） */
const buildPng = (
  width: number,
  height: number,
  colorType: number,
  pixels: Uint8Array,
  options?: { palette?: Uint8Array; filters?: number[] }
): Uint8Array => {
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType]!;
  const stride = width * channels;
  const raw = new Uint8Array(height * (stride + 1));
  for (let row = 0; row < height; row++) {
    raw[row * (stride + 1)] = options?.filters?.[row] ?? 0;
    raw.set(pixels.subarray(row * stride, (row + 1) * stride), row * (stride + 1) + 1);
  }
  const idat = deflate(raw);

  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    return out;
  };

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr[8] = 8; // bitDepth
  ihdr[9] = colorType;

  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    ...(options?.palette ? [chunk('PLTE', options.palette)] : []),
    chunk('IDAT', idat),
    chunk('IEND', new Uint8Array(0)),
  ];
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const png = new Uint8Array(total);
  let pos = 0;
  for (const part of parts) {
    png.set(part, pos);
    pos += part.length;
  }
  return png;
};

describe('decodePngLite', () => {
  it('RGB(colorType=2)をデコードできる', () => {
    const pixels = new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 10, 20, 30]);
    const png = buildPng(2, 2, 2, pixels);
    const decoded = decodePngLite(png);
    expect(decoded).not.toBeNull();
    expect(decoded!.width).toBe(2);
    expect(decoded!.height).toBe(2);
    expect(decoded!.channels).toBe(3);
    expect(Array.from(decoded!.data)).toEqual(Array.from(pixels));
  });

  it('RGBA(colorType=6)をデコードできる', () => {
    const pixels = new Uint8Array([1, 2, 3, 255, 4, 5, 6, 128]);
    const decoded = decodePngLite(buildPng(2, 1, 6, pixels));
    expect(decoded!.channels).toBe(4);
    expect(Array.from(decoded!.data)).toEqual(Array.from(pixels));
  });

  it('パレット(colorType=3)をデコードできる', () => {
    const palette = new Uint8Array([255, 0, 0, 0, 255, 0]);
    const pixels = new Uint8Array([0, 1, 1, 0]);
    const decoded = decodePngLite(buildPng(2, 2, 3, pixels, { palette }));
    expect(decoded!.channels).toBe(1);
    expect(Array.from(decoded!.data)).toEqual([0, 1, 1, 0]);
    expect(Array.from(decoded!.palette!)).toEqual(Array.from(palette));
  });

  it('Sub/Up/Average/Paethフィルタを解除できる', () => {
    // 4x4グレースケールの勾配画像を各フィルタでエンコードして復元を確認
    const width = 4;
    const height = 4;
    const original = new Uint8Array(width * height);
    for (let i = 0; i < original.length; i++) original[i] = (i * 13) % 256;

    // フィルタ適用済みのrawを手動で作る
    const filters = [1, 2, 3, 4];
    const raw = new Uint8Array(height * (width + 1));
    for (let row = 0; row < height; row++) {
      const filter = filters[row];
      raw[row * (width + 1)] = filter;
      for (let i = 0; i < width; i++) {
        const x = original[row * width + i];
        const left = i > 0 ? original[row * width + i - 1] : 0;
        const up = row > 0 ? original[(row - 1) * width + i] : 0;
        const upLeft = row > 0 && i > 0 ? original[(row - 1) * width + i - 1] : 0;
        let predictor = 0;
        if (filter === 1) predictor = left;
        else if (filter === 2) predictor = up;
        else if (filter === 3) predictor = (left + up) >> 1;
        else if (filter === 4) {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        }
        raw[row * (width + 1) + 1 + i] = (x - predictor + 256) % 256;
      }
    }
    // buildPngのfilters対応はraw作成方式が違うため、ここでは直接チャンクを組む
    const idat = deflate(raw);
    const png = buildPng(width, height, 0, new Uint8Array(width * height));
    // IDATを差し替え（IHDR: 8+25バイト目以降にIDATがある構造を利用せず、再構築する）
    const signatureAndIhdr = png.subarray(0, 8 + 12 + 13);
    const chunk = (type: string, data: Uint8Array) => {
      const out = new Uint8Array(12 + data.length);
      new DataView(out.buffer).setUint32(0, data.length);
      for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
      out.set(data, 8);
      return out;
    };
    const idatChunk = chunk('IDAT', idat);
    const iendChunk = chunk('IEND', new Uint8Array(0));
    const rebuilt = new Uint8Array(signatureAndIhdr.length + idatChunk.length + iendChunk.length);
    rebuilt.set(signatureAndIhdr, 0);
    rebuilt.set(idatChunk, signatureAndIhdr.length);
    rebuilt.set(iendChunk, signatureAndIhdr.length + idatChunk.length);

    const decoded = decodePngLite(rebuilt);
    expect(decoded).not.toBeNull();
    expect(Array.from(decoded!.data)).toEqual(Array.from(original));
  });

  it('PNGでないデータはnullを返す', () => {
    expect(decodePngLite(new Uint8Array([1, 2, 3, 4]))).toBeNull();
    expect(decodePngLite(new Uint8Array(0))).toBeNull();
  });

  it('16bit深度など対応外の形式はnullを返す', () => {
    const png = buildPng(2, 2, 2, new Uint8Array(12));
    png[8 + 8 + 8] = 16; // IHDRのbitDepthを書き換え
    expect(decodePngLite(png)).toBeNull();
  });
});
