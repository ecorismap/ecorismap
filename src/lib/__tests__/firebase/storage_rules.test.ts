import * as ftest from '@firebase/rules-unit-testing';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import * as fs from 'fs';
import 'jest';

/**
 * storage.rules のテスト。
 * クロスサービスRules（storage.rulesからfirestore.get()でprojectドキュメントを参照）を使うため、
 * firestore + storage 両エミュレータが必要:
 *   yarn testrules (= firebase emulators:exec --only firestore,storage ...)
 */

let testEnv: ftest.RulesTestEnvironment;

const projectId = 'testProject';
const layerId = 'testLayer';
const uid1 = 'testUid1'; // オーナー
const uid2 = 'testUid2'; // 管理者
const uid3 = 'testUid3'; // メンバー
const uid5 = 'testUid5'; // 非メンバー

const png = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const over20MB = () => new Uint8Array(20 * 1024 * 1024 + 1);
const imageType = { contentType: 'image/png' };
const pdfType = { contentType: 'application/pdf' };
const sqliteType = { contentType: 'application/x-sqlite3' };

const photoPath = (userId: string, name: string) => `projects/${projectId}/PHOTO/${layerId}/${userId}/${name}`;
const pdfPath = (name: string) => `projects/${projectId}/PDF/${name}`;
const stylePath = (name: string) => `projects/${projectId}/STYLE/${name}`;
const dictionaryPath = (name: string) => `projects/${projectId}/DICTIONARY/${layerId}/${name}`;

const ctx = (uid: string, emailVerified = true) =>
  testEnv.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: emailVerified });

// Storage Rulesが参照するprojectドキュメントをFirestoreエミュレータにシード
const seedProject = async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), `projects/${projectId}`), {
      ownerUid: uid1,
      adminsUid: [uid1, uid2],
      membersUid: [uid1, uid2, uid3],
    });
  });
};

const seedFile = async (path: string, metadata = imageType) => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.storage().ref(path).put(png(), metadata).then();
  });
};

jest.setTimeout(60000);

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

beforeEach(async () => {
  await testEnv.clearStorage();
  await testEnv.clearFirestore();
  await seedProject();
});

afterAll(async () => await testEnv.cleanup());

describe('PHOTO', () => {
  describe('create', () => {
    test('メンバーは自分のディレクトリに写真を作成できる', async () => {
      await assertSucceeds(ctx(uid3).storage().ref(photoPath(uid3, 'photo1')).put(png(), imageType).then());
    });
    test('メンバーでも他人のディレクトリには作成できない', async () => {
      await assertFails(ctx(uid3).storage().ref(photoPath(uid1, 'photo1')).put(png(), imageType).then());
    });
    test('非メンバーは自分のuserIdパスでも作成できない', async () => {
      await assertFails(ctx(uid5).storage().ref(photoPath(uid5, 'photo1')).put(png(), imageType).then());
    });
    test('メール未承認ユーザーは作成できない', async () => {
      await assertFails(ctx(uid3, false).storage().ref(photoPath(uid3, 'photo1')).put(png(), imageType).then());
    });
    test('未認証ユーザーは作成できない', async () => {
      await assertFails(
        testEnv.unauthenticatedContext().storage().ref(photoPath(uid3, 'photo1')).put(png(), imageType).then()
      );
    });
    test('許可されていないcontentTypeでは作成できない', async () => {
      await assertFails(
        ctx(uid3).storage().ref(photoPath(uid3, 'photo1')).put(png(), { contentType: 'image/tiff' }).then()
      );
    });
    test('20MBを超えるファイルは作成できない', async () => {
      await assertFails(ctx(uid3).storage().ref(photoPath(uid3, 'big')).put(over20MB(), imageType).then());
    });
  });

  describe('read', () => {
    beforeEach(async () => await seedFile(photoPath(uid1, 'photo1')));
    test('メンバーは他メンバーの写真を取得できる', async () => {
      await assertSucceeds(ctx(uid3).storage().ref(photoPath(uid1, 'photo1')).getDownloadURL());
    });
    test('非メンバーは取得できない', async () => {
      await assertFails(ctx(uid5).storage().ref(photoPath(uid1, 'photo1')).getDownloadURL());
    });
    test('未認証ユーザーは取得できない', async () => {
      await assertFails(testEnv.unauthenticatedContext().storage().ref(photoPath(uid1, 'photo1')).getDownloadURL());
    });
  });

  describe('delete', () => {
    beforeEach(async () => await seedFile(photoPath(uid3, 'photo1')));
    test('本人は自分の写真を削除できる', async () => {
      await assertSucceeds(ctx(uid3).storage().ref(photoPath(uid3, 'photo1')).delete());
    });
    test('管理者は他人の写真を削除できる', async () => {
      await assertSucceeds(ctx(uid2).storage().ref(photoPath(uid3, 'photo1')).delete());
    });
    test('一般メンバーは他人の写真を削除できない', async () => {
      await seedFile(photoPath(uid1, 'photo2'));
      await assertFails(ctx(uid3).storage().ref(photoPath(uid1, 'photo2')).delete());
    });
    test('非メンバーは削除できない', async () => {
      await assertFails(ctx(uid5).storage().ref(photoPath(uid3, 'photo1')).delete());
    });
  });
});

