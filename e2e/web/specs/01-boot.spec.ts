import { expect, test } from '@playwright/test';
import { acceptTerms, dialogButton, openApp, reloadApp, TERMS_TEXT, text, waitForPersisted } from '../support/app';

test.describe('1. 起動・共通', () => {
  test('BOOT-1 初回起動で利用規約の確認が出て、OKで地図画面になる', async ({ page }) => {
    await openApp(page, { acceptTerms: false });
    await expect(text(page, TERMS_TEXT)).toBeVisible();
    await dialogButton(page, 'OK').click();
    await expect(text(page, TERMS_TEXT)).toBeHidden();
    // 地図（MapLibre）が描かれている
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
  });

  test('BOOT-3 地図画面のボタン群が出る', async ({ page }) => {
    await openApp(page);
    for (const id of ['home-maps', 'home-layers', 'home-feature-draw', 'home-settings']) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
    // 軌跡の記録はネイティブだけ
    await expect(page.getByTestId('home-track')).toHaveCount(0);
  });

  test('BOOT-6 再読み込みしても、利用規約への同意が残っている', async ({ page }) => {
    await openApp(page);
    await waitForPersisted(page, /agreedTermsVersion\\+":\\+"[^\\]/);
    await reloadApp(page);
    await page.waitForTimeout(3000);
    await expect(text(page, TERMS_TEXT)).toBeHidden();
  });

  test('BOOT-1b 利用規約をCancelすると、確認が出たままになる', async ({ page }) => {
    await openApp(page, { acceptTerms: false });
    await dialogButton(page, 'Cancel').click();
    await page.waitForTimeout(1000);
    await expect(text(page, TERMS_TEXT)).toBeVisible();
    await acceptTerms(page);
  });
});
