import * as fs from 'fs';
import * as firebase from '@firebase/rules-unit-testing';
import {
  Timestamp,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

// projects/{project}/data/{data} の権限網羅テスト（範囲略号 DAT）
// - A-DAT-NN: 通ってはいけない操作。assertFails＝安全な仕様を期待値にする（現行Rulesに穴があれば赤になる）
// - L-DAT-NN: クライアントが依存している正当な操作。Rulesを締めたときの回帰防止

let testEnv: firebase.RulesTestEnvironment;
const projectID = 'ecorismap';
const documentId = 'testDocument';
const missingProjectId = 'noSuchProject';
const layerId = 'testLayer';
const uid1 = 'testUid1'; //オーナー
const uid2 = 'testUid2'; //管理者
const uid3 = 'testUid3'; //メンバー
const uid4 = 'testUid4'; //メール未承認（メンバー・管理者に含まれる）
const uid5 = 'testUid5'; //知らない人
const uid6 = 'testUid6'; //別のメンバー（被害者）
const uid7 = 'testUid7'; //元管理者（現在はプロジェクトから外れている）

beforeAll(async () => {
  // テストプロジェクト環境の作成
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

const ctx = (uid: string, n: string, verified = true) =>
  testEnv.authenticatedContext(uid, { email: `${n}@example.com`, email_verified: verified });

const dataPath = (id: string, project = documentId) => `projects/${project}/data/${id}`;

// クライアント(uploadDataHelper: src/lib/firebase/firestore.ts:937-950)が書くフィールド構成
const makeData = (userId: string, permission: string, extra: Record<string, unknown> = {}) => ({
  userId,
  layerId,
  permission,
  encdata: ['chunk'],
  encryptedAt: '2022年1月2日',
  chunkIndex: 0,
  chunkCount: 1,
  ...extra,
});

const seed = async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, `projects/${documentId}`), {
      ownerUid: uid1,
      adminsUid: [uid1, uid2, uid4],
      membersUid: [uid1, uid2, uid3, uid4, uid6],
      encdata: [''],
      encryptedAt: '2022年1月1日',
      cryptoScheme: 'dek',
      dekPublicKey: 'PUBKEY',
    });
    await setDoc(doc(db, dataPath('priv3')), makeData(uid3, 'PRIVATE'));
    await setDoc(doc(db, dataPath('priv6')), makeData(uid6, 'PRIVATE'));
    await setDoc(doc(db, dataPath('pub6')), makeData(uid6, 'PUBLIC'));
    await setDoc(doc(db, dataPath('common2')), makeData(uid2, 'COMMON'));
    await setDoc(doc(db, dataPath('tmpl2')), makeData(uid2, 'TEMPLATE'));
    // 元管理者が書いたCOMMON（Phase ii以前の書き込みなどで userId が元管理者のまま残っているもの）
    await setDoc(doc(db, dataPath('commonEx')), makeData(uid7, 'COMMON'));
    // 存在しないプロジェクト配下に残った孤児データ
    await setDoc(doc(db, dataPath('orphan6', missingProjectId)), makeData(uid6, 'PRIVATE'));
  });
};

