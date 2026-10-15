import { estimateLabelSize, layoutPointLabels, projectToPixel, DEFAULT_LABEL_LAYOUT_OPTIONS } from '../pointLabelGroups';

const base = { latitude: 35.0, longitude: 135.0 };
// zoom15・256pxタイルでの1pxあたりの経度・緯度
const scale = 256 * Math.pow(2, 15);
const lngPerPx = 360 / scale;
const latPerPx = (() => {
  const a = projectToPixel(base, 15, 256);
  const b = projectToPixel({ latitude: base.latitude + 0.0001, longitude: base.longitude }, 15, 256);
  return 0.0001 / (a.y - b.y);
})();
const offsetPx = (dx: number, dy: number) => ({
  latitude: base.latitude - dy * latPerPx,
  longitude: base.longitude + dx * lngPerPx,
});
// 'サルメンエビネ' = 7文字×15px = 105px幅
const long = 'サルメンエビネ';

describe('estimateLabelSize', () => {
  it('maxLabelWidthで幅を打ち切る（描画側は…で省略する）', () => {
    const opts = { fontSize: 15, lineHeight: 18, maxLabelWidth: 100 };
    expect(estimateLabelSize('あいうえおかきくけこ', opts)).toEqual({ width: 100, height: 18 });
    expect(estimateLabelSize('あい', opts)).toEqual({ width: 30, height: 18 });
  });

  it('空ラベルは0', () => {
    expect(estimateLabelSize('', DEFAULT_LABEL_LAYOUT_OPTIONS)).toEqual({ width: 0, height: 0 });
  });
  it('全角は1文字=fontSize、半角は0.6倍、既定では改行しない', () => {
    expect(estimateLabelSize('あい', DEFAULT_LABEL_LAYOUT_OPTIONS)).toEqual({ width: 30, height: 18 });
    expect(estimateLabelSize('ab', DEFAULT_LABEL_LAYOUT_OPTIONS)).toEqual({ width: 18, height: 18 });
    expect(estimateLabelSize('a'.repeat(16), DEFAULT_LABEL_LAYOUT_OPTIONS)).toEqual({ width: 144, height: 18 });
  });
  it('maxCharsPerLineを指定すると改行を見込む', () => {
    const opts = { ...DEFAULT_LABEL_LAYOUT_OPTIONS, maxCharsPerLine: 15 };
    expect(estimateLabelSize('a'.repeat(16), opts)).toEqual({ width: 135, height: 36 });
  });
});

