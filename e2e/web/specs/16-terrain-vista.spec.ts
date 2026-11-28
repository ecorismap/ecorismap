import zlib from 'zlib';
import { expect, Page, test } from '@playwright/test';
import {
  chooseFile,
  dialogButton,
  fixture,
  importLayerFile,
  longPressMap,
  okIfShown,
  openApp,
  plainText,
  sheetBack,
  sheetClose,
  text,
} from '../support/app';

// ---------------------------------------------------------------------------
// 標高タイルの差し替え
//
// 可視領域・3D・眺望はどれも標高タイル（Mapterhorn）から結果が決まる。本物のタイルに頼ると
// 通信の具合で結果が変わり、期待値も地形しだいになるので、決まった形の地形を返す。
// 地形は経度だけで決まる（南北に延びる尾根や段差）。行がすべて同じ画素になるので、タイルを安く作れる
// ---------------------------------------------------------------------------

const TILE = 512;

const CRC_TABLE = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table.push(c >>> 0);
  }
  return table;
})();
const crc32 = (bytes: Uint8Array): number => {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const concatBytes = (parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};
const uint32 = (value: number): Uint8Array =>
  Uint8Array.of((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
const pngChunk = (type: string, data: Uint8Array): Uint8Array => {
  const typed = concatBytes([Uint8Array.from(type, (ch) => ch.charCodeAt(0)), data]);
  return concatBytes([uint32(data.length), typed, uint32(crc32(typed))]);
};
/** すべての行が同じ画素の、RGBのPNG（rowは幅×3バイト） */
const pngOfRow = (size: number, row: Uint8Array): Buffer => {
  // 各行の先頭にフィルタ種別（0=なし）を置く
  const raw = new Uint8Array(size * (1 + row.length));
  for (let y = 0; y < size; y++) raw.set(row, y * (1 + row.length) + 1);
  return Buffer.from(
    concatBytes([
      Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
      pngChunk('IHDR', concatBytes([uint32(size), uint32(size), Uint8Array.of(8, 2, 0, 0, 0)])),
      pngChunk('IDAT', new Uint8Array(zlib.deflateSync(raw))),
      pngChunk('IEND', new Uint8Array(0)),
    ])
  );
};

/** 経度から標高[m]を決める地形 */
type Terrain = (lon: number) => number;

/** terrarium形式（標高 = R×256 + G + B/256 − 32768）のタイル */
const terrariumTile = (terrain: Terrain, z: number, x: number): Buffer => {
  const row = new Uint8Array(TILE * 3);
  for (let px = 0; px < TILE; px++) {
    const lon = ((x + (px + 0.5) / TILE) / 2 ** z) * 360 - 180;
    const v = terrain(lon) + 32768;
    const whole = Math.floor(v);
    row[px * 3] = whole >> 8;
    row[px * 3 + 1] = whole & 0xff;
    row[px * 3 + 2] = Math.floor((v - whole) * 256);
  }
  return pngOfRow(TILE, row);
};

/** 産総研の数値PNG形式（標高 = (R×65536 + G×256 + B)／100、負値は 2^24 を足す）のタイル。256px */
const gsjTile = (terrain: Terrain, z: number, x: number): Buffer => {
  const size = 256;
  const row = new Uint8Array(size * 3);
  for (let px = 0; px < size; px++) {
    const lon = ((x + (px + 0.5) / size) / 2 ** z) * 360 - 180;
    const raw = Math.round(terrain(lon) * 100);
    const v = raw < 0 ? raw + 0x1000000 : raw;
    row[px * 3] = (v >> 16) & 0xff;
    row[px * 3 + 1] = (v >> 8) & 0xff;
    row[px * 3 + 2] = v & 0xff;
  }
  return pngOfRow(size, row);
};

/** タイルを返す範囲（中心から東西南北に km まで）。範囲の外はタイルが無い（404）ことにする */
interface TileRegion {
  lon: number;
  lat: number;
  km: number;
}
const tileLat = (y: number, z: number) =>
  (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;
/** タイルが範囲に掛かっているか */
const tileInRegion = (region: TileRegion, z: number, x: number, y: number): boolean => {
  const dLat = region.km / 111.32;
  const dLon = dLat / Math.cos((region.lat * Math.PI) / 180);
  const west = (x / 2 ** z) * 360 - 180;
  const east = ((x + 1) / 2 ** z) * 360 - 180;
  return (
    east >= region.lon - dLon &&
    west <= region.lon + dLon &&
    tileLat(y, z) >= region.lat - dLat &&
    tileLat(y + 1, z) <= region.lat + dLat
  );
};

const TILE_HEADERS = { 'access-control-allow-origin': '*', 'cache-control': 'no-store' };

/**
 * 標高タイル（Mapterhorn）を、決まった地形のタイルに差し替える。terrain が null なら外洋（タイルが無い＝404）。
 * 返り値は、差し替えたタイルを返した回数（アプリが本当にこのタイルを読んだかの確認用）
 */
async function mockDem(page: Page, terrain: Terrain | null, region?: TileRegion): Promise<{ count: number }> {
  const served = { count: 0 };
  const cache = new Map<string, Buffer>();
  await page.route('https://tiles.mapterhorn.com/**', async (route) => {
    const m = /\/(\d+)\/(\d+)\/(\d+)\.webp/.exec(route.request().url());
    const [z, x, y] = m === null ? [0, 0, 0] : [Number(m[1]), Number(m[2]), Number(m[3])];
    if (m === null || terrain === null || (region !== undefined && !tileInRegion(region, z, x, y))) {
      await route.fulfill({ status: 404, headers: TILE_HEADERS, body: '' });
      return;
    }
    const key = `${z}/${x}`;
    let body = cache.get(key);
    if (body === undefined) {
      body = terrariumTile(terrain, z, x);
      cache.set(key, body);
    }
    served.count++;
    // 中身はPNG。アプリもmaplibreも画像の中身から形式を判別するので、拡張子（.webp）と違っていてよい
    await route.fulfill({ status: 200, contentType: 'image/png', headers: TILE_HEADERS, body });
  });
  return served;
}

/** GEBCOの標高タイル（産総研）を、決まった海底の深さのタイルに差し替える */
async function mockGebco(page: Page, terrain: Terrain): Promise<{ count: number }> {
  const served = { count: 0 };
  // URLは {z}/{y}/{x}.png の順
  await page.route('https://tiles.gsj.jp/tiles/elev/gebco/**', async (route) => {
    const m = /\/(\d+)\/(\d+)\/(\d+)\.png/.exec(route.request().url());
    if (m === null) {
      await route.fulfill({ status: 404, headers: TILE_HEADERS, body: '' });
      return;
    }
    served.count++;
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      headers: TILE_HEADERS,
      body: gsjTile(terrain, Number(m[1]), Number(m[3])),
    });
  });
  return served;
}

/**
 * 背景の地図（地理院タイル）を、白一色のタイルに差し替える。
 * 画面の色を見る検証は、背景が決まっているほうが確かになる。通信の具合にも左右されなくなる
 */
async function mockBaseTiles(page: Page, region?: TileRegion) {
  const white = pngOfRow(256, new Uint8Array(256 * 3).fill(255));
  await page.route('https://cyberjapandata.gsi.go.jp/**', async (route) => {
    const m = /\/(\d+)\/(\d+)\/(\d+)\.\w+$/.exec(new URL(route.request().url()).pathname);
    if (region !== undefined && m !== null && !tileInRegion(region, Number(m[1]), Number(m[2]), Number(m[3]))) {
      await route.fulfill({ status: 404, headers: TILE_HEADERS, body: '' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'image/png', headers: TILE_HEADERS, body: white });
  });
}

/**
 * 眺望のテストでタイルを返す範囲。眺望は300km先まで地形を読み、全部に応えると読み込みに1分以上かかって
 * 操作のたびに待たされる。確かめる山（19km先）が入る範囲だけに応え、その先はタイルが無いことにする
 */
const VISTA_REGION: TileRegion = { lon: 135, lat: 35, km: 30 };

// 初期表示の中心（東経135度・北緯35度）のすぐ東に、南北へ延びる尾根を置いた地形。
// 平地は標高100m、尾根（中心の東 約180〜320m）は400m
const BASE_M = 100;
const RIDGE_M = 400;
const HOME = { lon: 135, lat: 35 };
const RIDGE_WEST = 135.002;
const RIDGE_EAST = 135.0035;
const ridgeTerrain: Terrain = (lon) => (lon >= RIDGE_WEST && lon < RIDGE_EAST ? RIDGE_M : BASE_M);

const M_PER_DEG_LAT = 111319.49;
/** 基準の地点から東へeast[m]・北へnorth[m]の地点 */
const offsetFrom = (origin: { lon: number; lat: number }, east: number, north: number) => ({
  lon: origin.lon + east / (M_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180)),
  lat: origin.lat + north / M_PER_DEG_LAT,
});

// ---------------------------------------------------------------------------
// 地図（maplibre）の状態の読み出し
// ---------------------------------------------------------------------------

/** テストから使う範囲のmaplibreの地図 */
interface E2EMap {
  getCenter: () => { lng: number; lat: number };
  getZoom: () => number;
  getPitch: () => number;
  getBearing: () => number;
  getVerticalFieldOfView: () => number;
  getTerrain: () => { source: string; exaggeration?: number } | null;
  getLayer: (id: string) => unknown;
  getSource: (id: string) => { type: string; tiles?: string[] } | undefined;
  getStyle: () => { layers: { id: string; source?: string }[]; sources: Record<string, { type: string }> };
  project: (lngLat: [number, number]) => { x: number; y: number };
  queryRenderedFeatures: (
    geometry: [number, number] | [[number, number], [number, number]],
    options?: { layers?: string[] }
  ) => { layer: { id: string }; source: string; properties: Record<string, unknown> }[];
  queryTerrainElevation: (lngLat: [number, number]) => number | null;
  getContainer: () => HTMLElement;
  transform: { getCameraLngLat: () => { lng: number; lat: number }; getCameraAltitude: () => number };
}
type E2EWindow = { __e2eMap?: E2EMap };

/**
 * 地図のインスタンスを window.__e2eMap に置く。
 * アプリは地図を外へ出していないので、地図の要素を描いたReactの部品（react-map-glのMap）のrefから取り出す
 */
async function exposeMap(page: Page) {
  await page.waitForFunction(() => {
    const el = document.querySelector('.maplibregl-map') as unknown as Record<string, unknown> | null;
    if (el === null) return false;
    const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
    type Fiber = { return?: Fiber; ref?: { current?: { getMap?: () => unknown } | null } | null };
    let fiber = key === undefined ? undefined : (el[key] as Fiber);
    while (fiber) {
      const current = fiber.ref?.current;
      if (current && typeof current.getMap === 'function') {
        (window as unknown as { __e2eMap?: unknown }).__e2eMap = current.getMap();
        return true;
      }
      fiber = fiber.return;
    }
    return false;
  });
}

/** 地点の画面上の位置（ページの座標） */
const screenOf = (page: Page, p: { lon: number; lat: number }) =>
  page.evaluate(({ lon, lat }) => {
    const map = (window as unknown as E2EWindow).__e2eMap!;
    const rect = map.getContainer().getBoundingClientRect();
    const xy = map.project([lon, lat]);
    return { x: rect.left + xy.x, y: rect.top + xy.y };
  }, p);

/** その地点のまわり（±half px）に描かれている、指定レイヤの地物の数 */
const renderedAt = (page: Page, p: { lon: number; lat: number }, layers: string[], half = 2) =>
  page.evaluate(
    ({ lon, lat, ids, h }) => {
      const map = (window as unknown as E2EWindow).__e2eMap!;
      const existing = ids.filter((id) => map.getLayer(id) !== undefined);
      if (existing.length === 0) return 0;
      const xy = map.project([lon, lat]);
      return map.queryRenderedFeatures(
        [
          [xy.x - h, xy.y - h],
          [xy.x + h, xy.y + h],
        ],
        { layers: existing }
      ).length;
    },
    { lon: p.lon, lat: p.lat, ids: layers, h: half }
  );

/** 画面の矩形の平均色（スクリーンショットから） */
async function averageColor(page: Page, center: { x: number; y: number }, half = 12) {
  const shot = await page.screenshot({
    clip: { x: Math.round(center.x - half), y: Math.round(center.y - half), width: half * 2, height: half * 2 },
  });
  return page.evaluate(async (base64) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
    const n = data.length / 4;
    return { r: r / n, g: g / n, b: b / n };
  }, shot.toString('base64'));
}

/** 赤みの強さ（可視領域の塗りは半透明の赤） */
const redness = (c: { r: number; g: number; b: number }) => c.r - (c.g + c.b) / 2;

/** 地図の状態を読む */
const mapState = (page: Page) =>
  page.evaluate(() => {
    const map = (window as unknown as E2EWindow).__e2eMap!;
    const camera = map.transform.getCameraLngLat();
    return {
      terrain: map.getTerrain(),
      pitch: map.getPitch(),
      bearing: map.getBearing(),
      zoom: map.getZoom(),
      fov: map.getVerticalFieldOfView(),
      center: map.getCenter(),
      camera: { lon: camera.lng, lat: camera.lat, altitude: map.transform.getCameraAltitude() },
      demTiles: map.getSource('rasterdem')?.tiles ?? [],
    };
  });

/** 描かれている地形の、その地点の標高（誇張込み）。地形表示中でなければnull */
const terrainElevation = (page: Page, p: { lon: number; lat: number }) =>
  page.evaluate(({ lon, lat }) => {
    const map = (window as unknown as E2EWindow).__e2eMap!;
    try {
      return map.queryTerrainElevation([lon, lat]);
    } catch {
      return null;
    }
  }, p);

/** 3D表示の起伏の強調率（アプリの TERRAIN_EXAGGERATION） */
const EXAGGERATION = 1.5;

/** 3D表示に切り替え、差し替えた地形（平地と尾根）が地形として読み込まれるまで待つ */
async function enterTerrain(page: Page, flat: { lon: number; lat: number }, ridge: { lon: number; lat: number }) {
  await page.getByTestId('home-terrain').click();
  await expect.poll(async () => (await mapState(page)).terrain).toEqual({ source: 'rasterdem', exaggeration: EXAGGERATION });
  await expect
    .poll(async () => ((await terrainElevation(page, ridge)) ?? 0) - ((await terrainElevation(page, flat)) ?? 0), {
      timeout: 30_000,
    })
    .toBeCloseTo((RIDGE_M - BASE_M) * EXAGGERATION, 0);
}

/** 地図を傾ける（右ボタンのドラッグ。maplibreの標準操作） */
async function tiltMap(page: Page) {
  await page.mouse.move(640, 560);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(640, 440, { steps: 12 });
  await page.mouse.up({ button: 'right' });
  await expect.poll(async () => (await mapState(page)).pitch).toBeGreaterThan(30);
}

const openMaps = async (page: Page) => {
  await page.getByTestId('home-maps').click();
  await expect(page.getByTestId('maps-add')).toBeVisible();
};
const mapNames = async (page: Page) =>
  (await page.locator('[data-testid^="maps-row-"]').allInnerTexts()).map(plainText);
const mapIndex = async (page: Page, name: string) => {
  const names = await mapNames(page);
  const i = names.indexOf(name);
  if (i < 0) throw new Error(`地図が見つかりません: ${name}（${names.join(', ')}）`);
  const id = await page.locator('[data-testid^="maps-row-"]').nth(i).getAttribute('data-testid');
  return Number((id ?? '').replace('maps-row-', ''));
};

// 可視領域の観測点（初期表示の中心）と、そこから見える地点・尾根の陰の地点
const OBSERVER_XY = { x: 640, y: 400 };
const VIEWSHED_RADIUS_M = 500;
const VISIBLE_POINT = offsetFrom(HOME, -250, 0); // 西の平地
const HIDDEN_POINT = offsetFrom(HOME, 420, 0); // 尾根の向こう（範囲の円の内側）
const OUTSIDE_POINT = offsetFrom(HOME, -620, 0); // 範囲の円の外

const VIEWSHED_FILL = ['viewshed-preview-fill'];
const VIEWSHED_CIRCLE = ['viewshed-preview-circle'];

/** 長押しメニューから可視領域を作る（距離0.5km・観測点の高さ2m） */
async function createViewshed(page: Page, x: number, y: number) {
  await longPressMap(page, x, y);
  await page.getByTestId('home-poi-viewshed').click();
  await page.getByTestId('home-viewshedsettings-distance').fill(String(VIEWSHED_RADIUS_M / 1000));
  await expect(page.getByTestId('home-viewshedsettings-observer-height')).toHaveValue('2');
  await page.getByTestId('home-viewshedsettings-ok').click();
}

test.describe('7. 計測・3D（可視領域・3D・眺望）', () => {
  test('ANLY-2 可視領域を作成でき、範囲と見える場所が塗られる', async ({ page }) => {
    await mockBaseTiles(page);
    const dem = await mockDem(page, ridgeTerrain);
    await openApp(page);
    await exposeMap(page);

    // 差し替えた地形が使われている（長押しの標高が平地の100m）
    await longPressMap(page, OBSERVER_XY.x, OBSERVER_XY.y);
    await expect(page.getByTestId('home-poi-coordinate')).toHaveText('35.00000, 135.00000');
    await expect(page.getByTestId('home-poi-elevation')).toHaveText('標高 100.0 m', { timeout: 20_000 });
    await page.mouse.click(900, 150);

    await expect(page.getByTestId('home-viewshed-text')).toBeHidden();
    await createViewshed(page, OBSERVER_XY.x, OBSERVER_XY.y);
    await expect(page.getByTestId('home-viewshed-text')).toHaveText('可視領域 1件', { timeout: 30_000 });
    expect(dem.count).toBeGreaterThan(0);

    // 見える場所（西の平地）は塗られ、尾根の陰と範囲の外は塗られない
    await expect.poll(() => renderedAt(page, VISIBLE_POINT, VIEWSHED_FILL)).toBeGreaterThan(0);
    expect(await renderedAt(page, HIDDEN_POINT, VIEWSHED_FILL)).toBe(0);
    expect(await renderedAt(page, OUTSIDE_POINT, VIEWSHED_FILL)).toBe(0);
    // 範囲の円は、観測点から指定した距離（500m）のところに引かれる
    for (const [east, north] of [
      [-VIEWSHED_RADIUS_M, 0],
      [VIEWSHED_RADIUS_M, 0],
      [0, VIEWSHED_RADIUS_M],
    ]) {
      expect(await renderedAt(page, offsetFrom(HOME, east, north), VIEWSHED_CIRCLE, 6)).toBeGreaterThan(0);
    }
    expect(await renderedAt(page, offsetFrom(HOME, -VIEWSHED_RADIUS_M + 80, 0), VIEWSHED_CIRCLE, 6)).toBe(0);
    // 観測点に番号のマーカーが立つ
    const marker = page.locator('.maplibregl-marker').filter({ hasText: /^1$/ });
    await expect(marker).toHaveCount(1);
    const box = await marker.boundingBox();
    expect(Math.abs(box!.x + box!.width / 2 - OBSERVER_XY.x)).toBeLessThan(3);
    expect(Math.abs(box!.y + box!.height / 2 - OBSERVER_XY.y)).toBeLessThan(3);

    // 画面でも、見える場所は赤く、尾根の陰は赤くない
    const visibleXY = await screenOf(page, VISIBLE_POINT);
    const hiddenXY = await screenOf(page, HIDDEN_POINT);
    await expect
      .poll(async () => redness(await averageColor(page, visibleXY)) - redness(await averageColor(page, hiddenXY)))
      .toBeGreaterThan(40);

    // 消去すると、塗りも円もバナーも消える
    await page.getByTestId('home-viewshed-clear').click();
    await expect(page.getByTestId('dialog-message')).toHaveText('表示中の可視領域をすべて消去しますか？');
    await dialogButton(page, 'Yes').click();
    await expect(page.getByTestId('home-viewshed-text')).toBeHidden();
    await expect.poll(() => renderedAt(page, VISIBLE_POINT, VIEWSHED_FILL)).toBe(0);
    await expect(marker).toHaveCount(0);
    expect(redness(await averageColor(page, visibleXY))).toBeLessThan(20);
  });

  test('ANLY-4 3Dで地形・レイヤのデータ・ベクタPMTilesが描かれ、タップで属性が出る', async ({ page }) => {
    // フィクスチャ（仙台市内）のすぐ東に尾根を置く
    const BUNA = { lon: 140.8395, lat: 38.2505 }; // 区画「ブナ林」の中
    const SUGI = { lon: 140.848, lat: 38.25 }; // 区画「スギ植林」の中
    const MIZUNARA = { lon: 140.845775, lat: 38.25603 }; // ポイント「ミズナラ」
    const RIDGE = { lon: 140.8527, lat: 38.2505 };
    await mockBaseTiles(page);
    await mockDem(page, (lon) => (lon >= 140.852 && lon < 140.8535 ? RIDGE_M : BASE_M));
    await openApp(page);
    await exposeMap(page);

    // ベクタのPMTilesを取り込み、その範囲へ移動する
    await openMaps(page);
    const before = await mapNames(page);
    await chooseFile(page, page.getByTestId('maps-import'), fixture('vegetation.pmtiles'));
    await okIfShown(page, 15_000);
    await expect.poll(() => mapNames(page), { timeout: 30_000 }).toHaveLength(before.length + 1);
    const name = (await mapNames(page)).filter((n) => !before.includes(n))[0];
    await page.getByTestId(`maps-row-${await mapIndex(page, name)}`).click();
    await expect.poll(async () => (await mapState(page)).center.lng).toBeCloseTo(140.842, 2);
    // ポイントのレイヤを取り込む（地図の行を押すとシートは下端まで縮むので、閉じずにそのままレイヤ一覧を開く）
    await importLayerFile(page, '植物調査.geojson');
    await sheetClose(page);
    // 区画とポイントが見分けられる大きさまで拡大する
    for (let zoom = 13; zoom <= 15; zoom++) {
      await page.locator('.maplibregl-ctrl-zoom-in').click();
      await expect.poll(async () => (await mapState(page)).zoom).toBeCloseTo(zoom, 1);
    }

    // 3Dにして傾ける。地形は差し替えた標高タイルの形（平地と尾根）になる
    await enterTerrain(page, BUNA, RIDGE);
    await tiltMap(page);

    // ベクタのPMTiles: 区画が描かれていて、タップするとその区画の属性が出る
    const vectorLayers = await page.evaluate(() => {
      const style = (window as unknown as E2EWindow).__e2eMap!.getStyle();
      return style.layers
        .filter((l) => l.source !== undefined && style.sources[l.source]?.type === 'vector')
        .map((l) => l.id);
    });
    expect(vectorLayers.length).toBeGreaterThan(0);
    await expect.poll(() => renderedAt(page, BUNA, vectorLayers), { timeout: 30_000 }).toBeGreaterThan(0);
    await expect.poll(() => renderedAt(page, SUGI, vectorLayers)).toBeGreaterThan(0);
    const popup = page.getByTestId('home-popup-close').locator('..');
    await expect(popup).toBeHidden();
    const bunaXY = await screenOf(page, BUNA);
    await page.mouse.click(bunaXY.x, bunaXY.y);
    await expect(popup).toContainText('ブナ林');
    await expect(popup).toContainText('2.4');
    const sugiXY = await screenOf(page, SUGI);
    await page.mouse.click(sugiXY.x, sugiXY.y);
    await expect(popup).toContainText('スギ植林');
    await expect(popup).toContainText('1.8');
    await expect(popup).not.toContainText('ブナ林');
    await page.getByTestId('home-popup-close').click();
    await expect(popup).toBeHidden();

    // レイヤのデータ: ポイントが8件描かれていて、タップするとそのデータが開く
    await expect(page.locator('.maplibregl-marker')).toHaveCount(8);
    const pointXY = await screenOf(page, MIZUNARA);
    await page.mouse.click(pointXY.x, pointXY.y);
    await expect(page.getByTestId('dataedit-input-種名')).toHaveValue('ミズナラ');
    // ここまで3Dで傾けたまま
    const state = await mapState(page);
    expect(state.terrain).not.toBeNull();
    expect(state.pitch).toBeGreaterThan(30);
  });

  test('ANLY-10 3Dでも可視領域が表示される', async ({ page }) => {
    await mockBaseTiles(page);
    await mockDem(page, ridgeTerrain);
    await openApp(page);
    await exposeMap(page);
    await createViewshed(page, OBSERVER_XY.x, OBSERVER_XY.y);
    await expect(page.getByTestId('home-viewshed-text')).toHaveText('可視領域 1件', { timeout: 30_000 });

    // 3Dにして傾けても、2Dで作った可視領域が地形の上に出ている
    await enterTerrain(page, HOME, offsetFrom(HOME, 250, 0));
    await tiltMap(page);
    await expect(page.getByTestId('home-viewshed-text')).toHaveText('可視領域 1件');
    await expect.poll(() => renderedAt(page, VISIBLE_POINT, VIEWSHED_FILL)).toBeGreaterThan(0);
    expect(await renderedAt(page, HIDDEN_POINT, VIEWSHED_FILL)).toBe(0);
    expect(await renderedAt(page, OUTSIDE_POINT, VIEWSHED_FILL)).toBe(0);
    expect(await renderedAt(page, offsetFrom(HOME, -VIEWSHED_RADIUS_M, 0), VIEWSHED_CIRCLE, 6)).toBeGreaterThan(0);
    const visibleXY = await screenOf(page, VISIBLE_POINT);
    const outsideXY = await screenOf(page, OUTSIDE_POINT);
    await expect
      .poll(async () => redness(await averageColor(page, visibleXY)) - redness(await averageColor(page, outsideXY)))
      .toBeGreaterThan(40);

    // 3Dのままでも長押しメニューから可視領域を作れ、結果が加わる
    const secondXY = await screenOf(page, offsetFrom(HOME, -300, -200));
    await createViewshed(page, secondXY.x, secondXY.y);
    await expect(page.getByTestId('home-viewshed-text')).toHaveText('可視領域 2件', { timeout: 30_000 });
    // 1件目の範囲の外で、2件目の観測点から見える場所が塗られる
    await expect.poll(() => renderedAt(page, OUTSIDE_POINT, VIEWSHED_FILL)).toBeGreaterThan(0);
    await expect(page.locator('.maplibregl-marker').filter({ hasText: /^2$/ })).toHaveCount(1);
    expect((await mapState(page)).terrain).not.toBeNull();
  });

  test('ANLY-6 「ここからの眺望」が開き、山名・望遠／広角・視点の高さ変更が動く', async ({ page }) => {
    // 眺望は遠くまで地形を読み込み続けるので、その間は画面の反応が遅い（押せるようになるまでにも時間がかかる）。
    // 眺望に入ってからの操作と確認は、待ち時間を長めに取る
    test.setTimeout(240_000);
    const SLOW = { timeout: 45_000 };
    await mockBaseTiles(page, VISTA_REGION);
    await mockDem(page, ridgeTerrain, VISTA_REGION);
    await openApp(page);
    await exposeMap(page);
    const GROUND = BASE_M * EXAGGERATION; // 足元（平地）の描画上の高さ
    /** 立ち位置（カメラの位置）と基準の地点のずれ[m] */
    const cameraOffsetM = async (origin: { lon: number; lat: number }) => {
      const { camera } = await mapState(page);
      return Math.hypot(
        (camera.lon - origin.lon) * M_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180),
        (camera.lat - origin.lat) * M_PER_DEG_LAT
      );
    };

    // 2Dの長押しメニューから入ると、3Dに切り替わり、その地点に立って真北を水平に見る
    await longPressMap(page, OBSERVER_XY.x, OBSERVER_XY.y);
    await expect(page.getByTestId('home-poi-vista')).toHaveText(/ここからの眺望/);
    await page.getByTestId('home-poi-vista').click();
    await expect(page.getByTestId('home-vista-close')).toBeVisible(SLOW);
    await expect(page.getByTestId('home-vista-close')).toHaveText(/眺望モード/);
    let state = await mapState(page);
    expect(state.terrain).toEqual({ source: 'rasterdem', exaggeration: EXAGGERATION });
    expect(state.pitch).toBeCloseTo(90, 1);
    expect(state.bearing).toBeCloseTo(0, 3);
    expect(state.fov).toBeCloseTo(60, 3);
    expect(await cameraOffsetM(HOME)).toBeLessThan(1);
    // 目の高さは足元（標高100mの平地）の上1.7m
    expect(state.camera.altitude).toBeCloseTo(GROUND + 1.7 * EXAGGERATION, 1);
    await expect(page.getByTestId('home-vista-height')).toHaveText('1.7m');
    await expect(page.getByTestId('home-vista-zoom')).toHaveText('×1.0');
    // 眺望中は地図のズームボタンが消える
    await expect(page.locator('.maplibregl-ctrl-zoom-in')).toHaveCount(0);

    // 山名: 北西19kmの千ヶ峰（1005m）が、その方角（画面の左寄り）に出る
    const labels = page.getByTestId('home-vista-peak-label');
    const peakNames = async () => (await labels.allInnerTexts()).map((s) => s.replace(/\s/g, ''));
    await expect.poll(peakNames, SLOW).toContain('千ヶ峰');
    await expect(page.getByText('山名: 国土地理院')).toBeVisible();
    const sengamine = labels.filter({ hasText: /^千\s*ヶ\s*峰$/ });
    const labelBox = (await sengamine.boundingBox())!;
    // 方位 -33.3度の山は、縦の画角60度・1280×800の画面で x≒184 に来る
    expect(Math.abs(labelBox.x + labelBox.width / 2 - 184)).toBeLessThan(30);
    // 山名を押すと標高と距離が出る（読み込み中はラベルが置き直され続けるので、止まるのを待たずに押す）
    await sengamine.click({ force: true, ...SLOW });
    await expect(page.getByTestId('home-vista-peak-detail')).toHaveText(/千ヶ峰\s*標高 1005 m ・ 19\.\d km/, SLOW);
    // 山名の表示を切り替えられる
    await page.getByTestId('home-vista-peak-names').click(SLOW);
    await expect(labels).toHaveCount(0, SLOW);
    await expect(page.getByTestId('home-vista-peak-detail')).toBeHidden();
    await page.getByTestId('home-vista-peak-names').click(SLOW);
    await expect.poll(peakNames, SLOW).toContain('千ヶ峰');

    // 視点の高さ: 上げ下げすると表示と目の高さが変わり、立ち位置は動かない
    for (const [button, label, heightM] of [
      ['home-vista-height-up', '5m', 5],
      ['home-vista-height-up', '10m', 10],
      ['home-vista-height-down', '5m', 5],
    ] as const) {
      await page.getByTestId(button).click(SLOW);
      await expect(page.getByTestId('home-vista-height')).toHaveText(label, SLOW);
      await expect
        .poll(async () => (await mapState(page)).camera.altitude, SLOW)
        .toBeCloseTo(GROUND + heightM * EXAGGERATION, 1);
      expect(await cameraOffsetM(HOME)).toBeLessThan(1);
    }

    // 望遠／広角: 画角が変わり、立ち位置は動かない
    for (const [button, label, fov] of [
      ['home-vista-zoom-in', '×1.4', 45],
      ['home-vista-zoom-out', '×1.0', 60],
      ['home-vista-zoom-out', '×0.8', 75],
    ] as const) {
      await page.getByTestId(button).click(SLOW);
      await expect(page.getByTestId('home-vista-zoom')).toHaveText(label, SLOW);
      await expect.poll(async () => (await mapState(page)).fov, SLOW).toBeCloseTo(fov, 3);
      expect(await cameraOffsetM(HOME)).toBeLessThan(1);
    }

    // ドラッグはその場で見回す（向きが変わり、立ち位置は動かない）
    await page.mouse.move(700, 450);
    await page.mouse.down();
    await page.mouse.move(600, 450, { steps: 5 });
    await page.mouse.up();
    await expect.poll(async () => (await mapState(page)).bearing, SLOW).toBeGreaterThan(3);
    expect(await cameraOffsetM(HOME)).toBeLessThan(1);

    // バナーを押すと眺望を抜け、立っていた地点を見下ろす3Dへ戻る
    await page.getByTestId('home-vista-close').click(SLOW);
    await expect(page.getByTestId('home-vista-close')).toBeHidden(SLOW);
    await expect(page.getByTestId('home-vista-height')).toBeHidden();
    await expect(labels).toHaveCount(0);
    await expect(page.locator('.maplibregl-ctrl-zoom-in')).toBeVisible();
    await expect.poll(async () => (await mapState(page)).pitch, SLOW).toBeCloseTo(60, 0);
    state = await mapState(page);
    expect(state.terrain).not.toBeNull();
    expect(state.fov).toBeLessThan(40);
    expect(state.center.lng).toBeCloseTo(HOME.lon, 4);
    expect(state.center.lat).toBeCloseTo(HOME.lat, 4);
  });

  test('ANLY-7 現在地の近くを長押しすると「現在地からの眺望」になり、現在地に立つ', async ({ page, context }) => {
    const current = offsetFrom(HOME, -200, 100);
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: current.lat, longitude: current.lon, accuracy: 5 });
    await mockBaseTiles(page, VISTA_REGION);
    await mockDem(page, ridgeTerrain, VISTA_REGION);
    await openApp(page);
    await exposeMap(page);
    await page.locator('.maplibregl-ctrl-geolocate').click();
    const dot = page.locator('.maplibregl-user-location-dot');
    await expect(dot).toBeVisible({ timeout: 20_000 });
    // 地図が現在地へ移動し終えるまで待つ
    await expect.poll(async () => (await mapState(page)).center.lng, { timeout: 20_000 }).toBeCloseTo(current.lon, 5);
    await expect.poll(async () => (await mapState(page)).center.lat).toBeCloseTo(current.lat, 5);
    const dotBox = (await dot.boundingBox())!;
    const dotXY = { x: dotBox.x + dotBox.width / 2, y: dotBox.y + dotBox.height / 2 };

    // 現在地から離れた地点の長押しは、ふつうの「ここからの眺望」
    await longPressMap(page, dotXY.x + 150, dotXY.y);
    await expect(page.getByTestId('home-poi-distance')).toHaveText(/^現在地から \d+ m$/);
    await expect(page.getByTestId('home-poi-vista')).toHaveText(/ここからの眺望/);
    // 現在地の近く（画面上40px以内）の長押しは、現在地に吸い付く
    await longPressMap(page, dotXY.x + 20, dotXY.y + 15);
    await expect(page.getByTestId('home-poi-distance')).toHaveText('現在地');
    await expect(page.getByTestId('home-poi-coordinate')).toHaveText(
      `${current.lat.toFixed(5)}, ${current.lon.toFixed(5)}`
    );
    await expect(page.getByTestId('home-poi-vista')).toHaveText(/現在地からの眺望/);

    // 眺望に入ると、押した地点（現在地から約50m）ではなく現在地に立つ
    await page.getByTestId('home-poi-vista').click();
    await expect(page.getByTestId('home-vista-close')).toBeVisible({ timeout: 30_000 });
    const state = await mapState(page);
    const offsetM = Math.hypot(
      (state.camera.lon - current.lon) * M_PER_DEG_LAT * Math.cos((current.lat * Math.PI) / 180),
      (state.camera.lat - current.lat) * M_PER_DEG_LAT
    );
    expect(offsetM).toBeLessThan(1);
    expect(state.pitch).toBeCloseTo(90, 1);
    expect(state.camera.altitude).toBeCloseTo((BASE_M + 1.7) * EXAGGERATION, 1);
    // Webは立ち位置を現在地に追従させない（追従はネイティブのみ）ので、移動後の追従は確かめない
  });

  test('ANLY-9 GEBCO海底地形図を表示して3Dにすると、海底が立体になる', async ({ page }) => {
    // 陸の標高（Mapterhorn）は全面が海（0m）。GEBCOの海底は、中心より西が-1000m、東が-2000m
    const WEST = offsetFrom(HOME, -300, 0);
    const EAST = offsetFrom(HOME, 300, 0);
    await mockBaseTiles(page);
    await mockDem(page, () => 0);
    const gebco = await mockGebco(page, (lon) => (lon < HOME.lon ? -1000 : -2000));
    await openApp(page);
    await exposeMap(page);
    expect((await mapState(page)).demTiles).toEqual(['https://tiles.mapterhorn.com/{z}/{x}/{y}.webp']);

    // GEBCO海底地形図を追加すると、3D地形の標高が海底を埋めたものに切り替わる
    await openMaps(page);
    await page.getByTestId('maps-add').click();
    await page.getByTestId('mapedit-preset').click({ force: true });
    await text(page, 'GEBCO海底地形図(全球)').click();
    await expect(page.getByTestId('mapedit-url')).toHaveValue(/^relief:\/\/.*gebco/);
    await page.getByTestId('mapedit-save').click();
    await expect.poll(async () => (await mapState(page)).demTiles[0]).toMatch(/^bathyterrain:\/\/.*gebco/);
    await sheetBack(page);
    await sheetClose(page);

    // 3Dにすると、海が海底の深さで起伏する（深さ×海底の強調3倍×地形の強調1.5倍）
    await page.getByTestId('home-terrain').click();
    await expect.poll(async () => (await mapState(page)).terrain).toEqual({ source: 'rasterdem', exaggeration: EXAGGERATION });
    await expect.poll(() => terrainElevation(page, WEST), { timeout: 30_000 }).toBeCloseTo(-1000 * 3 * EXAGGERATION, 0);
    await expect.poll(() => terrainElevation(page, EAST)).toBeCloseTo(-2000 * 3 * EXAGGERATION, 0);
    expect(gebco.count).toBeGreaterThan(0);
  });

  test('ANLY-9b 3D表示中にGEBCO海底地形図を追加しても、海底が立体になる', async ({ page }) => {
    // ANLY-9と同じ地形で、順序だけが逆（先に3Dにしてから追加する）。
    // 読み込み済みの地形（0mの海）が、海底を埋めた標高に置き換わることを確かめる
    const WEST = offsetFrom(HOME, -300, 0);
    const EAST = offsetFrom(HOME, 300, 0);
    await mockBaseTiles(page);
    const dem = await mockDem(page, () => 0);
    const gebco = await mockGebco(page, (lon) => (lon < HOME.lon ? -1000 : -2000));
    await openApp(page);
    await exposeMap(page);

    // 先に3Dにする。この時点の地形は陸の標高（全面0m）
    await page.getByTestId('home-terrain').click();
    await expect.poll(async () => (await mapState(page)).terrain).toEqual({ source: 'rasterdem', exaggeration: EXAGGERATION });
    await expect.poll(() => dem.count, { timeout: 30_000 }).toBeGreaterThan(0);
    await expect.poll(() => terrainElevation(page, WEST), { timeout: 30_000 }).toBe(0);
    await page.waitForTimeout(1000);
    expect(await terrainElevation(page, EAST)).toBe(0);
    expect(gebco.count).toBe(0);

    // 3Dのまま、GEBCO海底地形図を追加する
    await openMaps(page);
    await page.getByTestId('maps-add').click();
    await page.getByTestId('mapedit-preset').click({ force: true });
    await text(page, 'GEBCO海底地形図(全球)').click();
    await expect(page.getByTestId('mapedit-url')).toHaveValue(/^relief:\/\/.*gebco/);
    await page.getByTestId('mapedit-save').click();
    await expect.poll(async () => (await mapState(page)).demTiles[0]).toMatch(/^bathyterrain:\/\/.*gebco/);
    await sheetBack(page);
    await sheetClose(page);

    // 地図を動かさなくても、海が海底の深さで起伏する（深さ×海底の強調3倍×地形の強調1.5倍）
    expect((await mapState(page)).terrain).toEqual({ source: 'rasterdem', exaggeration: EXAGGERATION });
    await expect.poll(() => terrainElevation(page, WEST), { timeout: 30_000 }).toBeCloseTo(-1000 * 3 * EXAGGERATION, 0);
    await expect.poll(() => terrainElevation(page, EAST)).toBeCloseTo(-2000 * 3 * EXAGGERATION, 0);
    expect(gebco.count).toBeGreaterThan(0);
  });
});
