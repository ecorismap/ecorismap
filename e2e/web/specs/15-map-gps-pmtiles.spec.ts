import fs from 'fs';
import { expect, Page, test } from '@playwright/test';
import {
  attribution,
  dataRows,
  fixture,
  longPressMap,
  openApp,
  openLayerData,
  plainText,
  selectFeature,
  sheetBack,
} from '../support/app';

/** 地図上の画面座標の経緯度（長押しのポップアップから読む） */
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

/** 地図の中心の画面座標 */
const mapCenter = async (page: Page) => {
  const canvas = await page.locator('.maplibregl-canvas').boundingBox();
  if (canvas === null) throw new Error('地図がありません');
  return { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2 };
};

type Rect = { x: number; y: number; width: number; height: number };

/**
 * 画面のその範囲で、色の条件に合う画素の割合（スクリーンショットをページ内で読んで調べる。地図のcanvasは直接読めないため）。
 * magenta は不透明なマゼンタ、green は緑が赤・青より十分強い画素
 */
async function colorFraction(page: Page, clip: Rect, color: 'magenta' | 'green'): Promise<number> {
  const shot = await page.screenshot({ clip });
  return page.evaluate(
    async ([base64, kind]) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      if (context === null) throw new Error('canvas');
      context.drawImage(image, 0, 0);
      const { data } = context.getImageData(0, 0, image.width, image.height);
      let hit = 0;
      for (let i = 0; i < data.length; i += 4) {
        const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
        if (kind === 'magenta' ? r > 200 && g < 80 && b > 200 : g > r + 60 && g > b + 60) hit += 1;
      }
      return hit / (data.length / 4);
    },
    [shot.toString('base64'), color] as const
  );
}

// 地図の左側（ボトムシートに隠れない範囲）
const MAP_AREA: Rect = { x: 150, y: 200, width: 400, height: 400 };

// ---------- 地図一覧 ----------

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

/** 地図一覧から、URLを入力して地図を追加する（地図一覧に戻る） */
async function addMapByUrl(page: Page, map: { name: string; url: string; attribution: string; vector?: boolean }) {
  await page.getByTestId('maps-add').click();
  await page.getByTestId('mapedit-name').fill(map.name);
  await page.getByTestId('mapedit-url').fill(map.url);
  await page.getByTestId('mapedit-attribution').fill(map.attribution);
  if (map.vector) await page.getByTestId('mapedit-vector').click();
  await page.getByTestId('mapedit-save').click();
  await sheetBack(page);
  await expect(page.getByTestId('maps-add')).toBeVisible();
  await expect.poll(() => mapNames(page)).toContain(map.name);
}

// ---------- PMTiles の配信 ----------

// 実在しないホスト。通信は page.route で受けて、外へは出さない
const RASTER_URL = 'https://pmtiles.e2e.test/raster.pmtiles';
const VECTOR_URL = 'https://pmtiles.e2e.test/vegetation.pmtiles';

/**
 * PMTiles を、そのURLで配信する（Range リクエストに 206 で応える）。
 * 返す配列に、応えた範囲（先頭・末尾のバイト位置）がたまる
 */
async function servePmtiles(page: Page, url: string, body: Buffer): Promise<[number, number][]> {
  const ranges: [number, number][] = [];
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-expose-headers': 'content-range, content-length, etag',
  };
  await page.context().route(url, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const range = /bytes=(\d+)-(\d*)/.exec(request.headers().range ?? '');
    if (range === null) {
      return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/octet-stream' }, body });
    }
    const start = Number(range[1]);
    const end = Math.min(range[2] === '' ? body.length - 1 : Number(range[2]), body.length - 1);
    ranges.push([start, end]);
    return route.fulfill({
      status: 206,
      headers: {
        ...cors,
        'content-type': 'application/octet-stream',
        'content-range': `bytes ${start}-${end}/${body.length}`,
        etag: '"e2e"',
      },
      body: body.subarray(start, end + 1),
    });
  });
  return ranges;
}

