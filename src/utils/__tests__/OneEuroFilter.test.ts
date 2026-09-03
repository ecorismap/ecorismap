import { OneEuroFilter, PositionFilter } from '../OneEuroFilter';

describe('OneEuroFilter', () => {
  it('最初のサンプルはそのまま返す', () => {
    const filter = new OneEuroFilter();
    expect(filter.filter(100, 0)).toBe(100);
  });

  it('一定入力には入力値に収束する', () => {
    const filter = new OneEuroFilter();
    let value = 0;
    for (let i = 0; i < 200; i++) {
      value = filter.filter(50, i * 16);
    }
    expect(value).toBeCloseTo(50, 5);
  });

  it('ステップ入力は遅れて追従する（即座に飛ばない）', () => {
    const filter = new OneEuroFilter();
    for (let i = 0; i < 10; i++) {
      filter.filter(0, i * 16);
    }
    const afterStep = filter.filter(100, 10 * 16);
    expect(afterStep).toBeGreaterThan(0);
    expect(afterStep).toBeLessThan(100);
  });

  it('低速のジッタは強く平滑化される', () => {
    const filter = new OneEuroFilter();
    //±2pxのジッタをゆっくり入力
    let last = 0;
    for (let i = 0; i < 100; i++) {
      last = filter.filter(100 + (i % 2 === 0 ? 2 : -2), i * 30);
    }
    //出力の振れ幅は入力ジッタ(±2)より十分小さい
    const next = filter.filter(100 + 2, 100 * 30);
    expect(Math.abs(next - last)).toBeLessThan(1);
  });

  it('resetで初期状態に戻る', () => {
    const filter = new OneEuroFilter();
    filter.filter(100, 0);
    filter.filter(110, 16);
    filter.reset();
    expect(filter.filter(500, 32)).toBe(500);
  });

  it('タイムスタンプが進まなくても例外を出さない', () => {
    const filter = new OneEuroFilter();
    filter.filter(10, 100);
    expect(() => filter.filter(20, 100)).not.toThrow();
    expect(Number.isFinite(filter.filter(30, 50))).toBe(true);
  });
});

describe('PositionFilter', () => {
  it('x/yを独立にフィルタし、最初のサンプルはそのまま返す', () => {
    const filter = new PositionFilter();
    expect(filter.filter([100, 200], 0)).toEqual([100, 200]);
  });

  it('resetすると次のサンプルはそのまま返る', () => {
    const filter = new PositionFilter();
    filter.filter([0, 0], 0);
    filter.filter([10, 10], 16);
    filter.reset();
    expect(filter.filter([100, 200], 32)).toEqual([100, 200]);
  });
});
