/**
 * Security Rules 権限網羅テスト: projects/{project}/settings/{settings} と position/{position}、
 * および未定義のサブコレクション・深いパスへのアクセス。
 *
 * - A-SUB-NN（attack）: 通ってはいけない操作。安全な仕様を期待値にしているため、
 *   現行Rulesに穴があればこのテストが赤になる。
 * - L-SUB-NN（legit）: クライアントが依存している正当な操作。Rulesを締めたときの回帰防止。
 *
 * 既存の firestore_rules.test.ts にあるケース（settingsのメンバーget/未承認・未認証get、
 * 管理者create、メンバー・未認証create、positionの基本なりすまし等）は重複させていない。
 */
import * as fs from 'fs';
import * as firebase from '@firebase/rules-unit-testing';
import {
  Timestamp,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

let testEnv: firebase.RulesTestEnvironment;
const projectID = 'ecorismap';
const documentId = 'testDocument';
const missingProjectId = 'noSuchProject';
const uid1 = 'testUid1'; //オーナー
const uid2 = 'testUid2'; //管理者
const uid3 = 'testUid3'; //メンバー
const uid4 = 'testUid4'; //メール未承認
const uid5 = 'testUid5'; //知らない人
const uid6 = 'testUid6'; //元管理者（adminsUidから外れた、メンバーのまま）
const uid7 = 'testUid7'; //元メンバー（membersUidから外れた）

beforeAll(async () => {
  testEnv = await firebase.initializeTestEnvironment({
    projectId: projectID,
    firestore: {
      host: 'localhost',
      port: 8080,
      rules: fs.readFileSync('./firestore.rules', 'utf8'),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

afterAll(async () => {
  await testEnv.clearFirestore();
  await testEnv.cleanup();
});

const ctx = (uid: string, n: string) =>
  testEnv.authenticatedContext(uid, { email: `${n}@example.com`, email_verified: true });
const unverifiedCtx = (uid: string, n: string) =>
  testEnv.authenticatedContext(uid, { email: `${n}@example.com`, email_verified: false });

const settingsPath = (projectId = documentId, id = 'default') => `projects/${projectId}/settings/${id}`;
const positionPath = (uid: string, projectId = documentId) => `projects/${projectId}/position/${uid}`;

// クライアント(uploadProjectSettings)と同じ形: { editorUid, encdata: string[], encryptedAt: Timestamp }
const settingsData = (editorUid: string) => ({
  editorUid,
  encdata: ['enc'],
  encryptedAt: Timestamp.now(),
});
// クライアント(uploadCurrentPosition)と同じ形: { encdata: string[], encryptedAt: Timestamp }
const positionData = () => ({ encdata: ['enc'], encryptedAt: Timestamp.now() });

type ProjectSeed = { ownerUid: string; adminsUid: string[]; membersUid: string[] };
const defaultProject: ProjectSeed = {
  ownerUid: uid1,
  adminsUid: [uid1, uid2],
  membersUid: [uid1, uid2, uid3, uid4, uid6],
};

const seedProject = async (p: ProjectSeed = defaultProject) => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), `projects/${documentId}`), {
      ...p,
      encdata: [''],
      encryptedAt: '2022年1月1日',
      cryptoScheme: 'dek',
      dekPublicKey: 'PUBKEY',
    });
  });
};
const seedSettings = async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), settingsPath()), settingsData(uid1));
  });
};
const seedPosition = async (uid: string) => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), positionPath(uid)), positionData());
  });
};
const seedRaw = async (path: string, data: Record<string, unknown>) => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), data);
  });
};