describe('PDF', () => {
  test('create: 管理者は作成できる', async () => {
    await assertSucceeds(ctx(uid2).storage().ref(pdfPath('map1')).put(png(), pdfType).then());
  });
  test('create: オーナーは作成できる', async () => {
    await assertSucceeds(ctx(uid1).storage().ref(pdfPath('map1')).put(png(), pdfType).then());
  });
  test('create: 一般メンバーは作成できない', async () => {
    await assertFails(ctx(uid3).storage().ref(pdfPath('map1')).put(png(), pdfType).then());
  });
  test('create: 非メンバーは作成できない', async () => {
    await assertFails(ctx(uid5).storage().ref(pdfPath('map1')).put(png(), pdfType).then());
  });
  test('create: メール未承認のオーナーは作成できない', async () => {
    await assertFails(ctx(uid1, false).storage().ref(pdfPath('map1')).put(png(), pdfType).then());
  });
  test('read: メンバーは取得できる', async () => {
    await seedFile(pdfPath('map1'), pdfType);
    await assertSucceeds(ctx(uid3).storage().ref(pdfPath('map1')).getDownloadURL());
  });
  test('read: 非メンバーは取得できない', async () => {
    await seedFile(pdfPath('map1'), pdfType);
    await assertFails(ctx(uid5).storage().ref(pdfPath('map1')).getDownloadURL());
  });
  test('delete: 管理者は削除できる', async () => {
    await seedFile(pdfPath('map1'), pdfType);
    await assertSucceeds(ctx(uid2).storage().ref(pdfPath('map1')).delete());
  });
  test('delete: 一般メンバーは削除できない', async () => {
    await seedFile(pdfPath('map1'), pdfType);
    await assertFails(ctx(uid3).storage().ref(pdfPath('map1')).delete());
  });
});

describe('STYLE', () => {
  test('create: 管理者は作成できる', async () => {
    await assertSucceeds(ctx(uid2).storage().ref(stylePath('map1')).put(png(), { contentType: 'application/json' }).then());
  });
  test('create: 一般メンバーは作成できない', async () => {
    await assertFails(ctx(uid3).storage().ref(stylePath('map1')).put(png(), { contentType: 'application/json' }).then());
  });
});

describe('DICTIONARY', () => {
  test('create: 管理者は作成できる', async () => {
    await assertSucceeds(
      ctx(uid2).storage().ref(dictionaryPath('dictionary.sqlite')).put(png(), sqliteType).then()
    );
  });
  test('create: 一般メンバーは作成できない', async () => {
    await assertFails(ctx(uid3).storage().ref(dictionaryPath('dictionary.sqlite')).put(png(), sqliteType).then());
  });
  test('read: メンバーは取得できる', async () => {
    await seedFile(dictionaryPath('dictionary.sqlite'), sqliteType);
    await assertSucceeds(ctx(uid3).storage().ref(dictionaryPath('dictionary.sqlite')).getDownloadURL());
  });
});

describe('list（一括削除用）', () => {
  beforeEach(async () => {
    await seedFile(pdfPath('map1'), pdfType);
    await seedFile(pdfPath('map2'), pdfType);
  });
  test('管理者はリストを取得できる', async () => {
    await assertSucceeds(ctx(uid2).storage().ref(`projects/${projectId}/PDF`).listAll());
  });
  test('オーナーはリストを取得できる', async () => {
    await assertSucceeds(ctx(uid1).storage().ref(`projects/${projectId}/PDF`).listAll());
  });
  test('一般メンバーはリストを取得できない', async () => {
    await assertFails(ctx(uid3).storage().ref(`projects/${projectId}/PDF`).listAll());
  });
  test('非メンバーはリストを取得できない', async () => {
    await assertFails(ctx(uid5).storage().ref(`projects/${projectId}/PDF`).listAll());
  });
});

describe('membersUid/adminsUidフィールドが無い古いドキュメント', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${projectId}`), {
        ownerUid: uid1,
      });
    });
  });
  test('オーナーは評価エラーにならず作成できる', async () => {
    await assertSucceeds(ctx(uid1).storage().ref(pdfPath('map1')).put(png(), pdfType).then());
  });
  test('他ユーザーは拒否される（評価エラーではなくfalse）', async () => {
    await assertFails(ctx(uid2).storage().ref(pdfPath('map1')).put(png(), pdfType).then());
  });
});

describe('projectドキュメントが存在しない場合', () => {
  test('create: 拒否される（存在しないprojectIdへの書き込み不可）', async () => {
    await assertFails(
      ctx(uid3).storage().ref(`projects/unknownProject/PHOTO/${layerId}/${uid3}/photo1`).put(png(), imageType).then()
    );
  });
});
