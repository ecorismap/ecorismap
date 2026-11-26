import { expect, Page, test } from '@playwright/test';
import {
  dataRows,
  dialogButton,
  openApp,
  openLayerData,
  selectFeature,
  sheetBack,
  sheetClose,
} from '../support/app';

/** 確定すると、できた記録の編集画面が開く。戻るとそのレイヤのデータ一覧になる */
const saveAndBackToList = async (page: Page) => {
  await page.getByTestId('home-draw-save').click();
  await expect(page.getByTestId('dataedit-record-number')).toHaveText('1/1');
  await sheetBack(page);
  await expect(page.getByTestId('data-export')).toBeVisible();
};

/** 地図上を押したまま動かす */
const dragOnMap = async (page: Page, from: [number, number], to: [number, number]) => {
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  await page.mouse.move((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, { steps: 8 });
  await page.mouse.move(to[0], to[1], { steps: 8 });
  await page.mouse.up();
};

// 地図の左半分（シートに隠れない位置）を座標で操作する。結果はデータ一覧の件数で確かめる
test.describe('5. 作図', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  test('DRAW-2 ポイントを地図に追加でき、データ一覧に1件増える', async ({ page }) => {
    await selectFeature(page, 'point');
    await page.getByTestId('home-draw-plot-point').click();
    await page.mouse.click(300, 300);
    await page.getByTestId('home-draw-save').click();
    // できた記録の編集画面が開き、クリックした位置の経緯度が入っている
    await expect(page.getByTestId('dataedit-coords-longitude-decimal')).toHaveValue(/^13\d\.\d+/);
    await expect(page.getByTestId('dataedit-coords-latitude-decimal')).toHaveValue(/^3\d\.\d+/);
    await sheetBack(page);
    await expect(dataRows(page)).toHaveCount(1);
  });

  test('DRAW-2b 描きかけをキャンセルすると、記録は増えない', async ({ page }) => {
    await selectFeature(page, 'point');
    await page.getByTestId('home-draw-plot-point').click();
    await page.mouse.click(300, 300);
    await page.getByTestId('home-draw-cancel').click();
    await expect(page.getByTestId('dialog-message')).toHaveText('変更を破棄しますか？');
    await dialogButton(page, 'Yes').click();
    await expect(page.getByTestId('home-draw-save')).toBeHidden();
    await openLayerData(page, 'ポイント');
    await expect(dataRows(page)).toHaveCount(0);
  });

  test('DRAW-5 ラインをプロットで描いて保存できる', async ({ page }) => {
    await selectFeature(page, 'line');
    await page.getByTestId('home-draw-plot-line').click();
    for (const [x, y] of [
      [200, 250],
      [300, 300],
      [400, 260],
    ]) {
      await page.mouse.click(x, y);
      await page.waitForTimeout(300);
    }
    await saveAndBackToList(page);
    await expect(dataRows(page)).toHaveCount(1);
  });

  test('DRAW-7 ポリゴンをプロットで描いて保存できる', async ({ page }) => {
    await selectFeature(page, 'polygon');
    await page.getByTestId('home-draw-plot-polygon').click();
    for (const [x, y] of [
      [200, 250],
      [350, 250],
      [350, 400],
      [200, 400],
    ]) {
      await page.mouse.click(x, y);
      await page.waitForTimeout(300);
    }
    await saveAndBackToList(page);
    await expect(dataRows(page)).toHaveCount(1);
  });

  test('DRAW-11 元に戻すで、描きかけの点が取り消される', async ({ page }) => {
    await selectFeature(page, 'point');
    await page.getByTestId('home-draw-plot-point').click();
    await page.mouse.click(300, 300);
    await expect(page.getByTestId('home-draw-save')).toBeVisible();
    await page.getByTestId('home-draw-undo').click();
    await expect(page.getByTestId('home-draw-save')).toBeHidden();
  });

  // 地図の上をなぞる（手書き）
  const stroke = async (page: Page, points: [number, number][]) => {
    await page.mouse.move(points[0][0], points[0][1]);
    await page.mouse.down();
    for (const [x, y] of points.slice(1)) await page.mouse.move(x, y, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(500);
  };

  test('DRAW-6 ラインを手書き（ペン）で描いて保存できる', async ({ page }) => {
    await selectFeature(page, 'line');
    await page.getByTestId('home-draw-handwriting-line').click();
    await stroke(page, [
      [200, 250],
      [280, 320],
      [360, 260],
      [420, 330],
    ]);
    await saveAndBackToList(page);
    await expect(dataRows(page)).toHaveCount(1);
  });

  test('DRAW-8 ポリゴンを手書きで描いて保存できる', async ({ page }) => {
    await selectFeature(page, 'polygon');
    await page.getByTestId('home-draw-handwriting-polygon').click();
    await stroke(page, [
      [200, 250],
      [380, 250],
      [380, 400],
      [200, 400],
      [200, 255],
    ]);
    await saveAndBackToList(page);
    await expect(dataRows(page)).toHaveCount(1);
  });

  test('DRAW-12 情報ツールで図形をタップすると、その記録の編集画面が開く', async ({ page }) => {
    await selectFeature(page, 'point');
    await page.getByTestId('home-draw-plot-point').click();
    await page.mouse.click(300, 300);
    await page.getByTestId('home-draw-save').click();
    await expect(page.getByTestId('dataedit-record-number')).toHaveText('1/1');
    await sheetClose(page);

    // ツールを選んでいない状態で図形を押すと、情報の表示になる
    await page.mouse.click(300, 300);
    await expect(page.getByTestId('dataedit-record-number')).toHaveText('1/1');
    await expect(page.getByTestId('dataedit-layername')).toBeVisible();
  });

  test('DRAW-17 描きかけのまま地図を離れようとすると、破棄の確認が出る', async ({ page }) => {
    await selectFeature(page, 'point');
    await page.getByTestId('home-draw-plot-point').click();
    await page.mouse.click(300, 300);
    await expect(page.getByTestId('home-draw-save')).toBeVisible();
    // 別の画面（ログイン・アカウント）へ移ろうとする
    await page.getByTestId('home-account').click();
    await expect(page.getByTestId('dialog-message')).toContainText('破棄');
    // Noなら描きかけが残る
    await dialogButton(page, 'No').click();
    await expect(page.getByTestId('home-draw-save')).toBeVisible();
  });
  test('DRAW-16 データ編集の「位置」から、地図でポイントを動かして確定できる。戻るなら位置は変わらない', async ({ page }) => {
    await selectFeature(page, 'point');
    await page.getByTestId('home-draw-plot-point').click();
    await page.mouse.click(300, 300);
    await page.getByTestId('home-draw-save').click();
    const lon = page.getByTestId('dataedit-coords-longitude-decimal');
    const lat = page.getByTestId('dataedit-coords-latitude-decimal');
    await expect(lon).toHaveValue(/^13\d\.\d+/);
    const before = { lon: Number(await lon.inputValue()), lat: Number(await lat.inputValue()) };

    // 「位置」を押すと地図に戻り、そのポイントを動かす状態になる（移動の道具は最初から選ばれている）
    const dragPoint = async () => {
      await page.getByTestId('dataedit-edit-position').click();
      await expect(page.getByTestId('home-draw-finish-edit-position')).toBeVisible();
      await expect(page.getByTestId('home-draw-move-point')).toBeVisible();
      // 地図はそのポイントを中央に寄せる
      await page.waitForTimeout(1000);
      await dragOnMap(page, [640, 400], [740, 460]);
    };

    // 動かしてから「戻る」→破棄の確認→Yes: 編集画面に戻り、位置は変わっていない
    await dragPoint();
    await page.getByTestId('home-draw-finish-edit-position').click();
    await expect(page.getByTestId('dialog-message')).toHaveText('位置の変更を破棄しますか？');
    await dialogButton(page, 'Yes').click();
    await expect(page.getByTestId('home-draw-finish-edit-position')).toBeHidden();
    await expect(lon).toBeVisible();
    expect(Number(await lon.inputValue())).toBeCloseTo(before.lon, 9);
    expect(Number(await lat.inputValue())).toBeCloseTo(before.lat, 9);

    // 動かしてから「確定」: 編集画面に戻り、右下へ動かした分だけ経度が増え、緯度が減っている
    await dragPoint();
    await page.getByTestId('home-draw-save').click();
    await expect(page.getByTestId('home-draw-finish-edit-position')).toBeHidden();
    await expect(page.getByTestId('dataedit-record-number')).toHaveText('1/1');
    await expect.poll(async () => Number(await lon.inputValue())).toBeGreaterThan(before.lon + 0.0001);
    expect(Number(await lat.inputValue())).toBeLessThan(before.lat - 0.0001);

    // 記録は増えていない
    await sheetBack(page);
    await expect(dataRows(page)).toHaveCount(1);
  });

  test('DRAW-4 ポイントを選んで移動・削除できる', async ({ page }) => {
    await selectFeature(page, 'point');
    await page.getByTestId('home-draw-plot-point').click();
    await page.mouse.click(300, 300);
    await page.getByTestId('home-draw-save').click();
    const lon = page.getByTestId('dataedit-coords-longitude-decimal');
    await expect(lon).toHaveValue(/^13\d\.\d+/);
    const before = Number(await lon.inputValue());
    await sheetClose(page);

    // 選択ツールでポイントを押すと、移動と削除のボタンが出る
    const selectPoint = async (x: number, y: number) => {
      await page.getByTestId('home-draw-select').click();
      await page.mouse.click(x, y);
      await expect(page.getByTestId('home-draw-move-point')).toBeVisible();
      await expect(page.getByTestId('home-draw-delete')).toBeVisible();
    };
    await selectPoint(300, 300);

    // 動かして確定すると、右へ動かした分だけ経度が増える
    await dragOnMap(page, [300, 300], [400, 360]);
    await page.getByTestId('home-draw-save').click();
    await expect(page.getByTestId('home-draw-save')).toBeHidden();
    // レイヤのボタンは、閉じていた編集画面を開き直す。動かした後の経度になっている
    await page.getByTestId('home-layers').click();
    await expect(page.getByTestId('dataedit-record-number')).toHaveText('1/1');
    await expect.poll(async () => Number(await lon.inputValue())).toBeGreaterThan(before + 0.0001);
    await sheetClose(page);

    // 選んで削除すると、記録がなくなる
    await selectPoint(400, 360);
    await page.getByTestId('home-draw-delete').click();
    await expect(page.getByTestId('dialog-message')).toBeVisible();
    await expect(page.locator('.maplibregl-marker')).toHaveCount(1);
    await dialogButton(page, 'Yes').click();
    await expect(page.locator('.maplibregl-marker')).toHaveCount(0);
    await expect(page.getByTestId('home-draw-delete')).toBeHidden();
    // レイヤのボタンで、開いていた記録の代わりにデータ一覧が開き、0件になっている
    await page.getByTestId('home-layers').click();
    await expect(page.getByTestId('data-add')).toBeVisible();
    await expect(dataRows(page)).toHaveCount(0);
  });
});
