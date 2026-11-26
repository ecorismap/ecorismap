import { expect, Page, test } from '@playwright/test';
import { attribution, dialogButton, openApp, plainText, selectFeature, sheetBack, sheetClose, text } from '../support/app';

type Coord = { longitude: number; latitude: number };
type PersistedRecord = { id: string; coords: Coord | Coord[]; field: { [key: string]: string | number } };
type PersistedLayer = { id: string; name: string };
type PersistedTileMap = { id: string; name: string; transparency: number; visible: boolean };

/** 端末内保存（IndexedDB）の中身を、項目ごとに取り出す。まだ書き出されていなければ undefined */
const readPersisted = async <T>(page: Page, key: string): Promise<T | undefined> => {
  const raw = await page.evaluate(async () => {
    const tabId = sessionStorage.getItem('ecorismap-redux-tab-id');
    if (tabId === null) return '';
    return new Promise<string>((resolve) => {
      const req = indexedDB.open('ecorismapReduxPersist-' + tabId);
      req.onerror = () => resolve('');
      req.onsuccess = () => {
        const db = req.result;
        try {
          const get = db.transaction('keyvalue').objectStore('keyvalue').get('persist:root');
          get.onsuccess = () => {
            resolve(get.result?.value ?? '');
            db.close();
          };
          get.onerror = () => {
            resolve('');
            db.close();
          };
        } catch {
          db.close();
          resolve('');
        }
      };
    });
  });
  if (raw === '') return undefined;
  const root = JSON.parse(raw) as { [key: string]: string };
  return root[key] === undefined ? undefined : (JSON.parse(root[key]) as T);
};

/** 端末内に保存されている、そのレイヤの記録（線・面・メモは地図上にDOMが無いので、保存された中身で確かめる） */
const savedRecords = async (page: Page, layerName: string): Promise<PersistedRecord[]> => {
  const layers = await readPersisted<PersistedLayer[]>(page, 'layers');
  const dataSet = await readPersisted<{ layerId: string; data: PersistedRecord[] }[]>(page, 'dataSet');
  const layer = layers?.find((l) => l.name === layerName);
  if (layer === undefined || dataSet === undefined) return [];
  return dataSet.filter((d) => d.layerId === layer.id).flatMap((d) => d.data);
};

/** 保存された記録が条件を満たすまで待って、その記録を返す（保存は間引かれていて、すぐには書き出されない） */
const waitForRecords = async (
  page: Page,
  layerName: string,
  ready: (records: PersistedRecord[]) => boolean
): Promise<PersistedRecord[]> => {
  let records: PersistedRecord[] = [];
  await expect
    .poll(
      async () => {
        records = await savedRecords(page, layerName);
        return ready(records);
      },
      { timeout: 60_000, intervals: [500] }
    )
    .toBe(true);
  return records;
};

const lineCoords = (record: PersistedRecord) => record.coords as Coord[];

