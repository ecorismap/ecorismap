import { expect, Page } from '@playwright/test';
import { openApp } from './app';

/** エミュレータ接続時のプロジェクトID（src/lib/firebase/firebase.web.ts と同じ値） */
export const PROJECT_ID = 'demo-ecorismap-e2e';
const AUTH = 'http://localhost:9099';
const FIRESTORE = 'http://localhost:8080';

/** テスト用のアカウント。エミュレータの中にだけ作る（実在のアカウントではない） */
export const USERS = {
  owner: { email: 'owner@e2e.test', password: 'e2e-owner-pass', name: 'オーナー' },
  member: { email: 'member@e2e.test', password: 'e2e-member-pass', name: 'メンバー' },
} as const;
export type UserKey = keyof typeof USERS;

const admin = { 'Content-Type': 'application/json', Authorization: 'Bearer owner' };

/** エミュレータのアカウントとデータを空にする */
export async function resetEmulators() {
  const res = await Promise.all([
    fetch(`${AUTH}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: 'DELETE' }),
    fetch(`${FIRESTORE}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: 'DELETE' }),
  ]);
  for (const r of res) if (!r.ok) throw new Error(`エミュレータを初期化できません: ${r.url} ${r.status}`);
}

/** メール確認済みのアカウントを作る */
export async function createUser(user: { email: string; password: string; name: string }) {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts`, {
    method: 'POST',
    headers: admin,
    body: JSON.stringify({ email: user.email, password: user.password, displayName: user.name, emailVerified: true }),
  });
  if (!res.ok) throw new Error(`アカウントを作れません: ${user.email} ${res.status} ${await res.text()}`);
}

/** メールアドレスからuidを引く（無ければnull） */
export async function uidByEmail(email: string): Promise<string | null> {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:lookup`, {
    method: 'POST',
    headers: admin,
    body: JSON.stringify({ email: [email] }),
  });
  const json = (await res.json()) as { users?: { localId: string }[] };
  return json.users?.[0]?.localId ?? null;
}

/**
 * メールアドレスからuidを引く関数（Cloud Functions）の代わりに応える。
 * 関数は別リポジトリにあり、エミュレータでは動かしていない。
 */
export async function stubFunctions(page: Page) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  await page.route(/localhost:5001\/.*\/(getUidByEmail|getUidsByEmails)$/, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const data = (req.postDataJSON() as { data: { email?: string; emails?: string[] } }).data;
    const result =
      data.emails !== undefined ? await Promise.all(data.emails.map(uidByEmail)) : await uidByEmail(data.email ?? '');
    return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ result }) });
  });
}

/** 起動して、組織アカウントでログインする */
export async function login(page: Page, who: UserKey) {
  await stubFunctions(page);
  await openApp(page);
  await page.getByTestId('home-account').click();
  await page.getByTestId('account-org-login').click();
  await page.getByTestId('account-email').fill(USERS[who].email);
  await page.getByTestId('account-password').fill(USERS[who].password);
  await page.getByTestId('account-login').click();
  await expect(page.getByTestId('account-title')).toBeHidden({ timeout: 30_000 });
}

/** 起動して、指定したアカウント（USERS以外の、テストごとに作るアカウント）でログインを試みる。結果は呼び出し側で確かめる */
export async function tryLogin(page: Page, email: string, password: string, opts: { open?: boolean } = {}) {
  if (opts.open !== false) {
    await stubFunctions(page);
    await openApp(page);
    await page.getByTestId('home-account').click();
    await page.getByTestId('account-org-login').click();
  }
  await page.getByTestId('account-email').fill(email);
  await page.getByTestId('account-password').fill(password);
  await page.getByTestId('account-login').click();
}

/** 起動して、指定したアカウントでログインする（プロジェクト一覧が出る） */
export async function loginAs(page: Page, email: string, password: string) {
  await tryLogin(page, email, password);
  await expect(page.getByTestId('account-title')).toBeHidden({ timeout: 30_000 });
}

export type OobCode = { email: string; requestType: string; oobCode: string; oobLink: string };

/** Authエミュレータが「送った」メール（確認メール・パスワード再設定メール）。実際には送られず、ここに溜まる */
export async function oobCodes(email: string, requestType: 'VERIFY_EMAIL' | 'PASSWORD_RESET'): Promise<OobCode[]> {
  const res = await fetch(`${AUTH}/emulator/v1/projects/${PROJECT_ID}/oobCodes`);
  if (!res.ok) throw new Error(`メールの一覧を取れません: ${res.status}`);
  const json = (await res.json()) as { oobCodes?: OobCode[] };
  return (json.oobCodes ?? []).filter((c) => c.email === email && c.requestType === requestType);
}

