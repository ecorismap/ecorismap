import { expect, Locator, Page, test } from '@playwright/test';
import {
  dataRows,
  dialogButton,
  importLayerFile,
  layerRowIndex,
  okIfShown,
  openApp,
  openLayers,
  openLayerSettings,
  plainText,
  selectFeature,
  sheetBack,
  sheetClose,
  text,
  waitForPersisted,
} from '../support/app';

/** 地図上のポイント（DOMのマーカー） */
const markers = (page: Page): Locator => page.locator('.maplibregl-marker');

/** 地図上のポイントの記号の色（マーカーごと。記号は直径15pxの丸） */
const markerColors = (page: Page): Promise<string[]> =>
  markers(page).evaluateAll((els) =>
    els.map((el) => {
      const dot = Array.from(el.querySelectorAll('div')).find((d) => getComputedStyle(d).borderRadius === '15px');
      return dot ? getComputedStyle(dot).backgroundColor.replace(/\s/g, '') : '';
    })
  );

/** 色が近いか（色選択は HSV を経由するので、RGB が1ずれることがある） */
const isNear = (color: string, rgb: [number, number, number]) => {
  const m = color.match(/\d+/g)?.map(Number) ?? [];
  return m.length >= 3 && rgb.every((v, k) => Math.abs(v - m[k]) <= 2);
};
const RED: [number, number, number] = [255, 0, 0]; // #ff0000b3
const BLUE: [number, number, number] = [0, 0, 255]; // #0000ffb3
const YELLOW: [number, number, number] = [255, 255, 0]; // #ffff00b3

/** Picker を開いて、文言で選択肢を選ぶ */
const pick = async (page: Page, testID: string, label: string) => {
  await page.getByTestId(testID).click();
  await page
    .locator(`[data-testid^="${testID}-option-"]`)
    .filter({ hasText: new RegExp(`^${label}$`) })
    .click();
};

/** 色選択（react-color の SketchPicker）で、既定の見本から色を選んで OK する */
const pickSwatch = async (page: Page, hex: string) => {
  await expect(page.getByTestId('home-colorpicker-ok')).toBeVisible();
  await page.locator(`div[title="${hex}"]`).click();
  // 選んだ色は少し遅れて確定する（react-color が onChangeComplete を100ms間引く）
  await page.waitForTimeout(400);
  await page.getByTestId('home-colorpicker-ok').click();
  await expect(page.getByTestId('home-colorpicker-ok')).toBeHidden();
};

