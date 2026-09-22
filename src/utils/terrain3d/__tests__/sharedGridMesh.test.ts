import { buildSharedGridMesh, interpolateGridCell } from '../sharedGridMesh';

const SEG = 4;
const SIDE = SEG + 1;

describe('buildSharedGridMesh', () => {
  it('本体＋スカートの頂点数とインデックス数が一致する', () => {
    const mesh = buildSharedGridMesh(SEG);
    const bodyCount = SIDE * SIDE;
    const skirtCount = SIDE * 4;
    expect(mesh.grid.length).toBe((bodyCount + skirtCount) * 3);
    expect(mesh.indices.length).toBe((SEG * SEG + SEG * 4) * 6);
  });

  it('本体頂点は0..1の格子で、スカートフラグが0', () => {
    const mesh = buildSharedGridMesh(SEG);
    // 左上(row=0,col=0)
    expect(mesh.grid[0]).toBe(0);
    expect(mesh.grid[1]).toBe(0);
    expect(mesh.grid[2]).toBe(0);
    // 右下(row=SEG,col=SEG)
    const last = (SIDE * SIDE - 1) * 3;
    expect(mesh.grid[last]).toBe(1);
    expect(mesh.grid[last + 1]).toBe(1);
    expect(mesh.grid[last + 2]).toBe(0);
    // 中央
    const center = (2 * SIDE + 2) * 3;
    expect(mesh.grid[center]).toBeCloseTo(0.5);
    expect(mesh.grid[center + 1]).toBeCloseTo(0.5);
  });

  it('スカート頂点は外周と同じUVを持ち、フラグが1', () => {
    const mesh = buildSharedGridMesh(SEG);
    const skirtBase = SIDE * SIDE;
    // 上辺(edge=0)のi番目は本体のrow=0,col=iと同じUV
    for (let i = 0; i < SIDE; i++) {
      const dst = (skirtBase + i) * 3;
      const src = i * 3;
      expect(mesh.grid[dst]).toBe(mesh.grid[src]);
      expect(mesh.grid[dst + 1]).toBe(mesh.grid[src + 1]);
      expect(mesh.grid[dst + 2]).toBe(1);
    }
    // 右辺(edge=3)のi番目は本体のrow=i,col=SEGと同じUV
    for (let i = 0; i < SIDE; i++) {
      const dst = (skirtBase + 3 * SIDE + i) * 3;
      const src = (i * SIDE + SEG) * 3;
      expect(mesh.grid[dst]).toBe(mesh.grid[src]);
      expect(mesh.grid[dst + 1]).toBe(mesh.grid[src + 1]);
      expect(mesh.grid[dst + 2]).toBe(1);
    }
  });

  it('インデックスは全頂点の範囲に収まる（Uint16で足りる）', () => {
    const mesh = buildSharedGridMesh(64);
    const vertexCount = 65 * 65 + 65 * 4;
    expect(vertexCount).toBeLessThan(65536);
    let max = 0;
    for (const v of mesh.indices) max = Math.max(max, v);
    expect(max).toBe(vertexCount - 1);
  });

  it('本体の三角形は上から見て反時計回り（uを東・vを南とした右手系で表が上）', () => {
    const mesh = buildSharedGridMesh(SEG);
    // 最初の四角形の1枚目: a(0,0) → c(0,1) → b(1,0)
    const [a, c, b] = [mesh.indices[0], mesh.indices[1], mesh.indices[2]];
    const at = [mesh.grid[a * 3], mesh.grid[a * 3 + 1]];
    const bt = [mesh.grid[b * 3], mesh.grid[b * 3 + 1]];
    const ct = [mesh.grid[c * 3], mesh.grid[c * 3 + 1]];
    // v(南)方向を+Zとした平面での外積のY成分。表が上向きなら負にならない
    const cross = (ct[0] - at[0]) * (bt[1] - at[1]) - (ct[1] - at[1]) * (bt[0] - at[0]);
    expect(cross).toBeLessThan(0);
  });
});

