import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect, Locator, Page, test } from '@playwright/test';
import {
  dataRows,
  dialogButton,
  layerNames,
  layerRowIndex,
  longPressMap,
  okIfShown,
  openApp,
  openLayerData,
  openLayers,
  plainText,
  selectFeature,
  sheetBack,
  sheetSettled,
  sheetClose,
  text,
} from '../support/app';
import { createProject, login, openProject } from '../support/emu';

/** Picker を開いて、文言で選択肢を選ぶ */
const pick = async (page: Page, testID: string, label: string) => {
  await page.getByTestId(testID).click();
  await page
    .locator(`[data-testid^="${testID}-option-"]`)
    .filter({ hasText: new RegExp(`^${label}$`) })
    .click();
};

/** Picker の選択肢の文言（開いて読み、いま選ばれている先頭の選択肢を選び直して閉じる） */
const pickerOptions = async (page: Page, testID: string): Promise<string[]> => {
  await page.getByTestId(testID).click();
  const options = page.locator(`[data-testid^="${testID}-option-"]`);
  await expect(options.first()).toBeVisible();
  const labels = (await options.allInnerTexts()).map((s) => s.trim());
  await options.first().click();
  await expect(options.first()).toBeHidden();
  return labels;
};

/** 色選択（react-color の SketchPicker）で、既定の見本から色を選んで OK する */
const pickSwatch = async (page: Page, hex: string) => {
  await expect(page.getByTestId('home-colorpicker-ok')).toBeVisible();
  await page.locator(`div[title="${hex}"]`).click();
  await page.waitForTimeout(400);
  await page.getByTestId('home-colorpicker-ok').click();
  await expect(page.getByTestId('home-colorpicker-ok')).toBeHidden();
};

/** 地図上のポイント（DOMのマーカー）の記号の色 */
const markers = (page: Page): Locator => page.locator('.maplibregl-marker');
const markerColors = (page: Page): Promise<string[]> =>
  markers(page).evaluateAll((els) =>
    els.map((el) => {
      const dot = Array.from(el.querySelectorAll('div')).find((d) => getComputedStyle(d).borderRadius === '15px');
      return dot ? getComputedStyle(dot).backgroundColor.replace(/\s/g, '') : '';
    })
  );
const isNear = (color: string, rgb: [number, number, number], tolerance = 2) => {
  const m = color.match(/\d+/g)?.map(Number) ?? [];
  return m.length >= 3 && rgb.every((v, k) => Math.abs(v - m[k]) <= tolerance);
};

/** 画面の1点の色（ラインは canvas に描かれるので、スクリーンショットから読む） */
const pixelColor = async (page: Page, x: number, y: number): Promise<[number, number, number]> => {
  const png = await page.screenshot({ clip: { x: Math.round(x), y: Math.round(y), width: 1, height: 1 } });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b] as [number, number, number];
  }, png.toString('base64'));
};

/** 編集レイヤのチップを押して、候補から名前でレイヤを選ぶ（すでにそのレイヤなら何もしない） */
const switchEditingLayer = async (page: Page, layerName: string) => {
  const chip = page.getByTestId('home-editing-layer');
  if (plainText(await chip.innerText()) === layerName) return;
  await chip.click();
  await page
    .locator('[data-testid^="home-layerselect-row-"]')
    .filter({ has: page.getByText(layerName, { exact: true }) })
    .click();
  await expect.poll(async () => plainText(await chip.innerText())).toBe(layerName);
};

/** レイヤ一覧の「追加」から、プリセットを選んでレイヤを作る（レイヤ設定を保存して、シートを閉じる） */
/**
 * プロジェクト一覧から地図画面へ戻る。戻ると地図画面（ボトムシートを含む）が作り直される。
 * 作り直しの最中にシートを開く操作を重ねると、シートが途中の高さで止まり、×を押しても閉じなくなることがある。
 * 人が続けて押せる速さではないので、落ち着くまで待ってから先へ進む
 */