/** 画面の一部の平均色（ライン・ポリゴンは canvas に描かれるので、スクリーンショットから読む） */
const averageColor = async (page: Page, x: number, y: number, size = 40): Promise<[number, number, number]> => {
  const png = await page.screenshot({ clip: { x: x - size / 2, y: y - size / 2, width: size, height: size } });
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

/** ポリゴンをプロットで描いて確定する */
const plotPolygon = async (page: Page, points: [number, number][]) => {
  await page.getByTestId('home-draw-plot-polygon').click();
  for (const [x, y] of points) {
    await page.mouse.click(x, y);
    await page.waitForTimeout(300);
  }
  await page.getByTestId('home-draw-save').click();
  await expect(page.getByTestId('home-draw-save')).toBeHidden();
};
const LEFT: [number, number][] = [
  [380, 250],
  [480, 250],
  [480, 350],
  [380, 350],
];
const RIGHT: [number, number][] = [
  [520, 250],
  [620, 250],
  [620, 350],
  [520, 350],
];

/**
 * ポイントを1つ打ち、cmt を入れて保存する（データ一覧に戻る）。
 * 位置は地図の中央寄りにする。起動直後（地図を動かす前）は、画面の端に近いポイントが描かれないため
 */
const addPoint = async (page: Page, x: number, y: number, cmt: string) => {
  await page.getByTestId('home-draw-plot-point').click();
  await page.mouse.click(x, y);
  await page.getByTestId('home-draw-save').click();
  await page.getByTestId('dataedit-input-cmt').fill(cmt);
  await page.getByTestId('dataedit-save').click();
  await expect(page.getByTestId('data-export')).toBeVisible();
};

test.describe('12. レイヤの表示・スタイル・ツールパレット', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  test('LAYER-1 レイヤ一覧で表示／非表示・ラベルを切り替えると、地図に反映される', async ({ page }) => {
    await selectFeature(page, 'point');
    await addPoint(page, 450, 300, 'ブナ');
    await expect(markers(page)).toHaveCount(1);
    await sheetBack(page);
    const i = await layerRowIndex(page, 'ポイント');

    // 非表示にすると地図から消え、表示に戻すと出る
    await page.getByTestId(`layers-visible-${i}`).click();
    await expect(markers(page)).toHaveCount(0);
    await page.getByTestId(`layers-visible-${i}`).click();
    await expect(markers(page)).toHaveCount(1);

    // ラベルを cmt にすると、その値が地図に出る。ラベルなしにすると消える
    await pick(page, `layers-label-${i}`, 'cmt');
    await expect(markers(page).first()).toHaveText('ブナ');
    await page.getByTestId(`layers-label-${i}`).click();
    await page.getByTestId(`layers-label-${i}-option-0`).click();
    await expect(markers(page).first()).toHaveText('');
  });

  // 「個別」は用途のあるレイヤでしか選べないので、LAYER-9b で確かめる
  test('LAYER-9 スタイルを単色・カテゴリに変えると、地図の色が変わる', async ({ page }) => {
    await selectFeature(page, 'point');
    await addPoint(page, 450, 300, 'ブナ');
    await addPoint(page, 550, 300, 'スギ');
    await expect(markers(page)).toHaveCount(2);
    await sheetBack(page);
    const i = await layerRowIndex(page, 'ポイント');

    // 単色: 色を変えて保存すると、どのポイントもその色になる
    await page.getByTestId(`layers-style-${i}`).click();
    await page.getByTestId('featurestyle-single-color').click();
    await pickSwatch(page, '#ff0000b3');
    await page.getByTestId('featurestyle-save').click();
    await expect.poll(async () => (await markerColors(page)).map((c) => isNear(c, RED))).toEqual([true, true]);
    // 見本の色は半透明（ネイティブ版と同じ透明度0.7）。不透明にはならない
    expect((await markerColors(page)).every((c) => /^rgba\(.*,0\.7\d*\)$/.test(c))).toBe(true);

    // カテゴリ: cmt の値ごとに色を決めると、値の違うポイントが別の色になる
    await pick(page, 'featurestyle-color-type', 'カテゴリ');
    await pick(page, 'featurestyle-field-name', 'cmt');
    await page.getByTestId('featurestyle-reload').click();
    await expect(page.locator('[data-testid^="featurestyle-value-"]')).toHaveCount(2);
    const values = await page
      .locator('[data-testid^="featurestyle-value-"]')
      .evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value));
    expect([...values].sort()).toEqual(['スギ', 'ブナ']);
    await page.getByTestId(`featurestyle-color-${values.indexOf('ブナ')}`).click();
    await pickSwatch(page, '#0000ffb3');
    await page.getByTestId(`featurestyle-color-${values.indexOf('スギ')}`).click();
    await pickSwatch(page, '#ffff00b3');
    await page.getByTestId('featurestyle-save').click();
    // 左のポイントがブナ、右がスギ
    const byX = async () => {
      const boxes = await markers(page).evaluateAll((els) => els.map((el) => el.getBoundingClientRect().x));
      const colors = await markerColors(page);
      return colors
        .map((c, k) => ({ c, x: boxes[k] }))
        .sort((a, b) => a.x - b.x)
        .map((m) => m.c);
    };
    await expect.poll(async () => (await byX()).map((c, k) => isNear(c, [BLUE, YELLOW][k]))).toEqual([true, true]);
    await waitForPersisted(page, /"colorType\\*":\\*"CATEGORIZED\\*"/);
  });

  // 既定の「ポリゴン」レイヤの用途を植生図にして、区分を2つ足す（区分パレットから）
  const setupVegetation = async (page: Page) => {
    await openLayerSettings(page, 'ポリゴン');
    await pick(page, 'layeredit-purpose', '植生図');
    // 区分と区分コードのフィールドが足される
    const names = page.locator('[data-testid^="layeredit-field-name-"]');
    await expect
      .poll(() => names.evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value)))
      .toEqual(expect.arrayContaining(['区分', '区分コード']));
    await page.getByTestId('layeredit-save').click();
    await okIfShown(page, 1500);
    await waitForPersisted(page, /"toolPalette\\*":\\*"VEGETATION\\*"/);
    await sheetClose(page);

    // ポリゴンのタブに区分のボタンが出る。押すと区分の一覧が開き、その場で区分を足せる
    await selectFeature(page, 'polygon');
    const palette = page.getByTestId('home-palette-FIELD_区分');
    for (const [name, code] of [
      ['ブナ林', 'B'],
      ['スギ植林', 'S'],
    ]) {
      await palette.click();
      await page.getByTestId('home-categorypicker-add').click();
      await page.getByTestId('home-categorypicker-input-name').fill(name);
      await page.getByTestId('home-categorypicker-input-code').fill(code);
      await page.getByTestId('home-categorypicker-ok').click();
      await expect(page.getByTestId('home-categorypicker-cancel')).toBeHidden();
      // 足した区分が選ばれて、ボタンの名前になる
      await expect(palette).toContainText(name);
    }
  };

  test('LAYER-11 ツールパレット（植生図）をレイヤに設定できる', async ({ page }) => {
    await setupVegetation(page);
    // 一覧に、コードつきで並ぶ
    await page.getByTestId('home-palette-FIELD_区分').click();
    await expect(page.getByTestId('home-categorypicker-row-0')).toContainText('B ブナ林');
    await expect(page.getByTestId('home-categorypicker-row-1')).toContainText('S スギ植林');
    await page.getByTestId('home-categorypicker-cancel').click();
    // 用途を「なし」に戻すと、区分のボタンが消える
    await openLayerSettings(page, 'ポリゴン');
    await page.getByTestId('layeredit-purpose').click();
    await page.getByTestId('layeredit-purpose-option-0').click();
    await page.getByTestId('layeredit-save').click();
    await okIfShown(page, 1500);
    await sheetClose(page);
    await expect(page.getByTestId('home-draw-plot-polygon')).toBeVisible();
    await expect(page.getByTestId('home-palette-FIELD_区分')).toHaveCount(0);
  });

  test('DRAW-13 植生図パレットで区分を選んで面を描くと、区分が属性に入り色分けされる', async ({ page }) => {
    await setupVegetation(page);
    // 区分の色を、見分けやすい赤と青にする（レイヤ一覧の色アイコンからスタイル設定へ）
    await openLayers(page);
    const i = await layerRowIndex(page, 'ポリゴン');
    await page.getByTestId(`layers-style-${i}`).click();
    await expect(page.getByTestId('featurestyle-value-0')).toHaveValue('ブナ林');
    await expect(page.getByTestId('featurestyle-value-1')).toHaveValue('スギ植林');
    await page.getByTestId('featurestyle-color-0').click();
    await pickSwatch(page, '#ff0000b3');
    await page.getByTestId('featurestyle-color-1').click();
    await pickSwatch(page, '#0000ffb3');
    await page.getByTestId('featurestyle-save').click();
    await sheetClose(page);

    const palette = page.getByTestId('home-palette-FIELD_区分');
    const before = { left: await averageColor(page, 430, 300), right: await averageColor(page, 570, 300) };
    await palette.click();
    await page.getByTestId('home-categorypicker-row-0').click();
    await expect(palette).toContainText('ブナ林');
    await plotPolygon(page, LEFT);
    await palette.click();
    await page.getByTestId('home-categorypicker-row-1').click();
    await expect(palette).toContainText('スギ植林');
    await plotPolygon(page, RIGHT);
    // 赤と青で塗り分けられている（描く前は地図の地の色）
    const isReddish = ([r, g, b]: number[]) => r > g + 60 && r > b + 60;
    const isBluish = ([r, g, b]: number[]) => b > r + 60 && b > g + 30;
    expect(isReddish(before.left) || isBluish(before.right)).toBe(false);
    await expect.poll(async () => isReddish(await averageColor(page, 430, 300))).toBe(true);
    await expect.poll(async () => isBluish(await averageColor(page, 570, 300))).toBe(true);

    // 区分とコードが属性に入っている
    await openLayers(page);
    await page.getByTestId(`layers-row-${i}`).click();
    await expect(dataRows(page)).toHaveCount(2);
    await page.getByTestId('data-row-0').click();
    await expect(page.getByTestId('dataedit-input-区分')).toContainText('ブナ林');
    await expect(page.getByTestId('dataedit-input-区分コード')).toHaveValue('B');
    await page.getByTestId('dataedit-next').click();
    await expect(page.getByTestId('dataedit-record-number')).toHaveText('2/2');
    await expect(page.getByTestId('dataedit-input-区分')).toContainText('スギ植林');
    await expect(page.getByTestId('dataedit-input-区分コード')).toHaveValue('S');
  });

  /** 編集レイヤ選択の候補行（名前が完全に一致するもの） */
  const layerSelectRow = (page: Page, layerName: string) =>
    page.locator('[data-testid^="home-layerselect-row-"]').filter({ has: page.getByText(layerName, { exact: true }) });
  /** 編集レイヤのチップに出ている名前 */
  const editingLayerName = async (page: Page) => plainText(await page.getByTestId('home-editing-layer').innerText());
  /** 編集レイヤのチップを押して、候補から名前でレイヤを選ぶ */
  const switchEditingLayer = async (page: Page, layerName: string) => {
    await page.getByTestId('home-editing-layer').click();
    await layerSelectRow(page, layerName).click();
    await expect.poll(() => editingLayerName(page)).toBe(layerName);
  };

  test('DRAW-1 編集レイヤを選べる（未選択なら選択を求められる）', async ({ page }) => {
    // ラインのレイヤを2つにして、どちらも編集レイヤでない状態にする
    await importLayerFile(page, '個別色ライン.zip');
    const a = await layerRowIndex(page, 'ライン');
    const b = await layerRowIndex(page, '個別色ライン');
    // 編集レイヤかどうかは、チェックのアイコン（文字）でしか分からない。片方を押してから見比べ、
    // 違っていれば（＝押した方が編集レイヤになった）もう一度押して外す
    const glyph = (k: number) => page.getByTestId(`layers-active-${k}`).innerText();
    await page.getByTestId(`layers-active-${b}`).click();
    await page.waitForTimeout(300);
    if ((await glyph(a)) !== (await glyph(b))) await page.getByTestId(`layers-active-${b}`).click();
    await expect.poll(async () => (await glyph(a)) === (await glyph(b))).toBe(true);
    await sheetClose(page);

    // ラインのタブにすると、編集レイヤは未選択と出る
    await page.getByTestId('home-feature-draw').click();
    await page.getByTestId('home-feature-line').click();
    const chip = page.getByTestId('home-editing-layer');
    await expect(chip).toContainText('レイヤ未選択');

    // 描こうとすると、編集するレイヤを聞かれる。やめれば未選択のまま
    const rows = page.locator('[data-testid^="home-layerselect-row-"]');
    await page.getByTestId('home-draw-plot-line').click();
    await expect(text(page, '編集するレイヤを選択')).toBeVisible();
    await expect(rows).toHaveCount(2);
    await page.getByTestId('home-layerselect-cancel').click();
    await expect(rows).toHaveCount(0);
    await expect(chip).toContainText('レイヤ未選択');
    // 道具は選ばれていないので、地図を押しても描きはじめない
    await page.mouse.click(450, 300);
    await page.waitForTimeout(300);
    await expect(page.getByTestId('home-draw-save')).toBeHidden();

    // 選ぶと、そのレイヤが編集レイヤになる
    await page.getByTestId('home-draw-plot-line').click();
    await layerSelectRow(page, '個別色ライン').click();
    await expect.poll(() => editingLayerName(page)).toBe('個別色ライン');

    // チップから切り替えられる。描いた線は切り替えた先のレイヤに入る
    // （選び終えた時点で「追加」の道具が有効になっていて、切り替えても有効のまま）
    await switchEditingLayer(page, 'ライン');
    for (const [x, y] of [
      [380, 300],
      [480, 320],
      [600, 300],
    ]) {
      await page.mouse.click(x, y);
      await page.waitForTimeout(300);
    }
    await page.getByTestId('home-draw-save').click();
    await expect(page.getByTestId('dataedit-record-number')).toHaveText('1/1');
    await expect(page.getByTestId('dataedit-layername')).toHaveValue('ライン');
  });

  test('DRAW-15 個別色のレイヤで、色と太さを選んで描ける', async ({ page }) => {
    // 色分けが「個別」のラインレイヤ（フィクスチャ）を編集レイヤにする
    await importLayerFile(page, '個別色ライン.zip');
    await sheetClose(page);
    await selectFeature(page, 'line');
    await switchEditingLayer(page, '個別色ライン');

    // スタイルのボタンから、太さ・矢印・色を選ぶ
    await page.getByTestId('home-draw-style').click();
    await page.getByTestId('home-stylesettings-option-pen-thick').click();
    await page.getByTestId('home-stylesettings-tab-arrow').click();
    await page.getByTestId('home-stylesettings-option-arrow-end').click();
    await page.getByTestId('home-stylesettings-tab-color').click();
    await page.locator('button[style*="background-color: rgba(0, 0, 255, 0.7)"]').click();
    await page.getByTestId('home-stylesettings-ok').click();
    await expect(page.getByTestId('home-stylesettings-ok')).toBeHidden();

    await page.getByTestId('home-draw-plot-line').click();
    for (const [x, y] of [
      [380, 300],
      [480, 300],
      [600, 300],
    ]) {
      await page.mouse.click(x, y);
      await page.waitForTimeout(300);
    }
    await page.getByTestId('home-draw-save').click();
    await expect(page.getByTestId('dataedit-record-number')).toHaveText('2/2');
    // 選んだ太さ・色・矢印が、その線の記録に入る
    await waitForPersisted(page, /"_strokeWidth\\*":10,\\*"_strokeColor\\*":\\*"rgba\(0,0,255,0\.7\)\\*"/);
    await waitForPersisted(page, /"_strokeStyle\\*":\\*"ARROW_END\\*"/);
    // 地図の線が青になる（選択中は黄色で強調されるので、編集画面を閉じてから見る）
    await sheetClose(page);
    const isBluish = ([r, g, b]: number[]) => b > r + 60 && b > g + 60;
    await expect.poll(async () => isBluish(await averageColor(page, 430, 300, 4))).toBe(true);
  });

  test('LAYER-9b DRAW-15b 植生図のレイヤのスタイルを個別にすると、色を選んで面を描ける', async ({ page }) => {
    await setupVegetation(page);
    await openLayers(page);
    const i = await layerRowIndex(page, 'ポリゴン');
    await page.getByTestId(`layers-style-${i}`).click();
    await pick(page, 'featurestyle-color-type', '個別');
    await page.getByTestId('featurestyle-save').click();
    await sheetClose(page);
    // 区分のボタンは消え、スタイルのボタンが出る（植生図は色だけ）
    await expect(page.getByTestId('home-palette-FIELD_区分')).toHaveCount(0);
    await page.getByTestId('home-draw-style').click();
    await expect(page.getByTestId('home-stylesettings-tab-width')).toHaveCount(0);
    await page.locator('button[style*="background-color: rgba(0, 0, 255, 0.7)"]').click();
    await page.getByTestId('home-stylesettings-ok').click();
    await plotPolygon(page, LEFT);
    const isBluish = ([r, g, b]: number[]) => b > r + 60 && b > g + 60;
    await expect.poll(async () => isBluish(await averageColor(page, 430, 300))).toBe(true);
    await waitForPersisted(page, /"_strokeColor\\*":\\*"rgba\(0,0,255,0\.7\)\\*"/);
  });

  test('DATA-4 表（TABLE）と参照（子の記録）を入力できる', async ({ page }) => {
    // レイヤ設定を開いた状態で、形式を指定してフィールドを足す。足した行の番号を返す
    const addField = async (name: string, format: string) => {
      const n = await page.locator('[data-testid^="layeredit-field-name-"]').count();
      await page.getByTestId('layeredit-field-add').click();
      await page.getByTestId(`layeredit-field-name-${n}`).fill(name);
      await pick(page, `layeredit-field-format-${n}`, format);
      return n;
    };

    // 子の記録を入れるレイヤ（位置情報なし）を作る。親を指す欄を持たせる
    await openLayers(page);
    await page.getByTestId('layers-add').click();
    await page.getByTestId('layeredit-name').fill('個体');
    await pick(page, 'layeredit-type', '位置情報なし');
    await addField('地点', '文字列');
    await addField('樹種', '文字列');
    await page.getByTestId('layeredit-save').click();
    await okIfShown(page, 1500);
    await sheetBack(page);

    // ポイントに、表（樹種・胸高直径の2列）と、子のレイヤへの参照を足す
    const i = await layerRowIndex(page, 'ポイント');
    await page.getByTestId(`layers-settings-${i}`).click();
    const t = await addField('毎木', 'テーブル');
    await page.getByTestId(`layeredit-field-value-${t}`).click();
    await page.getByTestId('fieldedit-add').click();
    await page.getByTestId('fieldedit-value-0').fill('樹種');
    await page.getByTestId('fieldedit-add').click();
    await page.getByTestId('fieldedit-value-1').fill('胸高直径');
    await sheetBack(page);
    await expect(page.getByTestId('layeredit-save')).toBeVisible();
    const r = await addField('個体一覧', '参照');
    await page.getByTestId(`layeredit-field-value-${r}`).click();
    await pick(page, 'fieldedit-ref-layer', '個体');
    await pick(page, 'fieldedit-ref-field', '地点');
    await pick(page, 'fieldedit-primary-field', '_id');
    await sheetBack(page);
    await expect(page.getByTestId('layeredit-save')).toBeVisible();
    await page.getByTestId('layeredit-save').click();
    await okIfShown(page, 1500);
    await sheetBack(page);

    await page.getByTestId(`layers-row-${await layerRowIndex(page, 'ポイント')}`).click();
    await page.getByTestId('data-add').click();

    // 表: 行を足して値を入れる（足した行は先頭に入る）
    const cell = (row: number, col: number) => page.getByTestId(`dataedit-table-input-毎木-${row}-${col}`);
    await page.getByTestId('dataedit-table-add-毎木').click();
    await cell(0, 0).fill('スギ');
    await cell(0, 1).fill('32');
    await page.getByTestId('dataedit-table-add-毎木').click();
    await expect(cell(1, 0)).toHaveValue('スギ');
    await cell(0, 0).fill('ヒノキ');
    await cell(0, 1).fill('18');
    await page.getByTestId('dataedit-save').click();
    await expect(page.getByTestId('data-export')).toBeVisible();
    await expect(dataRows(page)).toHaveCount(1);

    // 開き直しても表の値が残っている
    await page.getByTestId('data-row-0').click();
    await expect(cell(0, 0)).toHaveValue('ヒノキ');
    await expect(cell(0, 1)).toHaveValue('18');
    await expect(cell(1, 0)).toHaveValue('スギ');
    await expect(cell(1, 1)).toHaveValue('32');

    // 参照: ＋で子の記録の編集画面が開く
    await page.getByTestId('dataedit-reference-add-個体一覧').click();
    await expect(page.getByTestId('dataedit-layername')).toHaveValue('個体');
    await page.getByTestId('dataedit-input-樹種').fill('ブナ');
    await page.getByTestId('dataedit-save').click();
    // 子のレイヤは編集レイヤにしていないので、切り替えるかを聞かれる
    await expect(page.getByTestId('dialog-message')).toHaveText('編集モードに切り替えますか？');
    await dialogButton(page, 'Yes').click();
    // 親の編集画面に戻り、子の記録が一覧に出る。押すと子の記録が開く
    const childRows = page.locator('[data-testid^="dataedit-reference-row-個体一覧-"]');
    await expect(childRows).toHaveCount(1);
    await expect(childRows.first()).toContainText('ブナ');
    await expect(cell(0, 0)).toHaveValue('ヒノキ');
    await childRows.first().click();
    await expect(page.getByTestId('dataedit-layername')).toHaveValue('個体');
    await expect(page.getByTestId('dataedit-input-樹種')).toHaveValue('ブナ');
    // 親を指す欄には、親の記録のIDが入っている
    await expect(page.getByTestId('dataedit-input-地点')).toHaveValue(/^[0-9A-Z]{26}$/);
    await sheetBack(page);

    // もう1件足すと2件になる（子のレイヤは編集レイヤになったので、もう聞かれない）
    await page.getByTestId('dataedit-reference-add-個体一覧').click();
    await expect(page.getByTestId('dataedit-layername')).toHaveValue('個体');
    await page.getByTestId('dataedit-input-樹種').fill('ミズナラ');
    await page.getByTestId('dataedit-save').click();
    await expect(childRows).toHaveCount(2);
    await expect(page.getByTestId('dataedit-layername')).toHaveValue('ポイント');
  });
});
