import fs from 'fs';
import { expect, Page, test } from '@playwright/test';
import { attribution, chooseFile, dialogButton, fixture, okIfShown, openApp, plainText, sheetBack, text } from '../support/app';

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

// プリセットの▼は、押せる領域（選択肢を開く部品）が上に重なっているので、位置を指定して押す
const openPresets = (page: Page) => page.getByTestId('mapedit-preset').click({ force: true });

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

  test('MAPS-5 プリセットから地図を追加できる', async ({ page }) => {
    await page.getByTestId('maps-add').click();
    await openPresets(page);
    await text(page, '地理院写真(最新)').click();
    // プリセットの内容が入力欄に入る
    await expect(page.getByTestId('mapedit-name')).toHaveValue('地理院写真(最新)');
    await expect(page.getByTestId('mapedit-url')).toHaveValue(/^https:\/\//);
    await page.getByTestId('mapedit-save').click();
    await sheetBack(page);
    await expect.poll(() => mapNames(page)).toContain('地理院写真(最新)');
  });

  test('MAPS-6 陰影起伏・段彩（hillshade:// relief://）を追加して表示できる', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    for (const [preset, scheme] of [
      ['陰影起伏図(全方位対応)', /^hillshade:\/\//],
      ['GEBCO海底地形図(全球)', /^relief:\/\//],
    ] as const) {
      await page.getByTestId('maps-add').click();
      await openPresets(page);
      await text(page, preset).click();
      await expect(page.getByTestId('mapedit-url')).toHaveValue(scheme);
      await page.getByTestId('mapedit-save').click();
      await sheetBack(page);
      await expect(page.getByTestId('maps-add')).toBeVisible();
    }
    // 追加した地図は表示され、出典に出る（タイルの絵そのものは確かめない）
    await expect(attribution(page)).toContainText('GEBCO');
    await page.waitForTimeout(3000);
    expect(pageErrors).toEqual([]);
  });

  test('MAPS-8 PMTilesファイルを取り込んで表示できる', async ({ page }) => {
    const before = await mapNames(page);
    await chooseFile(page, page.getByTestId('maps-import'), fixture('vegetation.pmtiles'));
    await okIfShown(page, 15_000);
    await expect.poll(() => mapNames(page), { timeout: 30_000 }).toHaveLength(before.length + 1);
    const added = (await mapNames(page)).filter((name) => !before.includes(name));
    expect(added[0]).toContain('vegetation');
  });

  test('MAPS-11 地図設定をエクスポートし、取り込み直せる', async ({ page }, testInfo) => {
    await page.getByTestId('maps-add').click();
    await page.getByTestId('mapedit-name').fill('書き出す地図');
    await page.getByTestId('mapedit-url').fill('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png');
    await page.getByTestId('mapedit-attribution').fill('書き出し出典');
    await page.getByTestId('mapedit-save').click();
    await sheetBack(page);
    await expect.poll(() => mapNames(page)).toContain('書き出す地図');

    // エクスポート（Webはダウンロードになる）
    let i = await mapIndex(page, '書き出す地図');
    await page.getByTestId(`maps-edit-${i}`).click();
    const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
    await page.getByTestId('mapedit-export').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.json$/);
    const saved = testInfo.outputPath(download.suggestedFilename());
    await download.saveAs(saved);
    await okIfShown(page, 5000);

    // 削除してから取り込み直す
    await page.getByTestId('mapedit-delete').click();
    await dialogButton(page, 'Yes').click();
    await expect.poll(() => mapNames(page)).not.toContain('書き出す地図');
    await chooseFile(page, page.getByTestId('maps-import'), saved);
    await okIfShown(page, 10_000);
    await expect.poll(() => mapNames(page)).toContain('書き出す地図');
    await expect(attribution(page)).toContainText('書き出し出典');
  });

  // ベクタのPMTilesを取り込み、その地図の編集画面を開く
  const openVectorMapEdit = async (page: Page) => {
    const before = await mapNames(page);
    await chooseFile(page, page.getByTestId('maps-import'), fixture('vegetation.pmtiles'));
    await okIfShown(page, 15_000);
    await expect.poll(() => mapNames(page), { timeout: 30_000 }).toHaveLength(before.length + 1);
    const name = (await mapNames(page)).filter((n) => !before.includes(n))[0];
    const i = await mapIndex(page, name);
    await page.getByTestId(`maps-edit-${i}`).click();
    await expect(page.getByTestId('mapedit-import-style')).toBeVisible();
    return name;
  };

  test('MAPS-9 ベクタタイルにスタイルJSONを読み込むと、保存後もスタイルが設定されている', async ({ page }) => {
    const name = await openVectorMapEdit(page);
    const before = await page.getByTestId('mapedit-style-url').inputValue();
    await chooseFile(page, page.getByTestId('mapedit-import-style'), fixture('vegetation-style.json'));
    await expect(page.getByTestId('mapedit-style-url')).toHaveValue('style://vegetation-style.json');
    expect(before).not.toBe('style://vegetation-style.json');
    await page.getByTestId('mapedit-save').click();
    await sheetBack(page);
    await expect(page.getByTestId('maps-add')).toBeVisible();
    // 開き直しても残っている
    const i = await mapIndex(page, name);
    await page.getByTestId(`maps-edit-${i}`).click();
    await expect(page.getByTestId('mapedit-style-url')).toHaveValue('style://vegetation-style.json');
  });

  test('ERR-3 不正なスタイルJSONを読み込むと、エラーが出て前のスタイルのまま', async ({ page }, testInfo) => {
    await openVectorMapEdit(page);
    const before = await page.getByTestId('mapedit-style-url').inputValue();
    // layers の無いJSON
    const broken = testInfo.outputPath('broken-style.json');
    fs.writeFileSync(broken, JSON.stringify({ version: 8, sources: {} }));
    await chooseFile(page, page.getByTestId('mapedit-import-style'), broken);
    await expect(page.getByTestId('dialog-message')).toContainText('スタイルファイルを読み取れません');
    await dialogButton(page, 'OK').click();
    await expect(page.getByTestId('mapedit-style-url')).toHaveValue(before);
    // JSONとして読めないファイル
    const notJson = testInfo.outputPath('not-json.json');
    fs.writeFileSync(notJson, '{ "layers": [');
    await chooseFile(page, page.getByTestId('mapedit-import-style'), notJson);
    await expect(page.getByTestId('dialog-message')).toBeVisible();
    await dialogButton(page, 'OK').click();
    await expect(page.getByTestId('mapedit-style-url')).toHaveValue(before);
  });
});
