import * as ftest from '@firebase/rules-unit-testing';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import * as fs from 'fs';
import 'jest';

/**
 * storage.rules の権限網羅テスト（攻撃 A-STO-* / 正当 L-STO-*）。
 *
 * - A-STO: 「通ってはいけない」操作。安全な仕様を期待値にしている（assertFails）。
 *   現行Rulesに穴があればこのテストが赤になる。
 * - L-STO: クライアント（src/lib/firebase/storage.ts, src/hooks/useRepository.ts）が
 *   依存している正当な操作（assertSucceeds）。Rulesを締めたときの回帰防止。
 *
 * 既存の storage_rules.test.ts と重複するケースは書いていない。
 * クロスサービスRulesのため firestore + storage 両エミュレータが必要（yarn testrules）。
 */

let testEnv: ftest.RulesTestEnvironment;

const projectId = 'testProject';
const otherProjectId = 'otherProject';
const layerId = 'testLayer';
const uid1 = 'testUid1'; // オーナー
const uid2 = 'testUid2'; // 管理者
const uid3 = 'testUid3'; // メンバー
const uid4 = 'testUid4'; // メンバー（別人）
const uid5 = 'testUid5'; // 非メンバー（otherProjectのオーナー）

const MB = 1024 * 1024;
const png = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const bytes = (size: number) => new Uint8Array(size);
const imageType = { contentType: 'image/png' };
const jpegType = { contentType: 'image/jpeg' };
const pdfType = { contentType: 'application/pdf' };
const sqliteType = { contentType: 'application/x-sqlite3' };
const jsonType = { contentType: 'application/json' };
const htmlType = { contentType: 'text/html' };
const svgType = { contentType: 'image/svg+xml' };

const photoPath = (userId: string, name: string, pid = projectId) => `projects/${pid}/PHOTO/${layerId}/${userId}/${name}`;
const pdfPath = (name: string) => `projects/${projectId}/PDF/${name}`;
const stylePath = (name: string) => `projects/${projectId}/STYLE/${name}`;
const dictionaryPath = (name: string) => `projects/${projectId}/DICTIONARY/${layerId}/${name}`;
const otherPath = (name: string) => `projects/${projectId}/OTHER/${name}`;

const ctx = (uid: string, emailVerified = true) =>
  testEnv.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: emailVerified });

const seedProjects = async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), `projects/${projectId}`), {
      ownerUid: uid1,
      adminsUid: [uid1, uid2],
      membersUid: [uid1, uid2, uid3, uid4],
    });
    await setDoc(doc(context.firestore(), `projects/${otherProjectId}`), {
      ownerUid: uid5,
      adminsUid: [uid5],
      membersUid: [uid5],
    });
  });
};

const seedFile = async (path: string, metadata: { contentType: string } = imageType) => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.storage().ref(path).put(png(), metadata).then();
  });
};

jest.setTimeout(120000);

beforeAll(async () => {
  // クロスサービスRules(firestore.get)はエミュレータ起動時の--projectを名前空間に使うため、
  // testrulesスクリプトの --project demo-ecorismap-test と一致させる必要がある。
  testEnv = await ftest.initializeTestEnvironment({
    projectId: 'demo-ecorismap-test',
    firestore: {
      host: 'localhost',
      port: 8080,
    },
    storage: {
      host: 'localhost',
      port: 9199,
      rules: fs.readFileSync('./storage.rules', 'utf8'),
    },
  });
});

// testEnv.clearStorage() はルート直下の items しか消さず、入れ子の projects/... 配下が
// 前のテストから残り続ける（件数系のテストが汚染される）。prefixes まで再帰して消す。
type StorageRef = ReturnType<ReturnType<ftest.RulesTestContext['storage']>['ref']>;
const clearStorageRecursive = async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const walk = async (r: StorageRef): Promise<void> => {
      const res = await r.listAll();
      await Promise.all(res.items.map((item) => item.delete()));
      await Promise.all(res.prefixes.map((prefix) => walk(prefix)));
    };
    await walk(context.storage().ref());
  });
};

beforeEach(async () => {
  await clearStorageRecursive();
  await testEnv.clearFirestore();
  await seedProjects();
});

afterAll(async () => await testEnv.cleanup());

