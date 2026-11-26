import { expect, test } from '@playwright/test';
import {
  chooseFile,
  dataRows,
  dialogButton,
  fixture,
  layerNames,
  layerRowIndex,
  okIfShown,
  openApp,
  openLayers,
  openLayerSettings,
  sheetBack,
  text,
} from '../support/app';

test.describe('10. レイヤ', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  test('LAYER-2 レイヤを追加できる', async ({ page }) => {
    await openLayers(page);
    await page.getByTestId('layers-add').click();
    await page.getByTestId('layeredit-name').fill('テスト点');
    await page.getByTestId('layeredit-save').click();
    await sheetBack(page);
    await expect.poll(() => layerNames(page)).toContain('テスト点');
  });

  test('LAYER-4 レイヤ名を変えて保存できる。削除できる', async ({ page }) => {
    await openLayerSettings(page, 'ポイント');
    await page.getByTestId('layeredit-name').fill('調査地点');
    await page.getByTestId('layeredit-save').click();
    await sheetBack(page);
    await expect.poll(() => layerNames(page)).toContain('調査地点');
    expect(await layerNames(page)).not.toContain('ポイント');

    const i = await layerRowIndex(page, '調査地点');
    await page.getByTestId(`layers-settings-${i}`).click();
    await page.getByTestId('layeredit-delete').click();
    await dialogButton(page, 'Yes').click();
    await expect.poll(() => layerNames(page)).not.toContain('調査地点');
  });

  test('LAYER-5 フィールドを追加して保存すると、データ編集画面に欄が出る', async ({ page }) => {
    await openLayerSettings(page, 'ポイント');
    const before = await page.locator('[data-testid^="layeredit-field-name-"]').count();
    await page.getByTestId('layeredit-field-add').click();
    await expect(page.locator('[data-testid^="layeredit-field-name-"]')).toHaveCount(before + 1);
    await page.getByTestId(`layeredit-field-name-${before}`).fill('樹高');
    await page.getByTestId('layeredit-save').click();
    await sheetBack(page);

    const i = await layerRowIndex(page, 'ポイント');
    await page.getByTestId(`layers-row-${i}`).click();
    await page.getByTestId('data-add').click();
    await expect(page.getByTestId('dataedit-input-樹高')).toBeVisible();
  });

  test('LAYER-3 グループを作成できる', async ({ page }) => {
    await openLayers(page);
    await page.getByTestId('layers-add-group').click();
    await page.getByTestId('textdialog-input').fill('調査A');
    await page.getByTestId('textdialog-ok').click();
    await expect.poll(() => layerNames(page)).toContain('調査A');
  });

  test('LAYER-3b 上下ボタンでレイヤを並べ替えられる', async ({ page }) => {
    await openLayers(page);
    const before = await layerNames(page);
    await page.getByTestId('layers-down-0').click();
    await expect.poll(() => layerNames(page)).toEqual([before[1], before[0], ...before.slice(2)]);
  });

  // レイヤ設定を開いた状態で、形式を指定してフィールドを足す。足した行の番号を返す
  const addField = async (page: import('@playwright/test').Page, name: string, format: string) => {
    const n = await page.locator('[data-testid^="layeredit-field-name-"]').count();
    await page.getByTestId('layeredit-field-add').click();
    await page.getByTestId(`layeredit-field-name-${n}`).fill(name);
    await page.getByTestId(`layeredit-field-format-${n}`).click();
    await text(page, format).click();
    return n;
  };
  // レイヤ設定を保存して、そのレイヤのデータ一覧を開く
  const saveAndOpenData = async (page: import('@playwright/test').Page, layerName: string) => {
    await page.getByTestId('layeredit-save').click();
    await okIfShown(page, 1500);
    await sheetBack(page);
    const i = await layerRowIndex(page, layerName);
    await page.getByTestId(`layers-row-${i}`).click();
    await expect(page.getByTestId('data-export')).toBeVisible();
  };

  test('LAYER-6 属性名を変えても値が残る', async ({ page }) => {
    await openLayers(page);
    let i = await layerRowIndex(page, 'ポイント');
    await page.getByTestId(`layers-row-${i}`).click();
    await page.getByTestId('data-add').click();
    await page.getByTestId('dataedit-input-cmt').fill('林縁で確認');
    await page.getByTestId('dataedit-save').click();
    await expect(dataRows(page)).toHaveCount(1);
    await sheetBack(page);

    // cmt を 備考 に変える
    i = await layerRowIndex(page, 'ポイント');
    await page.getByTestId(`layers-settings-${i}`).click();
    const names = page.locator('[data-testid^="layeredit-field-name-"]');
    await expect(names.first()).toBeVisible();
    const values = await names.evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value));
    const k = values.indexOf('cmt');
    expect(k).toBeGreaterThanOrEqual(0);
    await page.getByTestId(`layeredit-field-name-${k}`).fill('備考');
    await saveAndOpenData(page, 'ポイント');

    await page.getByTestId('data-row-0').click();
    await expect(page.getByTestId('dataedit-input-備考')).toHaveValue('林縁で確認');
    await expect(page.getByTestId('dataedit-input-cmt')).toHaveCount(0);
  });

  test('LAYER-7 リストの選択肢を設定すると、データ編集で選べる', async ({ page }) => {
    await openLayerSettings(page, 'ポイント');
    const n = await addField(page, '樹種', 'リスト');
    await page.getByTestId(`layeredit-field-value-${n}`).click();
    await page.getByTestId('fieldedit-add').click();
    await page.getByTestId('fieldedit-value-0').fill('スギ');
    await page.getByTestId('fieldedit-add').click();
    await page.getByTestId('fieldedit-value-1').fill('ヒノキ');
    await sheetBack(page);
    await expect(page.getByTestId('layeredit-save')).toBeVisible();
    await saveAndOpenData(page, 'ポイント');

    await page.getByTestId('data-add').click();
    await page.getByTestId('dataedit-input-樹種').click();
    await expect(page.getByTestId('dataedit-option-樹種-0')).toContainText('スギ');
    await page.getByTestId('dataedit-option-樹種-1').click();
    await page.getByTestId('dataedit-save').click();
    await expect(dataRows(page)).toHaveCount(1);
    await expect(page.getByText('ヒノキ', { exact: true }).first()).toBeVisible();
  });

  test('LAYER-8 DATA-5 辞書CSVを取り込むと、データ編集で候補から選べる', async ({ page }) => {
    await openLayerSettings(page, 'ポイント');
    const n = await addField(page, '種名', '文字列-辞書');
    await page.getByTestId(`layeredit-field-value-${n}`).click();
    await chooseFile(page, page.getByTestId('fieldedit-import-dictionary'), fixture('species.csv'));
    await okIfShown(page, 3000);
    await sheetBack(page);
    await expect(page.getByTestId('layeredit-save')).toBeVisible();
    await saveAndOpenData(page, 'ポイント');

    await page.getByTestId('data-add').click();
    await page.getByTestId('dataedit-input-種名').pressSequentially('ミ');
    await expect(page.getByTestId('dataedit-input-種名-suggestion-0')).toHaveText('ミズナラ');
    await page.getByTestId('dataedit-input-種名-suggestion-0').click();
    await expect(page.getByTestId('dataedit-input-種名')).toHaveValue('ミズナラ');
  });
});
