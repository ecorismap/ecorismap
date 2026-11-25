import { execFileSync } from 'child_process';
import fs from 'fs';
import { expect, test } from '@playwright/test';
import { dataRows, dialogButton, importLayerFile, layerNames, layerRowIndex, openApp, openLayers } from '../support/app';

test.describe('12. ファイルの入出力', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  test('FILE-1 GeoJSONを取り込むと、レイヤと記録ができる', async ({ page }) => {
    await importLayerFile(page, '植物調査.geojson');
    expect(await layerNames(page)).toContain('植物調査.geojson');
    const i = await layerRowIndex(page, '植物調査.geojson');
    await page.getByTestId(`layers-row-${i}`).click();
    await expect(dataRows(page)).toHaveCount(8);
    // 属性が列になっている
    await expect(page.getByTestId('data-sort-種名')).toBeVisible();
    await expect(page.getByText('ブナ', { exact: true }).first()).toBeVisible();
  });

  test('FILE-4 エクスポート形式のZIP（レイヤ設定＋データ）を取り込める', async ({ page }) => {
    await importLayerFile(page, '植物調査.zip');
    expect(await layerNames(page)).toContain('植物調査');
    const i = await layerRowIndex(page, '植物調査');
    await page.getByTestId(`layers-row-${i}`).click();
    await expect(dataRows(page)).toHaveCount(8);
  });

  test('FILE-1b ライン・ポリゴンのGeoJSONを取り込める', async ({ page }) => {
    await importLayerFile(page, '調査ルート.geojson');
    await page.getByTestId('sheet-close').click();
    await importLayerFile(page, '植生区画.geojson');
    const names = await layerNames(page);
    expect(names).toContain('調査ルート.geojson');
    expect(names).toContain('植生区画.geojson');
    let i = await layerRowIndex(page, '調査ルート.geojson');
    await page.getByTestId(`layers-row-${i}`).click();
    await expect(dataRows(page)).toHaveCount(2);
    await page.getByTestId('sheet-back').click();
    i = await layerRowIndex(page, '植生区画.geojson');
    await page.getByTestId(`layers-row-${i}`).click();
    await expect(dataRows(page)).toHaveCount(4);
  });

  test('FILE-6 データ一覧からエクスポートでき、内容が合っている', async ({ page }) => {
    await importLayerFile(page, '植物調査.zip');
    const i = await layerRowIndex(page, '植物調査');
    await page.getByTestId(`layers-row-${i}`).click();
    await page.getByTestId('data-check-all').click();
    const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
    await page.getByTestId('data-export').click();
    // 開始前に件数の確認が出る
    await expect(page.getByTestId('dialog-message')).toHaveText('8件のデータをエクスポートします。');
    await dialogButton(page, 'OK').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
    const file = await download.path();
    expect(fs.statSync(file).size).toBeGreaterThan(500);
    // ZIPの中に、レイヤ設定とデータ（GeoJSON・CSV）が入っている
    const entries = execFileSync('unzip', ['-Z1', file], { encoding: 'utf8' });
    expect(entries).toMatch(/\.json/);
    expect(entries).toMatch(/\.geojson/);
    expect(entries).toMatch(/\.csv/);
  });

  test('ERR-1 対応していない内容のファイルを取り込むと、エラーが出てレイヤは増えない', async ({ page }) => {
    await openLayers(page);
    const before = await layerNames(page);
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('layers-import').click()]);
    await chooser.setFiles({ name: 'broken.geojson', mimeType: 'application/geo+json', buffer: Buffer.from('{"type": "Feat') });
    await expect(page.getByTestId('dialog-message')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('dialog-message')).not.toHaveText('ファイルをインポートしました。');
    await page.getByTestId('dialog-button-0').click();
    expect(await layerNames(page)).toEqual(before);
  });
});