describe('攻撃: PHOTO', () => {
  test('[A-STO-01] 管理者でもメンバーのuserIdパスへ写真を作成できない', async () => {
    await assertFails(ctx(uid2).storage().ref(photoPath(uid3, 'photo1')).put(png(), imageType).then());
  });
  test('[A-STO-02] オーナーでもメンバーのuserIdパスへ写真を作成できない', async () => {
    await assertFails(ctx(uid1).storage().ref(photoPath(uid3, 'photo1')).put(png(), imageType).then());
  });
  test('[A-STO-03] 写真パスへapplication/jsonをアップロードできない（画像以外の混入）', async () => {
    await assertFails(ctx(uid3).storage().ref(photoPath(uid3, 'photo1')).put(png(), jsonType).then());
  });
  test('[A-STO-04] 写真パスへtext/htmlをアップロードできない（ダウンロードURL経由のXSS）', async () => {
    await assertFails(ctx(uid3).storage().ref(photoPath(uid3, 'photo1')).put(png(), htmlType).then());
  });
  test('[A-STO-05] 写真パスへimage/svg+xmlをアップロードできない（スクリプト入りSVG）', async () => {
    await assertFails(ctx(uid3).storage().ref(photoPath(uid3, 'photo1')).put(png(), svgType).then());
  });
  test('[A-STO-06] 20MBちょうどの写真は作成できない（size < 20MB の境界）', async () => {
    await assertFails(ctx(uid3).storage().ref(photoPath(uid3, 'big')).put(bytes(20 * MB), imageType).then());
  });
  // 期待値を反転: エミュレータ(firebase-tools lib/emulator/storage/files.js)は既存ファイルへの上書きも
  // 常にcreateとして評価する。本人の再アップロード(useRepositoryの同一photoId)は正当なので許可が正しい。
  test('[A-STO-07] メンバーは自分の既存写真を再アップロード(上書き)できる（上書きはcreateで評価される）', async () => {
    await seedFile(photoPath(uid3, 'photo1'));
    await assertSucceeds(ctx(uid3).storage().ref(photoPath(uid3, 'photo1')).put(png(), jpegType).then());
  });
  test('[A-STO-08] メンバーは他メンバーの既存写真を上書き(update)できない', async () => {
    await seedFile(photoPath(uid4, 'photo1'));
    await assertFails(ctx(uid3).storage().ref(photoPath(uid4, 'photo1')).put(png(), imageType).then());
  });
  test('[A-STO-09] メンバーは自分の写真のメタデータをtext/htmlへ書き換えられない', async () => {
    await seedFile(photoPath(uid3, 'photo1'));
    await assertFails(ctx(uid3).storage().ref(photoPath(uid3, 'photo1')).updateMetadata(htmlType));
  });
  test('[A-STO-10] 非メンバー（脱退・除名済み）は自分のuserIdパスに残る写真を削除できない', async () => {
    await seedFile(photoPath(uid5, 'photo1'));
    await assertFails(ctx(uid5).storage().ref(photoPath(uid5, 'photo1')).delete());
  });
  test('[A-STO-11] 存在しないプロジェクトのPHOTOパスでも本人uidなら削除できる状態になっていない', async () => {
    await seedFile(photoPath(uid5, 'photo1', 'unknownProject'));
    await assertFails(ctx(uid5).storage().ref(photoPath(uid5, 'photo1', 'unknownProject')).delete());
  });
  test('[A-STO-12] 他プロジェクトの管理者は、このプロジェクトのメンバー写真を削除できない', async () => {
    await seedFile(photoPath(uid3, 'photo1'));
    await assertFails(ctx(uid5).storage().ref(photoPath(uid3, 'photo1')).delete());
  });
  test('[A-STO-13] 管理者は、自分が管理者でない別プロジェクトの写真を削除できない', async () => {
    await seedFile(photoPath(uid5, 'photo1', otherProjectId));
    await assertFails(ctx(uid2).storage().ref(photoPath(uid5, 'photo1', otherProjectId)).delete());
  });
  test('[A-STO-14] メール未承認のメンバーは写真を取得できない', async () => {
    await seedFile(photoPath(uid1, 'photo1'));
    await assertFails(ctx(uid3, false).storage().ref(photoPath(uid1, 'photo1')).getDownloadURL());
  });
  test('[A-STO-15] メール未承認の管理者は他人の写真を削除できない', async () => {
    await seedFile(photoPath(uid3, 'photo1'));
    await assertFails(ctx(uid2, false).storage().ref(photoPath(uid3, 'photo1')).delete());
  });
  test('[A-STO-16] メール未承認の本人は自分の写真を削除できない', async () => {
    await seedFile(photoPath(uid3, 'photo1'));
    await assertFails(ctx(uid3, false).storage().ref(photoPath(uid3, 'photo1')).delete());
  });
  test('[A-STO-17] 一般メンバーはPHOTOフォルダの一覧を取得できない', async () => {
    await seedFile(photoPath(uid4, 'photo1'));
    await assertFails(ctx(uid3).storage().ref(`projects/${projectId}/PHOTO/${layerId}`).listAll());
  });
  test('[A-STO-18] 存在しないプロジェクトの写真は取得できない', async () => {
    await seedFile(photoPath(uid3, 'photo1', 'unknownProject'));
    await assertFails(ctx(uid3).storage().ref(photoPath(uid3, 'photo1', 'unknownProject')).getDownloadURL());
  });
});

