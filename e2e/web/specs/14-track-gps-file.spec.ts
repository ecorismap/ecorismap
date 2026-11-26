import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect, Page, test } from '@playwright/test';
import {
  attribution,
  chooseFile,
  dataRows,
  dialogButton,
  fixture,
  layerNames,
  longPressMap,
  okIfShown,
  openApp,
  openLayerData,
  openLayers,
  selectFeature,
  sheetBack,
  sheetClose,
  text,
} from '../support/app';

const IMPORTED = 'ファイルをインポートしました。';

/** テストの中で作ったファイルを置く一時ディレクトリ（リポジトリの外） */
const makeTmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ecorismap-e2e-14-'));

/** ZIPの中のファイル名（フォルダを除く。日本語の部分は化けることがあるので、拡張子だけを当てにする） */
const zipEntries = (file: string): string[] =>
  execFileSync('unzip', ['-Z1', file], { encoding: 'utf8' })
    .split('\n')
    .filter((name) => name !== '' && !name.endsWith('/'));

/** ZIPの中の、その拡張子のファイルの中身（1つだけある前提） */
const zipRead = (file: string, ext: string): Buffer => {
  const count = zipEntries(file).filter((name) => name.toLowerCase().endsWith(ext)).length;
  if (count !== 1) throw new Error(`${ext} がZIPに${count}個あります（${zipEntries(file).join(', ')}）`);
  return execFileSync('unzip', ['-p', file, `*${ext}`], { maxBuffer: 64 * 1024 * 1024 });
};

/**
 * 地図上の画面座標の経緯度（長押しのポップアップから読む）。
 * ポップアップは地図を動かすまで残り、長押しし直すとその地点のものに入れ替わる
 */
const lonLatAt = async (page: Page, x: number, y: number): Promise<[number, number]> => {
  const coordinate = page.getByTestId('home-poi-coordinate');
  const previous = await coordinate.innerText({ timeout: 500 }).catch(() => '');
  await longPressMap(page, x, y);
  await expect(coordinate).toHaveText(/^-?\d+\.\d+, -?\d+\.\d+$/);
  // 前の地点の表示が残っているうちは読まない（同じ地点を読み直すときは変わらないので、少しだけ待つ）
  await expect(coordinate).not.toHaveText(previous, { timeout: 1500 }).catch(() => undefined);
  const [lat, lon] = (await coordinate.innerText()).split(',').map((s) => Number(s.trim()));
  return [lon, lat];
};

// 軌跡は地図の左側（シートに隠れない位置）を、画面の左から右へ進む。点は10秒おき、標高は上って下る
const TRACK_POINTS = 61;
const TRACK_FROM: [number, number] = [160, 430];
const TRACK_TO: [number, number] = [520, 370];
const TRACK_START = Date.parse('2026-01-15T09:00:00+09:00');
const trackXY = (ratio: number): [number, number] => [
  TRACK_FROM[0] + (TRACK_TO[0] - TRACK_FROM[0]) * ratio,
  TRACK_FROM[1] + (TRACK_TO[1] - TRACK_FROM[1]) * ratio,
];

/**
 * 軌跡レイヤに、時刻・標高付きの軌跡を1本入れる。
 * Webでは記録ができないので、軌跡レイヤの書き出し形式（レイヤ設定＋GeoJSON）のZIPを作り、「置き換える」で取り込む。
 */
