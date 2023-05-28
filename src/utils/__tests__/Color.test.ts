import { hsv2hex, hex2rgba, getRandomColor } from '../Color';

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
    expect(hex2rgba('#3f7f7f', 0.5)).toBe('rgba(63, 127, 127, 0.5)');
    expect(hex2rgba('#000000', 1)).toBe('rgba(0, 0, 0, 1)');
  });
});

describe('getRandomColor', () => {
  it('return random color by hex', () => {
    expect(getRandomColor()).toMatch(/^#([A-F0-9]{6})$/);
  });
});
