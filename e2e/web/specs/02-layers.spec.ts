import { expect, test } from '@playwright/test';
import { dialogButton, layerNames, layerRowIndex, openApp, openLayers, openLayerSettings, sheetBack } from '../support/app';

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
});
