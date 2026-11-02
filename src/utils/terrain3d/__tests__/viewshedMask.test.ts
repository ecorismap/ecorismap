import { buildViewshedCircleSpecs, composeViewshedMask, densifyRing, viewshedMaskLocalRect } from '../viewshedMask';
import { lonLatToMercator, MERCATOR_CIRCUMFERENCE } from '../coords';

const rasterOf = (rows: number[][], zoom: number, originPxX: number, originPxY: number) => ({
  vis: new Uint8Array(rows.flat()),
  size: rows.length,
  zoom,
  originPxX,
  originPxY,
});

const maskRows = (mask: NonNullable<ReturnType<typeof composeViewshedMask>>) =>
  Array.from({ length: mask.height }, (_, y) =>
    Array.from(mask.data.subarray(y * mask.width, (y + 1) * mask.width)).map((v) => (v ? 1 : 0))
  );

describe('composeViewshedMask', () => {
  it('グリッドが無ければnull', () => {
    expect(composeViewshedMask([])).toBeNull();
  });

  it('1枚ならグリッドをそのままマスクにする', () => {
    const mask = composeViewshedMask([
      rasterOf(
        [
          [1, 0],
          [0, 1],
        ],
        13,
        100,
        200
      ),
    ])!;
    expect(mask).toMatchObject({ width: 2, height: 2, zoom: 13, originPxX: 100, originPxY: 200 });
    expect(maskRows(mask)).toEqual([
      [1, 0],
      [0, 1],
    ]);
  });

  it('複数は和集合を取り、全体を覆う範囲に並べる', () => {
    const mask = composeViewshedMask([
      rasterOf(
        [
          [1, 0],
          [0, 0],
        ],
        13,
        0,
        0
      ),
      rasterOf(
        [
          [0, 0],
          [0, 1],
        ],
        13,
        1,
        1
      ),
    ])!;
    expect(mask).toMatchObject({ width: 3, height: 3, originPxX: 0, originPxY: 0 });
    expect(maskRows(mask)).toEqual([
      [1, 0, 0],
      [0, 0, 0],
      [0, 0, 1],
    ]);
  });

  it('ズームの違うグリッドは細かいほうへ揃える', () => {
    const mask = composeViewshedMask([rasterOf([[1]], 12, 10, 10), rasterOf([[0]], 13, 22, 22)])!;
    expect(mask.zoom).toBe(13);
    // z12の1画素はz13の2x2画素になる
    expect(maskRows(mask)).toEqual([
      [1, 1, 0],
      [1, 1, 0],
      [0, 0, 0],
    ]);
  });
});

describe('viewshedMaskLocalRect', () => {
  it('マスク左上の緯度経度を原点からのローカル座標へ変換する', () => {
    // z0の512pxタイルの中心（経度0・緯度0）を左上に持つ1x1マスク
    const mask = { data: new Uint8Array(1), width: 1, height: 1, zoom: 0, originPxX: 256, originPxY: 256 };
    const origin = lonLatToMercator(0, 0);
    const [x0, z0, w, h] = viewshedMaskLocalRect(mask, origin);
    expect(x0).toBeCloseTo(0, 6);
    expect(z0).toBeCloseTo(0, 6);
    expect(w).toBeCloseTo(MERCATOR_CIRCUMFERENCE / 512, 6);
    expect(h).toBeCloseTo(MERCATOR_CIRCUMFERENCE / 512, 6);
  });
});

describe('densifyRing', () => {
  it('区間が上限より長ければ頂点を足し、端点は保つ', () => {
    // 緯度0.001度≒111m → 20m以下にするには6分割
    const ring = [
      { latitude: 35, longitude: 135 },
      { latitude: 35.001, longitude: 135 },
    ];
    const dense = densifyRing(ring, 20);
    expect(dense).toHaveLength(7);
    expect(dense[0]).toEqual(ring[0]);
    expect(dense[6].latitude).toBeCloseTo(35.001, 9);
  });

  it('短い区間はそのまま', () => {
    const ring = [
      { latitude: 35, longitude: 135 },
      { latitude: 35.0001, longitude: 135 },
    ];
    expect(densifyRing(ring, 20)).toHaveLength(2);
  });
});

describe('buildViewshedCircleSpecs', () => {
  it('結果ごとに範囲円のリボン指定を作る', () => {
    const specs = buildViewshedCircleSpecs(
      [
        {
          id: 'a',
          circleRing: [
            { latitude: 35, longitude: 135 },
            { latitude: 35.001, longitude: 135 },
          ],
        },
        { id: 'b', circleRing: [] },
      ],
      5,
      [1, 0, 0, 1]
    );
    expect(specs).toHaveLength(1);
    expect(specs[0]).toMatchObject({ id: 'viewshed-circle-a', kind: 'line', widthMeters: 5, color: [1, 0, 0, 1] });
    expect(specs[0].coords.length).toBeGreaterThan(2);
  });
});
