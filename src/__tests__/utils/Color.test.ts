import { hsv2rgb, hex2rgba, getRandomColor } from '../../utils/Color';

describe('hsv2rgb', () => {
  it('return rgb value from hsv', () => {
    expect(hsv2rgb(0, 0, 0)).toBe('#000000');
    expect(hsv2rgb(0, 0, 1)).toBe('#ffffff');
    expect(hsv2rgb(180, 0.5, 0.5)).toBe('#3f7f7f');
  });
});

describe('hex2rgba', () => {
  it('return rgba string from hex color string', () => {
    expect(hex2rgba('#000000')).toBe('rgba(0, 0, 0, 1)');
    expect(hex2rgba('#ffffff')).toBe('rgba(255, 255, 255, 1)');
    expect(hex2rgba('#3f7f7f', 0.5)).toBe('rgba(63, 127, 127, 0.5)');
  });
});

describe('getRandomColor', () => {
  it('return random color by hex', () => {
    expect(getRandomColor()).toMatch(/^#([A-F0-9]{6})$/);
  });
});