async function importTrack(page: Page) {
  // いま表示している範囲に重なるよう、画面の2点の経緯度から軌跡の座標を決める
  const from = await lonLatAt(page, ...TRACK_FROM);
  const to = await lonLatAt(page, ...TRACK_TO);
  const coordinates: number[][] = [];
  const timestamps: number[] = [];
  for (let i = 0; i < TRACK_POINTS; i++) {
    const r = i / (TRACK_POINTS - 1);
    const altitude = 100 + 80 * Math.sin(Math.PI * r);
    coordinates.push([from[0] + (to[0] - from[0]) * r, from[1] + (to[1] - from[1]) * r, Math.round(altitude * 10) / 10]);
    timestamps.push(TRACK_START + i * 10_000);
  }
  const layer = {
    id: 'track',
    name: '軌跡',
    type: 'LINE',
    permission: 'PRIVATE',
    colorStyle: {
      colorType: 'SINGLE',
      transparency: 0.2,
      color: '#0000ff',
      fieldName: 'name',
      customFieldValue: '',
      colorRamp: 'RANDOM',
      colorList: [],
      lineWidth: 4,
    },
    label: 'name',
    visible: true,
    active: false,
    field: [
      { id: 'e2etrackname', name: 'name', format: 'SERIAL' },
      { id: 'e2etracktime', name: 'time', format: 'DATETIME' },
      { id: 'e2etrackcmt', name: 'cmt', format: 'STRING' },
    ],
  };
  const geojson = {
    type: 'FeatureCollection',
    name: '軌跡',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates },
        // _id があると自前の書き出しとして扱われ、点ごとの時刻（_timestamps）が戻る
        properties: { _id: 'e2etrack0000000000000001', name: 'E2E軌跡', time: '', cmt: '', _timestamps: timestamps },
      },
    ],
  };
  const dir = makeTmpDir();
  fs.writeFileSync(path.join(dir, 'track.json'), JSON.stringify(layer));
  fs.writeFileSync(path.join(dir, 'track.geojson'), JSON.stringify(geojson));
  const zipFile = path.join(dir, 'track.zip');
  execFileSync('zip', ['-j', '-q', zipFile, path.join(dir, 'track.json'), path.join(dir, 'track.geojson')]);

  await openLayers(page);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('layers-import').click()]);
  await chooser.setFiles(zipFile);
  // 同じレイヤ（軌跡）があるので、置き換えるか別レイヤにするかを聞かれる
  await expect(text(page, 'レイヤ「軌跡」は既に存在します。どうしますか？')).toBeVisible({ timeout: 30_000 });
  await dialogButton(page, '置き換える').click();
  await expect(page.getByTestId('dialog-message')).toHaveText(IMPORTED, { timeout: 30_000 });
  await page.getByTestId('dialog-button-0').click();
  await expect(page.getByTestId('dialog-message')).toBeHidden();
  await sheetClose(page);
  fs.rmSync(dir, { recursive: true, force: true });
  return { from, to, coordinates, timestamps };
}

/** 軌跡の途中（割合で指定）をタップして、時刻のポップアップと軌跡サマリーを出す */
async function tapTrack(page: Page, ratio: number) {
  const [x, y] = trackXY(ratio);
  await page.mouse.click(x, y);
  await expect(page.getByTestId('home-trackpoint-coordinate')).toBeVisible();
  await expect(page.getByTestId('tracksummary-export')).toBeVisible();
}

/** 軌跡サマリーの進行位置を示す丸（オレンジ）の画面上の中心 */
const focusMarkerCenter = async (page: Page): Promise<{ x: number; y: number }> => {
  const marker = page.locator('.maplibregl-marker').filter({ has: page.locator('div[style*="border-radius: 8px"]') });
  const box = await marker.first().boundingBox();
  if (box === null) throw new Error('進行位置のマーカーが見つかりません');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

const haversineKm = (a: number[], b: number[]) => {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

/** 疑似位置（仙台市内。初期表示の範囲の外） */
const FAKE_LOCATION = { latitude: 38.2601, longitude: 140.8821, accuracy: 10 };

/** 現在地ボタン（maplibre の GeolocateControl）を押して、現在地のマーカーが出るまで待つ */
async function turnOnGps(page: Page) {
  await page.locator('.maplibregl-ctrl-geolocate').click();
  await expect(page.locator('.maplibregl-user-location-dot')).toBeVisible({ timeout: 20_000 });
}

/**
 * 位置情報付きの小さなPDF（GeoPDF）を作る。1ページ・全面を1色で塗っただけのもの。
 * 位置は ISO 32000 の地理空間拡張（ページの /VP → /Measure の /GPTS に四隅の緯度経度）で持つ
 */
function buildGeoPdf(bounds: { west: number; south: number; east: number; north: number }, rgb: [number, number, number]) {
  const size = 200;
  const content = `${rgb.join(' ')} rg 0 0 ${size} ${size} re f`;
  const { west, south, east, north } = bounds;
  // GPTS は緯度・経度の順。左下 → 左上 → 右上 → 右下
  const gpts = [south, west, north, west, north, east, south, east].join(' ');
  const wkt = 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${size} ${size}] /Resources << >> /Contents 4 0 R /VP [5 0 R] >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    `<< /Type /Viewport /BBox [0 0 ${size} ${size}] /Measure 6 0 R >>`,
    `<< /Type /Measure /Subtype /GEO /Bounds [0 0 0 1 1 1 1 0] /LPTS [0 0 0 1 1 1 1 0] /GPTS [${gpts}] /GCS 7 0 R >>`,
    `<< /Type /GEOGCS /EPSG 4326 /WKT (${wkt}) >>`,
  ];
  let pdf = '%PDF-1.7\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

/** 画面のその位置の色（スクリーンショットをページ内で読んで調べる。地図のcanvasは直接読めないため） */
async function pixelAt(page: Page, x: number, y: number): Promise<[number, number, number]> {
  const shot = await page.screenshot({ clip: { x: x - 2, y: y - 2, width: 4, height: 4 } });
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('canvas');
    context.drawImage(image, 0, 0);
    const [r, g, b] = context.getImageData(Math.floor(image.width / 2), Math.floor(image.height / 2), 1, 1).data;
    return [r, g, b] as [number, number, number];
  }, shot.toString('base64'));
}

