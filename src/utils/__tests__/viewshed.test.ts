import { deflate } from 'pako';
import {
  computeVisibility,
  traceBoundaryRings,
  visibilityToPolygons,
  selectDemZoom,
  fetchDemGrid,
  makeCircleRing,
  decodeDemTile,
} from '../viewshed';

describe('selectDemZoom', () => {
  it('UIの上限である半径10kmまでは日本全域で最大ズーム(z14)を選ぶ', () => {
    expect(selectDemZoom(35, 1000)).toBe(14);
    expect(selectDemZoom(35, 10000)).toBe(14);
    expect(selectDemZoom(45, 10000)).toBe(14); // 北海道北端でもz14を維持
  });
  it('さらに大きい半径ではズームを下げてグリッドを上限内に収める', () => {
    const z = selectDemZoom(35, 30000);
    expect(z).toBeLessThan(14);
    const mpp = (40075017.0 * Math.cos((35 * Math.PI) / 180)) / (256 * Math.pow(2, z));
    expect((2 * 30000) / mpp).toBeLessThanOrEqual(3000);
  });
});

describe('computeVisibility', () => {
  const SIZE = 21;
  const MPP = 10;
  const RADIUS_PX = (SIZE - 1) / 2;

  const makeFlat = (elevation: number) => new Float32Array(SIZE * SIZE).fill(elevation);

  it('平坦な地形では半径内が全て可視になる', async () => {
    const vis = await computeVisibility(makeFlat(100), SIZE, MPP, 2, RADIUS_PX);
    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        const distPx = Math.hypot(col - RADIUS_PX, row - RADIUS_PX);
        // オープニングで境界が1セル程度変わりうるため内側で判定
        if (distPx <= RADIUS_PX - 2) {
          expect(vis[row * SIZE + col]).toBe(1);
        }
      }
    }
  });

  it('尾根の背後は不可視になる', async () => {
    const elev = makeFlat(0);
    // 観測者の右側 col=14,15 に高さ100mの南北の尾根（幅2セル）
    for (let row = 0; row < SIZE; row++) {
      elev[row * SIZE + 14] = 100;
      elev[row * SIZE + 15] = 100;
    }
    const vis = await computeVisibility(elev, SIZE, MPP, 2, RADIUS_PX);
    const center = RADIUS_PX;
    // 尾根の手前側の面は見える
    expect(vis[center * SIZE + 14]).toBe(1);
    // 尾根の背後（同じ行の col=17以降）は見えない
    expect(vis[center * SIZE + 17]).toBe(0);
    expect(vis[center * SIZE + 19]).toBe(0);
    // 反対側（西側）は見える
    expect(vis[center * SIZE + 5]).toBe(1);
  });

  it('観測点を高くすると尾根の背後の遠方が見えるようになる', async () => {
    const elev = makeFlat(0);
    for (let row = 0; row < SIZE; row++) {
      elev[row * SIZE + 13] = 30;
      elev[row * SIZE + 14] = 30;
    }
    const center = RADIUS_PX;
    const low = await computeVisibility(elev, SIZE, MPP, 2, RADIUS_PX);
    expect(low[center * SIZE + 19]).toBe(0);
    // 観測点を尾根より十分高くすると背後も見える
    const high = await computeVisibility(elev, SIZE, MPP, 200, RADIUS_PX);
    expect(high[center * SIZE + 19]).toBe(1);
  });

  it('1セル幅のスジ状の可視域はオープニングで除去される', async () => {
    // 平坦地形で全可視にした後の結果と比較はできないため、直接スジを作る:
    // 高さ100mの孤立した細い壁だけが見える状況を模す
    const elev = makeFlat(0);
    // 観測者の周囲だけ盆地(観測点より低い-50m)にして、右方向に1セル幅の高い畝
    for (let i = 0; i < SIZE * SIZE; i++) elev[i] = -50;
    elev[RADIUS_PX * SIZE + RADIUS_PX] = 0;
    for (let col = RADIUS_PX + 2; col < SIZE; col++) {
      elev[RADIUS_PX * SIZE + col] = 5; // 観測点視線ぎりぎりの1セル幅の畝
    }
    const vis = await computeVisibility(elev, SIZE, MPP, 2, RADIUS_PX);
    // 畝の遠端は1セル幅のスジになるので除去されている
    expect(vis[RADIUS_PX * SIZE + (SIZE - 2)]).toBe(0);
  });

  it('NoData(NaN)は海面0mとして扱われ可視になる', async () => {
    const elev = makeFlat(NaN);
    elev[RADIUS_PX * SIZE + RADIUS_PX] = 5; // 観測点のみ陸
    const vis = await computeVisibility(elev, SIZE, MPP, 2, RADIUS_PX);
    expect(vis[RADIUS_PX * SIZE + (RADIUS_PX + 5)]).toBe(1);
  });
});

