import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Browser, BrowserContext, expect, Page, test } from '@playwright/test';
import {
  attribution,
  chooseFile,
  dataRows,
  dialogButton,
  fixture,
  layerRowIndex,
  longPressMap,
  okIfShown,
  openLayerData,
  openLayers,
  openLayerSettings,
  plainText,
  selectFeature,
  sheetBack,
  sheetClose,
  text,
} from '../support/app';
import {
  answerDialog,
  closeProject,
  createProject,
  download,
  gotoProjects,
  login,
  openProject,
  openProjectEdit,
  openProjectSetting,
  projectButton,
  saveProjectSetting,
  upload,
  UserKey,
  USERS,
} from '../support/emu';

/** 別の端末（別のブラウザ）として、ログインしたページを開く */
const anotherDevice = async (browser: Browser, who: UserKey) => {
  const context = await browser.newContext({
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  await login(page, who);
  return { context, page };
};

/** オーナーでログインしてプロジェクトを作る。permission を渡すと「ポイント」レイヤの共有範囲を変える（プロジェクト一覧へ戻る） */
const setupProject = async (
  page: Page,
  name: string,
  opts: { members?: string[]; permission?: 'public' | 'common'; inSetting?: (page: Page) => Promise<void> } = {}
) => {
  await login(page, 'owner');
  await createProject(page, name, opts.members ?? []);
  if (opts.permission === undefined && opts.inSetting === undefined) return;
  await openProjectSetting(page, name);
  if (opts.permission !== undefined) {
    await openLayerSettings(page, 'ポイント');
    await page.getByTestId(`layeredit-permission-${opts.permission}`).click();
    await page.getByTestId('layeredit-save').click();
    await sheetClose(page);
  }
  if (opts.inSetting !== undefined) await opts.inSetting(page);
  await saveProjectSetting(page);
  await page.getByTestId('projectedit-back').click();
};

/**
 * 「ポイント」レイヤに記録を1件足して、cmt を入れて保存する（シートを閉じて地図に戻る）。
 * beforeSave は、データ編集の画面で保存の前に行う操作（写真を付けるなど）
 */
const addPoint = async (page: Page, x: number, y: number, cmt: string, beforeSave?: () => Promise<void>) => {
  await selectFeature(page, 'point');
  await page.getByTestId('home-draw-plot-point').click();
  await page.mouse.click(x, y);
  await page.getByTestId('home-draw-save').click();
  await page.getByTestId('dataedit-input-cmt').fill(cmt);
  if (beforeSave !== undefined) await beforeSave();
  await page.getByTestId('dataedit-save').click();
  // 保存するとデータ一覧に戻る。レイヤ一覧まで戻してから閉じる（次に開いたときにレイヤ一覧が出るように）
  await expect(page.getByTestId('data-export')).toBeVisible();
  await sheetBack(page);
  await expect(page.getByTestId('layers-row-0')).toBeVisible();
  await sheetClose(page);
};

// 「ポイント」レイヤの項目は name / time / cmt / photo の順。データ一覧の cmt は3列目
const CMT = 2;
const cmtCell = (page: Page, row: number) => page.getByTestId(`data-cell-${row}-${CMT}`);

/** 「ポイント」レイヤのデータ一覧を開き、全ての行の cmt を返す（データ一覧を開いたままにする） */
const openPointList = async (page: Page): Promise<string[]> => {
  await openLayerData(page, 'ポイント');
  await page.waitForTimeout(300);
  const n = await dataRows(page).count();
  const result: string[] = [];
  for (let i = 0; i < n; i++) result.push(plainText(await cmtCell(page, i).innerText()));
  return result;
};

/** データ一覧からレイヤ一覧へ戻してシートを閉じる */
const closeList = async (page: Page) => {
  await sheetBack(page);
  await expect(page.getByTestId('layers-row-0')).toBeVisible();
  await sheetClose(page);
};

/** 「ポイント」レイヤの全ての記録の cmt（並べ替えて返す。シートは閉じる） */
const pointCmts = async (page: Page): Promise<string[]> => {
  const result = await openPointList(page);
  await closeList(page);
  return result.sort();
};

/** 「ポイント」レイヤのデータ一覧から、cmt がその値の記録の編集画面を開く */
const openPointRecord = async (page: Page, cmt: string) => {
  const list = await openPointList(page);
  const row = list.indexOf(cmt);
  if (row < 0) throw new Error(`記録が見つかりません: ${cmt}（${list.join(', ')}）`);
  await page.getByTestId(`data-row-${row}`).click();
  await expect(page.getByTestId('dataedit-input-cmt')).toHaveValue(cmt);
};

/** 開いている記録の cmt を書き換えて保存する（データ一覧に戻るので、シートを閉じる） */
const saveCmt = async (page: Page, cmt: string) => {
  await page.getByTestId('dataedit-input-cmt').fill(cmt);
  await page.getByTestId('dataedit-save').click();
  await expect(page.getByTestId('data-export')).toBeVisible();
  await closeList(page);
};

/**
 * 開いている記録の cmt を書き換えて保存しようとし、断られることを確かめる（理由が出て、保存されない）。
 * 変更を捨ててデータ一覧へ戻り、シートを閉じる
 */
const expectCannotSave = async (page: Page, cmt: string, reason: string) => {
  await page.getByTestId('dataedit-input-cmt').fill(cmt);
  await page.getByTestId('dataedit-save').click();
  await answerDialog(page, reason, 'OK');
  await sheetBack(page);
  // 変更を捨てるかを聞かれたら捨てる
  const discard = page.locator('[data-testid^="dialog-button-"]').getByText('Yes', { exact: true });
  await discard.click({ timeout: 3000 }).catch(() => undefined);
  await expect(page.getByTestId('data-export')).toBeVisible();
  await closeList(page);
};

/** 管理者として取得する（他のメンバーの非公開データは取らない） */
const downloadAsAdmin = async (page: Page) => {
  await (await projectButton(page, 'download')).click();
  await answerDialog(page, '更新されたデータを取得しますか？', 'Yes');
  await answerDialog(page, '管理者として他のメンバーの非公開データもダウンロードしますか？', 'No');
  await answerDialog(page, 'データを取得しました。', 'OK');
};

/** タブを閉じる・再読み込みするときに、離脱の確認が出る状態か（Web版は beforeunload を止めることで確認を出す） */
const wouldWarnOnLeave = (page: Page) =>
  page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });

/** 画面のその位置の色（地図の canvas は直接読めないので、スクリーンショットから読む） */
const pixelAt = async (page: Page, x: number, y: number): Promise<[number, number, number]> => {
  const shot = await page.screenshot({ clip: { x: Math.round(x), y: Math.round(y), width: 1, height: 1 } });
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
    return [r, g, b] as [number, number, number];
  }, shot.toString('base64'));
};

const lonLatAt = async (page: Page, x: number, y: number): Promise<[number, number]> => {
  const coordinate = page.getByTestId('home-poi-coordinate');
  const previous = await coordinate.innerText({ timeout: 500 }).catch(() => '');
  await longPressMap(page, x, y);
  await expect(coordinate).toHaveText(/^-?\d+\.\d+, -?\d+\.\d+$/);
  await expect(coordinate).not.toHaveText(previous, { timeout: 1500 }).catch(() => undefined);
  const [lat, lon] = (await coordinate.innerText()).split(',').map((s) => Number(s.trim()));
  return [lon, lat];
};

/** ZIPの中の、その拡張子のファイルの中身をつなげたもの */
const zipText = (file: string, ext: string): string =>
  execFileSync('unzip', ['-p', file, `*${ext}`], { maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' });

/** 画面の (200,250)〜(500,550) に重なる、1色で塗ったジオPDF（MAPS-10 と同じ作り） */
function buildGeoPdf(bounds: { west: number; south: number; east: number; north: number }, rgb: [number, number, number]) {
  const size = 200;
  const content = `${rgb.join(' ')} rg 0 0 ${size} ${size} re f`;
  const { west, south, east, north } = bounds;
  const gpts = [south, west, north, west, north, east, south, east].join(' ');
  const wkt =
    'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${size} ${size}] /Resources << >> /Contents 4 0 R /VP [5 0 R] >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    `<< /Type /Viewport /BBox [0 0 ${size} ${size}] /Measure 6 0 R >>`,
    `<< /Type /Measure /Subtype /GEO /Bounds [0 0 0 1 1 1 1 0] /LPTS [0 0 0 1 1 1 1 0] /GPTS [${gpts}] /GCS 7 0 R >>`,
    `<< /Type /GEOGCS /EPSG 4326 /WKT (${wkt}) >>`,
  ];
  let pdf = '%PDF-1.7\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

/**
 * 軌跡レイヤ（メンバーと共有・ユーザー別の色）に、自分の軌跡を1本入れる。
 * Webでは記録ができないので、軌跡レイヤの書き出し形式（レイヤ設定＋GeoJSON）のZIPを作り、「置き換える」で取り込む。
 * レイヤ設定は、設定モードで軌跡レイヤを「メンバーと共有」にしたときと同じ内容にしておく
 */
async function importSharedTrack(page: Page, y: number, recordId: string) {
  const from = await lonLatAt(page, 160, y);
  const to = await lonLatAt(page, 560, y);
  const coordinates: number[][] = [];
  const timestamps: number[] = [];
  for (let i = 0; i <= 40; i++) {
    const r = i / 40;
    coordinates.push([from[0] + (to[0] - from[0]) * r, from[1] + (to[1] - from[1]) * r, 100]);
    timestamps.push(Date.parse('2026-01-15T09:00:00+09:00') + i * 10_000);
  }
  const layer = {
    id: 'track',
    name: '軌跡',
    type: 'LINE',
    permission: 'PUBLIC',
    colorStyle: {
      colorType: 'USER',
      transparency: 0,
      color: '#0000ff',
      fieldName: 'name',
      customFieldValue: '',
      colorRamp: 'RANDOM',
      colorList: [],
      lineWidth: 6,
    },
    label: '',
    visible: true,
    active: false,
    field: [
      { id: 'e2etrackname', name: 'name', format: 'SERIAL' },
      { id: 'e2etracktime', name: 'time', format: 'DATETIME' },
      { id: 'e2etrackcmt', name: 'cmt', format: 'STRING' },
    ],
  };
  const geojson = {
    type: 'FeatureCollection',
    name: '軌跡',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates },
        properties: { _id: recordId, name: '共有の軌跡', time: '', cmt: '', _timestamps: timestamps },
      },
    ],
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecorismap-e2e-25-'));
  fs.writeFileSync(path.join(dir, 'track.json'), JSON.stringify(layer));
  fs.writeFileSync(path.join(dir, 'track.geojson'), JSON.stringify(geojson));
  const zipFile = path.join(dir, 'track.zip');
  execFileSync('zip', ['-j', '-q', zipFile, path.join(dir, 'track.json'), path.join(dir, 'track.geojson')]);
  await openLayers(page);
  await chooseFile(page, page.getByTestId('layers-import'), zipFile);
  await expect(text(page, 'レイヤ「軌跡」は既に存在します。どうしますか？')).toBeVisible({ timeout: 30_000 });
  await dialogButton(page, '置き換える').click();
  await expect(page.getByTestId('dialog-message')).toHaveText('ファイルをインポートしました。', { timeout: 30_000 });
  await page.getByTestId('dialog-button-0').click();
  await expect(page.getByTestId('dialog-message')).toBeHidden();
  await sheetClose(page);
  fs.rmSync(dir, { recursive: true, force: true });
}