/** 地図上を押したまま動かす */
const stroke = async (page: Page, points: [number, number][]) => {
  await page.mouse.move(points[0][0], points[0][1]);
  await page.mouse.down();
  for (const [x, y] of points.slice(1)) await page.mouse.move(x, y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(500);
};

const plot = async (page: Page, points: [number, number][]) => {
  for (const [x, y] of points) {
    await page.mouse.click(x, y);
    await page.waitForTimeout(300);
  }
};

const openMaps = async (page: Page) => {
  await page.getByTestId('home-maps').click();
  await expect(page.getByTestId('maps-add')).toBeVisible();
};
const mapIndex = async (page: Page, name: string) => {
  const rows = page.locator('[data-testid^="maps-row-"]');
  const names = (await rows.allInnerTexts()).map(plainText);
  const i = names.indexOf(name);
  if (i < 0) throw new Error(`地図が見つかりません: ${name}（${names.join(', ')}）`);
  return Number(((await rows.nth(i).getAttribute('data-testid')) ?? '').replace('maps-row-', ''));
};

// 地図の左半分（シートに隠れない位置）を座標で操作する
test.describe('13. 作図の編集・マップメモ・地図の回転ほか', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  test('DRAW-9 既存の線を選択して、頂点を動かして保存できる', async ({ page }) => {
    await selectFeature(page, 'line');
    await page.getByTestId('home-draw-plot-line').click();
    await plot(page, [
      [200, 250],
      [300, 300],
      [400, 260],
    ]);
    await page.getByTestId('home-draw-save').click();
    await expect(page.getByTestId('dataedit-record-number')).toHaveText('1/1');
    await sheetClose(page);
    const before = lineCoords((await waitForRecords(page, 'ライン', (r) => r.length === 1))[0]);
    expect(before).toHaveLength(3);

    // 選択ツールで線の上を押すと、その線の頂点を編集する状態になる
    await page.getByTestId('home-draw-select').click();
    await page.mouse.click(250, 275);
    await expect(page.getByTestId('home-draw-save')).toBeVisible();
    // 真ん中の頂点を下へ動かす
    await stroke(page, [
      [300, 300],
      [300, 340],
      [300, 380],
    ]);
    await page.getByTestId('home-draw-save').click();
    await expect(page.getByTestId('home-draw-save')).toBeHidden();

    const after = lineCoords(
      (await waitForRecords(page, 'ライン', (r) => r.length === 1 && lineCoords(r[0])[1].latitude !== before[1].latitude))[0]
    );
    // 頂点の数は変わらず、真ん中だけが南へ動いている（両端はそのまま）
    expect(after).toHaveLength(3);
    expect(after[1].latitude).toBeLessThan(before[1].latitude - 0.0003);
    expect(after[1].longitude).toBeCloseTo(before[1].longitude, 4);
    expect(after[0]).toEqual(before[0]);
    expect(after[2]).toEqual(before[2]);
  });

  test('DRAW-9b 既存の面を選択して、頂点を動かして保存できる', async ({ page }) => {
    await selectFeature(page, 'polygon');
    await page.getByTestId('home-draw-plot-polygon').click();
    await plot(page, [
      [200, 250],
      [350, 250],
      [350, 400],
      [200, 400],
    ]);
    await page.getByTestId('home-draw-save').click();
    await expect(page.getByTestId('dataedit-record-number')).toHaveText('1/1');
    await sheetClose(page);
    const before = lineCoords((await waitForRecords(page, 'ポリゴン', (r) => r.length === 1))[0]);

    await page.getByTestId('home-draw-select').click();
    // 既定のポリゴンは塗りが透明なので、辺の上を押して選ぶ
    await page.mouse.click(275, 250);
    await expect(page.getByTestId('home-draw-save')).toBeVisible();
    // 右下の頂点を、さらに右下へ動かす
    await stroke(page, [
      [350, 400],
      [390, 430],
      [420, 460],
    ]);
    await page.getByTestId('home-draw-save').click();
    await expect(page.getByTestId('home-draw-save')).toBeHidden();

    const after = lineCoords(
      (await waitForRecords(
        page,
        'ポリゴン',
        (r) => r.length === 1 && JSON.stringify(r[0].coords) !== JSON.stringify(before)
      ))[0]
    );
    expect(after).toHaveLength(before.length);
    // 右下（東・南の端）が広がり、左上（西・北の端）は変わらない
    const lons = (c: Coord[]) => c.map((p) => p.longitude);
    const lats = (c: Coord[]) => c.map((p) => p.latitude);
    expect(Math.max(...lons(after))).toBeGreaterThan(Math.max(...lons(before)) + 0.0005);
    expect(Math.min(...lats(after))).toBeLessThan(Math.min(...lats(before)) - 0.0003);
    expect(Math.min(...lons(after))).toBeCloseTo(Math.min(...lons(before)), 9);
    expect(Math.max(...lats(after))).toBeCloseTo(Math.max(...lats(before)), 9);
  });

  test('DRAW-10 なげなわ選択で、複数のポイントをまとめて移動・回転・削除できる', async ({ page }) => {
    await selectFeature(page, 'point');
    // 起動直後は地図の左右の端寄りに置いたポイントが表示されない（報告済みの不具合）ので、中央寄りに置く
    for (const x of [400, 500]) {
      await page.getByTestId('home-draw-plot-point').click();
      await page.mouse.click(x, 300);
      await page.getByTestId('home-draw-save').click();
      await expect(page.getByTestId('dataedit-coords-longitude-decimal')).toHaveValue(/^13\d\.\d+/);
      await sheetClose(page);
    }
    await expect(page.locator('.maplibregl-marker')).toHaveCount(2);
    const point = (r: PersistedRecord) => r.coords as Coord;
    const before = (await waitForRecords(page, 'ポイント', (r) => r.length === 2)).map(point);
    // 東西に並んでいる
    expect(Math.abs(before[0].latitude - before[1].latitude)).toBeLessThan(1e-9);
    const lonGap = Math.abs(before[0].longitude - before[1].longitude);
    expect(lonGap).toBeGreaterThan(0.001);

    // 選択ツールで2点を囲む
    const lasso = async (points: [number, number][]) => {
      await page.getByTestId('home-draw-select').click();
      await stroke(page, points);
      await expect(page.getByTestId('home-draw-delete')).toBeVisible();
    };
    await lasso([
      [350, 250],
      [550, 250],
      [550, 350],
      [350, 350],
      [350, 255],
    ]);
    // 枠の中を引くと、まとめて動く（下へ60px）
    await stroke(page, [
      [450, 300],
      [450, 330],
      [450, 360],
    ]);
    // 枠の上の回転ハンドル（枠の上辺から40px上）を引くと、まとめて回る（中心のまわりに右へ90度）
    await stroke(page, [
      [450, 300],
      [492, 318],
      [510, 360],
    ]);
    await page.getByTestId('home-draw-save').click();
    await expect(page.getByTestId('home-draw-save')).toBeHidden();

    const after = (
      await waitForRecords(page, 'ポイント', (r) => r.length === 2 && point(r[0]).latitude !== before[0].latitude)
    ).map(point);
    // 2点とも南へ動いている
    for (const p of after) expect(p.latitude).toBeLessThan(before[0].latitude);
    // 90度回したので、東西の並びが南北の並びになっている
    expect(Math.abs(after[0].longitude - after[1].longitude)).toBeLessThan(lonGap * 0.05);
    expect(Math.abs(after[0].latitude - after[1].latitude)).toBeGreaterThan(lonGap * 0.5);
    await expect(page.locator('.maplibregl-marker')).toHaveCount(2);

    // 囲み直して削除すると、2点ともなくなる
    await lasso([
      [390, 270],
      [510, 270],
      [510, 450],
      [390, 450],
      [390, 275],
    ]);
    await page.getByTestId('home-draw-delete').click();
    await expect(page.getByTestId('dialog-message')).toBeVisible();
    await dialogButton(page, 'Yes').click();
    await expect(page.locator('.maplibregl-marker')).toHaveCount(0);
    await waitForRecords(page, 'ポイント', (r) => r.length === 0);
  });

  // MEMO-2（ブラシ・スタンプ）は見送り: マップメモのツールバーはペンと消しゴムだけで、スタンプ・ブラシは
  // 飛翔図のパレット（DRAW-14）側にしか出ない

  test('MEMO-4 マップメモの色と太さを変えられる。描いたときのズームが線に記録される', async ({ page }) => {
    await page.getByTestId('home-feature-draw').click();
    await page.getByTestId('home-feature-memo').click();
    await page.getByTestId('home-memo-pen').click();
    const draw = (y: number) =>
      stroke(page, [
        [200, y],
        [300, y + 30],
        [400, y],
      ]);
    await draw(200);

    // 太さは押すたびに切り替わる（ボタンのラベルが変わる）
    const width = page.getByTestId('home-memo-pen-width');
    const widthBefore = plainText(await width.innerText());
    await width.click();
    await expect.poll(async () => plainText(await width.innerText())).not.toBe(widthBefore);
    await draw(280);

    // 色を選ぶ
    await page.getByTestId('home-memo-color').click();
    await expect(page.getByTestId('home-colorpicker-ok')).toBeVisible();
    const hex = page.locator('.sketch-picker input').first();
    await hex.fill('00FF00');
    await hex.press('Enter');
    // 選んだ色は少し遅れて確定する（react-color が onChangeComplete を100ms間引く）
    await page.waitForTimeout(400);
    await page.getByTestId('home-colorpicker-ok').click();
    await expect(page.getByTestId('home-colorpicker-ok')).toBeHidden();
    await draw(360);

    // 拡大してから描く。ペンを持ったまま＋ボタンを押すと、ボタンの下に点が描かれてしまう（報告済みの不具合）ので、
    // いったんペンを置いてから拡大する
    await page.getByTestId('home-memo-pen').click();
    await page.locator('.maplibregl-ctrl-zoom-in').click();
    await expect(page.getByTestId('home-zoom-level')).toHaveText('16');
    await page.waitForTimeout(800);
    await page.getByTestId('home-memo-pen').click();
    await draw(440);

    const records = await waitForRecords(page, 'メモ', (r) => r.length === 4);
    const [first, second, third, fourth] = records.map((r) => r.field);
    expect(second._strokeWidth).not.toBe(first._strokeWidth);
    expect(second._strokeColor).toBe(first._strokeColor);
    expect(third._strokeWidth).toBe(second._strokeWidth);
    expect(third._strokeColor).toBe('rgba(0,255,0,1)');
    // 太さと色は、次に描く線にも引き継がれる
    expect(fourth._strokeWidth).toBe(third._strokeWidth);
    expect(fourth._strokeColor).toBe(third._strokeColor);
    // 線には描いたときのズームが入る（この値を基準に、ズームに合わせて太さが変わる）
    expect(Number(fourth._zoom)).toBe(Number(first._zoom) + 1);
  });

  test('MAP-2 地図を回転でき、コンパスを押すと北が上に戻る', async ({ page }) => {
    const needle = page.locator('.maplibregl-ctrl-compass .maplibregl-ctrl-icon');
    const bearing = async () => {
      const style = (await needle.getAttribute('style')) ?? '';
      // 針の向きは、最後の rotateZ に入っている
      const all = [...style.matchAll(/rotateZ\((-?[\d.]+)deg\)/g)];
      return all.length === 0 ? NaN : Number(all[all.length - 1][1]);
    };
    expect(await bearing()).toBe(0);
    // Webでは右ドラッグ（またはCtrl+ドラッグ）で回す
    // 地図の中心（640,400）のまわりを回るように引く（中心へ向かってまっすぐ引いても回らない）
    await page.mouse.move(300, 400);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(400, 160, { steps: 10 });
    await page.mouse.move(640, 100, { steps: 10 });
    await page.mouse.up({ button: 'right' });
    await expect.poll(async () => Math.abs(await bearing())).toBeGreaterThan(30);

    await page.locator('.maplibregl-ctrl-compass').click();
    await expect.poll(bearing, { timeout: 10_000 }).toBe(0);
  });

  // 山名は canvas に描かれるので、文字そのものは確かめない。海域名はWeb版には無い（ネイティブのみ）
  test('MAP-7 山名のラベルを地図に追加して表示できる', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    const peakData = page.waitForResponse((r) => /gsi_peaks/.test(r.url()), { timeout: 60_000 });
    await openMaps(page);
    await page.getByTestId('maps-add').click();
    await page.getByTestId('mapedit-preset').click({ force: true });
    await text(page, '山名（国土地理院）').click();
    await expect(page.getByTestId('mapedit-url')).toHaveValue(/^peaks:\/\//);
    await page.getByTestId('mapedit-save').click();
    await sheetBack(page);
    await expect(page.getByTestId('maps-add')).toBeVisible();
    // 山頂のデータが読み込まれ、出典に出る
    expect((await peakData).ok()).toBe(true);
    await expect(attribution(page)).toContainText('山名: 国土地理院', { timeout: 30_000 });
    await page.waitForTimeout(2000);
    expect(pageErrors).toEqual([]);
  });

  test('MAPS-2 地図の透過率を変えられる', async ({ page }) => {
    const name = '陰影起伏図';
    const saved = async () => (await readPersisted<PersistedTileMap[]>(page, 'tileMaps'))?.find((m) => m.name === name);
    await openMaps(page);
    const i = await mapIndex(page, name);
    await page.getByTestId(`maps-edit-${i}`).click();
    const slider = page.getByTestId('mapedit-transparency');
    await expect(slider).toBeVisible();
    // スライダーの左から3割の位置を押す（0.1刻みなので0.3になる）。右の数字も変わる
    const box = (await slider.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height / 2);
    await expect(text(page, '0.3')).toBeVisible();
    await page.getByTestId('mapedit-save').click();
    await expect.poll(async () => (await saved())?.transparency, { timeout: 60_000, intervals: [500] }).toBeCloseTo(0.3, 5);
    // 開き直しても0.3のまま
    await sheetBack(page);
    await page.getByTestId(`maps-edit-${await mapIndex(page, name)}`).click();
    await expect(page.getByTestId('mapedit-transparency')).toBeVisible();
    await expect(text(page, '0.3')).toBeVisible();
  });
});