describe('攻撃: PDF / STYLE / DICTIONARY', () => {
  test('[A-STO-19] 一般メンバーはSTYLEを削除できない', async () => {
    await seedFile(stylePath('map1'), jsonType);
    await assertFails(ctx(uid3).storage().ref(stylePath('map1')).delete());
  });
  test('[A-STO-20] 一般メンバーはDICTIONARYを削除できない', async () => {
    await seedFile(dictionaryPath('dictionary.sqlite'), sqliteType);
    await assertFails(ctx(uid3).storage().ref(dictionaryPath('dictionary.sqlite')).delete());
  });
  test('[A-STO-21] 一般メンバーは既存DICTIONARYを上書きできない（辞書の差し替え）', async () => {
    await seedFile(dictionaryPath('dictionary.sqlite'), sqliteType);
    await assertFails(ctx(uid3).storage().ref(dictionaryPath('dictionary.sqlite')).put(png(), sqliteType).then());
  });
  test('[A-STO-22] 管理者でもPDFパスへtext/htmlをアップロードできない', async () => {
    await assertFails(ctx(uid2).storage().ref(pdfPath('map1')).put(png(), htmlType).then());
  });
  test('[A-STO-23] 管理者でもSTYLEパスへimage/svg+xmlをアップロードできない', async () => {
    await assertFails(ctx(uid2).storage().ref(stylePath('map1')).put(png(), svgType).then());
  });
  test('[A-STO-24] 管理者でも20MBちょうどのPDFはアップロードできない', async () => {
    await assertFails(ctx(uid2).storage().ref(pdfPath('big')).put(bytes(20 * MB), pdfType).then());
  });
  test('[A-STO-25] 一般メンバーは既存PDFのメタデータを書き換えられない', async () => {
    await seedFile(pdfPath('map1'), pdfType);
    await assertFails(ctx(uid3).storage().ref(pdfPath('map1')).updateMetadata(htmlType));
  });
  test('[A-STO-26] 非メンバーはSTYLEを取得できない', async () => {
    await seedFile(stylePath('map1'), jsonType);
    await assertFails(ctx(uid5).storage().ref(stylePath('map1')).getDownloadURL());
  });
  test('[A-STO-27] 非メンバーはDICTIONARYを取得できない（暗号化前提でも鍵以外の防御層）', async () => {
    await seedFile(dictionaryPath('dictionary.sqlite'), sqliteType);
    await assertFails(ctx(uid5).storage().ref(dictionaryPath('dictionary.sqlite')).getDownloadURL());
  });
  test('[A-STO-28] 存在しないプロジェクトへは誰もPDFを作成できない', async () => {
    await assertFails(ctx(uid5).storage().ref('projects/unknownProject/PDF/map1').put(png(), pdfType).then());
  });
});

describe('攻撃: 未定義パス（catch-all）', () => {
  test('[A-STO-29] 一般メンバーは未定義パス(OTHER)へファイルを作成できない', async () => {
    await assertFails(ctx(uid3).storage().ref(otherPath('x.png')).put(png(), imageType).then());
  });
  test('[A-STO-30] 管理者でも未定義パス(OTHER)へファイルを作成できない', async () => {
    await assertFails(ctx(uid2).storage().ref(otherPath('x.png')).put(png(), imageType).then());
  });
  test('[A-STO-31] 一般メンバーは未定義パス(OTHER)のファイルを削除できない', async () => {
    await seedFile(otherPath('x.png'));
    await assertFails(ctx(uid3).storage().ref(otherPath('x.png')).delete());
  });
  test('[A-STO-32] 一般メンバーは未定義パス(OTHER)のファイルを取得できない', async () => {
    await seedFile(otherPath('x.png'));
    await assertFails(ctx(uid3).storage().ref(otherPath('x.png')).getDownloadURL());
  });
  test('[A-STO-33] 一般メンバーはプロジェクト直下の一覧を取得できない', async () => {
    await seedFile(pdfPath('map1'), pdfType);
    await assertFails(ctx(uid3).storage().ref(`projects/${projectId}`).listAll());
  });
  test('[A-STO-34] 未認証ユーザーはプロジェクト外のルート(projects/)を一覧できない', async () => {
    await seedFile(pdfPath('map1'), pdfType);
    await assertFails(testEnv.unauthenticatedContext().storage().ref('projects').listAll());
  });
  test('[A-STO-35] メール未承認のオーナーは一覧を取得できない', async () => {
    await seedFile(pdfPath('map1'), pdfType);
    await assertFails(ctx(uid1, false).storage().ref(`projects/${projectId}/PDF`).listAll());
  });
});