/** 256pxを1色（マゼンタ）で塗ったPNG（ページ内のcanvasで作る） */
const magentaTile = async (page: Page): Promise<Buffer> =>
  Buffer.from(
    await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const context = canvas.getContext('2d');
      if (context === null) throw new Error('canvas');
      context.fillStyle = '#ff00ff';
      context.fillRect(0, 0, 256, 256);
      return canvas.toDataURL('image/png').split(',')[1];
    }),
    'base64'
  );

const RASTER_MAX_ZOOM = 14;

/**
 * ラスタのPMTiles（v3・無圧縮）を作る。ズーム0〜14の全タイルが、同じ1枚の画像を指す
 * （タイル番号0から連続する全タイルを、1つのエントリの run length でまとめる）
 */
function buildRasterPmtiles(png: Buffer): Buffer {
  const varint = (value: number): number[] => {
    const bytes: number[] = [];
    let rest = value;
    while (rest >= 0x80) {
      bytes.push((rest % 0x80) | 0x80);
      rest = Math.floor(rest / 0x80);
    }
    bytes.push(rest);
    return bytes;
  };
  const tileCount = (4 ** (RASTER_MAX_ZOOM + 1) - 1) / 3;
  // エントリ数、タイル番号（差分）、run length、長さ、位置+1
  const directory = Buffer.from([...varint(1), ...varint(0), ...varint(tileCount), ...varint(png.length), ...varint(1)]);
  const metadata = Buffer.from('{}');
  const header = Buffer.alloc(127);
  header.write('PMTiles', 0, 'latin1');
  header[7] = 3;
  const u64 = (position: number, value: number) => header.writeBigUInt64LE(BigInt(value), position);
  const tileDataOffset = header.length + directory.length + metadata.length;
  u64(8, header.length); // ルートディレクトリ
  u64(16, directory.length);
  u64(24, header.length + directory.length); // メタデータ
  u64(32, metadata.length);
  u64(40, tileDataOffset); // リーフディレクトリ（なし）
  u64(48, 0);
  u64(56, tileDataOffset); // タイル
  u64(64, png.length);
  u64(72, tileCount);
  u64(80, 1);
  u64(88, 1);
  header[96] = 1; // clustered
  header[97] = 1; // ディレクトリ・メタデータは無圧縮
  header[98] = 1; // タイルは無圧縮
  header[99] = 2; // PNG
  header[100] = 0;
  header[101] = RASTER_MAX_ZOOM;
  header.writeInt32LE(-180 * 1e7, 102);
  header.writeInt32LE(-85 * 1e7, 106);
  header.writeInt32LE(180 * 1e7, 110);
  header.writeInt32LE(85 * 1e7, 114);
  header[118] = 0;
  header.writeInt32LE(0, 119);
  header.writeInt32LE(0, 123);
  // Buffer.concat は型が合わない（Buffer と Uint8Array の型のずれ）ので、数値の配列にして作る
  return Buffer.from([...header, ...directory, ...metadata, ...png]);
}

// ---------- GPS ----------

/** 疑似位置（仙台市内。初期表示の範囲の外） */
const FAKE_LOCATION = { latitude: 38.2601, longitude: 140.8821, accuracy: 10 };

const geolocateButton = (page: Page) => page.locator('.maplibregl-ctrl-geolocate');
const locationDot = (page: Page) => page.locator('.maplibregl-user-location-dot');

/** 現在地のマーカーが、地図の中心からどれだけ離れているか（px） */
const dotOffset = async (page: Page) => {
  const center = await mapCenter(page);
  const dot = await locationDot(page).boundingBox();
  if (dot === null) return Infinity;
  return Math.hypot(dot.x + dot.width / 2 - center.x, dot.y + dot.height / 2 - center.y);
};

// ---------- HEIC ----------

