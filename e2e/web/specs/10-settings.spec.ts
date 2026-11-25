import { expect, test } from '@playwright/test';
import {
  chooseFile,
  dataRows,
  dialogButton,
  importLayerFile,
  layerNames,
  okIfShown,
  openApp,
  openLayerData,
  openLayers,
  sheetClose,
  text,
} from '../support/app';

test.describe('13. 設定', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  test('SET-1 設定画面が開き、各項目が出る', async ({ page }) => {
    await page.getByTestId('home-settings').click();
    for (const id of [
      'settings-file-open',
      'settings-file-save',
      'settings-pdf',
      'settings-clear-data',
      'settings-clear-cache',
      'settings-language',
      'settings-manual',
      'settings-oss-license',
      'settings-version',
    ]) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
    // ネイティブだけの項目は出ない
    for (const id of ['settings-gps', 'settings-proximity-alert', 'settings-backup-restore']) {
      await expect(page.getByTestId(id)).toHaveCount(0);
    }
  });

  test('SET-2 データをクリアすると、初期のレイヤに戻る', async ({ page }) => {
    await openLayers(page);
    const initial = await layerNames(page);
    await importLayerFile(page, '植物調査.zip');
    expect(await layerNames(page)).toContain('植物調査');
    await sheetClose(page);

    await page.getByTestId('home-settings').click();
    await page.getByTestId('settings-clear-data').click();
    await dialogButton(page, 'Yes').click();
    await okIfShown(page, 5000);
    await openLayers(page);
    await expect.poll(() => layerNames(page)).toEqual(initial);
  });

  test('FILE-9 設定の「保存」で全データを保存し、「開く」で元どおりに戻る', async ({ page }, testInfo) => {
    await importLayerFile(page, '植物調査.zip');
    await sheetClose(page);

    // 保存
    await page.getByTestId('home-settings').click();
    await page.getByTestId('settings-file-save').click();
    // 保存先の選択（デバイスに保存 / Google Drive）。Webはそのままダウンロードになる
    const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
    await text(page, 'デバイスに保存').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^ecorismap_.*\.zip$/);
    // 取り込みは拡張子で形式を見分けるので、元の名前で保存し直す
    const saved = testInfo.outputPath(download.suggestedFilename());
    await download.saveAs(saved);
    await expect(page.getByTestId('dialog-message')).toHaveText('ファイルを保存しました。');
    await dialogButton(page, 'OK').click();
    await sheetClose(page);

    // クリア
    await page.getByTestId('home-settings').click();
    await page.getByTestId('settings-clear-data').click();
    await dialogButton(page, 'Yes').click();
    await okIfShown(page, 5000);
    await openLayers(page);
    await expect.poll(() => layerNames(page)).not.toContain('植物調査');
    await sheetClose(page);

    // 開く
    await page.getByTestId('home-settings').click();
    await page.getByTestId('settings-file-open').click();
    await page.locator('[data-testid^="settings-storage-option-"]').first().click();
    // 上書きの確認にYesと答えると、ファイル選択が開く
    await expect(page.getByTestId('dialog-message')).toContainText('現在のデータと設定は上書きされます');
    await chooseFile(page, dialogButton(page, 'Yes'), saved);
    await okIfShown(page, 15_000);
    await openLayerData(page, '植物調査');
    await expect(dataRows(page)).toHaveCount(8);
  });

  test('BOOT-4 言語を英語に切り替えると表示が英語になり、日本語に戻せる', async ({ page }) => {
    await page.getByTestId('home-settings').click();
    await page.getByTestId('settings-language').click();
    await page.getByTestId('settings-language-option-en').click();
    await expect(page.getByTestId('home-layers')).toContainText(/layers/i, { timeout: 60_000 });
    await page.getByTestId('home-settings').click();
    await page.getByTestId('settings-language').click();
    await page.getByTestId('settings-language-option-ja').click();
    await expect(page.getByTestId('home-layers')).toContainText('レイヤ', { timeout: 60_000 });
  });
});
