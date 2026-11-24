import { isStaleProjectEdit } from '../projectStaleGuard';

describe('isStaleProjectEdit', () => {
  const local = new Date('2026-11-24T10:00:00.000Z');

  it('クラウドの方が新しければ古いとみなす', () => {
    expect(isStaleProjectEdit(local, new Date('2026-11-24T10:00:00.001Z'))).toBe(true);
  });

  it('同じ時刻なら古くない', () => {
    expect(isStaleProjectEdit(local, new Date(local.getTime()))).toBe(false);
  });

  it('端末に保存した一覧の文字列の時刻でも比べられる', () => {
    expect(isStaleProjectEdit(local.toISOString(), new Date('2026-11-24T11:00:00.000Z'))).toBe(true);
    expect(isStaleProjectEdit(local.toISOString(), local)).toBe(false);
  });

  it('どちらかが無い・読めないときは古いとみなさない', () => {
    expect(isStaleProjectEdit(undefined, local)).toBe(false);
    expect(isStaleProjectEdit(local, undefined)).toBe(false);
    expect(isStaleProjectEdit('not a date', local)).toBe(false);
  });
});