// 16×16 の HEIC（macOS の sips で photo1.jpg を縮小・変換したもの）
const HEIC_BASE64 =
  'AAAAJGZ0eXBoZWljAAAAAG1pZjFNaVBybWlhZk1pSEJoZWljAAABw21ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAHBpY3QAAAAAAAAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAAADnBpdG0AAAAAAAEAAAA4aWluZgAAAAAAAgAAABVpbmZlAgAAAAABAABodmMxAAAAABVpbmZlAgAAAQACAABFeGlmAAAAABppcmVmAAAAAAAAAA5jZHNjAAIAAQABAAAA5mlwcnAAAADFaXBjbwAAABNjb2xybmNseAACAAIABoAAAAAMY2xsaQDLAEAAAAAUaXNwZQAAAAAAAAAQAAAAEAAAAAlpcm90AAAAABBwaXhpAAAAAAMICAgAAABxaHZjQwEDcAAAALAAAAAAAB7wAPz9+PgAAAsDoAABABdAAQwB//8DcAAAAwCwAAADAAADAB5wJKEAAQAjQgEBA3AAAAMAsAAAAwAAAwAeoBQgQcCTDOIe5FlU3AgIGAKiAAEACUQBwGFyyEBTJAAAABlpcG1hAAAAAAAAAAEAAQaBAgMFhoQAAAAsaWxvYwAAAABEAAACAAEAAAABAAACRQAAAMIAAgAAAAEAAAH3AAAATgAAAAFtZGF0AAAAAAAAASAAAAAGRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAEKADAAQAAAABAAAAEAAAAAAAAAC+KAGvoRJQGl4Cc0/hOgbZG4kbRLUkhDHHB1fZDRJ+sjOGMakstm+4Sw6f/7Ergsc5XPX3008sh/e32edIZGxdetewgv78dI/SqXtOhhJLqBa4JfaXx4y5ppQYKVdvB/+aZnOQssowG13PUWiCpO2VrsMEK8vGfuuVPMhjp9xgG8HO0QL05diJiIOf/+4cmR9AyZvfrF89dEn6MAC5n/8sAIA+Yqe1dNdC2PInr+vd9dLReVtFgvUteUAPeZsi/A==';

