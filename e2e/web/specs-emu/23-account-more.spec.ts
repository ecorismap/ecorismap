import { expect, test } from '@playwright/test';
import { openApp } from '../support/app';
import {
  answerDialog,
  createProject,
  createUser,
  login,
  loginAs,
  oobCodes,
  projectName,
  resetPasswordByCode,
  stubFunctions,
  tryLogin,
  uidByEmail,
  USERS,
} from '../support/emu';

// このファイルのテストは、テストごとに専用のアカウントを作る（共有の owner / member を変えない）
test.describe('15. アカウント（登録・再設定・削除）', () => {
  test('ACCT-2 新規登録すると確認メールが送られ、確認するまではログインできない', async ({ page }) => {
    const email = 'signup@e2e.test';
    const password = 'e2e-signup-pass';
    await stubFunctions(page);
    await openApp(page);
    await page.getByTestId('home-account').click();
    await page.getByTestId('account-org-login').click();
    await page.getByTestId('account-goto-signup').click();
    await expect(page.getByTestId('account-title')).toHaveText('アカウント作成');
    await page.getByTestId('account-email').fill(email);
    await page.getByTestId('account-password').fill(password);
    await page.getByTestId('account-signup').click();
    await answerDialog(page, 'メールを確認して、アクティベートしてください。', 'OK');
    await expect(page.getByTestId('account-title')).toHaveText('ログイン');
    await expect(page.getByTestId('account-message')).toHaveText(
      '確認メールを送信しました。メール内のリンクをクリックした後、ログインしてください。'
    );

    // アカウントができ、確認メールが1通送られている
    expect(await uidByEmail(email)).not.toBeNull();
    const mails = await oobCodes(email, 'VERIFY_EMAIL');
    expect(mails).toHaveLength(1);

    // 確認する前は、ログインできない（確認メールの再送を聞かれる）
    await tryLogin(page, email, password, { open: false });
    await answerDialog(page, 'アカウントがアクティベートされていません。アクティベート用のメールを送信しますか？', 'No');
    await expect(page.getByTestId('account-message')).toHaveText('アカウントがアクティベートされていません。');
    await expect(page.getByTestId('account-title')).toHaveText('ログイン');

    // メールのリンクを開くと、ログインできる
    const res = await fetch(mails[0].oobLink);
    expect(res.ok).toBe(true);
    await tryLogin(page, email, password, { open: false });
    await expect(page.getByTestId('projects-add')).toBeVisible({ timeout: 30_000 });
  });

  test('ACCT-2b 登録済みのメールアドレスでは登録できず、理由が出る', async ({ page }) => {
    await stubFunctions(page);
    await openApp(page);
    await page.getByTestId('home-account').click();
    await page.getByTestId('account-org-login').click();
    await page.getByTestId('account-goto-signup').click();
    await page.getByTestId('account-email').fill(USERS.owner.email);
    await page.getByTestId('account-password').fill('e2e-another-pass');
    await page.getByTestId('account-signup').click();
    await expect(page.getByTestId('account-message')).toHaveText('そのメールアドレスは既に使用されています。');
    await expect(page.getByTestId('account-title')).toHaveText('アカウント作成');
    expect(await oobCodes(USERS.owner.email, 'VERIFY_EMAIL')).toHaveLength(0);
  });

  test('ACCT-3 パスワードの再設定メールを送れ、再設定したパスワードでログインできる', async ({ page }) => {
    const user = { email: 'reset@e2e.test', password: 'e2e-reset-old', name: '再設定' };
    const newPassword = 'e2e-reset-new';
    await createUser(user);
    await stubFunctions(page);
    await openApp(page);
    await page.getByTestId('home-account').click();
    await page.getByTestId('account-org-login').click();
    await page.getByTestId('account-reset-password').click();
    await expect(page.getByTestId('account-title')).toHaveText('パスワードリセット');
    await page.getByTestId('account-email').fill(user.email);
    await page.getByTestId('account-submit').click();
    await answerDialog(
      page,
      '登録されているメールアドレスであれば、パスワード再設定のメールが届きます。メールを確認してください。',
      'OK'
    );
    await expect(page.getByTestId('account-title')).toHaveText('ログイン');
    await expect(page.getByTestId('account-message')).toHaveText(
      'メールが届いたらパスワードを再設定し、ログインしてください。'
    );

    const mails = await oobCodes(user.email, 'PASSWORD_RESET');
    expect(mails).toHaveLength(1);
    await resetPasswordByCode(mails[0].oobCode, newPassword);

    // 古いパスワードでは入れず、新しいパスワードで入れる
    await tryLogin(page, user.email, user.password, { open: false });
    await expect(page.getByTestId('account-message')).toHaveText('emailまたはpasswordが間違っています。');
    await tryLogin(page, user.email, newPassword, { open: false });
    await expect(page.getByTestId('projects-add')).toBeVisible({ timeout: 30_000 });
  });

  test('ACCT-8 アカウントを削除すると、ログインできなくなり、所有していたプロジェクトも消える', async ({ page, browser }) => {
    test.setTimeout(180_000);
    const user = { email: 'delete@e2e.test', password: 'e2e-delete-pass', name: '削除' };
    await createUser(user);
    await loginAs(page, user.email, user.password);
    await createProject(page, 'アカウント削除の確認', [USERS.member.email]);
    await expect(projectName(page, 'アカウント削除の確認')).toBeVisible();

    await page.getByTestId('projects-back').click();
    await page.getByTestId('home-account').click();
    await page.getByTestId('home-account-setting').click();
    await page.getByTestId('accountsettings-account-delete').click();
    await answerDialog(page, 'アカウントを本当に削除しますか？', 'Yes');
    await expect(page.getByTestId('account-title')).toHaveText('アカウントの削除');

    // パスワードが違うと削除されない
    await page.getByTestId('account-password').fill('wrong-password');
    await page.getByTestId('account-submit').click();
    await expect(page.getByTestId('account-message')).not.toHaveText('ログインパスワードを入力してください。');
    await expect(page.getByTestId('account-title')).toHaveText('アカウントの削除');
    expect(await uidByEmail(user.email)).not.toBeNull();

    await page.getByTestId('account-password').fill(user.password);
    await page.getByTestId('account-submit').click();
    await answerDialog(page, 'アカウントを削除しました。', 'OK');
    await expect(page.getByTestId('account-title')).toHaveText('ログイン');
    expect(await uidByEmail(user.email)).toBeNull();

    // 削除したアカウントではログインできない
    await tryLogin(page, user.email, user.password, { open: false });
    await expect(page.getByTestId('account-message')).toHaveText('emailまたはpasswordが間違っています。');

    // メンバーの一覧からも、そのプロジェクトが消えている
    const context = await browser.newContext({ locale: 'ja-JP' });
    const member = await context.newPage();
    await login(member, 'member');
    await expect(member.getByTestId('projects-add')).toBeVisible();
    await member.getByTestId('projects-reload').click();
    await expect(projectName(member, 'アカウント削除の確認')).toBeHidden();
    await context.close();
  });
});