describe('data subcollection 権限網羅（attack）', () => {
  beforeEach(seed);

  // ---- create: permission値ごとの作成権限 ----
  it('[A-DAT-01] create: 一般メンバーは自分のuserIdでもTEMPLATEを作成できない', async () => {
    await firebase.assertFails(setDoc(doc(ctx(uid3, 'test3').firestore(), dataPath('x1')), makeData(uid3, 'TEMPLATE')));
  });

  it('[A-DAT-02] create: 未知のpermission値（不正文字列）では作成できない', async () => {
    await firebase.assertFails(setDoc(doc(ctx(uid2, 'test2').firestore(), dataPath('x2')), makeData(uid2, 'HACKED')));
  });

  it('[A-DAT-03] create: permissionが配列（["PRIVATE"]）など型違いでは作成できない', async () => {
    await firebase.assertFails(
      setDoc(doc(ctx(uid3, 'test3').firestore(), dataPath('x3')), makeData(uid3, 'PRIVATE', { permission: ['PRIVATE'] }))
    );
  });

  it('[A-DAT-04] create: 非メンバーは自分のuserIdのPRIVATEでも作成できない', async () => {
    await firebase.assertFails(setDoc(doc(ctx(uid5, 'test5').firestore(), dataPath('x4')), makeData(uid5, 'PRIVATE')));
  });

  it('[A-DAT-05] create: メール未承認のメンバー（管理者でもある）はCOMMONを作成できない', async () => {
    await firebase.assertFails(
      setDoc(doc(ctx(uid4, 'test4', false).firestore(), dataPath('x5')), makeData(uid4, 'COMMON'))
    );
  });

  it('[A-DAT-06] create: 未認証では作成できない', async () => {
    await firebase.assertFails(
      setDoc(doc(testEnv.unauthenticatedContext().firestore(), dataPath('x6')), makeData(uid3, 'PUBLIC'))
    );
  });

  it('[A-DAT-07] create: 存在しないプロジェクトには自分のuserIdでも作成できない', async () => {
    await firebase.assertFails(
      setDoc(doc(ctx(uid3, 'test3').firestore(), dataPath('x7', missingProjectId)), makeData(uid3, 'PRIVATE'))
    );
  });

  // ---- create: userIdなりすまし ----
  it('[A-DAT-08] create: メンバーは他メンバーのuserIdでPUBLICを作成できない（なりすまし）', async () => {
    await firebase.assertFails(setDoc(doc(ctx(uid3, 'test3').firestore(), dataPath('x8')), makeData(uid6, 'PUBLIC')));
  });

  it('[A-DAT-09] create: 管理者でも他メンバーのuserIdでPRIVATE/PUBLICは作成できない', async () => {
    const db = ctx(uid2, 'test2').firestore();
    await firebase.assertFails(setDoc(doc(db, dataPath('x9a')), makeData(uid3, 'PRIVATE')));
    await firebase.assertFails(setDoc(doc(db, dataPath('x9b')), makeData(uid3, 'PUBLIC')));
  });

  // ---- create: フィールド型（chunk系・encdata） ----
  it('[A-DAT-10] create: encdataが配列でない（文字列）PUBLICは作成できない（他メンバーのダウンロード処理を壊す）', async () => {
    await firebase.assertFails(
      setDoc(doc(ctx(uid3, 'test3').firestore(), dataPath('x10')), makeData(uid3, 'PUBLIC', { encdata: 'not-array' }))
    );
  });

  it('[A-DAT-11] create: chunkIndex/chunkCountが数値でない・負値のドキュメントは作成できない', async () => {
    const db = ctx(uid3, 'test3').firestore();
    await firebase.assertFails(setDoc(doc(db, dataPath('x11a')), makeData(uid3, 'PUBLIC', { chunkIndex: 'zero' })));
    await firebase.assertFails(setDoc(doc(db, dataPath('x11b')), makeData(uid3, 'PUBLIC', { chunkCount: -1 })));
  });

  // ---- update: resource側の所有者を見ていない問題 ----
  it('[A-DAT-12] update: メンバーは他メンバーのPRIVATEをuserIdを自分に差し替えて上書きできない', async () => {
    await firebase.assertFails(
      setDoc(doc(ctx(uid3, 'test3').firestore(), dataPath('priv6')), makeData(uid3, 'PRIVATE', { encdata: ['evil'] }))
    );
  });

  it('[A-DAT-13] update: メンバーは他メンバーのPRIVATEのuserIdだけを自分に書き換えて乗っ取れない', async () => {
    await firebase.assertFails(updateDoc(doc(ctx(uid3, 'test3').firestore(), dataPath('priv6')), { userId: uid3 }));
  });

  it('[A-DAT-14] update: メンバーは他メンバーのPUBLICを自分のPUBLICとして上書きできない', async () => {
    await firebase.assertFails(
      setDoc(doc(ctx(uid3, 'test3').firestore(), dataPath('pub6')), makeData(uid3, 'PUBLIC', { encdata: ['evil'] }))
    );
  });

  it('[A-DAT-15] update: メンバーは管理者のCOMMONをPRIVATE＋自分のuserIdへ書き換えて奪えない', async () => {
    await firebase.assertFails(
      updateDoc(doc(ctx(uid3, 'test3').firestore(), dataPath('common2')), { permission: 'PRIVATE', userId: uid3 })
    );
  });

  it('[A-DAT-16] update: メンバーはTEMPLATEをPUBLIC＋自分のuserIdへ書き換えられない', async () => {
    await firebase.assertFails(
      updateDoc(doc(ctx(uid3, 'test3').firestore(), dataPath('tmpl2')), { permission: 'PUBLIC', userId: uid3 })
    );
  });

  it('[A-DAT-17] update: 管理者は他メンバーのPRIVATEを自分のuserIdのPRIVATEで上書きできない', async () => {
    await firebase.assertFails(
      setDoc(doc(ctx(uid2, 'test2').firestore(), dataPath('priv6')), makeData(uid2, 'PRIVATE', { encdata: ['evil'] }))
    );
  });

  it('[A-DAT-18] update: 管理者は他メンバーのPRIVATEの中身をCOMMON（任意userId）として書き換えられない', async () => {
    await firebase.assertFails(
      setDoc(doc(ctx(uid2, 'test2').firestore(), dataPath('priv6')), makeData(uid6, 'COMMON', { encdata: ['evil'] }))
    );
  });

  it('[A-DAT-19] update: メンバーは自分のPRIVATEをCOMMONへ昇格できない', async () => {
    await firebase.assertFails(updateDoc(doc(ctx(uid3, 'test3').firestore(), dataPath('priv3')), { permission: 'COMMON' }));
  });

  it('[A-DAT-20] update: メンバーは自分のデータのuserIdを他人へ付け替えられない（他人への濡れ衣）', async () => {
    await firebase.assertFails(updateDoc(doc(ctx(uid3, 'test3').firestore(), dataPath('priv3')), { userId: uid6 }));
  });

  it('[A-DAT-21] update: メンバーは他メンバーのPRIVATEのpermissionだけをPUBLICへ変えられない', async () => {
    await firebase.assertFails(updateDoc(doc(ctx(uid3, 'test3').firestore(), dataPath('priv6')), { permission: 'PUBLIC' }));
  });

  // ---- update: 「permissionのみ更新」分岐 ----
  it('[A-DAT-22] update(permissionのみ): 管理者でもpermissionを不正文字列へ変えられない', async () => {
    await firebase.assertFails(updateDoc(doc(ctx(uid2, 'test2').firestore(), dataPath('priv6')), { permission: 'HACKED' }));
  });

  it('[A-DAT-23] update(permissionのみ): 管理者でもpermissionを数値など型違いへ変えられない', async () => {
    await firebase.assertFails(updateDoc(doc(ctx(uid2, 'test2').firestore(), dataPath('pub6')), { permission: 1 }));
  });

  it('[A-DAT-24] update(permissionのみ): 管理者でもpermissionフィールドを削除できない（全クエリから消える）', async () => {
    await firebase.assertFails(
      updateDoc(doc(ctx(uid2, 'test2').firestore(), dataPath('priv6')), { permission: deleteField() })
    );
  });

  // ---- delete ----
  it('[A-DAT-25] delete: メンバーは他メンバーのPRIVATE/PUBLICを削除できない', async () => {
    const db = ctx(uid3, 'test3').firestore();
    await firebase.assertFails(deleteDoc(doc(db, dataPath('priv6'))));
    await firebase.assertFails(deleteDoc(doc(db, dataPath('pub6'))));
  });

  it('[A-DAT-26] delete: メンバーはCOMMON/TEMPLATEを削除できない', async () => {
    const db = ctx(uid3, 'test3').firestore();
    await firebase.assertFails(deleteDoc(doc(db, dataPath('common2'))));
    await firebase.assertFails(deleteDoc(doc(db, dataPath('tmpl2'))));
  });

  it('[A-DAT-27] delete: プロジェクトから外れた元管理者は自分が書いたCOMMONを削除できない', async () => {
    await firebase.assertFails(deleteDoc(doc(ctx(uid7, 'test7').firestore(), dataPath('commonEx'))));
  });

  it('[A-DAT-28] delete: メール未承認・未認証・非メンバーは削除できない', async () => {
    await firebase.assertFails(deleteDoc(doc(ctx(uid4, 'test4', false).firestore(), dataPath('priv6'))));
    await firebase.assertFails(deleteDoc(doc(testEnv.unauthenticatedContext().firestore(), dataPath('priv6'))));
    await firebase.assertFails(deleteDoc(doc(ctx(uid5, 'test5').firestore(), dataPath('common2'))));
  });

  // ---- read ----
  it('[A-DAT-29] list: メンバーはuserId絞り込み無しのPRIVATEクエリを実行できない', async () => {
    const db = ctx(uid3, 'test3').firestore();
    await firebase.assertFails(getDocs(query(collection(db, `projects/${documentId}/data`), where('permission', '==', 'PRIVATE'))));
  });

  it('[A-DAT-30] list: メンバーは絞り込み無しでdataコレクション全体を読めない', async () => {
    await firebase.assertFails(getDocs(collection(ctx(uid3, 'test3').firestore(), `projects/${documentId}/data`)));
  });

  it('[A-DAT-31] get: 元管理者（非メンバー）は自分のuserIdのCOMMONでも読めない', async () => {
    await firebase.assertFails(getDoc(doc(ctx(uid7, 'test7').firestore(), dataPath('commonEx'))));
  });

  it('[A-DAT-32] get: メール未承認の管理者は他メンバーのPRIVATEを読めない', async () => {
    await firebase.assertFails(getDoc(doc(ctx(uid4, 'test4', false).firestore(), dataPath('priv6'))));
  });

  it('[A-DAT-33] get: 存在しないプロジェクト配下の孤児データは本人でも読めない', async () => {
    await firebase.assertFails(getDoc(doc(ctx(uid6, 'test6').firestore(), dataPath('orphan6', missingProjectId))));
  });
});

