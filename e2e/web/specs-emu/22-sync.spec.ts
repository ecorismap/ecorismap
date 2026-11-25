import { expect, Page, test } from '@playwright/test';
import { dataRows, layerRowIndex, openLayers, openLayerSettings, selectFeature, sheetBack, sheetClose } from '../support/app';
import {
  createProject,
  download,
  login,
  openProject,
  openProjectSetting,
  saveProjectSetting,
  upload,
  USERS,
} from '../support/emu';

/** 「ポイント」レイヤに記録を1件足す（確定すると編集画面が開くので閉じる） */
const addPoint = async (page: Page, x: number, y: number) => {
  await selectFeature(page, 'point');
  await page.getByTestId('home-draw-plot-point').click();
  await page.mouse.click(x, y);
  await page.getByTestId('home-draw-save').click();
  await expect(page.getByTestId('dataedit-save')).toBeVisible();
  await sheetClose(page);
};

/** レイヤごとの記録の件数。レイヤ一覧を開いて数え、シートを閉じて戻る */
const counts = async (page: Page, layers: string[]) => {
  await openLayers(page);
  const result: number[] = [];
  for (const layer of layers) {
    const i = await layerRowIndex(page, layer);
    await page.getByTestId(`layers-row-${i}`).click();
    await expect(page.getByTestId('data-export')).toBeVisible();
    await page.waitForTimeout(300);
    result.push(await dataRows(page).count());
    // レイヤ一覧へ戻してから閉じる（データ一覧のまま閉じると、次に開いたときもデータ一覧が出る）
    await sheetBack(page);
    await expect(page.getByTestId('layers-row-0')).toBeVisible();
  }
  await sheetClose(page);
  return result;
};

test.describe('16. 共有プロジェクト（送信と取得）', () => {
  test('PROJ-5 送信した記録を、別のメンバーが取得できる。「自分のみ」のレイヤの記録は届かない', async ({ page, browser }) => {
    test.setTimeout(180_000);
    // オーナー: 「ポイント」をメンバーと共有にする（「ライン」は自分のみのまま）
    await login(page, 'owner');
    await createProject(page, '送信の確認', [USERS.member.email]);
    await openProjectSetting(page, '送信の確認');
    await openLayerSettings(page, 'ポイント');
    await page.getByTestId('layeredit-permission-public').click();
    await page.getByTestId('layeredit-save').click();
    await sheetClose(page);
    await saveProjectSetting(page);

    // オーナー: 開いて、ポイントとラインを1件ずつ記録して送信
    await page.getByTestId('projectedit-back').click();
    await openProject(page, '送信の確認', { admin: true });
    await addPoint(page, 300, 300);
    await selectFeature(page, 'line');
    await page.getByTestId('home-draw-plot-line').click();
    await page.mouse.click(200, 400);
    await page.mouse.click(300, 450);
    await page.mouse.dblclick(400, 400);
    await page.getByTestId('home-draw-save').click();
    await expect(page.getByTestId('dataedit-save')).toBeVisible();
    await sheetClose(page);
    await upload(page);

    // メンバー: 開くとポイントの記録が入っている。ラインは届かない
    const context = await browser.newContext({ locale: 'ja-JP' });
    const member = await context.newPage();
    await login(member, 'member');
    await openProject(member, '送信の確認', { admin: false });
    expect(await counts(member, ['ポイント', 'ライン'])).toEqual([1, 0]);

    // オーナーがもう1件送ると、メンバーは「取得」で受け取れる
    await addPoint(page, 350, 350);
    await upload(page);
    await download(member);
    expect(await counts(member, ['ポイント'])).toEqual([2]);
    await context.close();
  });
});
