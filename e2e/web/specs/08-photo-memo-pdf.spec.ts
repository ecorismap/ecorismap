import { expect, test } from '@playwright/test';
import { chooseFile, dataRows, fixture, openApp, openLayerData } from '../support/app';

test.describe('写真・マップメモ・PDF', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  test('PHOTO-A1 PHOTO-A5 写真をファイルから追加して保存でき、開き直すと拡大表示できる', async ({ page }) => {
    await openLayerData(page, 'ポイント');
    await page.getByTestId('data-add').click();
    await chooseFile(page, page.getByTestId('dataedit-photo-library'), fixture('photo1.jpg'));
    await expect(page.getByTestId('dataedit-photo-thumb-0')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('dataedit-save').click();
    await expect(dataRows(page)).toHaveCount(1);

    await page.getByTestId('data-row-0').click();
    await expect(page.getByTestId('dataedit-photo-thumb-0')).toBeVisible();
    await page.getByTestId('dataedit-photo-thumb-0').click();
    await expect(page.getByTestId('photo-view-close')).toBeVisible();
    await page.getByTestId('photo-view-close').click();
    await expect(page.getByTestId('photo-view-close')).toBeHidden();
  });

  test('MEMO-1 MEMO-5 ペンで描いた線が残る。元に戻すで消える', async ({ page }) => {
    await page.getByTestId('home-feature-draw').click();
    await page.getByTestId('home-feature-memo').click();
    await page.getByTestId('home-memo-pen').click();
    const draw = async (y: number) => {
      await page.mouse.move(200, y);
      await page.mouse.down();
      await page.mouse.move(300, y + 40, { steps: 8 });
      await page.mouse.move(400, y, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(500);
    };
    await draw(300);
    await draw(400);
    // 1本取り消す
    await page.getByTestId('home-draw-undo').click();
    await page.waitForTimeout(500);
    await openLayerData(page, 'メモ');
    await expect(dataRows(page)).toHaveCount(1);
  });

  test('PDF-1 設定からPDF出力の画面を開き、用紙の設定を開いて閉じ、戻れる', async ({ page }) => {
    await page.getByTestId('home-settings').click();
    await page.getByTestId('settings-pdf').click();
    await expect(page.getByTestId('home-pdf-export')).toBeVisible();
    await page.getByTestId('home-pdf-settings').click();
    await expect(page.getByTestId('home-pdfsettings-paper-size')).toBeVisible();
    await expect(page.getByTestId('home-pdfsettings-orientation')).toBeVisible();
    await expect(page.getByTestId('home-pdfsettings-scale')).toBeVisible();
    await page.getByTestId('home-pdfsettings-ok').click();
    await expect(page.getByTestId('home-pdfsettings-ok')).toBeHidden();
    await page.getByTestId('home-pdf-back').click();
    await expect(page.getByTestId('home-pdf-export')).toBeHidden();
    await expect(page.getByTestId('home-layers')).toBeVisible();
  });
});
