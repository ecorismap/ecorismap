import { nearDegree } from '../../utils/General';

describe('nearDegree', () => {
  it('return nearDegree by interval value 5', () => {
    expect(nearDegree(0, 5)).toBe(0);
    expect(nearDegree(5, 5)).toBe(5);
    expect(nearDegree(1.1, 5)).toBe(0);
    expect(nearDegree(4.1, 5)).toBe(5);
    expect(nearDegree(2.5, 5)).toBe(5);
    expect(nearDegree(42.6, 5)).toBe(45);
    expect(nearDegree(-5, 5)).toBe(-5);
    expect(nearDegree(-1.1, 5)).toBe(-0);
    expect(nearDegree(-4.1, 5)).toBe(-5);
    expect(nearDegree(-2.5, 5)).toBe(-5);
    expect(nearDegree(-42.6, 5)).toBe(-45);
  });
  it('return nearDegree by interval value 2', () => {
    expect(nearDegree(0, 2)).toBe(0);
    expect(nearDegree(5, 2)).toBe(6);
    expect(nearDegree(1.1, 2)).toBe(2);
    expect(nearDegree(4.1, 2)).toBe(4);
    expect(nearDegree(2.5, 2)).toBe(2);
    expect(nearDegree(42.6, 2)).toBe(42);
    expect(nearDegree(-5, 2)).toBe(-6);
    expect(nearDegree(-1.1, 2)).toBe(-2);
    expect(nearDegree(-4.1, 2)).toBe(-4);
    expect(nearDegree(-2.5, 2)).toBe(-2);
    expect(nearDegree(-42.6, 2)).toBe(-42);
  });
});
