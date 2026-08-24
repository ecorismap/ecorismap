import { stepAngleToward } from '../angle';

describe('stepAngleToward', () => {
  it('目標へ近づく（通常ケース）', () => {
    const next = stepAngleToward(0, 90, 180, 180);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(90);
  });

  it('359→1は+2度として最短経路で回る（ラップ境界）', () => {
    const next = stepAngleToward(359, 1, 180, 180);
    // 359から増える方向（360を跨いで0..1へ）に動き、逆回りしない
    expect(next > 359 || next < 1).toBe(true);
  });

  it('1→359は-2度として最短経路で回る（ラップ境界）', () => {
    const next = stepAngleToward(1, 359, 180, 180);
    expect(next < 1 || next > 359).toBe(true);
  });

  it('戻り値は常に0..360に正規化される', () => {
    expect(stepAngleToward(350, 10, 10000, 180)).toBeGreaterThanOrEqual(0);
    expect(stepAngleToward(350, 10, 10000, 180)).toBeLessThan(360);
  });
});