const backFromProjects = async (page: Page) => {
  await page.getByTestId('projects-back').click();
  await expect(page.getByTestId('home-layers')).toBeVisible();
  await page.waitForTimeout(1000);
};

const addLayerFromPreset = async (page: Page, presetName: string) => {
  await openLayers(page);
  await page.getByTestId('layers-add').click();
  await expect(page.getByTestId('layeredit-name')).toBeVisible();
  await sheetSettled(page);
  // ModalSelector の外側のタッチ領域が重なっているので、位置で押す
  await page.getByTestId('layeredit-preset').click({ force: true });
  await text(page, presetName).click();
  await expect(page.getByTestId('layeredit-name')).toHaveValue(presetName);
};

/** 地図の上をなぞる（手書き） */
const stroke = async (page: Page, points: [number, number][]) => {
  await page.mouse.move(points[0][0], points[0][1]);
  await page.mouse.down();
  for (const [x, y] of points.slice(1)) await page.mouse.move(x, y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(500);
};

/** レイヤ設定のフィールド名の並び */
const fieldNames = (page: Page) =>
  page
    .locator('[data-testid^="layeredit-field-name-"]')
    .evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value));

/** データ一覧の、その行の列の値（列はレイヤのフィールドの並び順。先頭の列は 0） */
const cellText = async (page: Page, row: number, fieldIndex: number) =>
  plainText(
    await page.getByTestId(fieldIndex === 0 ? `data-row-${row}` : `data-cell-${row}-${fieldIndex}`).innerText()
  );

const lonLatAt = async (page: Page, x: number, y: number): Promise<[number, number]> => {
  const coordinate = page.getByTestId('home-poi-coordinate');
  const previous = await coordinate.innerText({ timeout: 500 }).catch(() => '');
  await longPressMap(page, x, y);
  await expect(coordinate).toHaveText(/^-?\d+\.\d+, -?\d+\.\d+$/);
  await expect(coordinate)
    .not.toHaveText(previous, { timeout: 1500 })
    .catch(() => undefined);
  const [lat, lon] = (await coordinate.innerText()).split(',').map((s) => Number(s.trim()));
  return [lon, lat];
};

// 軌跡は地図の左側（シートに隠れない位置）を、画面の左から右へ水平に進む
const TRACK_POINTS = 41;
const TRACK_FROM: [number, number] = [160, 400];
const TRACK_TO: [number, number] = [560, 400];
const FIX = 4; // GGA の測位品質: RTK FIX
const FLOAT = 5; // RTK FLOAT
const SINGLE = 1; // 単独測位（品質色を重ねない）

/**
 * 軌跡レイヤに、外部GNSSの測位品質つきの軌跡を1本入れる（前1/3がFIX、中1/3がFLOAT、後1/3が単独測位）。
 * Webでは記録ができないので、軌跡レイヤの書き出し形式（レイヤ設定＋GeoJSON）のZIPを作り、「置き換える」で取り込む。
 */
