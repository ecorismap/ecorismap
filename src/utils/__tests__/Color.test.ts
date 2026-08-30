import { hsv2hex, hex2rgba, getRandomColor, getUserColor } from '../Color';

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