describe('正当: クライアントが依存する操作', () => {
  test('[L-STO-01] メンバーは自分のパスにimage/jpegの写真をアップロードしURLを取得できる（uploadPhoto）', async () => {
    const ref = ctx(uid3).storage().ref(photoPath(uid3, 'photo1'));
    await assertSucceeds(ref.put(png(), jpegType).then());
    await assertSucceeds(ref.getDownloadURL());
  });
  test('[L-STO-02] 20MB未満（20MB-1バイト）の写真はアップロードできる', async () => {
    await assertSucceeds(ctx(uid3).storage().ref(photoPath(uid3, 'big')).put(bytes(20 * MB - 1), jpegType).then());
  });
  test('[L-STO-03] membersUid/adminsUidに居ないオーナーも写真作成・取得・一覧ができる', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${projectId}`), {
        ownerUid: uid1,
        adminsUid: [uid2],
        membersUid: [uid2, uid3],
      });
    });
    const ref = ctx(uid1).storage().ref(photoPath(uid1, 'photo1'));
    await assertSucceeds(ref.put(png(), jpegType).then());
    await assertSucceeds(ref.getDownloadURL());
    await assertSucceeds(ctx(uid1).storage().ref(`projects/${projectId}/PHOTO/${layerId}`).listAll());
  });
  test('[L-STO-04] 管理者はレイヤの写真を再帰的に一覧して他人の分も削除できる（deleteLayerPhotos）', async () => {
    await seedFile(photoPath(uid3, 'photo1'));
    await seedFile(photoPath(uid4, 'photo2'));
    const admin = ctx(uid2).storage();
    const top = await assertSucceeds(admin.ref(`projects/${projectId}/PHOTO/${layerId}`).listAll());
    expect(top.prefixes.length).toBe(2);
    await assertSucceeds(admin.ref(photoPath(uid3, 'photo1')).delete());
    await assertSucceeds(admin.ref(photoPath(uid4, 'photo2')).delete());
  });
  test('[L-STO-05] オーナーはプロジェクト直下を一覧して削除できる（deleteProjectStorageData）', async () => {
    await seedFile(otherPath('x.png'));
    const owner = ctx(uid1).storage();
    await assertSucceeds(owner.ref(`projects/${projectId}`).listAll());
    await assertSucceeds(owner.ref(otherPath('x.png')).delete());
  });
  test('[L-STO-06] 管理者はPDFをアップロード後にURLを取得できる（uploadPDF）', async () => {
    const ref = ctx(uid2).storage().ref(pdfPath('tilemap1'));
    await assertSucceeds(ref.put(png(), pdfType).then());
    await assertSucceeds(ref.getDownloadURL());
  });
  test('[L-STO-07] メンバーはSTYLEを取得できる（downloadStyle）', async () => {
    await seedFile(stylePath('tilemap1'), jsonType);
    await assertSucceeds(ctx(uid3).storage().ref(stylePath('tilemap1')).getDownloadURL());
  });
  test('[L-STO-08] 管理者は既存DICTIONARYを上書きできる（設定の再アップロード）', async () => {
    // useRepository.uploadProjectSettings は辞書を事前削除せず同じパスへ再アップロードする
    await seedFile(dictionaryPath('dictionary.sqlite'), sqliteType);
    await assertSucceeds(ctx(uid2).storage().ref(dictionaryPath('dictionary.sqlite')).put(png(), sqliteType).then());
  });
  test('[L-STO-09] 管理者は既存STYLEを上書きできる（Webで設定を再アップロード）', async () => {
    // deleteProjectStyle は現行タイルマップIDを除外し、styleURLがstyle://のままなら再アップロードされる
    await seedFile(stylePath('tilemap1'), jsonType);
    await assertSucceeds(ctx(uid2).storage().ref(stylePath('tilemap1')).put(png(), jsonType).then());
  });
  test('[L-STO-10] 管理者はSTYLEフォルダを一覧して不要なスタイルを削除できる（deleteProjectStyle）', async () => {
    await seedFile(stylePath('old'), jsonType);
    const admin = ctx(uid2).storage();
    await assertSucceeds(admin.ref(`projects/${projectId}/STYLE`).listAll());
    await assertSucceeds(admin.ref(stylePath('old')).delete());
  });
});