describe('interpolateGridCell（GPUの三角形補間との一致）', () => {
  /**
   * 実際に生成されたインデックスから、格子(0,0)のマスを構成する2枚の三角形を取り出す。
   * 分割の向きを取り違えたらここで検出できる（定数で書き下すと意味がない）
   */
  const cellTriangles = (): number[][] => {
    const mesh = buildSharedGridMesh(SEG);
    const tris: number[][] = [];
    for (let t = 0; t < 2; t++) {
      const tri = [mesh.indices[t * 3], mesh.indices[t * 3 + 1], mesh.indices[t * 3 + 2]];
      tris.push(tri);
    }
    return tris;
  };

  /** 頂点添字→マス内のローカル座標(0か1) */
  const local = (idx: number): [number, number] => [idx % SIDE, Math.floor(idx / SIDE)];

  /** 3頂点が張る平面上での高さ（重心座標） */
  const planeHeight = (tri: number[], h: Record<string, number>, fu: number, fv: number): number | null => {
    const [p0, p1, p2] = tri.map(local);
    const det = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]);
    if (det === 0) return null;
    const w1 = ((fu - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (fv - p0[1])) / det;
    const w2 = ((p1[0] - p0[0]) * (fv - p0[1]) - (fu - p0[0]) * (p1[1] - p0[1])) / det;
    const w0 = 1 - w1 - w2;
    // この三角形の内側でなければ対象外
    if (w0 < -1e-9 || w1 < -1e-9 || w2 < -1e-9) return null;
    return w0 * h[`${p0[0]},${p0[1]}`] + w1 * h[`${p1[0]},${p1[1]}`] + w2 * h[`${p2[0]},${p2[1]}`];
  };

  // ねじれのあるクアッド（バイリニアと三角形補間が最も食い違う配置）
  const H = { '0,0': 100, '1,0': 180, '0,1': 220, '1,1': 500 };

  it.each([
    [0.2, 0.2],
    [0.8, 0.1],
    [0.1, 0.8],
    [0.7, 0.7],
    [0.5, 0.5],
    [0.0, 0.0],
    [1.0, 1.0],
  ])('(fu=%p, fv=%p) でGPUが描く三角形の高さと一致する', (fu, fv) => {
    const tris = cellTriangles();
    const expected = tris.map((t) => planeHeight(t, H, fu, fv)).find((v) => v !== null);
    expect(expected).toBeDefined();
    expect(interpolateGridCell(H['0,0'], H['1,0'], H['0,1'], H['1,1'], fu, fv)).toBeCloseTo(expected!, 9);
  });

  it('分割線(fu+fv=1)の両側で連続している', () => {
    // 分割線では傾きが変わる（C0だがC1ではない）ので、差はepsに比例する。
    // epsを1/10にしたら差も1/10になることで連続を確かめる
    const gap = (eps: number): number =>
      Math.abs(
        interpolateGridCell(H['0,0'], H['1,0'], H['0,1'], H['1,1'], 0.5 + eps, 0.5) -
          interpolateGridCell(H['0,0'], H['1,0'], H['0,1'], H['1,1'], 0.5 - eps, 0.5)
      );
    expect(gap(1e-4) / gap(1e-5)).toBeCloseTo(10, 3);
    expect(gap(1e-5)).toBeLessThan(1e-2);
  });

  it('ねじれのないクアッドではバイリニアと一致する', () => {
    // h11 = h10 + h01 - h00 ならツイスト項が0
    const h00 = 100,
      h10 = 180,
      h01 = 220,
      h11 = h10 + h01 - h00;
    const fu = 0.3,
      fv = 0.7;
    const bilinear =
      (h00 * (1 - fu) + h10 * fu) * (1 - fv) + (h01 * (1 - fu) + h11 * fu) * fv;
    expect(interpolateGridCell(h00, h10, h01, h11, fu, fv)).toBeCloseTo(bilinear, 9);
  });

  it('角の値はそのまま返る', () => {
    expect(interpolateGridCell(1, 2, 3, 4, 0, 0)).toBe(1);
    expect(interpolateGridCell(1, 2, 3, 4, 1, 0)).toBeCloseTo(2, 9);
    expect(interpolateGridCell(1, 2, 3, 4, 0, 1)).toBeCloseTo(3, 9);
    expect(interpolateGridCell(1, 2, 3, 4, 1, 1)).toBeCloseTo(4, 9);
  });
});
