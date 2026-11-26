import { expect, test } from '@playwright/test';
import {
  dataRows,
  dialogButton,
  importLayerFile,
  layerRowIndex,
  longPressMap,
  okIfShown,
  openApp,
  openLayerData,
  openLayerSettings,
  plainText,
  sheetBack,
  text,
} from '../support/app';

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

test.describe('11. データ編集（入力の検証・地図への移動）', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  test('ERR-4 必須でない欄を空のまま保存できる。数値欄に文字を入れると保存できない', async ({ page }) => {
    // 整数の欄を足す
    await openLayerSettings(page, 'ポイント');
    const n = await page.locator('[data-testid^="layeredit-field-name-"]').count();
    await page.getByTestId('layeredit-field-add').click();
    await page.getByTestId(`layeredit-field-name-${n}`).fill('個体数');
    await page.getByTestId(`layeredit-field-format-${n}`).click();
    await text(page, '整数').click();
    await page.getByTestId('layeredit-save').click();
    await sheetBack(page);
    const i = await layerRowIndex(page, 'ポイント');
    await page.getByTestId(`layers-row-${i}`).click();

    // 空のまま保存できる
    await page.getByTestId('data-add').click();
    // 整数の欄は0が入っているので、消して空にする（何も変えていない記録は保存の対象にならない）
    await expect(page.getByTestId('dataedit-input-個体数')).toHaveValue('0');
    await page.getByTestId('dataedit-input-個体数').fill('');
    await page.getByTestId('dataedit-save').click();
    await expect(page.getByTestId('data-export')).toBeVisible();
    await expect(dataRows(page)).toHaveCount(1);

    // 数値欄に文字を入れると、入力し直しを求められて保存されない（欄を離れた時点で確かめられる）
    await page.getByTestId('data-row-0').click();
    await page.getByTestId('dataedit-input-個体数').fill('たくさん');
    await page.getByTestId('dataedit-save').click();
    await expect(page.getByTestId('dialog-message')).toContainText('以下の値を正しく入力してください');
    await expect(page.getByTestId('dialog-message')).toContainText('たくさん');
    await dialogButton(page, 'OK').click();
    // 欄を離れたときの確認と、保存時の確認が続けて出ることがある
    await okIfShown(page, 2000);
    await expect(page.getByTestId('dialog-message')).toBeHidden();
    await expect(page.getByTestId('dataedit-save')).toBeVisible();
    await expect(page.getByTestId('data-export')).toHaveCount(0);

    // 数値に直すと保存できる
    await page.getByTestId('dataedit-input-個体数').fill('12');
    await page.getByTestId('dataedit-save').click();
    await expect(page.getByTestId('data-export')).toBeVisible();
    await page.getByTestId('data-row-0').click();
    await expect(page.getByTestId('dataedit-input-個体数')).toHaveValue('12');
  });

  test('DATA-10 編集画面の「表示」で、その記録の位置へ地図が移動する', async ({ page }) => {
    // 地図の中央あたりの座標を、長押しのポップアップから読む
    const centerCoord = async () => {
      await longPressMap(page, 400, 300);
      const [lat, lon] = (await page.getByTestId('home-poi-coordinate').innerText()).split(',').map(Number);
      return { lat, lon };
    };
    const far = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) =>
      Math.max(Math.abs(a.lat - b.lat), Math.abs(a.lon - b.lon));

    const before = await centerCoord();
    await page.mouse.click(700, 150); // ポップアップを閉じる
    await importLayerFile(page, '植物調査.zip');
    const i = await layerRowIndex(page, '植物調査');
    await page.getByTestId(`layers-row-${i}`).click();
    await page.getByTestId('data-row-0').click();
    const record = {
      lat: Number(await page.getByTestId('dataedit-coords-latitude-decimal').inputValue()),
      lon: Number(await page.getByTestId('dataedit-coords-longitude-decimal').inputValue()),
    };
    // 取り込んだ記録は、最初に表示していた場所から離れている
    expect(far(before, record)).toBeGreaterThan(0.05);

    await page.getByTestId('dataedit-jump').click();
    await page.waitForTimeout(1500);
    const after = await centerCoord();
    expect(far(after, record)).toBeLessThan(0.02);
  });
});
