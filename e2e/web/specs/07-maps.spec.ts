import { expect, Page, test } from '@playwright/test';
import { attribution, dialogButton, openApp, plainText, sheetBack } from '../support/app';

const openMaps = async (page: Page) => {
  await page.getByTestId('home-maps').click();
  await expect(page.getByTestId('maps-add')).toBeVisible();
};
const mapNames = async (page: Page) =>
  (await page.locator('[data-testid^="maps-row-"]').allInnerTexts()).map(plainText);
const mapIndex = async (page: Page, name: string) => {
  const names = await mapNames(page);
  const i = names.indexOf(name);
  if (i < 0) throw new Error(`地図が見つかりません: ${name}（${names.join(', ')}）`);
  const id = await page.locator('[data-testid^="maps-row-"]').nth(i).getAttribute('data-testid');
  return Number((id ?? '').replace('maps-row-', ''));
};

test.describe('9. 地図（背景地図）の管理', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await openMaps(page);
  });

  test('MAPS-1 地図一覧で表示／非表示を切り替えると、地図に反映される', async ({ page }) => {
    await expect(attribution(page)).toContainText('国土地理院');
    const before = await attribution(page).innerText();
    const i = await mapIndex(page, '衛星画像');
    await page.getByTestId(`maps-visible-${i}`).click();
    await expect(attribution(page)).not.toHaveText(before);
    await page.getByTestId(`maps-visible-${i}`).click();
    await expect(attribution(page)).toHaveText(before);
  });

  test('MAPS-4 地図をURLで追加・編集・削除できる', async ({ page }) => {
    await page.getByTestId('maps-add').click();
    await page.getByTestId('mapedit-name').fill('テスト地図');
    await page.getByTestId('mapedit-url').fill('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png');
    await page.getByTestId('mapedit-attribution').fill('テスト出典');
    await page.getByTestId('mapedit-save').click();
    // 保存しても編集画面のまま（地図にはすぐ反映される）
    await sheetBack(page);
    await expect(page.getByTestId('maps-add')).toBeVisible();
    await expect.poll(() => mapNames(page)).toContain('テスト地図');
    // 追加した地図は表示され、出典に出る
    await expect(attribution(page)).toContainText('テスト出典');

    let i = await mapIndex(page, 'テスト地図');
    await page.getByTestId(`maps-edit-${i}`).click();
    await expect(page.getByTestId('mapedit-name')).toHaveValue('テスト地図');
    await page.getByTestId('mapedit-name').fill('テスト地図2');
    await page.getByTestId('mapedit-save').click();
    await sheetBack(page);
    await expect.poll(() => mapNames(page)).toContain('テスト地図2');

    i = await mapIndex(page, 'テスト地図2');
    await page.getByTestId(`maps-edit-${i}`).click();
    await page.getByTestId('mapedit-delete').click();
    await dialogButton(page, 'Yes').click();
    await expect.poll(() => mapNames(page)).not.toContain('テスト地図2');
    await expect(attribution(page)).not.toContainText('テスト出典');
  });

  test('MAPS-3 グループを作成できる。上下ボタンで並べ替えられる', async ({ page }) => {
    await page.getByTestId('maps-add-group').click();
    await page.getByTestId('textdialog-input').fill('背景A');
    await page.getByTestId('textdialog-ok').click();
    await expect.poll(() => mapNames(page)).toContain('背景A');

    const before = await mapNames(page);
    await page.getByTestId('maps-down-0').click();
    await expect.poll(() => mapNames(page)).not.toEqual(before);
  });
});