describe('data subcollection 権限網羅（legit）', () => {
  beforeEach(seed);

  it('[L-DAT-01] メンバーは自分の旧世代を消しつつ新チャンク（cryptoScheme=dek, Timestamp）を1バッチで書ける', async () => {
    const db = ctx(uid3, 'test3').firestore();
    const batch = writeBatch(db);
    batch.delete(doc(db, dataPath('priv3')));
    const encryptedAt = Timestamp.now();
    [0, 1].forEach((i) =>
      batch.set(doc(collection(db, `projects/${documentId}/data`)), {
        userId: uid3,
        layerId,
        permission: 'PRIVATE',
        encdata: [`chunk${i}`],
        encryptedAt,
        chunkIndex: i,
        chunkCount: 2,
        cryptoScheme: 'dek',
      })
    );
    await firebase.assertSucceeds(batch.commit());
  });

  it('[L-DAT-02] メンバーは自分のPUBLICを作成できる', async () => {
    await firebase.assertSucceeds(
      setDoc(doc(ctx(uid3, 'test3').firestore(), dataPath('newPub3')), makeData(uid3, 'PUBLIC'))
    );
  });

  it('[L-DAT-03] メンバーは layerId×userId(自分)×permission のクエリで自分の既存チャンクを取得できる', async () => {
    const db = ctx(uid3, 'test3').firestore();
    await firebase.assertSucceeds(
      getDocs(
        query(
          collection(db, `projects/${documentId}/data`),
          where('permission', '==', 'PRIVATE'),
          where('layerId', '==', layerId),
          where('userId', '==', uid3)
        )
      )
    );
  });

  it('[L-DAT-04] メンバーはPUBLIC/COMMON/TEMPLATEのクエリを実行できる', async () => {
    const col = collection(ctx(uid3, 'test3').firestore(), `projects/${documentId}/data`);
    await firebase.assertSucceeds(getDocs(query(col, where('permission', '==', 'PUBLIC'))));
    await firebase.assertSucceeds(getDocs(query(col, where('permission', '==', 'COMMON'))));
    await firebase.assertSucceeds(getDocs(query(col, where('permission', '==', 'TEMPLATE'))));
    await firebase.assertSucceeds(getDocs(query(col, where('permission', 'in', ['PUBLIC', 'COMMON']))));
  });

  it('[L-DAT-05] 管理者はuserId絞り込み無しのPRIVATEクエリ・全件取得ができる', async () => {
    const col = collection(ctx(uid2, 'test2').firestore(), `projects/${documentId}/data`);
    await firebase.assertSucceeds(getDocs(query(col, where('permission', '==', 'PRIVATE'))));
    await firebase.assertSucceeds(getDocs(col));
  });

  it('[L-DAT-06] 管理者はレイヤ単位で他メンバーのデータも含めて一括削除できる', async () => {
    const db = ctx(uid2, 'test2').firestore();
    const snap = await getDocs(query(collection(db, `projects/${documentId}/data`), where('layerId', '==', layerId)));
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await firebase.assertSucceeds(batch.commit());
  });

  it('[L-DAT-07] 管理者はレイヤのpermission変更に合わせて他メンバーのデータのpermissionをバッチ更新できる', async () => {
    const db = ctx(uid2, 'test2').firestore();
    const batch = writeBatch(db);
    batch.update(doc(db, dataPath('pub6')), { permission: 'COMMON' });
    batch.update(doc(db, dataPath('common2')), { permission: 'PRIVATE' });
    await firebase.assertSucceeds(batch.commit());
  });

  it('[L-DAT-08] 管理者は自分のTEMPLATE旧世代を消して新世代を書ける', async () => {
    const db = ctx(uid2, 'test2').firestore();
    const batch = writeBatch(db);
    batch.delete(doc(db, dataPath('tmpl2')));
    batch.set(doc(collection(db, `projects/${documentId}/data`)), makeData(uid2, 'TEMPLATE', { cryptoScheme: 'dek' }));
    await firebase.assertSucceeds(batch.commit());
  });

  it('[L-DAT-09] メンバーは自分のデータを layerId×userId×permission のクエリで探して削除できる', async () => {
    const db = ctx(uid3, 'test3').firestore();
    const snap = await getDocs(
      query(
        collection(db, `projects/${documentId}/data`),
        where('layerId', '==', layerId),
        where('userId', '==', uid3),
        where('permission', '==', 'PRIVATE')
      )
    );
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await firebase.assertSucceeds(batch.commit());
  });

  it('[L-DAT-10] オーナーは他メンバーのPRIVATEを読め、削除できる', async () => {
    const db = ctx(uid1, 'test1').firestore();
    await firebase.assertSucceeds(getDoc(doc(db, dataPath('priv6'))));
    await firebase.assertSucceeds(deleteDoc(doc(db, dataPath('priv6'))));
  });
});
