import { penWidthTypeToNumber } from '../penWidth';

describe('penWidthTypeToNumber', () => {
  it('太さ種別を線幅へ変換し、極太は20になる（作図プレビューと保存で同じ値）', () => {
    expect(penWidthTypeToNumber('PEN_THIN')).toBe(2);
    expect(penWidthTypeToNumber('PEN_MEDIUM')).toBe(5);
    expect(penWidthTypeToNumber('PEN_THICK')).toBe(10);
    expect(penWidthTypeToNumber('PEN_EXTRA_THICK')).toBe(20);
  });
});