describe('[SUB] settings サブコレクション: attack', () => {
  it('[A-SUB-01] 非メンバー(承認済み)は設定をget/listできない', async () => {
    await seedProject();
    await seedSettings();
    const db = ctx(uid5, 'test5').firestore();
    await firebase.assertFails(getDoc(doc(db, settingsPath())));
    await firebase.assertFails(
      getDocs(query(collection(db, `projects/${documentId}/settings`), where('__name__', '==', 'default')))
    );
  });

  it('[A-SUB-02] 非メンバー(承認済み)は設定を作成・上書きできない', async () => {
    await seedProject();
    const db = ctx(uid5, 'test5').firestore();
    await firebase.assertFails(setDoc(doc(db, settingsPath()), settingsData(uid5)));
    await seedSettings();
    await firebase.assertFails(setDoc(doc(db, settingsPath()), settingsData(uid5)));
  });

  it('[A-SUB-03] メール未承認の管理者は設定を書けない', async () => {
    await seedProject();
    await seedSettings();
    const db = unverifiedCtx(uid2, 'test2').firestore();
    await firebase.assertFails(setDoc(doc(db, settingsPath()), settingsData(uid2)));
  });

  it('[A-SUB-04] adminsUidから外れた元管理者(メンバーのまま)は設定を書けない', async () => {
    await seedProject();
    await seedSettings();
    const db = ctx(uid6, 'test6').firestore();
    await firebase.assertFails(setDoc(doc(db, settingsPath()), settingsData(uid6)));
    await firebase.assertFails(
      updateDoc(doc(db, settingsPath()), { encdata: ['forged'], encryptedAt: Timestamp.now(), editorUid: uid6 })
    );
  });

  it('[A-SUB-05] membersUidから外れた元メンバーは設定を読めない', async () => {
    await seedProject();
    await seedSettings();
    await firebase.assertFails(getDoc(doc(ctx(uid7, 'test7').firestore(), settingsPath())));
  });

  it('[A-SUB-06] メンバーは設定を削除できない', async () => {
    await seedProject();
    await seedSettings();
    await firebase.assertFails(deleteDoc(doc(ctx(uid3, 'test3').firestore(), settingsPath())));
  });

  it('[A-SUB-07] 管理者でも設定を削除できない（verifyFieldsがdelete時にrequest.resource=nullで評価エラー→拒否）', async () => {
    await seedProject();
    await seedSettings();
    await firebase.assertFails(deleteDoc(doc(ctx(uid2, 'test2').firestore(), settingsPath())));
  });

  it('[A-SUB-08] オーナーでも設定を個別削除できない（プロジェクト削除はFunctions側で掃除）', async () => {
    await seedProject();
    await seedSettings();
    await firebase.assertFails(deleteDoc(doc(ctx(uid1, 'test1').firestore(), settingsPath())));
  });

  it('[A-SUB-09] 管理者は許可外フィールド(ownerUid/adminsUid等)を設定へ混ぜられない', async () => {
    await seedProject();
    const db = ctx(uid2, 'test2').firestore();
    await firebase.assertFails(setDoc(doc(db, settingsPath()), { ...settingsData(uid2), ownerUid: uid2 }));
    await firebase.assertFails(setDoc(doc(db, settingsPath()), { ...settingsData(uid2), adminsUid: [uid2, uid5] }));
  });

  it('[A-SUB-10] 管理者は必須フィールドを欠いた設定を書けない（encdata/editorUid欠落）', async () => {
    await seedProject();
    const db = ctx(uid2, 'test2').firestore();
    await firebase.assertFails(setDoc(doc(db, settingsPath()), { editorUid: uid2, encryptedAt: Timestamp.now() }));
    await firebase.assertFails(setDoc(doc(db, settingsPath()), { encdata: ['enc'], encryptedAt: Timestamp.now() }));
  });

  it('[A-SUB-11] 管理者はeditorUidをプロジェクト外のuidに差し替えられない（最終編集者のなりすまし）', async () => {
    await seedProject();
    await firebase.assertFails(
      setDoc(doc(ctx(uid2, 'test2').firestore(), settingsPath()), settingsData(uid5))
    );
  });

  it('[A-SUB-12] 管理者はeditorUidを文字列以外(数値/配列)にできない', async () => {
    await seedProject();
    const db = ctx(uid2, 'test2').firestore();
    await firebase.assertFails(setDoc(doc(db, settingsPath()), { ...settingsData(uid2), editorUid: 123 }));
    await firebase.assertFails(setDoc(doc(db, settingsPath()), { ...settingsData(uid2), editorUid: [uid2] }));
  });

  it('[A-SUB-13] 管理者はencdataを配列以外(マップ)・encryptedAtを非Timestampにできない', async () => {
    await seedProject();
    const db = ctx(uid2, 'test2').firestore();
    await firebase.assertFails(setDoc(doc(db, settingsPath()), { ...settingsData(uid2), encdata: { x: 'enc' } }));
    await firebase.assertFails(setDoc(doc(db, settingsPath()), { ...settingsData(uid2), encryptedAt: 0 }));
  });

  it('[A-SUB-14] 管理者は default 以外のIDで設定ドキュメントを量産できない', async () => {
    await seedProject();
    await firebase.assertFails(
      setDoc(doc(ctx(uid2, 'test2').firestore(), settingsPath(documentId, 'evil')), settingsData(uid2))
    );
  });

  it('[A-SUB-15] 存在しないプロジェクトの設定は誰も作成できない', async () => {
    await firebase.assertFails(
      setDoc(doc(ctx(uid1, 'test1').firestore(), settingsPath(missingProjectId)), settingsData(uid1))
    );
  });

  it('[A-SUB-16] 設定の下の深いパス(settings/default/history/x)へは書けない', async () => {
    await seedProject();
    await seedSettings();
    await firebase.assertFails(
      setDoc(doc(ctx(uid1, 'test1').firestore(), `${settingsPath()}/history/x`), settingsData(uid1))
    );
  });
});