/** パスワード再設定メールのコードで、新しいパスワードを設定する（メールのリンク先でユーザーが行う操作の代わり） */
export async function resetPasswordByCode(oobCode: string, newPassword: string) {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=fake-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oobCode, newPassword }),
  });
  if (!res.ok) throw new Error(`パスワードを再設定できません: ${res.status} ${await res.text()}`);
}

/** 確認ダイアログの文言を確かめて、ボタンを押す */
export async function answerDialog(page: Page, message: string | RegExp, button: string) {
  await expect(page.getByTestId('dialog-message')).toHaveText(message, { timeout: 30_000 });
  await page.locator('[data-testid^="dialog-button-"]').getByText(button, { exact: true }).click();
  // 閉じるか、次のダイアログに替わるまで待つ
  await expect(page.getByTestId('dialog-message').filter({ hasText: message })).toHaveCount(0);
}

/** プロジェクト一覧の行（プロジェクト名で探す） */
export const projectName = (page: Page, name: string) =>
  page.locator('[data-testid^="project-"]').filter({ hasText: new RegExp(`^${name}$`) });

/** プロジェクト一覧で「作成」を押し、名前とメンバーを入れて保存する（一覧へ戻る） */
export async function createProject(page: Page, name: string, memberEmails: string[] = []) {
  await page.getByTestId('projects-add').click();
  await page.getByTestId('projectedit-name').fill(name);
  // 新規作成の画面には、最初から自分（オーナー）の行がある。追加した行が出てから次へ進む
  const rows = page.locator('[data-testid^="projectedit-member-email-"]');
  for (const [i, email] of memberEmails.entries()) {
    await page.getByTestId('projectedit-member-add').fill(email);
    await page.getByTestId('projectedit-member-add').press('Enter');
    await expect(rows).toHaveCount(i + 2);
    await expect(rows.nth(i + 1)).toHaveValue(email);
  }
  await page.getByTestId('projectedit-save').click();
}

/** プロジェクト一覧から、そのプロジェクトの編集画面を開く */
export async function openProjectEdit(page: Page, name: string) {
  await projectName(page, name).click();
  await expect(page.getByTestId('projectedit-open')).toBeVisible();
}

/** プロジェクトを開いて地図画面にする。管理者は、他のメンバーの非公開データも取るかを聞かれる */
export async function openProject(page: Page, name: string, opts: { admin: boolean }) {
  await openProjectEdit(page, name);
  await page.getByTestId('projectedit-open').click();
  if (opts.admin) await answerDialog(page, /^管理者として他のメンバーの非公開データも取得して/, 'No');
  await expect(page.getByTestId('home-project-label')).toHaveText(name, { timeout: 30_000 });
}

/** 設定モードでプロジェクトを開く */
export async function openProjectSetting(page: Page, name: string) {
  await openProjectEdit(page, name);
  await page.getByTestId('projectedit-setting').click();
  await answerDialog(page, 'プロジェクトの設定を変更できます。', 'OK');
  await expect(page.getByTestId('home-project-save-setting')).toBeVisible();
}

/** 設定モードの変更を保存する（プロジェクトの編集画面へ戻る） */
export async function saveProjectSetting(page: Page) {
  await page.getByTestId('home-project-save-setting').click();
  await answerDialog(page, 'プロジェクトの設定を保存しますか？', 'Yes');
  await answerDialog(page, 'プロジェクトの設定を変更しました', 'OK');
  await expect(page.getByTestId('projectedit-open')).toBeVisible();
}

/** プロジェクトのボタン（取得・送信・終了）。プロジェクト名のラベルを押すと出る */
export async function projectButton(page: Page, id: 'download' | 'upload' | 'close' | 'jump') {
  const button = page.getByTestId(`home-project-${id}`);
  if (!(await button.isVisible())) await page.getByTestId('home-project-label').click();
  return button;
}

/** 記録を送信する */
export async function upload(page: Page) {
  await (await projectButton(page, 'upload')).click();
  await answerDialog(page, 'データを送信しますか？', 'Yes');
  await answerDialog(page, 'データをアップロードしました。', 'OK');
}

/** ほかのメンバーの記録を取得する */
export async function download(page: Page) {
  await (await projectButton(page, 'download')).click();
  await answerDialog(page, '更新されたデータを取得しますか？', 'Yes');
  await answerDialog(page, 'データを取得しました。', 'OK');
}

/** プロジェクトを終了する */
export async function closeProject(page: Page) {
  await (await projectButton(page, 'close')).click();
  await answerDialog(page, /^プロジェクトを終了しますか？/, 'Yes');
  await expect(page.getByTestId('home-project-label')).toBeHidden();
}

/** 地図画面からプロジェクト一覧へ */
export async function gotoProjects(page: Page) {
  await page.getByTestId('home-account').click();
  await page.getByTestId('home-account-projects').click();
  await expect(page.getByTestId('projects-add')).toBeVisible();
}
