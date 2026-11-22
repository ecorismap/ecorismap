import { hsv2hex, hex2rgba, getRandomColor, getUserColor, parseColor, toKmlColor, rgbaString2qgis } from '../Color';

describe('hsv2hex', () => {
  it('return rgb value from hsv', () => {
    expect(hsv2hex(0, 0, 0)).toBe('#000000ff');
    expect(hsv2hex(0, 0, 1)).toBe('#ffffffff');
    expect(hsv2hex(180, 0.5, 0.5)).toBe('#3f7f7fff');
    expect(hsv2hex(0, 0, 0, 1)).toBe('#000000ff');
  });
});

describe('hex2rgba', () => {
  it('return rgba string from hex color string', () => {
    expect(hex2rgba('#000000')).toBe('rgba(0, 0, 0, 1)');
    expect(hex2rgba('#ffffff')).toBe('rgba(255, 255, 255, 1)');
    expect(hex2rgba('#3f7f7f')).toBe('rgba(63, 127, 127, 1)');
    expect(hex2rgba('#000000')).toBe('rgba(0, 0, 0, 1)');
  });
});

describe('getRandomColor', () => {
  it('return random color by hex', () => {
    expect(getRandomColor()).toMatch(/^#([A-F0-9]{6})$/);
  });
});

describe('getUserColor', () => {
  it('同じ名前からは常に同じ色が生成される（決定的）', () => {
    expect(getUserColor('調査者A')).toBe(getUserColor('調査者A'));
    expect(getUserColor('user1')).toBe(getUserColor('user1'));
  });
  it('異なる名前からは異なる色が生成される', () => {
    expect(getUserColor('調査者A')).not.toBe(getUserColor('調査者B'));
    expect(getUserColor('user1')).not.toBe(getUserColor('user2'));
  });
  it('rgba形式の不透明色を返す', () => {
    expect(getUserColor('user1')).toMatch(/^rgba\(\d+,\d+,\d+,1\)$/);
  });
});

describe('parseColor', () => {
  it('アプリ内の色表記を読む', () => {
    expect(parseColor('rgba(255, 0, 0, 1)')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor('rgba(0,128,255,0.5)')).toEqual({ r: 0, g: 128, b: 255, a: 0.5 });
    expect(parseColor('rgb(1, 2, 3)')).toEqual({ r: 1, g: 2, b: 3, a: 1 });
    expect(parseColor('#ff0000')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor('#FFF')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor('#0000FFee')).toEqual({ r: 0, g: 0, b: 255, a: 0xee / 255 });
    expect(parseColor('#f008')).toEqual({ r: 255, g: 0, b: 0, a: 0x88 / 255 });
  });

  it('読めない表記は undefined', () => {
    expect(parseColor('')).toBeUndefined();
    expect(parseColor('red')).toBeUndefined();
    expect(parseColor('#12345')).toBeUndefined();
    expect(parseColor(undefined as unknown as string)).toBeUndefined();
  });
});

describe('toKmlColor', () => {
  it('aabbggrr の順で出す', () => {
    expect(toKmlColor('rgba(255, 0, 0, 1)', false)).toBe('ff0000ff');
    expect(toKmlColor('rgba(0, 128, 255, 0.5)', false)).toBe('80ff8000');
  });

  it('[回帰] 軌跡の既定色のような8桁のhexも白にならない', () => {
    expect(toKmlColor('#0000FFee', false)).toBe('eeff0000');
    expect(toKmlColor('#ff0000', false)).toBe('ff0000ff');
  });

  it('transparent のときは塗りを完全に透明にし、読めない色は従来どおり白', () => {
    expect(toKmlColor('#ff0000', true)).toBe('000000ff');
    expect(toKmlColor('unknown', false)).toBe('ffffffff');
    expect(toKmlColor('unknown', true)).toBe('00ffffff');
  });
});

describe('rgbaString2qgis', () => {
  it('#AARRGGBB で出す（空白入りのrgbaやhexも読む）', () => {
    expect(rgbaString2qgis('rgba(255,0,0,1)')).toBe('#ffff0000');
    expect(rgbaString2qgis('rgba(0, 0, 255, 0.5)')).toBe('#800000ff');
    expect(rgbaString2qgis('#00ff00')).toBe('#ff00ff00');
  });

  it('読めない色は壊れた値ではなく空文字', () => {
    expect(rgbaString2qgis('unknown')).toBe('');
  });
});
