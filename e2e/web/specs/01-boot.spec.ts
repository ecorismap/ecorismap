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

  test('BOOT-2 更新情報が出て、OKで閉じる。次回は出ない', async ({ page }) => {
    await openApp(page);
    await waitForPersisted(page, /agreedTermsVersion\\+":\\+"[^\\]/);
    // 端末内の保存を「前のバージョンまで見た」状態に書き換える。
    // 起動直後の書き出しが続いている間に書き換えると上書きされるので、落ち着くまで待つ
    const persisted = () =>
      page.evaluate(async () => {
        const tabId = sessionStorage.getItem('ecorismap-redux-tab-id');
        return new Promise<string>((resolve) => {
          const req = indexedDB.open('ecorismapReduxPersist-' + tabId);
          req.onsuccess = () => {
            const get = req.result.transaction('keyvalue').objectStore('keyvalue').get('persist:root');
            get.onsuccess = () => {
              resolve(get.result?.value ?? '');
              req.result.close();
            };
          };
        });
      });
    await expect(async () => {
      const a = await persisted();
      await page.waitForTimeout(3000);
      expect(await persisted()).toBe(a);
    }).toPass({ timeout: 60_000 });
    await page.evaluate(async () => {
      const tabId = sessionStorage.getItem('ecorismap-redux-tab-id');
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('ecorismapReduxPersist-' + tabId);
        req.onsuccess = () => {
          const store = req.result.transaction('keyvalue', 'readwrite').objectStore('keyvalue');
          const get = store.get('persist:root');
          get.onsuccess = () => {
            const row = get.result;
            const root = JSON.parse(row.value);
            const settings = JSON.parse(root.settings);
            settings.lastSeenVersion = '0.0.0';
            root.settings = JSON.stringify(settings);
            const put = store.put({ ...row, value: JSON.stringify(root) });
            put.onsuccess = () => {
              req.result.close();
              resolve();
            };
            put.onerror = () => reject(put.error);
          };
        };
      });
    });

    await reloadApp(page);
    await expect(page.getByTestId('home-updateinfo-version')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('home-updateinfo-close').click();
    await expect(page.getByTestId('home-updateinfo-version')).toBeHidden();

    // 次回は出ない
    await waitForPersisted(page, /lastSeenVersion\\+":\\+"(?!0\.0\.0)[^\\]/);
    await reloadApp(page);
    await page.waitForTimeout(3000);
    await expect(page.getByTestId('home-updateinfo-version')).toBeHidden();
  });
});
