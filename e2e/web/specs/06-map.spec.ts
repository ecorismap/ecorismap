import { expect, test } from '@playwright/test';
import { attribution, longPressMap, openApp } from '../support/app';

test.describe('2. 地図表示・基本操作 / 7. 計測・3D', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  test('MAP-1 ＋／−ボタンで拡大縮小でき、ズームレベル表示が変わる', async ({ page }) => {
    const level = page.getByTestId('home-zoom-level');
    await expect(level).toHaveText('15');
    await page.locator('.maplibregl-ctrl-zoom-in').click();
    await expect(level).toHaveText('16');
    await page.locator('.maplibregl-ctrl-zoom-out').click();
    await expect(level).toHaveText('15');
  });

  test('MAP-1b 地図をドラッグで移動できる', async ({ page }) => {
    await longPressMap(page, 300, 350);
    const before = await page.getByTestId('home-poi-coordinate').innerText();
    await page.mouse.click(500, 200); // ポップアップを閉じる
    await page.mouse.move(300, 350);
    await page.mouse.down();
    await page.mouse.move(450, 450, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(800);
    await longPressMap(page, 300, 350);
    await expect(page.getByTestId('home-poi-coordinate')).not.toHaveText(before);
  });

  test('MAP-4 長押しで標高・座標のポップアップが出る', async ({ page }) => {
    await longPressMap(page, 300, 350);
    await expect(page.getByTestId('home-poi-coordinate')).toHaveText(/^\d+\.\d+, \d+\.\d+$/);
    await expect(page.getByTestId('home-poi-elevation')).toHaveText(/標高 -?\d+(\.\d+)? m/, { timeout: 20_000 });
    for (const id of ['home-poi-measure', 'home-poi-viewshed', 'home-poi-vista', 'home-poi-google-maps']) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
  });

  test('MAP-6 出典表示が、表示中の地図のものになっている', async ({ page }) => {
    await expect(attribution(page)).toContainText('国土地理院');
  });

  test('ANLY-1 長押しメニューから距離測定を始め、2点目で距離が出る', async ({ page }) => {
    await longPressMap(page, 300, 350);
    await page.getByTestId('home-poi-measure').click();
    await expect(page.getByTestId('home-measure-text')).toHaveText('地図をタップして地点を選択');
    await page.mouse.click(450, 450);
    await expect(page.getByTestId('home-measure-text')).toHaveText(/^距離 [\d.,]+ k?m$/);
    await page.getByTestId('home-measure-close').click();
    await expect(page.getByTestId('home-measure-text')).toBeHidden();
  });

  test('ANLY-3 3D表示に切り替えられ、2Dに戻せる', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.getByTestId('home-terrain').click();
    // 3Dでは標高データの出典が加わる
    await expect(attribution(page)).toContainText('Mapterhorn', { timeout: 30_000 });
    await page.getByTestId('home-terrain').click();
    await expect(attribution(page)).not.toContainText('Mapterhorn', { timeout: 30_000 });
    expect(errors).toEqual([]);
  });
});