const ADMIN_ONLY = '他のメンバーやテンプレートの記録を変更・削除できるのは管理者だけです。';
const LOCKED = 'このレイヤは編集できません。';
const CONFLICT =
  /^このデータは別の端末で更新されています。どうしますか？\s+マージ：両方の変更を残します\s+上書き：この端末の内容で上書きします（別端末の変更は失われます）$/;

// エミュレータの中身は全テストで共有する。テストごとに別の名前のプロジェクトを作り、名前で探す
test.describe('16. 共有プロジェクト（共同作業）', () => {
  test.beforeEach(() => {
    test.setTimeout(240_000);
  });

  /** オーナーが写真付きの記録を送信し、メンバーが開いてその記録の編集画面を出す */
  const sharePhotoRecord = async (page: Page, browser: Browser, projectName_: string, uploaded: string | RegExp) => {
    await setupProject(page, projectName_, { members: [USERS.member.email], permission: 'public' });
    await openProject(page, projectName_, { admin: true });
    await addPoint(page, 300, 300, '写真つき', async () => {
      await chooseFile(page, page.getByTestId('dataedit-photo-library'), fixture('photo1.jpg'));
      await expect(page.getByTestId('dataedit-photo-thumb-0')).toBeVisible({ timeout: 30_000 });
    });
    await (await projectButton(page, 'upload')).click();
    await answerDialog(page, 'データを送信しますか？', 'Yes');
    await answerDialog(page, uploaded, 'OK');
    const device = await anotherDevice(browser, 'member');
    await openProject(device.page, projectName_, { admin: false });
    await openPointRecord(device.page, '写真つき');
    return device;
  };

  // エミュレータ接続（暗号化なし）では、写真そのものは Storage に送れない（下の fixme を参照）。
  // ここでは、記録と一緒に送られるサムネイルがメンバーに届くところまでを確かめる
  test('PROJ-6 写真付きの記録を送信すると、別のメンバーが取得した記録に写真のサムネイルが出る', async ({ page, browser }) => {
    const { context, page: member } = await sharePhotoRecord(page, browser, '写真の確認', /^データ(を|は)アップロードしま/);
    const thumb = member.getByTestId('dataedit-photo-thumb-0');
    await expect(thumb).toBeVisible();
    // サムネイルの画像が読み込まれている（高さ150pxに縮めたもの。元の photo1.jpg は 800x600）
    await expect
      .poll(() => thumb.locator('img').evaluate((img) => [(img as HTMLImageElement).naturalWidth, (img as HTMLImageElement).naturalHeight]))
      .toEqual([200, 150]);
    await expect(member.locator('[data-testid^="dataedit-photo-thumb-"]')).toHaveCount(1);
    await context.close();
  });

  // TODO(tmizu23): エミュレータ接続では通らない。暗号化なしのとき encryptFileEThree は key を '' で返し
  // （src/lib/virgilsecurity/e3kit.web.ts）、uploadPhoto の `if (!payload || !key)` がそれを暗号化の失敗として
  // 扱うため（src/lib/firebase/storage.ts）、写真が Storage へ送られない。そこが通るようになったら fixme を外す
  // （エミュレータでは一度も通せていないので、外すときに手順を確かめ直すこと）
  test.fixme('PROJ-6b 取得した記録の写真を押すと、Storage に送られた元の写真が開く', async ({ page, browser }) => {
    const { context, page: member } = await sharePhotoRecord(page, browser, '写真を開く確認', 'データをアップロードしました。');
    const storageRequest = member.waitForRequest((req) => req.url().includes('localhost:9199'), { timeout: 30_000 });
    await member.getByTestId('dataedit-photo-thumb-0').click();
    await storageRequest;
    await expect(member.getByTestId('photo-view-close')).toBeVisible({ timeout: 30_000 });
    await expect(member.getByTestId('photo-view-counter')).toHaveText('1 / 1');
    // サムネイルではなく、元の大きさ（幅800px）の画像が読み込まれている
    await expect
      .poll(
        () =>
          member.evaluate(() =>
            Math.max(0, ...Array.from(document.querySelectorAll('img')).map((img) => (img.complete ? img.naturalWidth : 0)))
          ),
        { timeout: 30_000 }
      )
      .toBe(800);
    await member.getByTestId('photo-view-close').click();
    await context.close();
  });

  /** 同じアカウントの2台で同じ記録を開き、2台目が書き換えたあと（未送信）、1台目が別の値に書き換えて送信する */
  const editOnTwoDevices = async (page: Page, browser: Browser, projectName_: string) => {
    await setupProject(page, projectName_);
    await openProject(page, projectName_, { admin: true });
    await addPoint(page, 300, 300, '元の値');
    await upload(page);
    const device = await anotherDevice(browser, 'owner');
    await openProject(device.page, projectName_, { admin: true });
    expect(await pointCmts(device.page)).toEqual(['元の値']);
    await openPointRecord(device.page, '元の値');
    await saveCmt(device.page, '2台目の値');
    await openPointRecord(page, '元の値');
    await saveCmt(page, '1台目の値');
    await upload(page);
    return device;
  };

  /** 競合の解決画面に並んでいる候補の cmt（上から順） */
  const conflictCmts = async (page: Page) =>
    (await page.getByText(/"cmt": "/).allInnerTexts()).map((s) => s.match(/"cmt": "([^"]*)"/)?.[1] ?? '');

  test('PROJ-7 同じ記録を2台で変えてから取得すると、競合の解決画面が出て、選んだ方が残る', async ({ page, browser }) => {
    const { context, page: second } = await editOnTwoDevices(page, browser, '競合の確認');

    // 2台目が取得すると、記録ごとにどちらを残すかを選ぶ画面が出る（上が手元、下がクラウド）
    await (await projectButton(second, 'download')).click();
    await answerDialog(second, '更新されたデータを取得しますか？', 'Yes');
    await answerDialog(second, '管理者として他のメンバーの非公開データもダウンロードしますか？', 'No');
    const candidates = second.locator('[data-testid^="home-conflict-apply-"]');
    await expect(candidates).toHaveCount(2);
    expect(await conflictCmts(second)).toEqual(['2台目の値', '1台目の値']);
    // クラウドの方（1台目の値）を採用する
    await second.getByTestId('home-conflict-apply-1').click();
    await answerDialog(second, 'データを取得しました。', 'OK');
    await expect(candidates).toHaveCount(0);
    expect(await pointCmts(second)).toEqual(['1台目の値']);
    await context.close();
  });

  test('PROJ-7b 競合の解決画面で手元の方を選ぶと、手元の値が残り、送信すると相手にも届く', async ({ page, browser }) => {
    const { context, page: second } = await editOnTwoDevices(page, browser, '競合で手元を残す確認');
    await (await projectButton(second, 'download')).click();
    await answerDialog(second, '更新されたデータを取得しますか？', 'Yes');
    await answerDialog(second, '管理者として他のメンバーの非公開データもダウンロードしますか？', 'No');
    await expect(second.locator('[data-testid^="home-conflict-apply-"]')).toHaveCount(2);
    expect(await conflictCmts(second)).toEqual(['2台目の値', '1台目の値']);
    await second.getByTestId('home-conflict-apply-0').click();
    await answerDialog(second, 'データを取得しました。', 'OK');
    expect(await pointCmts(second)).toEqual(['2台目の値']);

    // 選んだあとの送信では、もう競合にならない。1台目が取得すると、こんどは1台目に競合の解決画面が出る
    await upload(second);
    await (await projectButton(page, 'download')).click();
    await answerDialog(page, '更新されたデータを取得しますか？', 'Yes');
    await answerDialog(page, '管理者として他のメンバーの非公開データもダウンロードしますか？', 'No');
    await expect(page.locator('[data-testid^="home-conflict-apply-"]')).toHaveCount(2);
    expect(await conflictCmts(page)).toEqual(['1台目の値', '2台目の値']);
    await page.getByTestId('home-conflict-apply-1').click();
    await answerDialog(page, 'データを取得しました。', 'OK');
    expect(await pointCmts(page)).toEqual(['2台目の値']);
    await context.close();
  });

  test('PROJ-7c 別の端末で変わった記録を送信しようとすると、マージか上書きかを聞かれる。マージは新しい方が残る', async ({
    page,
    browser,
  }) => {
    const { context, page: second } = await editOnTwoDevices(page, browser, '送信の競合の確認');
    await (await projectButton(second, 'upload')).click();
    await answerDialog(second, 'データを送信しますか？', 'Yes');
    await answerDialog(second, CONFLICT, 'マージ');
    await answerDialog(second, 'データをアップロードしました。', 'OK');
    // 後から書き換えた1台目の値がクラウドに残っている（3台目で開いて確かめる。上書きを選ぶと2台目の値になる）
    const third = await anotherDevice(browser, 'owner');
    await openProject(third.page, '送信の競合の確認', { admin: true });
    expect(await pointCmts(third.page)).toEqual(['1台目の値']);
    await third.context.close();
    await context.close();
  });

  test('PROJ-9 一般メンバーは他人の記録を編集できない。管理者は編集でき、その変更がメンバーに届く', async ({ page, browser }) => {
    await setupProject(page, '権限の確認', { members: [USERS.member.email], permission: 'public' });
    await openProject(page, '権限の確認', { admin: true });
    await addPoint(page, 300, 300, 'オーナーの記録');
    await upload(page);

    // メンバー: 自分の記録を送信する。オーナーの記録は見えるが、変えられない
    const { context, page: member } = await anotherDevice(browser, 'member');
    await openProject(member, '権限の確認', { admin: false });
    await addPoint(member, 400, 350, 'メンバーの記録');
    await upload(member);
    await openPointRecord(member, 'オーナーの記録');
    await expect(member.getByTestId('dataedit-modify-block')).toHaveText(ADMIN_ONLY);
    await expectCannotSave(member, 'メンバーが書き換えた', ADMIN_ONLY);
    expect(await pointCmts(member)).toEqual(['オーナーの記録', 'メンバーの記録']);

    // オーナー（管理者）: メンバーの記録を取得して書き換え、送信できる
    await downloadAsAdmin(page);
    await openPointRecord(page, 'メンバーの記録');
    await expect(page.getByTestId('dataedit-modify-block')).toHaveCount(0);
    await saveCmt(page, '管理者が直した');
    await upload(page);

    // メンバーが取得すると、管理者が直した値になっている
    await download(member);
    expect(await pointCmts(member)).toEqual(['オーナーの記録', '管理者が直した']);
    await context.close();
  });

  test('PROJ-10 共通データのレイヤの記録は全員に見え、調査中は誰も変えられない。設定モードで変えると全員に届く', async ({
    page,
    browser,
  }) => {
    // オーナー: 設定モードで「ポイント」を共通データにして、記録を1件入れる
    await setupProject(page, '共通データの確認', {
      members: [USERS.member.email],
      permission: 'common',
      inSetting: (p) => addPoint(p, 300, 300, '共通の基準点'),
    });

    // メンバー: 開くと共通の記録が入っている。書き換えようとすると、編集できないと出る
    const { context, page: member } = await anotherDevice(browser, 'member');
    await openProject(member, '共通データの確認', { admin: false });
    await openPointRecord(member, '共通の基準点');
    await expectCannotSave(member, 'メンバーが書き換えた', LOCKED);
    expect(await pointCmts(member)).toEqual(['共通の基準点']);

    // オーナー（管理者）も、調査中（プロジェクトを開いている間）は書き換えられない
    await openProject(page, '共通データの確認', { admin: true });
    await openPointRecord(page, '共通の基準点');
    await expectCannotSave(page, 'オーナーが書き換えた', LOCKED);
    expect(await pointCmts(page)).toEqual(['共通の基準点']);
    await closeProject(page);

    // 設定モードで書き換えて保存すると、メンバーが開き直したときに届く
    await gotoProjects(page);
    await openProjectSetting(page, '共通データの確認');
    await openPointRecord(page, '共通の基準点');
    await saveCmt(page, '直した基準点');
    await saveProjectSetting(page);
    await closeProject(member);
    await gotoProjects(member);
    await openProject(member, '共通データの確認', { admin: false });
    expect(await pointCmts(member)).toEqual(['直した基準点']);
    await context.close();
  });

  test('PROJ-11 軌跡レイヤを共有にするとユーザー別の色になり、メンバーの軌跡が記録者名つきで出る', async ({ page, browser }) => {
    // オーナー: 設定モードで軌跡レイヤを「メンバーと共有」にすると、カラータイプがユーザー別に変わる
    await setupProject(page, '軌跡の共有の確認', {
      members: [USERS.member.email],
      inSetting: async (p) => {
        await openLayerSettings(p, '軌跡');
        await p.getByTestId('layeredit-permission-public').click();
        await p.getByTestId('layeredit-save').click();
        await sheetBack(p);
        const i = await layerRowIndex(p, '軌跡');
        await p.getByTestId(`layers-style-${i}`).click();
        await expect(p.getByTestId('featurestyle-color-type')).toContainText('ユーザー別');
        await sheetBack(p);
        await sheetClose(p);
      },
    });

    // オーナーとメンバーが、それぞれ軌跡を1本ずつ送信する（上と下に離して置く）
    await openProject(page, '軌跡の共有の確認', { admin: true });
    await importSharedTrack(page, 350, 'e2esharedtrackowner00001');
    await upload(page);
    const { context, page: member } = await anotherDevice(browser, 'member');
    await openProject(member, '軌跡の共有の確認', { admin: false });
    await importSharedTrack(member, 450, 'e2esharedtrackmember0001');
    await upload(member);

    // オーナーが取得すると、メンバーの軌跡が自分の軌跡と別の色で出る
    const background = await pixelAt(page, 360, 450);
    await downloadAsAdmin(page);
    const distance = (a: number[], b: number[]) => Math.max(...a.map((v, k) => Math.abs(v - b[k])));
    await expect.poll(async () => distance(await pixelAt(page, 360, 450), background)).toBeGreaterThan(40);
    const ownColor = await pixelAt(page, 360, 350);
    const memberColor = await pixelAt(page, 360, 450);
    expect(distance(ownColor, memberColor)).toBeGreaterThan(40);

    // 軌跡をタップすると、記録者の名前が出る
    await page.mouse.click(360, 450);
    await expect(page.getByTestId('home-trackpoint-coordinate')).toBeVisible();
    await expect(text(page, USERS.member.name)).toBeVisible();
    await page.getByTestId('home-trackpoint-close').click();
    await page.mouse.click(360, 350);
    await expect(page.getByTestId('home-trackpoint-coordinate')).toBeVisible();
    await expect(text(page, USERS.owner.name)).toBeVisible();
    await context.close();
  });

  test('PROJ-13 未送信の変更があるままタブを閉じようとすると、離脱の確認が出る。送信すると出なくなる', async ({ page }) => {
    await setupProject(page, '未送信の確認');
    await openProject(page, '未送信の確認', { admin: true });
    // 開いただけでは出ない
    expect(await wouldWarnOnLeave(page)).toBe(false);

    // 記録を足すと出る。実際に閉じようとすると、ブラウザの離脱確認が出て、やめるとページが残る
    await addPoint(page, 300, 300, '未送信');
    expect(await wouldWarnOnLeave(page)).toBe(true);
    const dialogs: string[] = [];
    page.once('dialog', (dialog) => {
      dialogs.push(dialog.type());
      void dialog.dismiss();
    });
    await page.close({ runBeforeUnload: true });
    await expect.poll(() => dialogs).toEqual(['beforeunload']);
    expect(page.isClosed()).toBe(false);
    await expect(page.getByTestId('home-project-label')).toHaveText('未送信の確認');

    // 送信すると出なくなり、そのあと書き換えるとまた出る
    await upload(page);
    expect(await wouldWarnOnLeave(page)).toBe(false);
    await openPointRecord(page, '未送信');
    await saveCmt(page, '送信後の変更');
    expect(await wouldWarnOnLeave(page)).toBe(true);

    // プロジェクトを終了するときも、送信していないデータは捨てられると出る
    await (await projectButton(page, 'close')).click();
    await answerDialog(page, 'プロジェクトを終了しますか？アップロードしていないデータは破棄されます！！', 'No');
    await expect(page.getByTestId('home-project-label')).toHaveText('未送信の確認');
  });

  test('PROJ-16 プロジェクトのデータをエクスポートすると、メンバー全員の記録がZIPに入る', async ({ page, browser }, testInfo) => {
    await setupProject(page, 'エクスポートの確認', { members: [USERS.member.email], permission: 'public' });
    await openProject(page, 'エクスポートの確認', { admin: true });
    await addPoint(page, 300, 300, 'オーナーの書き出し');
    await upload(page);
    const { context, page: member } = await anotherDevice(browser, 'member');
    await openProject(member, 'エクスポートの確認', { admin: false });
    await addPoint(member, 400, 350, 'メンバーの書き出し');
    await upload(member);
    await context.close();

    // オーナー: プロジェクトを終了して、編集画面からエクスポートする（Webはダウンロードになる）
    await closeProject(page);
    await gotoProjects(page);
    await openProjectEdit(page, 'エクスポートの確認');
    const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
    await page.getByTestId('projectedit-export').click();
    const file = await downloadPromise;
    expect(file.suggestedFilename()).toMatch(/^エクスポートの確認_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.zip$/);
    const saved = testInfo.outputPath('project-export.zip');
    await file.saveAs(saved);

    // クラウドにある全員の記録が入っている（オーナーは取得していないメンバーの記録も）
    const geojson = zipText(saved, '.geojson');
    expect(geojson).toContain('オーナーの書き出し');
    expect(geojson).toContain('メンバーの書き出し');
    // レイヤの設定も入っている
    expect(zipText(saved, '.json')).toContain('"ポイント"');
  });

  const isMagenta = ([r, g, b]: [number, number, number]) => r > 200 && g < 80 && b > 200;
  // ベクタタイルの配信元は実在しない。外へ出ていかないよう、どちらの端末でも止める
  const blockTiles = (p: Page) => p.route(/vector\.e2e\.invalid/, (route) => route.abort());

  /** オーナーが設定モードでPDF地図とスタイルつきの地図を入れて保存し、メンバーがそのプロジェクトを開く */
  const shareMaps = async (page: Page, browser: Browser, projectName_: string) => {
    await blockTiles(page);
    await setupProject(page, projectName_, {
      members: [USERS.member.email],
      inSetting: async (p) => {
        // PDF地図（画面の左寄りに重なる、マゼンタ1色）
        const [west, north] = await lonLatAt(p, 200, 250);
        const [east, south] = await lonLatAt(p, 500, 550);
        const pdf = buildGeoPdf({ west, south, east, north }, [1, 0, 1]);
        await p.getByTestId('home-maps').click();
        await expect(p.getByTestId('maps-add')).toBeVisible();
        const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.getByTestId('maps-import').click()]);
        await chooser.setFiles({ name: 'e2e-shared.pdf', mimeType: 'application/pdf', buffer: pdf });
        await okIfShown(p, 60_000);
        await expect(text(p, 'e2e-shared', false)).toBeVisible({ timeout: 30_000 });
        await expect.poll(async () => isMagenta(await pixelAt(p, 350, 400)), { timeout: 30_000 }).toBe(true);
        // スタイルつきのベクタタイルの地図
        await p.getByTestId('maps-add').click();
        await p.getByTestId('mapedit-name').fill('スタイルつき');
        await p.getByTestId('mapedit-url').fill('https://vector.e2e.invalid/{z}/{x}/{y}.pbf');
        await chooseFile(p, p.getByTestId('mapedit-import-style'), fixture('vegetation-style.json'));
        await expect(p.getByTestId('mapedit-style-url')).toHaveValue('style://vegetation-style.json');
        await p.getByTestId('mapedit-save').click();
        await sheetBack(p);
        await expect(p.getByTestId('maps-add')).toBeVisible();
        await sheetClose(p);
      },
    });
    const device = await anotherDevice(browser, 'member');
    await blockTiles(device.page);
    return device;
  };

  /** その端末（ブラウザ内の保存領域）に入っている、地図のスタイルの中身 */
  const storedStyles = (page: Page) =>
    page.evaluate(async () => {
      const styles: string[] = [];
      for (const { name } of await indexedDB.databases()) {
        if (name === undefined) continue;
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open(name);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        if (db.objectStoreNames.contains('pmtiles')) {
          const rows = await new Promise<{ style?: string }[]>((resolve, reject) => {
            const req = db.transaction('pmtiles').objectStore('pmtiles').getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          });
          rows.forEach((row) => typeof row.style === 'string' && row.style !== '' && styles.push(row.style));
        }
        db.close();
      }
      return styles;
    });

  // エミュレータ接続（暗号化なし）では、メンバーはPDF地図の本体を取得できない（下の fixme を参照）。
  // ここでは、地図の一覧に2つとも入ることと、スタイルの中身がメンバーの端末に届くことを確かめる。
  // スタイルを当てた描画は確かめていない（配信元のベクタタイルが要る）
  test('PROJ-19 設定モードで入れたPDF地図とスタイルつきの地図が、メンバーの地図一覧に入り、スタイルが端末に届く', async ({
    page,
    browser,
  }) => {
    const { context, page: member } = await shareMaps(page, browser, '地図の共有の確認');
    // 開く前は、メンバーの端末にスタイルは無い
    expect(await storedStyles(member)).toEqual([]);
    await openProject(member, '地図の共有の確認', { admin: false });
    await okIfShown(member, 3000);
    await member.getByTestId('home-maps').click();
    const rows = member.locator('[data-testid^="maps-row-"]');
    await expect(rows.first()).toBeVisible();
    const names = (await rows.allInnerTexts()).map(plainText);
    expect(names.filter((n) => n.includes('e2e-shared'))).toHaveLength(1);
    expect(names).toContain('スタイルつき');
    const stored = await storedStyles(member);
    expect(stored).toHaveLength(1);
    expect(JSON.parse(stored[0])).toEqual(JSON.parse(fs.readFileSync(fixture('vegetation-style.json'), 'utf8')));
    await context.close();
  });

  // TODO(tmizu23): エミュレータ接続では通らない。暗号化なしのとき encryptFileEThree は key を '' で返し、
  // 地図一覧のダウンロードで呼ばれる取り込み処理の `if (!key) return { isOK: false, ... }`（src/hooks/useMaps.ts）が
  // それを鍵なしとして断るため、メンバーの端末にPDFが入らない。そこが通るようになったら fixme を外す
  // （エミュレータでは一度も通せていないので、外すときに手順を確かめ直すこと）
  test.fixme('PROJ-19b 共有のPDF地図が、メンバーの端末で同じ位置に表示される', async ({ page, browser }) => {
    const { context, page: member } = await shareMaps(page, browser, 'PDF地図の表示の確認');
    await member.getByTestId('projects-back').click();
    expect(isMagenta(await pixelAt(member, 350, 400))).toBe(false);
    await gotoProjects(member);
    await openProject(member, 'PDF地図の表示の確認', { admin: false });
    await okIfShown(member, 3000);
    // 地図一覧で、PDF地図のダウンロードを押すと本体が取り込まれる
    await member.getByTestId('home-maps').click();
    const row = member.locator('[data-testid^="maps-row-"]').filter({ hasText: 'e2e-shared' });
    const i = ((await row.getAttribute('data-testid')) ?? '').replace('maps-row-', '');
    await member.getByTestId(`maps-download-${i}`).click();
    await okIfShown(member, 60_000);
    await sheetClose(member);
    await expect.poll(async () => isMagenta(await pixelAt(member, 350, 400)), { timeout: 60_000 }).toBe(true);
    expect(isMagenta(await pixelAt(member, 215, 265))).toBe(true);
    expect(isMagenta(await pixelAt(member, 185, 400))).toBe(false);
    await expect(attribution(member)).toContainText('PDF');
    await context.close();
  });

  /**
   * ブラウザをオフライン（オンライン）にする。Playwright の切り替えは通信を止めるだけで、実際のブラウザが出す
   * offline / online・接続の変化のイベントは出ないので、あわせて出す（アプリはこのイベントで接続の状態を知る）
   */
  const setOffline = async (context: BrowserContext, page: Page, offline: boolean) => {
    await context.setOffline(offline);
    await page.evaluate((name) => {
      window.dispatchEvent(new Event(name));
      // Chrome では、接続の状態は navigator.connection の change で伝わる
      (navigator as Navigator & { connection?: EventTarget }).connection?.dispatchEvent(new Event('change'));
    }, offline ? 'offline' : 'online');
  };

  const NO_INTERNET = 'インターネットに接続していません。接続してから再度実行してください。';

  test('ERR-6 通信できないとき、送信・取得は失敗を示し、端末内の記録は未送信のまま残る', async ({ page, context }) => {
    await setupProject(page, '通信断の確認');
    await openProject(page, '通信断の確認', { admin: true });
    await addPoint(page, 350, 350, '送信できなかった記録');

    // 通信を切って送信・取得すると、つながっていないと出る
    await setOffline(context, page, true);
    await (await projectButton(page, 'upload')).click();
    await answerDialog(page, 'データを送信しますか？', 'Yes');
    await answerDialog(page, NO_INTERNET, 'OK');
    await (await projectButton(page, 'download')).click();
    await answerDialog(page, '更新されたデータを取得しますか？', 'Yes');
    await answerDialog(page, NO_INTERNET, 'OK');
    // 記録は端末に残っていて、未送信のまま
    expect(await pointCmts(page)).toEqual(['送信できなかった記録']);
    expect(await wouldWarnOnLeave(page)).toBe(true);

    // 通信を戻すと送信でき、未送信ではなくなる
    await setOffline(context, page, false);
    await upload(page);
    expect(await wouldWarnOnLeave(page)).toBe(false);
  });

  test('ERR-6b 通信できないとき、プロジェクトを開くと失敗を示し、端末内のデータは変わらない', async ({ page, browser }) => {
    await setupProject(page, '通信断で開く確認');
    // 別の端末でログインし、端末内（プロジェクトの外）に記録を1件作っておく
    const { context, page: device } = await anotherDevice(browser, 'owner');
    await device.getByTestId('projects-back').click();
    await addPoint(device, 300, 300, '端末内の記録');

    await gotoProjects(device);
    await openProjectEdit(device, '通信断で開く確認');
    await setOffline(context, device, true);
    await device.getByTestId('projectedit-open').click();
    // 置き換えの確認より先に、つながっていないことを知らせる。プロジェクトは開かない
    await expect(device.getByTestId('dialog-message')).toContainText('インターネットに接続していません', { timeout: 60_000 });
    await device.locator('[data-testid^="dialog-button-"]').first().click();
    await expect(device.getByTestId('projectedit-open')).toBeVisible();
    await device.getByTestId('projectedit-back').click();
    await device.getByTestId('projects-back').click();
    await expect(device.getByTestId('home-project-label')).toBeHidden();
    // 端末内の記録は残っている
    expect(await pointCmts(device)).toEqual(['端末内の記録']);
    await context.close();
  });
});
