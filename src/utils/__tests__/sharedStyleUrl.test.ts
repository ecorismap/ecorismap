import { isProjectStyleUrl } from '../sharedStyleUrl';

const url = (path: string, token = 'abc') =>
  `style://https://firebasestorage.googleapis.com/v0/b/bucket/o/${encodeURIComponent(path)}?alt=media&token=${token}`;

describe('isProjectStyleUrl: 共有スタイルの URL がこのプロジェクトのこの地図の置き場所か', () => {
  test('同じプロジェクト・同じ地図のパスなら true（トークンは問わない）', () => {
    expect(isProjectStyleUrl(url('projects/P1/STYLE/m1'), 'P1', 'm1')).toBe(true);
    expect(isProjectStyleUrl(url('projects/P1/STYLE/m1', 'other'), 'P1', 'm1')).toBe(true);
  });

  test('エミュレータの URL でも読める', () => {
    const emu = `style://http://127.0.0.1:9199/v0/b/demo/o/${encodeURIComponent('projects/P1/STYLE/m1')}?alt=media&token=t`;
    expect(isProjectStyleUrl(emu, 'P1', 'm1')).toBe(true);
  });

  test('別のプロジェクト・別の地図・別のフォルダなら false', () => {
    expect(isProjectStyleUrl(url('projects/P2/STYLE/m1'), 'P1', 'm1')).toBe(false);
    expect(isProjectStyleUrl(url('projects/P1/STYLE/m2'), 'P1', 'm1')).toBe(false);
    expect(isProjectStyleUrl(url('projects/P1/PDF/m1'), 'P1', 'm1')).toBe(false);
    expect(isProjectStyleUrl(url('projects/P1/STYLE/m1/x'), 'P1', 'm1')).toBe(false);
  });

  test('手元で取り込んだだけのスタイルや style:// でない URL は false', () => {
    expect(isProjectStyleUrl(undefined, 'P1', 'm1')).toBe(false);
    expect(isProjectStyleUrl('style://style.json', 'P1', 'm1')).toBe(false);
    expect(isProjectStyleUrl(url('projects/P1/STYLE/m1').replace('style://', ''), 'P1', 'm1')).toBe(false);
    expect(isProjectStyleUrl('style://https://x/o/%E0%A4%A', 'P1', 'm1')).toBe(false);
  });
});
