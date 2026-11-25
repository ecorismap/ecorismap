import { expect, test } from '@playwright/test';
import { dataRows, importLayerFile, layerNames, layerRowIndex, openApp, openLayers, plainText } from '../support/app';

const firstColumn = async (page: import('@playwright/test').Page) => (await dataRows(page).allInnerTexts()).map(plainText);

test.describe('11. データ一覧（並べ替え・絞り込み） / 12. 取り込み', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  test('DATA-7 一覧の並べ替え・絞り込みができる', async ({ page }) => {
    await importLayerFile(page, '植物調査.zip');
    const i = await layerRowIndex(page, '植物調査');
    await page.getByTestId(`layers-row-${i}`).click();
    await expect(dataRows(page)).toHaveCount(8);

    // 並べ替え: 見出しを押すたびに昇順・降順が入れ替わる
    await page.getByTestId('data-sort-No').click();
    const once = await firstColumn(page);
    await page.getByTestId('data-sort-No').click();
    const twice = await firstColumn(page);
    expect(once).not.toEqual(twice);
    expect([...once].reverse()).toEqual(twice);

    // 絞り込み
    await page.getByTestId('data-filter').click();
    await page.getByTestId('data-filter-field-種名').click();
    await page.getByTestId('data-filter-input').fill('ブナ');
    await page.getByTestId('data-filter-ok').click();
    await expect(dataRows(page)).toHaveCount(1);
    await expect(page.getByTestId('data-filter-count')).toContainText('1');
    await page.getByTestId('data-filter-clear').click();
    await expect(dataRows(page)).toHaveCount(8);
  });

  test('FILE-3 CSVを取り込める（緯度経度の列から位置ができる）', async ({ page }) => {
    await openLayers(page);
    const csv = ['name,lat,lon,memo', 'A,38.25,140.84,first', 'B,38.26,140.85,second', 'C,38.27,140.86,third'].join('\n');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('layers-import').click()]);
    await chooser.setFiles({ name: 'points.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await expect(page.getByTestId('dialog-message')).toHaveText('ファイルをインポートしました。', { timeout: 30_000 });
    await page.getByTestId('dialog-button-0').click();
    expect(await layerNames(page)).toContain('points.csv');
    const i = await layerRowIndex(page, 'points.csv');
    await page.getByTestId(`layers-row-${i}`).click();
    await expect(dataRows(page)).toHaveCount(3);
    await page.getByTestId('data-row-0').click();
    await expect(page.getByTestId('dataedit-coords-latitude-decimal')).toHaveValue(/^38\.2/);
  });

  test('FILE-2 GPXを取り込める', async ({ page }) => {
    await openLayers(page);
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="e2e" xmlns="http://www.topografix.com/GPX/1/1">
  <wpt lat="38.25" lon="140.84"><name>P1</name></wpt>
  <wpt lat="38.26" lon="140.85"><name>P2</name></wpt>
</gpx>`;
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('layers-import').click()]);
    await chooser.setFiles({ name: 'waypoints.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from(gpx) });
    await expect(page.getByTestId('dialog-message')).toHaveText('ファイルをインポートしました。', { timeout: 30_000 });
    await page.getByTestId('dialog-button-0').click();
    const names = await layerNames(page);
    const name = names.find((n) => n.startsWith('waypoints'));
    expect(name).toBeTruthy();
    const i = await layerRowIndex(page, name as string);
    await page.getByTestId(`layers-row-${i}`).click();
    await expect(dataRows(page)).toHaveCount(2);
  });
});