describe('layoutPointLabels', () => {
  const ids = (m: Map<string, unknown>) => [...m.keys()];

  it('同一座標のポイントは先頭も含めて全員が引き出し線で周囲に置かれる', () => {
    const shown = layoutPointLabels(
      [
        { id: 'a', coords: base, label: 'A' },
        { id: 'b', coords: base, label: 'B' },
        { id: 'c', coords: base, label: 'C' },
      ],
      15
    );
    expect(ids(shown)).toEqual(['a', 'b', 'c']);
    // aは右（角度0）、bは左（角度π）、cは右上（角度-π/4）
    expect(shown.get('a')!.leader).toEqual({ angle: 0, length: 26 - 7.5 });
    expect(shown.get('a')!.dx).toBeCloseTo(26 + 9 / 2);
    expect(shown.get('a')!.dy).toBeCloseTo(0);
    expect(shown.get('b')!.leader!.angle).toBeCloseTo(Math.PI);
    expect(shown.get('b')!.dx).toBeCloseTo(-(26 + 9 / 2));
    expect(shown.get('c')!.leader!.angle).toBeCloseTo(-Math.PI / 4);
  });

  it('記号が重なるほど近ければ全員引き出し線、離れていれば先頭は通常位置', () => {
    const near = layoutPointLabels(
      [
        { id: 'a', coords: base, label: 'A' },
        { id: 'b', coords: offsetPx(10, 0), label: 'B' },
      ],
      15
    );
    expect(near.get('a')!.leader).toBeDefined();
    expect(near.get('b')!.leader).toBeDefined();
    const apart = layoutPointLabels(
      [
        { id: 'a', coords: base, label: long },
        { id: 'b', coords: offsetPx(20, 0), label: long },
      ],
      15
    );
    expect(apart.get('a')!.leader).toBeUndefined();
    expect(apart.get('b')!.leader).toBeDefined();
  });

  it('同一座標でもラベルのない点は引き出し線の対象にしない', () => {
    const shown = layoutPointLabels(
      [
        { id: 'a', coords: base, label: 'A' },
        { id: 'b', coords: base, label: '' },
      ],
      15
    );
    expect(shown.get('a')!.leader).toBeUndefined();
  });

  it('下置き(Web)では通常位置が記号の下になる', () => {
    const shown = layoutPointLabels([{ id: 'a', coords: base, label: 'A' }], 15, { labelPosition: 'below' });
    expect(shown.get('a')!.dy).toBeGreaterThan(0);
  });

  it('leaderMinZoom未満では引き出し線を使わず間引く', () => {
    const points = [
      { id: 'a', coords: base, label: 'A' },
      { id: 'b', coords: base, label: 'B' },
    ];
    expect(ids(layoutPointLabels(points, 14))).toEqual(['a']);
    expect(ids(layoutPointLabels(points, 15))).toEqual(['a', 'b']);
  });

  it('周囲に空きがなければ間引く', () => {
    // 同一座標に多数。全員引き出し線で、候補は8方向×2半径=16なので16個までしか置けない
    const points = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, coords: base, label: 'X' }));
    const shown = layoutPointLabels(points, 15);
    expect(shown.size).toBeLessThanOrEqual(16);
    expect(shown.size).toBeGreaterThan(5);
    expect(shown.has('p0')).toBe(true);
  });

  it('ラベルは他の点の記号に重ねない', () => {
    // aの通常位置（上、高さ18）の真ん中に別の点dがある → aは通常位置に置けず引き出し線へ
    const shown = layoutPointLabels(
      [
        { id: 'a', coords: base, label: long },
        { id: 'd', coords: offsetPx(0, -16), label: '' },
      ],
      15
    );
    expect(shown.get('a')!.leader).toBeDefined();
  });

  it('横に十分離れていれば両方通常位置', () => {
    const shown = layoutPointLabels(
      [
        { id: 'a', coords: base, label: long },
        { id: 'b', coords: offsetPx(120, 0), label: long },
      ],
      15
    );
    expect(shown.get('a')!.leader).toBeUndefined();
    expect(shown.get('b')!.leader).toBeUndefined();
  });

  it('priorityIdsのラベルは後ろにあっても通常位置を優先して取る', () => {
    const shown = layoutPointLabels(
      [
        { id: 'a', coords: base, label: long },
        { id: 'b', coords: offsetPx(60, 0), label: long },
      ],
      15,
      { priorityIds: ['b'] }
    );
    expect(shown.get('b')!.leader).toBeUndefined();
    expect(shown.get('a')!.leader).toBeDefined();
  });

  it('ズームインすれば通常位置に戻る', () => {
    const points = [
      { id: 'a', coords: base, label: long },
      { id: 'b', coords: offsetPx(60, 0), label: long },
    ];
    expect(layoutPointLabels(points, 15).get('b')!.leader).toBeDefined();
    expect(layoutPointLabels(points, 16).get('b')!.leader).toBeUndefined();
  });

  it('タイルサイズ512(maplibre)ではズーム値が1小さくて同じ縮尺', () => {
    const points = [
      { id: 'a', coords: base, label: long },
      { id: 'b', coords: offsetPx(60, 0), label: long },
    ];
    expect(layoutPointLabels(points, 14, { tileSize: 512 }).get('b')!.leader).toBeDefined();
    expect(layoutPointLabels(points, 15, { tileSize: 512 }).get('b')!.leader).toBeUndefined();
  });

  it('ラベルが空・座標なしのポイントは含まれない', () => {
    const shown = layoutPointLabels(
      [
        { id: 'a', coords: base, label: '' },
        { id: 'n', coords: undefined, label: 'N' },
        { id: 'b', coords: offsetPx(0, 40), label: 'B' },
      ],
      15
    );
    expect(ids(shown)).toEqual(['b']);
  });
});