async function importGnssTrack(page: Page) {
  const from = await lonLatAt(page, ...TRACK_FROM);
  const to = await lonLatAt(page, ...TRACK_TO);
  const coordinates: number[][] = [];
  const timestamps: number[] = [];
  const fixQualities: number[] = [];
  for (let i = 0; i < TRACK_POINTS; i++) {
    const r = i / (TRACK_POINTS - 1);
    coordinates.push([from[0] + (to[0] - from[0]) * r, from[1] + (to[1] - from[1]) * r, 100]);
    timestamps.push(Date.parse('2026-01-15T09:00:00+09:00') + i * 1000);
    fixQualities.push(r < 1 / 3 ? FIX : r < 2 / 3 ? FLOAT : SINGLE);
  }
  const layer = {
    id: 'track',
    name: '軌跡',
    type: 'LINE',
    permission: 'PRIVATE',
    colorStyle: {
      colorType: 'SINGLE',
      transparency: 0,
      color: '#0000ff',
      fieldName: 'name',
      customFieldValue: '',
      colorRamp: 'RANDOM',
      colorList: [],
      lineWidth: 6,
    },
    label: '',
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
        // _id があると自前の書き出しとして扱われ、点ごとの時刻・測位品質が戻る
        properties: {
          _id: 'e2egnsstrack000000000001',
          name: 'RTK軌跡',
          time: '',
          cmt: '',
          _timestamps: timestamps,
          _fixQualities: fixQualities,
        },
      },
    ],
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecorismap-e2e-24-'));
  fs.writeFileSync(path.join(dir, 'track.json'), JSON.stringify(layer));
  fs.writeFileSync(path.join(dir, 'track.geojson'), JSON.stringify(geojson));
  const zipFile = path.join(dir, 'track.zip');
  execFileSync('zip', ['-j', '-q', zipFile, path.join(dir, 'track.json'), path.join(dir, 'track.geojson')]);

  await openLayers(page);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('layers-import').click()]);
  await chooser.setFiles(zipFile);
  await expect(text(page, 'レイヤ「軌跡」は既に存在します。どうしますか？')).toBeVisible({ timeout: 30_000 });
  await dialogButton(page, '置き換える').click();
  await expect(page.getByTestId('dialog-message')).toHaveText('ファイルをインポートしました。', { timeout: 30_000 });
  await page.getByTestId('dialog-button-0').click();
  await expect(page.getByTestId('dialog-message')).toBeHidden();
  fs.rmSync(dir, { recursive: true, force: true });
}

/** 軌跡の上の点（ratio=0〜1）の色 */
const trackColor = (page: Page, ratio: number) =>
  pixelColor(page, TRACK_FROM[0] + (TRACK_TO[0] - TRACK_FROM[0]) * ratio, TRACK_FROM[1]);

const BLUE: [number, number, number] = [0, 0, 255];
const FIX_GREEN: [number, number, number] = [0x2e, 0x9e, 0x44];
const FLOAT_ORANGE: [number, number, number] = [0xf2, 0x9c, 0x00];

