import { expect, test } from '@playwright/test';
import { importLayerFile, layerNames, openLayers, sheetClose } from '../support/app';
import {
  answerDialog,
  closeProject,
  createProject,
  gotoProjects,
  login,
  openProject,
  openProjectEdit,
  openProjectSetting,
  projectName,
  saveProjectSetting,
  upload,
  USERS,
} from '../support/emu';

// エミュレータの中身は全テストで共有する。テストごとに別の名前のプロジェクトを作り、名前で探す
test.describe('16. 共有プロジェクト', () => {
  test('PROJ-1/2 プロジェクトを作成でき、一覧に出る', async ({ page }) => {
    await login(page, 'owner');
    await createProject(page, '作成の確認');
    await expect(projectName(page, '作成の確認')).toBeVisible();
    // 更新を押しても残っている（サーバーに保存されている）
    await page.getByTestId('projects-reload').click();
    await expect(projectName(page, '作成の確認')).toBeVisible();
  });

  test('PROJ-8 メンバーを追加すると、そのメンバーの一覧に出る。未登録のメンバーは保留で保存できる', async ({ page, browser }) => {
    await login(page, 'owner');
    await createProject(page, 'メンバーの確認', [USERS.member.email, 'nobody@e2e.test']);
    await answerDialog(page, /^アカウントが存在しないメンバーが含まれています[\s\S]*nobody@e2e\.test$/, 'Yes');
    await expect(projectName(page, 'メンバーの確認')).toBeVisible();

    const context = await browser.newContext({ locale: 'ja-JP' });
    const member = await context.newPage();
    await login(member, 'member');
    await expect(projectName(member, 'メンバーの確認')).toBeVisible();
    // メンバーには、保存・設定・削除のボタンが出ない
    await openProjectEdit(member, 'メンバーの確認');
    await expect(member.getByTestId('projectedit-save')).toBeHidden();
    await expect(member.getByTestId('projectedit-setting')).toBeHidden();
    await expect(member.getByTestId('projectedit-delete')).toBeHidden();
    await context.close();
  });

  test('PROJ-3/4/12 設定モードで入れたレイヤが、開いたプロジェクトに入る。終了すると端末内のデータに戻る', async ({ page }) => {
    await login(page, 'owner');
    await createProject(page, '設定の確認');
    await openProjectSetting(page, '設定の確認');
    await importLayerFile(page, '植物調査.geojson');
    await sheetClose(page);
    await saveProjectSetting(page);

    await page.getByTestId('projectedit-back').click();
    await openProject(page, '設定の確認', { admin: true });
    await openLayers(page);
    expect(await layerNames(page)).toContain('植物調査.geojson');
    await sheetClose(page);

    await closeProject(page);
    await openLayers(page);
    expect(await layerNames(page)).not.toContain('植物調査.geojson');
  });

  test('PROJ-14 アーカイブすると一覧から消え、「アーカイブを含む」で出て復元できる', async ({ page }) => {
    await login(page, 'owner');
    await createProject(page, 'アーカイブの確認');
    const row = page.locator('[data-testid^="projects-row-"]').filter({ hasText: 'アーカイブの確認' });
    await row.locator('[data-testid^="archive-toggle-"]').click();
    await answerDialog(page, /^このプロジェクトをアーカイブしますか？/, 'Yes');
    await expect(projectName(page, 'アーカイブの確認')).toBeHidden();

    await page.getByTestId('toggle-show-archive').click();
    await expect(projectName(page, 'アーカイブの確認')).toBeVisible();
    await row.locator('[data-testid^="archive-toggle-"]').click();
    await answerDialog(page, 'このプロジェクトを復元しますか？', 'Yes');
    await page.getByTestId('toggle-show-archive').click();
    await expect(projectName(page, 'アーカイブの確認')).toBeVisible();
  });

  test('PROJ-15 クラウドデータ管理に、送信したレイヤのデータが並ぶ', async ({ page }) => {
    await login(page, 'owner');
    await createProject(page, 'データ管理の確認');
    await openProject(page, 'データ管理の確認', { admin: true });
    await upload(page);
    await closeProject(page);

    await gotoProjects(page);
    await openProjectEdit(page, 'データ管理の確認');
    await page.getByTestId('projectedit-data-manage').click();
    const layer = page.locator('[data-testid^="clouddata-layer-"]').filter({ hasText: 'ポイント' }).first();
    await expect(layer).toBeVisible();
    await layer.click();
    await expect(page.locator('[data-testid^="clouddata-data-"]').filter({ hasText: USERS.owner.email }).first()).toBeVisible();
  });

  test('PROJ-17 オーナーはプロジェクトを削除できる', async ({ page }) => {
    await login(page, 'owner');
    await createProject(page, '削除の確認');
    await openProjectEdit(page, '削除の確認');
    await page.getByTestId('projectedit-delete').click();
    await answerDialog(page, 'プロジェクトを削除しますか？', 'Yes');
    await answerDialog(page, 'プロジェクトを削除しました。', 'OK');
    await expect(page.getByTestId('projects-add')).toBeVisible();
    await expect(projectName(page, '削除の確認')).toBeHidden();
  });
});
