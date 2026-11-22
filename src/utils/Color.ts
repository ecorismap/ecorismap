export const hsv2rgba = (H: number, S: number, V: number, alpha?: number) => {
  //https://en.wikipedia.org/wiki/HSL_and_HSV#From_HSV

  const C = V * S;
  const Hp = H / 60;
  const X = C * (1 - Math.abs((Hp % 2) - 1));

  let R = 0;
  let G = 0;
  let B = 0;

  if (Hp >= 0 && Hp < 1) {
    [R, G, B] = [C, X, 0];
  }
  if (Hp >= 1 && Hp < 2) {
    [R, G, B] = [X, C, 0];
  }
  if (Hp >= 2 && Hp < 3) {
    [R, G, B] = [0, C, X];
  }
  if (Hp >= 3 && Hp < 4) {
    [R, G, B] = [0, X, C];
  }
  if (Hp >= 4 && Hp < 5) {
    [R, G, B] = [X, 0, C];
  }
  if (Hp >= 5 && Hp < 6) {
    [R, G, B] = [C, 0, X];
  }

  const m = V - C;
  [R, G, B] = [R + m, G + m, B + m];

  R = Math.floor(R * 255);
  G = Math.floor(G * 255);
  B = Math.floor(B * 255);
  const A = alpha ? alpha : 1;
  return { R, G, B, A };
};
//rgbaStringをqgisで使える形式に変換する
export type RgbaColor = { r: number; g: number; b: number; a: number };

const clampByte = (value: number) => Math.min(255, Math.max(0, Math.round(value)));
const clampAlpha = (value: number) => Math.min(1, Math.max(0, value));

/**
 * アプリ内に混在する色表記（rgba()/rgb()、#RGB、#RGBA、#RRGGBB、#RRGGBBAA）を読む。
 * レイヤの色は旧版のhex（軌跡の既定 #0000FFee のような8桁を含む）とrgba()の両方で保存されている。
 * 読めない表記は undefined
 */
export const parseColor = (color: string): RgbaColor | undefined => {
  const text = typeof color === 'string' ? color.trim() : '';
  const rgba = text.match(
    /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*(?:,\s*(\d*\.?\d+)\s*)?\)$/i
  );
  if (rgba) {
    return {
      r: clampByte(Number(rgba[1])),
      g: clampByte(Number(rgba[2])),
      b: clampByte(Number(rgba[3])),
      a: rgba[4] === undefined ? 1 : clampAlpha(Number(rgba[4])),
    };
  }
  const hex = text.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (!hex) return undefined;
  const digits = hex[1];
  const short = digits.length <= 4;
  const channel = (index: number) =>
    short ? 0x11 * parseInt(digits[index], 16) : parseInt(digits.slice(index * 2, index * 2 + 2), 16);
  const hasAlpha = digits.length === 4 || digits.length === 8;
  return { r: channel(0), g: channel(1), b: channel(2), a: hasAlpha ? channel(3) / 255 : 1 };
};

const toHexByte = (value: number) => clampByte(value).toString(16).padStart(2, '0');

/** QGISの色（#AARRGGBB）。読めない色は空文字（以前は "#NaN..." のような壊れた値になっていた） */
export const rgbaString2qgis = (rgbaString: string): string => {
  const color = parseColor(rgbaString);
  if (color === undefined) return '';
  return `#${toHexByte(color.a * 255)}${toHexByte(color.r)}${toHexByte(color.g)}${toHexByte(color.b)}`;
};

/**
 * KMLの色（aabbggrr）。読めない色は従来どおり白にする。
 * transparent は塗りを完全に透明にする（ポリゴンの透過設定）
 */
export const toKmlColor = (colorString: string, transparent: boolean): string => {
  const color = parseColor(colorString);
  if (color === undefined) return transparent ? '00ffffff' : 'ffffffff';
  const alpha = transparent ? '00' : toHexByte(color.a * 255);
  return `${alpha}${toHexByte(color.b)}${toHexByte(color.g)}${toHexByte(color.r)}`;
};

export const hsv2rgbaString = (H: number, S: number, V: number, alpha?: number) => {
  const { R, G, B, A } = hsv2rgba(H, S, V, alpha);
  return `rgba(${R},${G},${B},${A})`;
};

export const hex2qgis = (hex: string): string => {
  const r = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  let c: string[] = [];
  if (r) {
    c = r.slice(1, 5).map((x) => x);
  }

  // RGBA to ARGB
  return `#${c[3]}${c[0]}${c[1]}${c[2]}`;
};

export const hsv2hex = (H: number, S: number, V: number, alpha?: number): string => {
  const { R, G, B, A } = hsv2rgba(H, S, V, alpha);

  return (
    '#' +
    zeroPadding(R.toString(16), 2) +
    zeroPadding(G.toString(16), 2) +
    zeroPadding(B.toString(16), 2) +
    zeroPadding(Math.floor(A * 255).toString(16), 2)
  );
};

const zeroPadding = (num: string, length: number) => {
  return ('0000000000' + num).slice(-length);
};

export const hex2rgba = (hex: string) => {
  // ロングバージョンの場合（例：#FF0000）
  let r = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  let c: number[] = [];
  if (r) {
    c = r.slice(1, 4).map(function (x) {
      return parseInt(x, 16);
    });
  }
  // ショートバージョンの場合（例：#F00）
  r = hex.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (r) {
    c = r.slice(1, 4).map(function (x) {
      return 0x11 * parseInt(x, 16);
    });
  }
  // 該当しない場合は、そのまま返す。仕様変更でhexはrgbaになっている可能性があるため。
  if (c.length === 0) {
    return hex;
  }
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, 1)`;
};

export const getRandomColor = (): string => {
  const letters = '0123456789ABCDEF';
  let color = '#';
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
};

/**
 * ユーザー名から決定的に色を生成する（同じ名前は全端末・いつ生成しても同じ色）。
 * USER色分けでcolorListの生成・未登録ユーザーのフォールバックに使う。
 * 黄金角(137.5度)で色相を回すため、ハッシュが近い名前同士でも色相が離れやすい。
 */
export const getUserColor = (displayName: string): string => {
  let hash = 0;
  for (let i = 0; i < displayName.length; i++) {
    hash = (hash * 31 + displayName.charCodeAt(i)) % 4294967296;
  }
  const hue = (hash * 137.5) % 360;
  return hsv2rgbaString(hue, 0.75, 0.9, 1);
};
