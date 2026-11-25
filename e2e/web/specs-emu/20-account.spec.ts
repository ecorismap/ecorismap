import { expect, test } from '@playwright/test';
import { openApp } from '../support/app';
import { answerDialog, login, stubFunctions, USERS } from '../support/emu';

test.describe('15. アカウント', () => {
  test('ACCT-1 メールとパスワードでログインでき、プロジェクト一覧が出る', async ({ page }) => {
    await login(page, 'owner');
    await expect(page.getByTestId('projects-add')).toBeVisible();
    // 地図へ戻ると、アカウントボタンが表示名の頭文字になり、メニューにプロジェクト一覧が出る
    await page.getByTestId('projects-back').click();
    await expect(page.getByTestId('home-account')).toHaveText(USERS.owner.name.slice(0, 1));
    await page.getByTestId('home-account').click();
    await expect(page.getByTestId('home-account-projects')).toBeVisible();
  });

  test('ACCT-1b パスワードが違うとログインできず、理由が出る', async ({ page }) => {
    await stubFunctions(page);
    await openApp(page);
    await page.getByTestId('home-account').click();
    await page.getByTestId('account-org-login').click();
    await page.getByTestId('account-email').fill(USERS.owner.email);
    await page.getByTestId('account-password').fill('wrong-password');
    await page.getByTestId('account-login').click();
    await expect(page.getByTestId('account-message')).toHaveText('emailまたはpasswordが間違っています。');
    await expect(page.getByTestId('account-title')).toHaveText('ログイン');
  });

  test('ACCT-6 表示名を変えられる', async ({ page }) => {
    await login(page, 'member');
    await page.getByTestId('projects-back').click();
    await page.getByTestId('home-account').click();
    await page.getByTestId('home-account-setting').click();
    await page.getByTestId('accountsettings-account-edit').click();
    await expect(page.getByTestId('account-title')).toHaveText('プロフィール更新');
    await page.getByTestId('account-display-name').fill('変更後');
    await page.getByTestId('account-submit').click();
    await answerDialog(page, 'プロフィールを更新しました。', 'OK');
    await page.getByTestId('accountsettings-back').click();
    await expect(page.getByTestId('home-account')).toHaveText('変');
    // 元に戻す（ほかのテストが表示名を見るため）
    await page.getByTestId('home-account').click();
    await page.getByTestId('home-account-setting').click();
    await page.getByTestId('accountsettings-account-edit').click();
    await page.getByTestId('account-display-name').fill(USERS.member.name);
    await page.getByTestId('account-submit').click();
    await answerDialog(page, 'プロフィールを更新しました。', 'OK');
  });

  test('ACCT-7 ログアウトすると、ログイン方法の選択に戻る', async ({ page }) => {
    await login(page, 'owner');
    await page.getByTestId('projects-back').click();
    await page.getByTestId('home-account').click();
    await page.getByTestId('home-account-logout').click();
    await answerDialog(page, 'ログアウトしますか？現在のデータは破棄されます。', 'Yes');
    await page.getByTestId('home-account').click();
    await expect(page.getByTestId('account-org-login')).toBeVisible();
  });
});