describe('traceBoundaryRings', () => {
  const makeVis = (size: number, cells: [number, number][]) => {
    const vis = new Uint8Array(size * size);
    cells.forEach(([col, row]) => (vis[row * size + col] = 1));
    return vis;
  };

  it('単一の矩形は1つの外周リングになる', () => {
    const cells: [number, number][] = [];
    for (let row = 1; row <= 3; row++) for (let col = 1; col <= 4; col++) cells.push([col, row]);
    const rings = traceBoundaryRings(makeVis(6, cells), 6);
    expect(rings).toHaveLength(1);
    expect(rings[0].area).toBe(12); // 4x3セル
  });

  it('ドーナツ状は外周リングと穴になる', () => {
    const cells: [number, number][] = [];
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        if (!(col === 2 && row === 2)) cells.push([col, row]);
      }
    }
    const rings = traceBoundaryRings(makeVis(5, cells), 5);
    expect(rings).toHaveLength(2);
    const outer = rings.find((r) => r.area > 0);
    const hole = rings.find((r) => r.area < 0);
    expect(outer?.area).toBe(25);
    expect(hole?.area).toBe(-1);
  });

  it('離れた2つの領域は2つの外周リングになる', () => {
    const rings = traceBoundaryRings(
      makeVis(6, [
        [0, 0],
        [1, 0],
        [4, 4],
        [5, 4],
        [4, 5],
        [5, 5],
      ]),
      6
    );
    expect(rings.filter((r) => r.area > 0)).toHaveLength(2);
  });

  it('対角で接するセルは別々のリングに分かれる（4連結）', () => {
    const rings = traceBoundaryRings(
      makeVis(4, [
        [0, 0],
        [1, 1],
      ]),
      4
    );
    expect(rings).toHaveLength(2);
    expect(rings.every((r) => r.area === 1)).toBe(true);
  });
});

describe('visibilityToPolygons', () => {
  // 北緯35度・東経138度付近のワールドピクセル座標（z14）
  const GRID = { size: 32, zoom: 14, originPxX: 3704000, originPxY: 1661000 };

  it('矩形の可視域が1つのポリゴンになり緯度経度に変換される', () => {
    const vis = new Uint8Array(GRID.size * GRID.size);
    for (let row = 4; row < 20; row++) for (let col = 4; col < 20; col++) vis[row * GRID.size + col] = 1;
    const polygons = visibilityToPolygons(vis, GRID);
    expect(polygons).toHaveLength(1);
    const { coords, holes } = polygons[0];
    expect(Object.keys(holes)).toHaveLength(0);
    expect(coords.length).toBeGreaterThanOrEqual(4);
    // 閉じたリング
    expect(coords[0]).toEqual(coords[coords.length - 1]);
    // 日本付近の妥当な座標か
    coords.forEach((c) => {
      expect(c.latitude).toBeGreaterThan(20);
      expect(c.latitude).toBeLessThan(50);
      expect(c.longitude).toBeGreaterThan(120);
      expect(c.longitude).toBeLessThan(155);
    });
  });

  it('ドーナツ状の可視域は穴付きポリゴンになる', () => {
    const vis = new Uint8Array(GRID.size * GRID.size);
    for (let row = 2; row < 30; row++) for (let col = 2; col < 30; col++) vis[row * GRID.size + col] = 1;
    for (let row = 10; row < 20; row++) for (let col = 10; col < 20; col++) vis[row * GRID.size + col] = 0;
    const polygons = visibilityToPolygons(vis, GRID);
    expect(polygons).toHaveLength(1);
    expect(Object.keys(polygons[0].holes)).toHaveLength(1);
  });

  it('微小領域は捨てられる', () => {
    const vis = new Uint8Array(GRID.size * GRID.size);
    for (let row = 4; row < 20; row++) for (let col = 4; col < 20; col++) vis[row * GRID.size + col] = 1;
    vis[30 * GRID.size + 30] = 1; // 1セルだけの飛び地
    const polygons = visibilityToPolygons(vis, GRID);
    expect(polygons).toHaveLength(1);
  });
});

