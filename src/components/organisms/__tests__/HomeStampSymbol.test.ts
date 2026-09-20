import { KOUBI_STAR_POINTS } from '../HomeStampSymbol';

describe('HomeStampSymbol', () => {
  //交尾の★は文字（ベースライン基準）から多角形に変えた。記録位置＝枠の中心(10,10)に
  //外接矩形の中心が来ていないと、ラインの上に置いた記号が上下左右にずれて見える
  it('交尾の★が20x20の枠の中心に置かれていること', () => {
    const points = KOUBI_STAR_POINTS.split(' ').map((p) => p.split(',').map(Number));
    expect(points).toHaveLength(10);

    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(10, 1);
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(10, 1);

    //枠（20x20）からはみ出さないこと
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(20);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(20);
  });
});