describe('[SUB] settings サブコレクション: legit', () => {
  it('[L-SUB-01] 管理者はクライアントと同じ形(Timestamp)で設定を作成・上書きできる', async () => {
    await seedProject();
    const db = ctx(uid2, 'test2').firestore();
    await firebase.assertSucceeds(setDoc(doc(db, settingsPath()), settingsData(uid2)));
    await firebase.assertSucceeds(setDoc(doc(db, settingsPath()), { ...settingsData(uid2), encdata: ['enc2'] }));
  });

  it('[L-SUB-02] 管理者はeditorUidを他の管理者/オーナーのまま書き戻せる（DEK移行で最終編集者を据え置く）', async () => {
    await seedProject();
    await seedSettings();
    await firebase.assertSucceeds(setDoc(doc(ctx(uid2, 'test2').firestore(), settingsPath()), settingsData(uid1)));
  });

  it('[L-SUB-03] メンバーは __name__=="default" のクエリで設定を取得できる（衝突検知用）', async () => {
    await seedProject();
    await seedSettings();
    const db = ctx(uid3, 'test3').firestore();
    await firebase.assertSucceeds(
      getDocs(query(collection(db, `projects/${documentId}/settings`), where('__name__', '==', 'default')))
    );
  });

  it('[L-SUB-04] オーナー(adminsUidに居る)は設定を書ける', async () => {
    await seedProject();
    await firebase.assertSucceeds(setDoc(doc(ctx(uid1, 'test1').firestore(), settingsPath()), settingsData(uid1)));
  });

  it('[L-SUB-05] オーナーはadminsUidに居なくても設定を書ける（Owner>Adminの階層）', async () => {
    await seedProject({ ownerUid: uid1, adminsUid: [uid2], membersUid: [uid1, uid2, uid3] });
    await firebase.assertSucceeds(setDoc(doc(ctx(uid1, 'test1').firestore(), settingsPath()), settingsData(uid1)));
  });
});

describe('[SUB] position サブコレクション: attack', () => {
  it('[A-SUB-17] メンバーは自分の位置に許可外フィールド(平文座標・ownerUid等)を混ぜられない', async () => {
    await seedProject();
    const db = ctx(uid3, 'test3').firestore();
    await firebase.assertFails(
      setDoc(doc(db, positionPath(uid3)), { ...positionData(), coords: { latitude: 35, longitude: 139 } })
    );
    await firebase.assertFails(setDoc(doc(db, positionPath(uid3)), { ...positionData(), ownerUid: uid3 }));
  });

  it('[A-SUB-18] メンバーは型違い/必須欠落の位置を書けない（encdataがマップ・encryptedAt欠落）', async () => {
    await seedProject();
    const db = ctx(uid3, 'test3').firestore();
    await firebase.assertFails(
      setDoc(doc(db, positionPath(uid3)), { encdata: { x: 'enc' }, encryptedAt: Timestamp.now() })
    );
    await firebase.assertFails(setDoc(doc(db, positionPath(uid3)), { encdata: ['enc'] }));
  });

  it('[A-SUB-19] membersUidから外れた元メンバーは自分のuidでも位置を書けない', async () => {
    await seedProject();
    await firebase.assertFails(setDoc(doc(ctx(uid7, 'test7').firestore(), positionPath(uid7)), positionData()));
  });

  it('[A-SUB-20] membersUidから外れた元メンバーは他メンバーの位置を読めない（get/list）', async () => {
    await seedProject();
    await seedPosition(uid3);
    const db = ctx(uid7, 'test7').firestore();
    await firebase.assertFails(getDoc(doc(db, positionPath(uid3))));
    await firebase.assertFails(getDocs(collection(db, `projects/${documentId}/position`)));
  });

  it('[A-SUB-21] メール未承認のメンバーは位置を読めない', async () => {
    await seedProject();
    await seedPosition(uid3);
    const db = unverifiedCtx(uid4, 'test4').firestore();
    await firebase.assertFails(getDoc(doc(db, positionPath(uid3))));
    await firebase.assertFails(getDocs(collection(db, `projects/${documentId}/position`)));
  });

  it('[A-SUB-22] 未認証は位置を読めず、書けない', async () => {
    await seedProject();
    await seedPosition(uid3);
    const db = testEnv.unauthenticatedContext().firestore();
    await firebase.assertFails(getDocs(collection(db, `projects/${documentId}/position`)));
    await firebase.assertFails(setDoc(doc(db, positionPath(uid3)), positionData()));
  });

  it('[A-SUB-23] collectionGroup("position") で全プロジェクトの位置を横断取得できない', async () => {
    await seedProject();
    await seedPosition(uid3);
    await firebase.assertFails(getDocs(collectionGroup(ctx(uid5, 'test5').firestore(), 'position')));
    await firebase.assertFails(getDocs(collectionGroup(ctx(uid3, 'test3').firestore(), 'position')));
  });

  it('[A-SUB-24] 存在しないプロジェクトには自分のuidでも位置を書けない', async () => {
    await firebase.assertFails(
      setDoc(doc(ctx(uid3, 'test3').firestore(), positionPath(uid3, missingProjectId)), positionData())
    );
  });

  it('[A-SUB-25] 自分のuidに似たドキュメントID(接尾辞付き)には書けない', async () => {
    await seedProject();
    await firebase.assertFails(
      setDoc(doc(ctx(uid3, 'test3').firestore(), positionPath(`${uid3}_x`)), positionData())
    );
  });

  it('[A-SUB-26] 位置の下の深いパス(position/{uid}/history/x)へは自分のuidでも書けない', async () => {
    await seedProject();
    await firebase.assertFails(
      setDoc(doc(ctx(uid3, 'test3').firestore(), `${positionPath(uid3)}/history/x`), positionData())
    );
  });
});