test.describe('14. 軌跡・現在地・ファイル（Web）', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  test('ERR-2 5万頂点を超えるファイルを取り込むと、簡略化の確認が出る', async ({ page }) => {
    // 6万頂点の円（ポリゴン1つ）をその場で作る
    const vertices = 60_000;
    const ring: number[][] = [];
    for (let i = 0; i < vertices; i++) {
      const a = (2 * Math.PI * i) / vertices;
      ring.push([140.84 + 0.01 * Math.cos(a), 38.25 + 0.008 * Math.sin(a)]);
    }
    ring.push(ring[0]);
    const dir = makeTmpDir();
    const file = path.join(dir, 'huge-polygon.geojson');
    fs.writeFileSync(
      file,
      JSON.stringify({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: { name: 'big' } }],
      })
    );
    try {
      await openLayers(page);
      await chooseFile(page, page.getByTestId('layers-import'), file);
      // 頂点の数を示して、簡略化するかを聞かれる
      const message = page.getByTestId('dialog-message');
      await expect(message).toContainText('ポリゴンの頂点が60001点あり', { timeout: 30_000 });
      await expect(message).toContainText('形を簡略化して取り込みますか？');
      await expect(dialogButton(page, 'そのまま取り込む')).toBeVisible();
      await dialogButton(page, '簡略化する').click();
      await expect(message).toHaveText(IMPORTED, { timeout: 60_000 });
      await page.getByTestId('dialog-button-0').click();
      expect(await layerNames(page)).toContain('huge-polygon.geojson');
      await openLayerData(page, 'huge-polygon.geojson');
      await expect(dataRows(page)).toHaveCount(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('FILE-7 写真付きレイヤをエクスポートすると、ZIPに写真が入る', async ({ page }) => {
    await openLayerData(page, 'ポイント');
    await page.getByTestId('data-add').click();
    await chooseFile(page, page.getByTestId('dataedit-photo-library'), fixture('photo1.jpg'));
    await expect(page.getByTestId('dataedit-photo-thumb-0')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('dataedit-save').click();
    await expect(dataRows(page)).toHaveCount(1);

    await page.getByTestId('data-check-all').click();
    const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
    await page.getByTestId('data-export').click();
    await expect(page.getByTestId('dialog-message')).toHaveText('1件のデータをエクスポートします。');
    await dialogButton(page, 'OK').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
    const file = await download.path();
    const names = zipEntries(file);
    expect(names.some((n) => /\.geojson$/.test(n))).toBe(true);
    // 写真は1枚、JPEGのまま入っている
    const photos = names.filter((n) => /\.jpe?g$/i.test(n));
    expect(photos).toHaveLength(1);
    const photo = zipRead(file, path.extname(photos[0]).toLowerCase());
    expect(photo.subarray(0, 2).toString('hex')).toBe('ffd8');
    expect(photo.length).toBeGreaterThan(1000);
    // GeoJSONの写真の欄が、その写真のファイル名を指している
    expect(zipRead(file, '.geojson').toString('utf8')).toContain(path.basename(photos[0]));
  });

  test('TRACK-4 軌跡をタップすると通過時刻のポップアップが出る', async ({ page }) => {
    const { coordinates } = await importTrack(page);
    // 中間の点（30番目・開始から5分後）の上をタップする
    const [x, y] = trackXY(0.5);
    await page.mouse.click(x, y);
    const coordinate = page.getByTestId('home-trackpoint-coordinate');
    await expect(coordinate).toBeVisible();
    // 通過時刻（点の間は補間されるので、5分の前後10秒まで）
    await expect(text(page, /^2026\/01\/15 09:0(4:5|5:0)\d$/)).toBeVisible();
    // 位置は軌跡の上（タップした中間の点の近く）
    const [lat, lon] = (await coordinate.innerText()).split(',').map((s) => Number(s.trim()));
    const mid = coordinates[30];
    expect(Math.abs(lon - mid[0])).toBeLessThan(Math.abs(coordinates[32][0] - mid[0]) + 1e-5);
    expect(Math.abs(lat - mid[1])).toBeLessThan(Math.abs(coordinates[32][1] - mid[1]) + 1e-5);
    // ×で閉じられる
    await page.getByTestId('home-trackpoint-close').click();
    await expect(coordinate).toBeHidden();
  });

  test('TRACK-5 軌跡サマリー（距離・時間・速度・累積標高・標高グラフ）が出る', async ({ page }) => {
    const { coordinates } = await importTrack(page);
    await tapTrack(page, 0.5);
    const stat = (key: string) => page.getByTestId(`tracksummary-stat-${key}`);
    const numberOf = async (key: string) => Number((await stat(key).innerText()).match(/-?\d+(\.\d+)?(?= (km|m))/)?.[0]);

    // 距離: 取り込んだ座標から計算した値と合う
    let km = 0;
    for (let i = 1; i < coordinates.length; i++) km += haversineKm(coordinates[i - 1], coordinates[i]);
    await expect(stat('distance')).toContainText(/\d+\.\d{2} km/);
    expect(Math.abs((await numberOf('distance')) - km)).toBeLessThan(0.02);
    // 時間: 10秒おき61点 = 10分
    await expect(stat('duration')).toContainText('0:10:00');
    // 速度: 距離 ÷ 10分
    await expect(stat('averageSpeed')).toContainText(/\d+\.\d km\/h/);
    expect(Math.abs((await numberOf('averageSpeed')) - km * 6)).toBeLessThan(0.3);
    await expect(stat('maxSpeed')).toContainText(/(\d+\.\d km\/h|--)/);
    // 標高: 100m → 180m → 100m。累積は平滑化としきい値がかかるので幅を持たせる
    await expect(stat('ascent')).toContainText(/\d+ m/);
    await expect(stat('descent')).toContainText(/\d+ m/);
    expect(await numberOf('ascent')).toBeGreaterThan(50);
    expect(await numberOf('ascent')).toBeLessThanOrEqual(85);
    expect(await numberOf('descent')).toBeGreaterThan(50);
    expect(await numberOf('descent')).toBeLessThanOrEqual(85);
    expect(Math.abs((await numberOf('maxAltitude')) - 180)).toBeLessThanOrEqual(5);
    expect(Math.abs((await numberOf('minAltitude')) - 100)).toBeLessThanOrEqual(5);
    // 記録した時間帯
    await expect(text(page, '2026/01/15 09:00 - 09:10')).toBeVisible();
    // 標高グラフ: 折れ線が描かれている
    const chart = page.getByTestId('tracksummary-chart');
    await expect(chart).toBeVisible();
    await expect(chart.locator('svg path').first()).toBeVisible();
    expect(await chart.locator('svg path').count()).toBeGreaterThanOrEqual(2);
    await expect(chart.getByText(/^\d+m$/).first()).toBeVisible();
  });

  test('TRACK-6 軌跡リプレイで、マーカーが軌跡に沿って動く', async ({ page }) => {
    await importTrack(page);
    // 始点の近くから始める（リプレイは常に頭から流れる）
    await tapTrack(page, 0.1);
    const replay = page.getByTestId('tracksummary-replay');
    await expect(replay).toHaveAttribute('aria-label', '軌跡を再生');
    await replay.click();
    await expect(replay).toHaveAttribute('aria-label', '再生を一時停止');
    // 再生中は時刻のポップアップを隠す
    await expect(page.getByTestId('home-trackpoint-coordinate')).toBeHidden();

    // 進行位置の丸が、軌跡（左下→右上の直線）に沿って進む
    const onTrack = (p: { x: number; y: number }) => {
      const r = (p.x - TRACK_FROM[0]) / (TRACK_TO[0] - TRACK_FROM[0]);
      const [, y] = trackXY(r);
      expect(r).toBeGreaterThan(-0.02);
      expect(r).toBeLessThan(1.02);
      expect(Math.abs(p.y - y)).toBeLessThan(6);
    };
    const first = await focusMarkerCenter(page);
    onTrack(first);
    await expect.poll(async () => (await focusMarkerCenter(page)).x, { timeout: 15_000 }).toBeGreaterThan(first.x + 30);
    const second = await focusMarkerCenter(page);
    onTrack(second);
    await expect.poll(async () => (await focusMarkerCenter(page)).x, { timeout: 15_000 }).toBeGreaterThan(second.x + 30);
    onTrack(await focusMarkerCenter(page));

    // 一時停止すると止まり、止めた地点の時刻が出る
    await replay.click();
    await expect(replay).toHaveAttribute('aria-label', '軌跡を再生');
    const paused = await focusMarkerCenter(page);
    await page.waitForTimeout(1000);
    expect((await focusMarkerCenter(page)).x).toBeCloseTo(paused.x, 0);
    await expect(page.getByTestId('home-trackpoint-coordinate')).toBeVisible();
    await expect(text(page, /^2026\/01\/15 09:0\d:\d\d$/)).toBeVisible();
  });

  test('TRACK-8 軌跡をエクスポートできる（GPX・GeoJSON・KML・サマリー画像）', async ({ page }) => {
    await importTrack(page);
    await tapTrack(page, 0.5);
    const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
    await page.getByTestId('tracksummary-export').click();
    // 始める前に、点の数を示した確認が出る
    await expect(page.getByTestId('dialog-message')).toContainText(`軌跡（${TRACK_POINTS}点）をエクスポートします。`);
    await dialogButton(page, 'OK').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^track_E2E軌跡_.*\.zip$/);
    await expect(page.getByTestId('dialog-message')).toHaveText('データを保存しました。', { timeout: 30_000 });
    await page.getByTestId('dialog-button-0').click();

    const file = await download.path();
    const names = zipEntries(file);
    const read = (ext: string) => zipRead(file, ext).toString('utf8');
    // GPX: 全点が時刻・標高付きで入っている
    const gpx = read('.gpx');
    expect(gpx.match(/<trkpt /g)).toHaveLength(TRACK_POINTS);
    expect(gpx).toContain('<time>2026-01-15T00:00:00.000Z</time>');
    expect(gpx).toContain('<time>2026-01-15T00:10:00.000Z</time>');
    expect(gpx.match(/<ele>/g)).toHaveLength(TRACK_POINTS);
    // GeoJSON: 1本の線で、点ごとの時刻を持つ
    const geojson = JSON.parse(read('.geojson'));
    expect(geojson.features).toHaveLength(1);
    expect(geojson.features[0].geometry.coordinates).toHaveLength(TRACK_POINTS);
    expect(geojson.features[0].properties._timestamps).toHaveLength(TRACK_POINTS);
    // Google Earth用: Webは写真を同梱しないので、KMZではなくKML
    const kml = read('.kml');
    expect(kml).toContain('<LineString>');
    expect(names.some((n) => n.endsWith('.kmz'))).toBe(false);
    // サマリー画像（SVG）: 軌跡名と距離が描かれている
    const svg = read('.svg');
    expect(svg).toMatch(/^<svg|<\?xml/);
    expect(svg).toContain('E2E軌跡');
    expect(svg).toMatch(/\d+\.\d{2} ?km/);
  });

  test('GPS-1 現在地ボタンで現在地マーカーが出て、地図が現在地へ移動する', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation(FAKE_LOCATION);
    // 押す前は、現在地から離れた場所を表示している
    const canvas = await page.locator('.maplibregl-canvas').boundingBox();
    if (canvas === null) throw new Error('地図がありません');
    const center = { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2 };
    const before = await lonLatAt(page, center.x, center.y);
    expect(Math.abs(before[0] - FAKE_LOCATION.longitude) + Math.abs(before[1] - FAKE_LOCATION.latitude)).toBeGreaterThan(0.05);
    await expect(page.locator('.maplibregl-user-location-dot')).toHaveCount(0);

    await turnOnGps(page);
    // 地図が動くと、長押しのポップアップは閉じる
    await expect(page.getByTestId('home-poi-coordinate')).toBeHidden();
    // 地図が現在地へ移動し、現在地のマーカーが地図の中心に来る
    // （移動のアニメーション中に地図を押すと移動が止まるので、マーカーが中心に落ち着くまで触らない）
    const dotOffset = async () => {
      const dot = await page.locator('.maplibregl-user-location-dot').boundingBox();
      if (dot === null) return Infinity;
      return Math.hypot(dot.x + dot.width / 2 - center.x, dot.y + dot.height / 2 - center.y);
    };
    await expect.poll(dotOffset, { timeout: 30_000 }).toBeLessThan(5);
    await page.waitForTimeout(1500);
    expect(await dotOffset()).toBeLessThan(5);
    // 中心の経緯度が疑似位置になっている
    const [lon, lat] = await lonLatAt(page, center.x, center.y);
    expect(Math.abs(lon - FAKE_LOCATION.longitude)).toBeLessThan(0.0005);
    expect(Math.abs(lat - FAKE_LOCATION.latitude)).toBeLessThan(0.0005);
  });

  test('DRAW-3 現在地にポイントを追加できる（現在地を取得していないと警告になる）', async ({ page, context }) => {
    await selectFeature(page, 'point');
    // 現在地を取得していないうちは追加できない
    await page.getByTestId('home-draw-add-location-point').click();
    await expect(page.getByTestId('dialog-message')).toHaveText('GPSをオンにしてください');
    await page.getByTestId('dialog-button-0').click();
    await expect(page.getByTestId('dialog-message')).toBeHidden();

    await context.grantPermissions(['geolocation']);
    await context.setGeolocation(FAKE_LOCATION);
    await turnOnGps(page);
    await page.getByTestId('home-draw-add-location-point').click();
    await expect(page.getByTestId('dialog-message')).toHaveText('現在地にポイントを追加しますか？');
    await dialogButton(page, 'Yes').click();
    // できた記録の編集画面が開き、現在地の経緯度が入っている
    await expect(page.getByTestId('dataedit-coords-latitude-decimal')).toHaveValue(/^38\.2601/);
    await expect(page.getByTestId('dataedit-coords-longitude-decimal')).toHaveValue(/^140\.8821/);
    await sheetBack(page);
    await expect(dataRows(page)).toHaveCount(1);
  });
  test('MAPS-10 PDF地図を取り込んで表示できる', async ({ page }) => {
    // いま表示している範囲の左寄りに重なる、1色（マゼンタ）で塗ったPDF地図を作る
    const [west, north] = await lonLatAt(page, 200, 250);
    const [east, south] = await lonLatAt(page, 500, 550);
    const pdf = buildGeoPdf({ west, south, east, north }, [1, 0, 1]);
    const isMagenta = ([r, g, b]: [number, number, number]) => r > 200 && g < 80 && b > 200;
    expect(isMagenta(await pixelAt(page, 350, 400))).toBe(false);

    await page.getByTestId('home-maps').click();
    await expect(page.getByTestId('maps-add')).toBeVisible();
    const rows = page.locator('[data-testid^="maps-row-"]');
    const before = await rows.count();
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('maps-import').click()]);
    await chooser.setFiles({ name: 'e2e-map.pdf', mimeType: 'application/pdf', buffer: pdf });
    await okIfShown(page, 60_000);
    await expect(rows).toHaveCount(before + 1, { timeout: 30_000 });
    await expect(text(page, 'e2e-map', false)).toBeVisible();
    // 地図に重なって表示される（出典にPDF、PDFの範囲の内側がPDFの色、外側は元の地図のまま）
    await expect(attribution(page)).toContainText('PDF');
    await expect.poll(async () => isMagenta(await pixelAt(page, 350, 400)), { timeout: 30_000 }).toBe(true);
    // 位置も合っている（PDFの四隅を、画面の (200,250)〜(500,550) の経緯度にしてある）
    expect(isMagenta(await pixelAt(page, 215, 265))).toBe(true);
    expect(isMagenta(await pixelAt(page, 485, 300))).toBe(true);
    expect(isMagenta(await pixelAt(page, 185, 400))).toBe(false);
    expect(isMagenta(await pixelAt(page, 350, 235))).toBe(false);
    expect(isMagenta(await pixelAt(page, 350, 565))).toBe(false);
  });
});