test.describe('13. レイヤ・作図（ログインで開く機能）', () => {
  test('LAYER-12 野帳レイヤのプリセットは、ログインすると選べて、選んだ野帳の項目でレイヤができる', async ({
    page,
  }) => {
    // ログインしていないと、プリセットの選択は出ない
    await openApp(page);
    await openLayers(page);
    await page.getByTestId('layers-add').click();
    await expect(page.getByTestId('layeredit-name')).toBeVisible();
    await expect(page.getByTestId('layeredit-preset')).toHaveCount(0);

    await login(page, 'owner');
    await backFromProjects(page);
    await addLayerFromPreset(page, '鳥類野帳');
    expect(await fieldNames(page)).toEqual([
      '確認No',
      '種名',
      '個体数',
      '写真番号',
      '確認形態',
      '確認環境',
      '微環境',
      '調査地点',
      '確認日時',
      '備考',
    ]);
    await page.getByTestId('layeredit-save').click();
    await okIfShown(page, 1500);
    await sheetClose(page);
    await openLayers(page);
    expect(await layerNames(page)).toContain('鳥類野帳');
    await sheetClose(page);

    // 野帳のレイヤにポイントを打つと、野帳の項目を入力する画面になる。確認No（連番）は1から始まる
    await selectFeature(page, 'point');
    await switchEditingLayer(page, '鳥類野帳');
    await page.getByTestId('home-draw-plot-point').click();
    await page.mouse.click(450, 300);
    await page.getByTestId('home-draw-save').click();
    await expect(page.getByTestId('dataedit-layername')).toHaveValue('鳥類野帳');
    await expect(page.getByTestId('dataedit-input-確認No')).toHaveValue('1');
    await page.getByTestId('dataedit-input-個体数').fill('3');
    await page.getByTestId('dataedit-save').click();
    await expect(page.getByTestId('data-export')).toBeVisible();
    await expect(dataRows(page)).toHaveCount(1);
    expect(await cellText(page, 0, 2)).toBe('3');
  });

  test('DRAW-14 飛翔図パレットで飛翔線・行動記号を描くと、属性に種名と行動が入る', async ({ page }) => {
    test.setTimeout(150_000);
    await login(page, 'owner');
    await backFromProjects(page);
    await addLayerFromPreset(page, '猛禽類野帳（飛翔）');
    const names = await fieldNames(page);
    await page.getByTestId('layeredit-save').click();
    await okIfShown(page, 1500);
    await sheetClose(page);

    await selectFeature(page, 'line');
    await switchEditingLayer(page, '猛禽類野帳（飛翔）');
    // 飛翔図のパレットが出る。行動範囲・行動削除は、線を描くまで押せない
    const pen = page.getByTestId('home-palette-HISYOU_PEN');
    await expect(pen).toBeVisible();
    await expect(page.getByTestId('home-palette-HISYOU_BRUSH')).toHaveAttribute('aria-disabled', 'true');

    // 種名などを選ばずに「飛翔」を押すと、先に種名・性別・齢を聞かれる
    await pen.click();
    await expect(page.getByTestId('home-categorypicker-tab-0')).toHaveText('種名');
    await page.getByTestId('home-categorypicker-row-1').click(); // イヌワシ
    await page.getByTestId('home-categorypicker-row-1').click(); // 雌
    await page.getByTestId('home-categorypicker-row-0').click(); // 成鳥
    await expect(page.getByTestId('home-categorypicker-cancel')).toBeHidden();
    await expect(page.getByTestId('home-palette-HISYOU_FIELDS')).toContainText('イヌワシ');

    // 飛翔線を描く
    await stroke(page, [
      [200, 300],
      [300, 340],
      [400, 300],
      [500, 340],
    ]);
    // 行動位置「とまり」を線の上に置くと、どのとまりかを聞かれる
    await page.getByTestId('home-palette-HISYOU_STAMP').click();
    await page.getByTestId('home-subtool-TOMARI').click();
    await page.mouse.move(440, 318);
    await page.mouse.down();
    await page.waitForTimeout(150);
    await page.mouse.move(441, 318);
    await page.mouse.up();
    await expect(text(page, '監視')).toBeVisible();
    await text(page, '監視').click();
    // 行動範囲「探餌」で線をなぞる（中身を選ばない行動）
    await page.getByTestId('home-palette-HISYOU_BRUSH').click();
    await page.getByTestId('home-subtool-TANJI').click();
    await stroke(page, [
      [300, 340],
      [350, 320],
      [400, 300],
    ]);
    await page.getByTestId('home-draw-save').click();
    await expect(page.getByTestId('home-draw-save')).toBeHidden();

    // 1本の記録になり、種名・性別・齢と、置いた行動だけが入っている
    await okIfShown(page, 1000);
    if (await page.getByTestId('dataedit-save').isVisible()) await sheetClose(page);
    await openLayerData(page, '猛禽類野帳（飛翔）');
    await expect(dataRows(page)).toHaveCount(1);
    const value = (name: string) => cellText(page, 0, names.indexOf(name));
    expect(await value('種名')).toBe('イヌワシ');
    expect(await value('性別')).toBe('雌');
    expect(await value('齢')).toBe('成鳥');
    expect(await value('とまり')).toBe('監視');
    expect(await value('採餌行動')).toBe('探餌');
    expect(await value('交尾')).toBe('');
    expect(await value('排斥')).toBe('');
  });

  test('LAYER-10 軌跡を測位品質で色分けできる（FIX・FLOATの区間だけ品質の色になる）', async ({ page }) => {
    await login(page, 'owner');
    await backFromProjects(page);
    await importGnssTrack(page);
    // 軌跡は地図の左側にあり、右側のシート（レイヤ一覧）を開いたままでも見える。取り込んだ直後は単色（青）
    await expect.poll(async () => isNear((await trackColor(page, 0.15)).join(','), BLUE, 40)).toBe(true);
    expect(isNear((await trackColor(page, 0.5)).join(','), BLUE, 40)).toBe(true);

    const i = await layerRowIndex(page, '軌跡');
    await page.getByTestId(`layers-style-${i}`).click();
    await pick(page, 'featurestyle-color-type', '測位品質');
    // 凡例に FIX と FLOAT が出る
    await expect(page.getByTestId(`featurestyle-gnss-quality-${FIX}`)).toBeVisible();
    await expect(page.getByTestId(`featurestyle-gnss-quality-${FLOAT}`)).toBeVisible();
    await page.getByTestId('featurestyle-save').click();

    // FIX の区間は緑、FLOAT の区間は橙、単独測位の区間はレイヤの色（青）のまま
    await expect.poll(async () => isNear((await trackColor(page, 0.15)).join(','), FIX_GREEN, 40)).toBe(true);
    expect(isNear((await trackColor(page, 0.5)).join(','), FLOAT_ORANGE, 40)).toBe(true);
    expect(isNear((await trackColor(page, 0.85)).join(','), BLUE, 40)).toBe(true);

    // 測位品質を選べるのは軌跡レイヤだけ（スタイルの画面に残っていれば、レイヤ一覧へ戻る）
    if (!(await page.getByTestId('layers-row-0').isVisible())) await sheetBack(page);
    await expect(page.getByTestId('layers-row-0')).toBeVisible();
    const k = await layerRowIndex(page, 'ライン');
    await page.getByTestId(`layers-style-${k}`).click();
    expect(await pickerOptions(page, 'featurestyle-color-type')).not.toContain('測位品質');
  });

  test('LAYER-10b プロジェクトの中では、ユーザー別の色分けができる', async ({ page }) => {
    await login(page, 'owner');
    // プロジェクトの外では、ユーザー別は選べない
    await backFromProjects(page);
    await openLayers(page);
    let i = await layerRowIndex(page, 'ポイント');
    await page.getByTestId(`layers-style-${i}`).click();
    expect(await pickerOptions(page, 'featurestyle-color-type')).not.toContain('ユーザー別');
    await sheetBack(page);
    await sheetClose(page);

    await page.getByTestId('home-account').click();
    await page.getByTestId('home-account-projects').click();
    await createProject(page, 'ユーザー別の色の確認');
    await openProject(page, 'ユーザー別の色の確認', { admin: true });
    await selectFeature(page, 'point');
    await page.getByTestId('home-draw-plot-point').click();
    await page.mouse.click(450, 300);
    await page.getByTestId('home-draw-save').click();
    await expect(page.getByTestId('dataedit-save')).toBeVisible();
    await expect(markers(page)).toHaveCount(1);
    const before = (await markerColors(page))[0];

    // データ編集 → データ一覧 → レイヤ一覧 と戻る
    await sheetBack(page);
    await expect(page.getByTestId('data-export')).toBeVisible();
    await sheetBack(page);
    await expect(page.getByTestId('layers-row-0')).toBeVisible();
    i = await layerRowIndex(page, 'ポイント');
    await page.getByTestId(`layers-style-${i}`).click();
    await pick(page, 'featurestyle-color-type', 'ユーザー別');
    await page.getByTestId('featurestyle-reload').click();
    // 記録した人の表示名が並ぶ
    await expect(page.locator('[data-testid^="featurestyle-value-"]')).toHaveCount(1);
    await expect(page.getByTestId('featurestyle-value-0')).toHaveValue('オーナー');
    await page.getByTestId('featurestyle-color-0').click();
    await pickSwatch(page, '#ff0000b3');
    await page.getByTestId('featurestyle-save').click();
    await sheetClose(page);
    expect(isNear(before, [255, 0, 0])).toBe(false);
    await expect.poll(async () => isNear((await markerColors(page))[0], [255, 0, 0])).toBe(true);
  });
});
