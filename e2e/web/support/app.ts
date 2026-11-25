import path from 'path';
import { expect, Locator, Page } from '@playwright/test';

export const FIXTURES = path.resolve(__dirname, '../fixtures');
export const fixture = (name: string) => path.join(FIXTURES, name);

export const TERMS_TEXT = '利用規約に同意して開始しますか？';

/** 最前面に見えている文字列（同じ文言が地図の裏に残っていても、見えている最初のものを取る） */
export const text = (page: Page, s: string | RegExp, exact = true): Locator =>
  page.getByText(s, { exact }).locator('visible=true').first();

/** 起動して地図画面が使える状態にする（利用規約に同意し、更新情報を閉じる） */
export async function openApp(page: Page, opts: { acceptTerms?: boolean } = {}) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('home-layers')).toBeVisible({ timeout: 120_000 });
  if (opts.acceptTerms === false) return;
  await acceptTerms(page);
}

export async function acceptTerms(page: Page) {
  await expect(text(page, TERMS_TEXT)).toBeVisible({ timeout: 30_000 });
  await dialogButton(page, 'OK').click();
  await expect(text(page, TERMS_TEXT)).toBeHidden();
}

/** 確認ダイアログのボタン（OK / Cancel / Yes / No など） */
export const dialogButton = (page: Page, label: string): Locator => text(page, label);

/** 出ていれば確認ダイアログのOKを押す */
export async function okIfShown(page: Page, timeout = 1500) {
  const ok = dialogButton(page, 'OK');
  try {
    await ok.waitFor({ state: 'visible', timeout });
    await ok.click();
  } catch {
    // 出ていない
  }
}

/** 再読み込みして地図画面が出るまで待つ（Webはタブが生きている間だけデータを持つ） */
export async function reloadApp(page: Page) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('home-layers')).toBeVisible({ timeout: 120_000 });
}

/** ファイル選択を伴うボタンを押して、ファイルを渡す */
export async function chooseFile(page: Page, trigger: Locator, file: string | string[]) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), trigger.click()]);
  await chooser.setFiles(file);
}

/**
 * 端末内への保存（IndexedDB）に、指定した文字列が書き出されるまで待つ。
 * 保存は間引かれていて（起動直後は全項目を1秒に1つずつ書く）、書き出す前に再読み込みすると変更が失われる。
 */
export async function waitForPersisted(page: Page, needle: string | RegExp, timeout = 60_000) {
  const source = typeof needle === 'string' ? needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : needle.source;
  await expect
    .poll(
      () =>
        page.evaluate(async (pattern) => {
          const tabId = sessionStorage.getItem('ecorismap-redux-tab-id');
          if (tabId === null) return false;
          const value = await new Promise<string>((resolve) => {
            const req = indexedDB.open('ecorismapReduxPersist-' + tabId);
            req.onerror = () => resolve('');
            req.onsuccess = () => {
              const db = req.result;
              try {
                const get = db.transaction('keyvalue').objectStore('keyvalue').get('persist:root');
                get.onsuccess = () => {
                  resolve(get.result?.value ?? '');
                  db.close();
                };
                get.onerror = () => {
                  resolve('');
                  db.close();
                };
              } catch {
                db.close();
                resolve('');
              }
            };
          });
          return new RegExp(pattern).test(value);
        }, source),
      { timeout, intervals: [500] }
    )
    .toBe(true);
}

