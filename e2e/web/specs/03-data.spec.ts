import { expect, test } from '@playwright/test';
import { dataRows, dialogButton, openApp, openLayerData, plainText, sheetBack } from '../support/app';

test.describe('11. データ一覧・データ編集', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await openLayerData(page, 'ポイント');
  });

  const addRecord = async (page: import('@playwright/test').Page, cmt: string) => {
    await page.getByTestId('data-add').click();
    await page.getByTestId('dataedit-input-cmt').fill(cmt);
    // 保存するとデータ一覧へ戻る
    await page.getByTestId('dataedit-save').click();
    await expect(page.getByTestId('data-export')).toBeVisible();
  };

  test('DATA-1 DATA-2 記録を追加し、文字列を入力して保存できる', async ({ page }) => {
    await expect(dataRows(page)).toHaveCount(0);
    await addRecord(page, '林縁で確認');
    await expect(dataRows(page)).toHaveCount(1);
    await expect(page.getByTestId('data-cell-0-2')).toHaveText('林縁で確認');
    // 開き直しても値が入っている
    await page.getByTestId('data-row-0').click();
    await expect(page.getByTestId('dataedit-input-cmt')).toHaveValue('林縁で確認');
  });

  test('DATA-3 連番が最大値＋1で入る', async ({ page }) => {
    await addRecord(page, 'a');
    await addRecord(page, 'b');
    await expect(dataRows(page)).toHaveCount(2);
    const names = await dataRows(page).allInnerTexts();
    expect(names.map(plainText).sort()).toEqual(['1', '2']);
  });

  test('DATA-8 一覧でチェックした記録を削除できる', async ({ page }) => {
    await addRecord(page, 'a');
    await addRecord(page, 'b');
    await expect(dataRows(page)).toHaveCount(2);
    await page.getByTestId('data-check-0').click();
    await page.getByTestId('data-delete').click();
    await dialogButton(page, 'Yes').click();
    await expect(dataRows(page)).toHaveCount(1);
  });

  test('DATA-9 記録を複製できる。前後の記録へ移動できる', async ({ page }) => {
    await addRecord(page, '元の記録');
    await page.getByTestId('data-row-0').click();
    await page.getByTestId('dataedit-copy').click();
    await dialogButton(page, 'Yes').click();
    // 「複製しました」の通知を閉じる
    await dialogButton(page, 'OK').click();
    await expect(page.getByTestId('dataedit-record-number')).toHaveText('2/2');
    await expect(page.getByTestId('dataedit-input-cmt')).toHaveValue('元の記録');
    await page.getByTestId('dataedit-prev').click();
    await expect(page.getByTestId('dataedit-record-number')).toHaveText('1/2');
    await page.getByTestId('dataedit-next').click();
    await expect(page.getByTestId('dataedit-record-number')).toHaveText('2/2');
  });

  test('DATA-11 変更したまま戻ろうとすると、破棄の確認が出る', async ({ page }) => {
    await page.getByTestId('data-add').click();
    await page.getByTestId('dataedit-input-cmt').fill('未保存');
    await sheetBack(page);
    await expect(page.getByTestId('dialog-message')).toBeVisible();
  });
});