describe('decodeDemTile', () => {
  /** 全ピクセル同一RGBの256x256 PNGを組み立てる */
  const buildUniformPng = (r: number, g: number, b: number): Uint8Array => {
    const size = 256;
    const stride = size * 3;
    const raw = new Uint8Array(size * (stride + 1));
    for (let row = 0; row < size; row++) {
      const offset = row * (stride + 1) + 1;
      for (let col = 0; col < size; col++) {
        raw[offset + col * 3] = r;
        raw[offset + col * 3 + 1] = g;
        raw[offset + col * 3 + 2] = b;
      }
    }
    const idat = deflate(raw);
    const chunk = (type: string, data: Uint8Array) => {
      const out = new Uint8Array(12 + data.length);
      new DataView(out.buffer).setUint32(0, data.length);
      for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
      out.set(data, 8);
      return out;
    };
    const ihdr = new Uint8Array(13);
    const v = new DataView(ihdr.buffer);
    v.setUint32(0, size);
    v.setUint32(4, size);
    ihdr[8] = 8; // bitDepth
    ihdr[9] = 2; // RGB
    const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))];
    const total = parts.reduce((s, p) => s + p.length, 0);
    const png = new Uint8Array(total);
    let pos = 0;
    for (const p of parts) {
      png.set(p, pos);
      pos += p.length;
    }
    return png;
  };

  it('GSI方式をデコードできる（100m = x:10000, 0.01m単位）', () => {
    // x = 2^16*R + 2^8*G + B = 10000 → R=0, G=39, B=16
    const elev = decodeDemTile(buildUniformPng(0, 39, 16).buffer as ArrayBuffer, 'gsi');
    expect(elev![0]).toBeCloseTo(100);
  });

  it('terrarium方式をデコードできる（e = R*256+G+B/256-32768）', () => {
    // 標高1000m: 33768 = R*256+G → R=131, G=232, B=0
    const elev = decodeDemTile(buildUniformPng(131, 232, 0).buffer as ArrayBuffer, 'terrarium');
    expect(elev![0]).toBeCloseTo(1000);
  });

  it('terrariumの負値（海洋バスメトリ）は0にクランプされる', () => {
    // -1000m: 31768 = R*256+G → R=124, G=24, B=0
    const elev = decodeDemTile(buildUniformPng(124, 24, 0).buffer as ArrayBuffer, 'terrarium');
    expect(elev![0]).toBe(0);
  });
});

describe('makeCircleRing', () => {
  it('閉じたリングで各頂点が指定半径の距離にある', () => {
    const center = { latitude: 35.0, longitude: 138.0 };
    const radius = 3000;
    const ring = makeCircleRing(center, radius, 72);
    expect(ring).toHaveLength(73);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    // 各頂点までのハバーサイン距離が半径と一致すること
    const R = 6371000;
    for (const p of ring) {
      const dLat = ((p.latitude - center.latitude) * Math.PI) / 180;
      const dLon = ((p.longitude - center.longitude) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((center.latitude * Math.PI) / 180) * Math.cos((p.latitude * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
      const d = 2 * R * Math.asin(Math.sqrt(a));
      expect(d).toBeCloseTo(radius, -1); // 誤差10m以内
    }
  });
});

describe('fetchDemGrid', () => {
  it('タイルローダーから標高グリッドを組み立てる', async () => {
    // 全域100mの平坦なタイルを返すローダー
    const loader = jest.fn(async () => new Float32Array(256 * 256).fill(100));
    const grid = await fetchDemGrid({ latitude: 35.0, longitude: 138.0 }, 1000, loader);
    expect(grid).not.toBeNull();
    expect(grid!.zoom).toBe(14);
    expect(grid!.size % 2).toBe(1); // 中心セルを持つ奇数サイズ
    expect(grid!.elev[0]).toBe(100);
    expect(grid!.elev[grid!.elev.length - 1]).toBe(100);
  });

  it('全タイルが取得できない場合はnullを返す', async () => {
    const loader = jest.fn(async () => null);
    const grid = await fetchDemGrid({ latitude: 35.0, longitude: 138.0 }, 1000, loader);
    expect(grid).toBeNull();
  });
});
