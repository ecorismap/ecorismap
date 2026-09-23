/**
 * RNのカラー文字列（#rgb/#rrggbb/#rrggbbaa/rgb()/rgba()）をGL用の[r,g,b,a](0-1)へ変換する。
 * レイヤスタイルのgetColor()の出力を3Dオーバーレイの描画色に使うため。
 */
export type Rgba = [number, number, number, number];

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export const parseColorToRgba = (color: string, fallback: Rgba = [0.2, 0.4, 1, 1]): Rgba => {
  if (typeof color !== 'string') return fallback;
  const hex = color.trim();
  if (hex.startsWith('#')) {
    const body = hex.slice(1);
    if (body.length === 3) {
      const r = parseInt(body[0] + body[0], 16);
      const g = parseInt(body[1] + body[1], 16);
      const b = parseInt(body[2] + body[2], 16);
      if ([r, g, b].some(Number.isNaN)) return fallback;
      return [r / 255, g / 255, b / 255, 1];
    }
    if (body.length === 6 || body.length === 8) {
      const r = parseInt(body.slice(0, 2), 16);
      const g = parseInt(body.slice(2, 4), 16);
      const b = parseInt(body.slice(4, 6), 16);
      const a = body.length === 8 ? parseInt(body.slice(6, 8), 16) / 255 : 1;
      if ([r, g, b].some(Number.isNaN) || Number.isNaN(a)) return fallback;
      return [r / 255, g / 255, b / 255, clamp01(a)];
    }
    return fallback;
  }
  const m = hex.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (m) {
    const r = parseFloat(m[1]);
    const g = parseFloat(m[2]);
    const b = parseFloat(m[3]);
    const a = m[4] !== undefined ? parseFloat(m[4]) : 1;
    if ([r, g, b, a].some(Number.isNaN)) return fallback;
    return [clamp01(r / 255), clamp01(g / 255), clamp01(b / 255), clamp01(a)];
  }
  return fallback;
};