test.describe('地図の長押し・GPS・PMTiles・HEIC', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  test('MAP-5 長押しメニューの「Google Mapsへ」で、長押しした地点のGoogle Mapsを開こうとする', async ({ page }) => {
    // 外部の地図は開かず、開こうとしたURLだけを記録する
    await page.evaluate(() => {
      const opened: { url: string; target: string }[] = [];
      (window as unknown as { __e2eOpened: typeof opened }).__e2eOpened = opened;
      window.open = (url?: string | URL, target?: string) => {
        opened.push({ url: String(url), target: String(target) });
        return null;
      };
    });
    const opened = () =>
      page.evaluate(() => (window as unknown as { __e2eOpened: { url: string; target: string }[] }).__e2eOpened);

    await longPressMap(page, 300, 350);
    const coordinate = page.getByTestId('home-poi-coordinate');
    await expect(coordinate).toHaveText(/^\d+\.\d+, \d+\.\d+$/);
    const [lat, lon] = (await coordinate.innerText()).split(',').map((s) => Number(s.trim()));
    expect(await opened()).toEqual([]);

    await page.getByTestId('home-poi-google-maps').click();
    await expect.poll(async () => (await opened()).length).toBe(1);
    const [{ url, target }] = await opened();
    expect(target).toBe('_blank');
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://www.google.com/maps/search/');
    expect(parsed.searchParams.get('api')).toBe('1');
    // 検索する地点は、長押しした地点（ポップアップに出ていた経緯度。表示は小数6桁前後なので、その精度で比べる）
    const [queryLat, queryLon] = (parsed.searchParams.get('query') ?? '').split(',').map(Number);
    expect(Math.abs(queryLat - lat)).toBeLessThan(0.00001);
    expect(Math.abs(queryLon - lon)).toBeLessThan(0.00001);
    // 開いたらポップアップは閉じる
    await expect(coordinate).toBeHidden();
  });

  test('GPS-2 追従中は位置が変わると地図が付いてくる。地図をドラッグすると追従が外れる', async ({ page, context }) => {
    // 【アプリの不具合で、いまは通らない】Webでは、追従の移動が終わった直後に追従がひとりでに外れる。
    // 地図（react-map-gl）へ表示範囲（mapRegion）を制御プロパティとして渡しているため、移動が終わった後の再描画で
    // react-map-gl が jumpTo を呼び（Maplibre._updateViewState）、その movestart を現在地ボタン（GeolocateControl）が
    // 「利用者が地図を動かした」と受け取って追従をやめる（Home.web.tsx の <Map {...mapRegion}>）。
    // この jumpTo の movestart を追従由来として扱わせると、このテストは最後まで通る（2026-11-27 に確認）。
    // 直ったら、この test.fail を外す（外さないと「失敗するはずが通った」で落ちる）
    test.fail();
    const accuracyCircleWidth = async () =>
      (await page.locator('.maplibregl-user-location-accuracy-circle').boundingBox())?.width ?? 0;
    const isTracking = () => geolocateButton(page).evaluate((el) => el.classList.contains('maplibregl-ctrl-geolocate-active'));
    const near = (a: [number, number], b: { longitude: number; latitude: number }) =>
      Math.abs(a[0] - b.longitude) < 0.0002 && Math.abs(a[1] - b.latitude) < 0.0002;

    await context.grantPermissions(['geolocation']);
    await context.setGeolocation(FAKE_LOCATION);
    await geolocateButton(page).click();
    await expect(locationDot(page)).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => dotOffset(page), { timeout: 30_000 }).toBeLessThan(5);
    await page.waitForTimeout(1500);
    expect(await isTracking()).toBe(true);
    const firstCircle = await accuracyCircleWidth();
    expect(firstCircle).toBeGreaterThan(0);

    // 位置が変わる（北東へ約400m。届いたことを画面で見分けられるよう、精度も変える＝精度の円が大きくなる）
    const second = { latitude: FAKE_LOCATION.latitude + 0.003, longitude: FAKE_LOCATION.longitude + 0.003, accuracy: 40 };
    await context.setGeolocation(second);
    await expect.poll(accuracyCircleWidth, { timeout: 20_000 }).toBeGreaterThan(firstCircle * 2);
    // 地図が付いてきて、現在地のマーカーは地図の中心のまま
    await expect.poll(() => dotOffset(page), { timeout: 20_000 }).toBeLessThan(5);
    await page.waitForTimeout(1500);
    expect(await dotOffset(page)).toBeLessThan(5);
    expect(await isTracking()).toBe(true);

    // 地図をドラッグすると追従が外れる（現在地の表示は続く）
    const center = await mapCenter(page);
    await page.mouse.move(center.x - 100, center.y - 50);
    await page.mouse.down();
    await page.mouse.move(center.x + 50, center.y + 50, { steps: 10 });
    await page.waitForTimeout(300); // 慣性で流れないよう、止めてから離す
    await page.mouse.up();
    await expect.poll(isTracking).toBe(false);
    await expect(geolocateButton(page)).toHaveClass(/maplibregl-ctrl-geolocate-background/);
    await page.waitForTimeout(1000);
    // マーカーは地図と一緒に動いて中心から離れた。マーカーの下の地点は2つめの位置（＝ドラッグの前は、2つめの位置が地図の中心にあった）
    const dotCenter = async () => {
      const dot = await locationDot(page).boundingBox();
      if (dot === null) throw new Error('現在地のマーカーがありません');
      return { x: dot.x + dot.width / 2, y: dot.y + dot.height / 2 };
    };
    const dragged = await dotCenter();
    expect(dragged.x - center.x).toBeGreaterThan(100);
    expect(dragged.y - center.y).toBeGreaterThan(60);
    expect(near(await lonLatAt(page, dragged.x, dragged.y), second)).toBe(true);
    const centerAfterDrag = await lonLatAt(page, center.x, center.y);
    expect(near(centerAfterDrag, second)).toBe(false);
    expect(await isTracking()).toBe(false);

    // 追従が外れたあとは、位置が変わっても地図は動かない（マーカーだけが動く）
    const third = { latitude: FAKE_LOCATION.latitude + 0.006, longitude: FAKE_LOCATION.longitude + 0.006, accuracy: 10 };
    await context.setGeolocation(third);
    await expect
      .poll(async () => Math.hypot((await dotCenter()).x - dragged.x, (await dotCenter()).y - dragged.y), { timeout: 20_000 })
      .toBeGreaterThan(50);
    await page.waitForTimeout(1500);
    expect(await isTracking()).toBe(false);
    expect(await lonLatAt(page, center.x, center.y)).toEqual(centerAfterDrag);
  });

  test('GPS-3 位置情報が許可されていないと、現在地ボタンが使えなくなり、GPSはオフのまま', async ({ page }) => {
    // 位置情報の権限を与えていない（Playwright のブラウザは、許可を求められると拒否として返す）
    const button = geolocateButton(page);
    await expect(button).toBeEnabled();
    await expect(button).toHaveAttribute('title', 'Find my location');
    await button.click();
    // Webの案内は、ボタンが無効になり、ボタンの説明が「Location not available」に変わること（ダイアログは出ない）
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute('title', 'Location not available');
    await expect(button).not.toHaveClass(/maplibregl-ctrl-geolocate-(active|background|waiting)/);
    await expect(locationDot(page)).toHaveCount(0);
    await expect(page.getByTestId('dialog-message')).toBeHidden();
    // アプリのGPSもオフのまま（現在地へのポイント追加は「GPSをオンにしてください」になる）
    await selectFeature(page, 'point');
    await page.getByTestId('home-draw-add-location-point').click();
    await expect(page.getByTestId('dialog-message')).toHaveText('GPSをオンにしてください');
  });

  test('PHOTO-A6 JPEG・PNG以外の写真（WebP）はJPEGで保存される。HEICはWebでは読めず、追加されない', async ({ page }) => {
    const thumbs = page.locator('[data-testid^="dataedit-photo-thumb-"]');
    const pick = async (file: { name: string; mimeType: string; buffer: Buffer }) => {
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.getByTestId('dataedit-photo-library').click(),
      ]);
      await chooser.setFiles(file);
    };
    // WebP の写真（ページ内のcanvasで作る）
    const webp = Buffer.from(
      await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 48;
        const context = canvas.getContext('2d');
        if (context === null) throw new Error('canvas');
        context.fillStyle = '#3366cc';
        context.fillRect(0, 0, 64, 48);
        return canvas.toDataURL('image/webp').split(',')[1];
      }),
      'base64'
    );
    expect(webp.subarray(8, 12).toString('latin1')).toBe('WEBP');

    await openLayerData(page, 'ポイント');
    await page.getByTestId('data-add').click();

    // HEIC は Chromium が読めないので、JPEGにできない。壊れた写真は付かない（案内も出ない）
    await pick({ name: 'IMG_0001.HEIC', mimeType: 'image/heic', buffer: Buffer.from(HEIC_BASE64, 'base64') });
    await page.waitForTimeout(3000);
    await expect(thumbs).toHaveCount(0);
    await expect(page.getByTestId('dialog-message')).toBeHidden();

    // WebP は JPEG になって付く
    await pick({ name: 'photo.webp', mimeType: 'image/webp', buffer: webp });
    await expect(thumbs).toHaveCount(1, { timeout: 30_000 });
    await page.getByTestId('dataedit-save').click();
    await expect(dataRows(page)).toHaveCount(1);

    // 保存した写真の中身がJPEG（拡大表示の画像を読んで確かめる）
    await page.getByTestId('data-row-0').click();
    await expect(thumbs).toHaveCount(1);
    await page.getByTestId('dataedit-photo-thumb-0').click();
    await expect(page.getByTestId('photo-view-close')).toBeVisible();
    const photos = await page.evaluate(async () => {
      const srcs = Array.from(document.images)
        .map((image) => image.src)
        .filter((src) => src.startsWith('blob:'));
      return Promise.all(
        Array.from(new Set(srcs)).map(async (src) => {
          const blob = await (await fetch(src)).blob();
          const head = Array.from(new Uint8Array(await blob.slice(0, 3).arrayBuffer()));
          return { type: blob.type, head };
        })
      );
    });
    expect(photos.length).toBeGreaterThan(0);
    for (const photo of photos) {
      expect(photo.type).toBe('image/jpeg');
      expect(photo.head).toEqual([0xff, 0xd8, 0xff]);
    }
  });

  test('MAPS-7 PMTiles（ラスタ／ベクタ）をURLで登録して表示できる', async ({ page }) => {
    const raster = buildRasterPmtiles(await magentaTile(page));
    const vector = fs.readFileSync(fixture('vegetation.pmtiles'));
    const rasterRanges = await servePmtiles(page, RASTER_URL, raster);
    const vectorRanges = await servePmtiles(page, VECTOR_URL, vector);
    const readsTileData = (ranges: [number, number][], tileDataOffset: number) =>
      ranges.some(([start, end]) => start > 0 && end >= tileDataOffset);
    await openMaps(page);

    // ラスタ: 全面マゼンタのタイルが、地図に出る
    expect(await colorFraction(page, MAP_AREA, 'magenta')).toBe(0);
    await addMapByUrl(page, { name: 'E2Eラスタ', url: RASTER_URL, attribution: 'E2Eラスタ出典' });
    await expect(attribution(page)).toContainText('E2Eラスタ出典');
    await expect.poll(() => colorFraction(page, MAP_AREA, 'magenta'), { timeout: 30_000 }).toBeGreaterThan(0.99);
    // タイルは、URLの先から範囲を指定して読んでいる
    expect(readsTileData(rasterRanges, raster.length - 1)).toBe(true);
    // 非表示にすると消える
    let i = await mapIndex(page, 'E2Eラスタ');
    await page.getByTestId(`maps-visible-${i}`).click();
    await expect.poll(() => colorFraction(page, MAP_AREA, 'magenta')).toBe(0);
    await expect(attribution(page)).not.toContainText('E2Eラスタ出典');

    // ベクタ: 地図名を押すとその範囲へ移動し（シートは閉じる）、ポリゴンが既定のスタイル（半透明の緑）で出る
    await addMapByUrl(page, { name: 'E2Eベクタ', url: VECTOR_URL, attribution: 'E2Eベクタ出典', vector: true });
    await expect(attribution(page)).toContainText('E2Eベクタ出典');
    i = await mapIndex(page, 'E2Eベクタ');
    await page.getByTestId(`maps-row-${i}`).click();
    await expect(page.getByTestId('maps-add')).not.toBeInViewport();
    await openMaps(page);
    // 移動先は PMTiles の範囲の中心（地図の中心）。その周りに緑のポリゴンがある
    const center = await mapCenter(page);
    const around: Rect = { x: center.x - 100, y: center.y - 100, width: 200, height: 200 };
    await expect.poll(() => colorFraction(page, around, 'green'), { timeout: 30_000 }).toBeGreaterThan(0.005);
    expect(readsTileData(vectorRanges, 731)).toBe(true);
    // 表示している場所は、PMTiles の範囲のあたり（ポリゴンの上を長押しすると別の表示になるので、少し外した地点で読む）
    await expect(page.getByTestId('home-zoom-level')).toHaveText('12');
    const [lon, lat] = await lonLatAt(page, center.x - 120, center.y - 120);
    expect(lon).toBeGreaterThan(140.837521 - 0.05);
    expect(lon).toBeLessThan(140.8501039);
    expect(lat).toBeGreaterThan(38.248372);
    expect(lat).toBeLessThan(38.256998 + 0.05);
    // 非表示にすると消える
    i = await mapIndex(page, 'E2Eベクタ');
    await page.getByTestId(`maps-visible-${i}`).click();
    await expect.poll(() => colorFraction(page, around, 'green')).toBeLessThan(0.0005);
  });

  test('PDF-3 PMTilesの地図（ラスタ／ベクタ）も、印刷用のウィンドウに画像として入る', async ({ page, context }) => {
    // 印刷ダイアログは出さず、印刷が呼ばれた時点の、印刷用ウィンドウの画像を調べて記録する
    type PrintedImage = { isDataUrl: boolean; width: number; height: number; magenta: number; green: number };
    const printed: PrintedImage[][] = [];
    await context.exposeBinding('__e2ePrinted', (_source, images: PrintedImage[]) => {
      printed.push(images);
    });
    await context.addInitScript(() => {
      window.print = () => {
        const images = Array.from(document.images).map((image) => {
          const result = {
            isDataUrl: image.src.startsWith('data:'),
            width: image.naturalWidth,
            height: image.naturalHeight,
            magenta: 0,
            green: 0,
          };
          if (!result.isDataUrl || image.naturalWidth === 0) return result;
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const canvasContext = canvas.getContext('2d');
          if (canvasContext === null) return result;
          canvasContext.drawImage(image, 0, 0);
          const { data } = canvasContext.getImageData(0, 0, canvas.width, canvas.height);
          for (let i = 0; i < data.length; i += 4) {
            const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
            // 不透明なマゼンタ（ラスタのタイル）と、緑（ベクタの既定のスタイル。背景は透明）
            if (a > 200 && r > 200 && g < 80 && b > 200) result.magenta += 1;
            if (a > 50 && g > r + 60 && g > b + 60) result.green += 1;
          }
          result.magenta /= data.length / 4;
          result.green /= data.length / 4;
          return result;
        });
        void (window as unknown as { __e2ePrinted: (images: PrintedImage[]) => Promise<void> })
          .__e2ePrinted(images)
          .then(() => window.dispatchEvent(new Event('afterprint')));
      };
    });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await servePmtiles(page, RASTER_URL, buildRasterPmtiles(await magentaTile(page)));
    await servePmtiles(page, VECTOR_URL, fs.readFileSync(fixture('vegetation.pmtiles')));
    await openMaps(page);
    await addMapByUrl(page, { name: 'E2Eラスタ', url: RASTER_URL, attribution: 'E2Eラスタ出典' });
    await addMapByUrl(page, { name: 'E2Eベクタ', url: VECTOR_URL, attribution: 'E2Eベクタ出典', vector: true });
    // 外部のタイルに頼らないよう、初めから表示されている地図は非表示にする
    for (const name of ['地理院地図', '陰影起伏図']) {
      await page.getByTestId(`maps-visible-${await mapIndex(page, name)}`).click();
    }
    await expect(attribution(page)).toHaveText(/^E2Eラスタ出典 \| E2Eベクタ出典( \| MapLibre)?$/);
    // ベクタのポリゴンがある範囲へ移動する（地図名を押す。シートは閉じる）
    await page.getByTestId(`maps-row-${await mapIndex(page, 'E2Eベクタ')}`).click();
    await expect(page.getByTestId('maps-add')).not.toBeInViewport();

    await page.getByTestId('home-settings').click();
    await page.getByTestId('settings-pdf').click();
    await expect(page.getByTestId('home-pdf-export')).toBeVisible();
    const popupPromise = context.waitForEvent('page', { timeout: 60_000 });
    await page.getByTestId('home-pdf-export').click();
    const popup = await popupPromise;
    await expect.poll(() => printed.length, { timeout: 60_000 }).toBe(1);
    await expect.poll(() => popup.isClosed(), { timeout: 30_000 }).toBe(true);

    const images = printed[0];
    // 地図の画像は PMTiles から取り出したものだけ（URLで貼る地図は無い）
    expect(images.length).toBeGreaterThan(0);
    expect(images.every((image) => image.isDataUrl)).toBe(true);
    // ラスタ: 全面マゼンタのタイルが、そのまま入っている
    const rasterTiles = images.filter((image) => image.magenta > 0.99);
    expect(rasterTiles.length).toBeGreaterThan(0);
    expect(rasterTiles.every((image) => image.width === 256 && image.height === 256)).toBe(true);
    // ベクタ: ポリゴンを描いた画像が入っている
    expect(images.some((image) => image.green > 0.01)).toBe(true);
    expect(errors).toEqual([]);
  });
});