/** アイコン（私用領域の文字）を除いた、最初の行の文字列 */
export const plainText = (s: string): string =>
  s
    .replace(/[\uE000-\uF8FF]|[\u{F0000}-\u{FFFFF}]/gu, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')[0] ?? '';

/** レイヤ一覧を開く */
export async function openLayers(page: Page) {
  await page.getByTestId('home-layers').click();
  // 共有プロジェクトの一般メンバーには「追加」が出ないので、行でも判定する
  await expect(page.getByTestId('layers-add').or(page.getByTestId('layers-row-0')).first()).toBeVisible();
}

/** レイヤ一覧の行番号（レイヤ名で探す） */
export async function layerRowIndex(page: Page, layerName: string): Promise<number> {
  const rows = page.locator('[data-testid^="layers-row-"]');
  await expect(rows.first()).toBeVisible();
  const n = await rows.count();
  for (let i = 0; i < n; i++) {
    const row = rows.nth(i);
    if (plainText(await row.innerText()) === layerName) {
      const id = (await row.getAttribute('data-testid')) ?? '';
      return Number(id.replace('layers-row-', ''));
    }
  }
  throw new Error(`レイヤが見つかりません: ${layerName}`);
}

/** レイヤ一覧に出ているレイヤ名 */
export async function layerNames(page: Page): Promise<string[]> {
  const rows = page.locator('[data-testid^="layers-row-"]');
  return (await rows.allInnerTexts()).map(plainText);
}

/** レイヤ一覧から、そのレイヤのデータ一覧を開く */
export async function openLayerData(page: Page, layerName: string) {
  await openLayers(page);
  const i = await layerRowIndex(page, layerName);
  await page.getByTestId(`layers-row-${i}`).click();
  await expect(page.getByTestId('data-export')).toBeVisible();
}

/** レイヤ一覧から、そのレイヤの設定を開く */
export async function openLayerSettings(page: Page, layerName: string) {
  await openLayers(page);
  const i = await layerRowIndex(page, layerName);
  await page.getByTestId(`layers-settings-${i}`).click();
  await expect(page.getByTestId('layeredit-name')).toBeVisible();
}

/** データ一覧の行数 */
export const dataRows = (page: Page): Locator => page.locator('[data-testid^="data-row-"]');

/** ボトムシートの「戻る」 */
export async function sheetBack(page: Page) {
  await page.getByTestId('sheet-back').click();
}

/** ボトムシートを閉じる */
export async function sheetClose(page: Page) {
  // 開くアニメーションの最中に押すと効かないことがある。画面の外へ出るまで確かめ、残っていれば押し直す
  const close = page.getByTestId('sheet-close');
  await expect(async () => {
    await close.click({ timeout: 2000 });
    await expect(close).not.toBeInViewport({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
}

/** レイヤ一覧の「インポート」からファイルを取り込み、完了の通知を閉じる */
export async function importLayerFile(page: Page, file: string) {
  await openLayers(page);
  await chooseFile(page, page.getByTestId('layers-import'), fixture(file));
  await expect(page.getByTestId('dialog-message')).toHaveText('ファイルをインポートしました。', { timeout: 30_000 });
  await page.getByTestId('dialog-button-0').click();
  await expect(page.getByTestId('dialog-message')).toBeHidden();
}

/** 作図の種類（ポイント・ライン・ポリゴン・メモ）を選んで、ツールを出す */
export async function selectFeature(page: Page, feature: 'point' | 'line' | 'polygon' | 'memo') {
  // 種類のボタンは、いま選んでいる種類（未選択なら「ドロー」）だけが出ている。押すと選択肢が開く
  const current = page.locator(
    '[data-testid="home-feature-draw"], [data-testid="home-feature-point"], [data-testid="home-feature-line"], [data-testid="home-feature-polygon"], [data-testid="home-feature-memo"]'
  );
  await current.locator('visible=true').first().click();
  await page.getByTestId(`home-feature-${feature}`).click();
  await expect(page.getByTestId('home-editing-layer')).toBeVisible();
}

/** そのレイヤの記録の件数（レイヤ一覧からデータ一覧を開いて数える。データ一覧を開いたままにする） */
export async function recordCount(page: Page, layerName: string): Promise<number> {
  await openLayerData(page, layerName);
  await page.waitForTimeout(300);
  return dataRows(page).count();
}

/** 地図の出典表示 */
export const attribution = (page: Page): Locator => page.locator('.maplibregl-ctrl-attrib');

/** 地図を長押しする（標高・座標のポップアップが出る） */
export async function longPressMap(page: Page, x: number, y: number) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(1300);
  await page.mouse.up();
}
