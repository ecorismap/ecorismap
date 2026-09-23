import { buildPolygonFill, buildRibbon, OverlayBatchBuilder } from '../overlayGeometry';
import { lonLatToMercator } from '../coords';
import { parseColorToRgba } from '../colorUtils';

const origin = lonLatToMercator(138.0, 35.0);
const flatSampler = () => 100;

describe('buildRibbon', () => {
  const path = [
    { latitude: 35.0, longitude: 138.0 },
    { latitude: 35.0, longitude: 138.001 },
  ];

  it('2点のラインから4頂点2三角形のリボンを作る', () => {
    const geo = buildRibbon(path, 10, origin, 1, flatSampler);
    expect(geo).not.toBeNull();
    expect(geo!.positions.length).toBe(4 * 3);
    expect(geo!.indices.length).toBe(6);
  });

  it('リボン幅は指定どおり（東西ラインなら南北方向に±width/2）', () => {
    const geo = buildRibbon(path, 10, origin, 1, flatSampler)!;
    // 頂点0と1は同じ経路点の左右オフセット
    const dz = Math.abs(geo.positions[2] - geo.positions[5]);
    expect(dz).toBeCloseTo(10, 4);
  });

  it('高さ=標高+リフト（elevScale適用）', () => {
    const geo = buildRibbon(path, 10, origin, 2, flatSampler)!;
    expect(geo.positions[1]).toBeCloseTo((100 + 3) * 2);
  });

  it('長い区間は分割される', () => {
    const long = [
      { latitude: 35.0, longitude: 138.0 },
      { latitude: 35.0, longitude: 138.01 }, // 約1km
    ];
    const geo = buildRibbon(long, 10, origin, 1, flatSampler)!;
    expect(geo.positions.length / 6).toBeGreaterThan(4);
  });

  it('標高未取得(null)は0m扱い', () => {
    const geo = buildRibbon(path, 10, origin, 1, () => null)!;
    expect(geo.positions[1]).toBeCloseTo(3);
  });

  it('1点以下はnull', () => {
    expect(buildRibbon([path[0]], 10, origin, 1, flatSampler)).toBeNull();
  });
});

describe('buildPolygonFill', () => {
  const square = [
    { latitude: 35.0, longitude: 138.0 },
    { latitude: 35.0, longitude: 138.001 },
    { latitude: 35.001, longitude: 138.001 },
    { latitude: 35.001, longitude: 138.0 },
  ];

  it('四角形は2三角形に分割される', () => {
    const geo = buildPolygonFill(square, undefined, origin, 1, flatSampler);
    expect(geo).not.toBeNull();
    expect(geo!.indices.length).toBe(6);
    expect(geo!.positions.length).toBe(4 * 3);
  });

  it('穴付きポリゴンは穴を避けて分割される', () => {
    const hole = [
      { latitude: 35.0004, longitude: 138.0004 },
      { latitude: 35.0004, longitude: 138.0006 },
      { latitude: 35.0006, longitude: 138.0006 },
      { latitude: 35.0006, longitude: 138.0004 },
    ];
    const geo = buildPolygonFill(square, { h1: hole }, origin, 1, flatSampler)!;
    expect(geo.positions.length).toBe(8 * 3);
    expect(geo.indices.length).toBeGreaterThan(6);
  });

  it('3点未満はnull', () => {
    expect(buildPolygonFill(square.slice(0, 2), undefined, origin, 1, flatSampler)).toBeNull();
  });
});

describe('OverlayBatchBuilder', () => {
  const square = [
    { latitude: 35.0, longitude: 138.0 },
    { latitude: 35.0, longitude: 138.001 },
    { latitude: 35.001, longitude: 138.001 },
    { latitude: 35.001, longitude: 138.0 },
  ];
  const line = [
    { latitude: 35.0, longitude: 138.0 },
    { latitude: 35.0, longitude: 138.001 },
  ];

  it('何も追加しなければnull', () => {
    const builder = new OverlayBatchBuilder();
    expect(builder.isEmpty).toBe(true);
    expect(builder.build()).toBeNull();
  });

  it('複数地物を連結し、インデックスが頂点オフセット分ずれる', () => {
    const a = buildRibbon(line, 10, origin, 1, flatSampler)!;
    const b = buildPolygonFill(square, undefined, origin, 1, flatSampler)!;
    const builder = new OverlayBatchBuilder();
    builder.add(a, [1, 0, 0, 1]);
    builder.add(b, [0, 0, 1, 0.5]);
    const batch = builder.build()!;

    const aVertices = a.positions.length / 3;
    expect(batch.positions.length).toBe(a.positions.length + b.positions.length);
    expect(batch.indices.length).toBe(a.indices.length + b.indices.length);
    // 1件目はそのまま、2件目は1件目の頂点数だけずれる
    expect(batch.indices[0]).toBe(a.indices[0]);
    expect(batch.indices[a.indices.length]).toBe(aVertices + b.indices[0]);
    // インデックスが全頂点の範囲に収まる
    const vertexCount = batch.positions.length / 3;
    for (const i of batch.indices) expect(i).toBeLessThan(vertexCount);
  });

  it('色は頂点毎にRGBA8で展開される', () => {
    const a = buildRibbon(line, 10, origin, 1, flatSampler)!;
    const builder = new OverlayBatchBuilder();
    builder.add(a, [1, 0, 0, 1]);
    builder.add(buildPolygonFill(square, undefined, origin, 1, flatSampler)!, [0, 0, 1, 0.5]);
    const batch = builder.build()!;

    expect(batch.colors.length).toBe((batch.positions.length / 3) * 4);
    // 1件目の先頭頂点は赤
    expect(Array.from(batch.colors.slice(0, 4))).toEqual([255, 0, 0, 255]);
    // 2件目の先頭頂点は半透明の青
    const offset = (a.positions.length / 3) * 4;
    expect(Array.from(batch.colors.slice(offset, offset + 4))).toEqual([0, 0, 255, 128]);
  });
});

describe('parseColorToRgba', () => {
  it('各形式をパースできる', () => {
    expect(parseColorToRgba('#ff0000')).toEqual([1, 0, 0, 1]);
    expect(parseColorToRgba('#f00')).toEqual([1, 0, 0, 1]);
    const withAlpha = parseColorToRgba('#00ff0080');
    expect(withAlpha[1]).toBe(1);
    expect(withAlpha[3]).toBeCloseTo(0.5, 1);
    expect(parseColorToRgba('rgba(0,0,255,0.5)')).toEqual([0, 0, 1, 0.5]);
    expect(parseColorToRgba('rgb(255,255,0)')).toEqual([1, 1, 0, 1]);
  });

  it('不正値はフォールバック', () => {
    expect(parseColorToRgba('unknown')).toEqual([0.2, 0.4, 1, 1]);
  });
});