describe('[SUB] position サブコレクション: legit', () => {
  it('[L-SUB-06] メンバーはクライアントと同じ形(Timestamp)で自分の位置を作成・上書き・削除できる', async () => {
    await seedProject();
    const db = ctx(uid3, 'test3').firestore();
    await firebase.assertSucceeds(setDoc(doc(db, positionPath(uid3)), positionData()));
    await firebase.assertSucceeds(setDoc(doc(db, positionPath(uid3)), { ...positionData(), encdata: ['enc2'] }));
    await firebase.assertSucceeds(deleteDoc(doc(db, positionPath(uid3))));
  });

  it('[L-SUB-07] オーナー・管理者はpositionコレクションを購読(一覧取得)できる', async () => {
    await seedProject();
    await seedPosition(uid3);
    await firebase.assertSucceeds(getDocs(collection(ctx(uid1, 'test1').firestore(), `projects/${documentId}/position`)));
    await firebase.assertSucceeds(getDocs(collection(ctx(uid2, 'test2').firestore(), `projects/${documentId}/position`)));
  });

  it('[L-SUB-08] 管理者・オーナーも自分のuidの位置は送信できる', async () => {
    await seedProject();
    await firebase.assertSucceeds(setDoc(doc(ctx(uid1, 'test1').firestore(), positionPath(uid1)), positionData()));
    await firebase.assertSucceeds(setDoc(doc(ctx(uid2, 'test2').firestore(), positionPath(uid2)), positionData()));
  });
});

describe('[SUB] 未定義のサブコレクション・深いパス: attack', () => {
  it('[A-SUB-27] オーナーでも未定義サブコレクション(projects/{p}/foo/x)へは書けない', async () => {
    await seedProject();
    await firebase.assertFails(
      setDoc(doc(ctx(uid1, 'test1').firestore(), `projects/${documentId}/foo/x`), { a: 1 })
    );
  });

  it('[A-SUB-28] メンバーでも未定義サブコレクションの既存ドキュメントは読めない', async () => {
    await seedProject();
    await seedRaw(`projects/${documentId}/foo/x`, { secret: 'plain' });
    const db = ctx(uid3, 'test3').firestore();
    await firebase.assertFails(getDoc(doc(db, `projects/${documentId}/foo/x`)));
    await firebase.assertFails(getDocs(collection(db, `projects/${documentId}/foo`)));
  });

  it('[A-SUB-29] オーナーでもdataの下の深いパス(data/{d}/sub/x)へは書けない', async () => {
    await seedProject();
    await firebase.assertFails(
      setDoc(doc(ctx(uid1, 'test1').firestore(), `projects/${documentId}/data/d1/sub/x`), { a: 1 })
    );
  });

  it('[A-SUB-30] 承認済みユーザーでも未定義のトップレベルコレクション(users/{uid})へは書けない', async () => {
    await firebase.assertFails(setDoc(doc(ctx(uid5, 'test5').firestore(), `users/${uid5}`), { a: 1 }));
  });
});
