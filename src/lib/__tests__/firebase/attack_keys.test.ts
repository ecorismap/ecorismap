/**
 * projects/{project}/keys/{uid}（DEKエンベロープ暗号の鍵配布）の権限網羅テスト。
 *
 * - attack (A-KEY-NN): 通ってはいけない操作。assertFails＝安全な仕様を期待値にしているため、
 *   現行Rulesに穴があればこのテストが赤になる。
 * - legit (L-KEY-NN): クライアント（src/lib/firebase/firestore.ts の addProject / distributeProjectDEK /
 *   addMemberKey / removeMemberKey / getMemberKeyFreshness、src/hooks/useE3kitGroup.ts）が依存する
 *   正当な読み書き。Rulesを締めたときの回帰防止。
 *
 * 既存の firestore_rules.test.ts の keys ケースとは重複させていない。
 */
import * as fs from 'fs';
import * as firebase from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';

let testEnv: firebase.RulesTestEnvironment;
const projectID = 'ecorismap';
const documentId = 'testDocumentKeys';
const otherDocumentId = 'testDocumentKeysOther';
const missingDocumentId = 'testDocumentKeysMissing';
const uid1 = 'testUid1'; //オーナー
const uid2 = 'testUid2'; //管理者
const uid3 = 'testUid3'; //メンバー
const uid4 = 'testUid4'; //メール未承認（membersUid/adminsUid に入っている）
const uid5 = 'testUid5'; //知らない人
const uid6 = 'testUid6'; //メンバー2
const uid7 = 'testUid7'; //除名済みの元メンバー（keysの消し残りがある）

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
const unverifiedCtx = () => testEnv.authenticatedContext(uid4, { email: 'test4@example.com', email_verified: false });
const keyPath = (uid: string, projectId = documentId) => `projects/${projectId}/keys/${uid}`;

// クライアント(ProjectKeyFS)と同じ形。encryptedAt は Timestamp.now()。
const keyFS = (wrapperUid: string, encDek = 'wrapped') => ({ encDek, wrapperUid, encryptedAt: Timestamp.now() });

const seedProject = async (opts?: { scheme?: 'dek' | 'group'; projectId?: string; ownerUid?: string; adminsUid?: string[]; membersUid?: string[] }) => {
  const scheme = opts?.scheme ?? 'dek';
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), `projects/${opts?.projectId ?? documentId}`), {
      ownerUid: opts?.ownerUid ?? uid1,
      adminsUid: opts?.adminsUid ?? [uid1, uid2, uid4],
      membersUid: opts?.membersUid ?? [uid1, uid2, uid3, uid4, uid6],
      encdata: [''],
      encryptedAt: Timestamp.now(),
      ...(scheme === 'dek' ? { cryptoScheme: 'dek', dekPublicKey: 'PUBKEY' } : {}),
    });
  });
};

const seedKey = async (uid: string, projectId = documentId, wrapperUid = uid1) => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), keyPath(uid, projectId)), {
      encDek: 'wrapped-original',
      wrapperUid,
      encryptedAt: Timestamp.now(),
    });
  });
};

describe('keys: wrapperUid のなりすまし', () => {
  it('[A-KEY-01] 管理者が wrapperUid をオーナーに偽装して新メンバー宛ての鍵を作成できない', async () => {
    await seedProject();
    await firebase.assertFails(setDoc(doc(ctx(uid2, 'test2').firestore(), keyPath(uid5)), keyFS(uid1)));
  });

  it('[A-KEY-02] 一般メンバーがオーナー宛ての鍵(F4)を wrapperUid=オーナー に偽装して書けない', async () => {
    await seedProject();
    await seedKey(uid1);
    await firebase.assertFails(setDoc(doc(ctx(uid3, 'test3').firestore(), keyPath(uid1)), keyFS(uid1, 'fake')));
  });

  it('[A-KEY-03] オーナーが wrapperUid を管理者に偽装してメンバー鍵を更新できない', async () => {
    await seedProject();
    await seedKey(uid3);
    await firebase.assertFails(setDoc(doc(ctx(uid1, 'test1').firestore(), keyPath(uid3)), keyFS(uid2)));
  });

  it('[A-KEY-04] 管理者が updateDoc で wrapperUid だけを他人に差し替えられない', async () => {
    await seedProject();
    await seedKey(uid3, documentId, uid2);
    await firebase.assertFails(updateDoc(doc(ctx(uid2, 'test2').firestore(), keyPath(uid3)), { wrapperUid: uid6 }));
  });
});

describe('keys: フィールド構成・型', () => {
  it('[A-KEY-05] 管理者が encDek を文字列以外(数値)で書けない', async () => {
    await seedProject();
    await firebase.assertFails(
      setDoc(doc(ctx(uid2, 'test2').firestore(), keyPath(uid3)), { encDek: 12345, wrapperUid: uid2, encryptedAt: Timestamp.now() })
    );
  });

  it('[A-KEY-06] 管理者が wrapperUid を配列(自分＋オーナー)で書けない', async () => {
    await seedProject();
    await firebase.assertFails(
      setDoc(doc(ctx(uid2, 'test2').firestore(), keyPath(uid3)), {
        encDek: 'wrapped',
        wrapperUid: [uid2, uid1],
        encryptedAt: Timestamp.now(),
      })
    );
  });

  it('[A-KEY-07] 一般メンバーがオーナー宛ての鍵(F4)に余分なフィールドを足せない（hasOnly）', async () => {
    await seedProject();
    await firebase.assertFails(
      setDoc(doc(ctx(uid3, 'test3').firestore(), keyPath(uid1)), { ...keyFS(uid3), membersUid: [uid3] })
    );
  });

  it('[A-KEY-08] 管理者が必須フィールド(wrapperUid)を欠いた鍵を作れない', async () => {
    await seedProject();
    await firebase.assertFails(
      setDoc(doc(ctx(uid2, 'test2').firestore(), keyPath(uid3)), { encDek: 'wrapped', encryptedAt: Timestamp.now() })
    );
  });
});

describe('keys: 一般メンバーによる他人宛て・自分宛ての書き込み', () => {
  it('[A-KEY-09] 一般メンバーが他メンバー宛ての既存鍵を上書きできない', async () => {
    await seedProject();
    await seedKey(uid6);
    await firebase.assertFails(setDoc(doc(ctx(uid3, 'test3').firestore(), keyPath(uid6)), keyFS(uid3, 'fake')));
  });

  it('[A-KEY-10] 一般メンバーが他メンバー宛ての既存鍵を updateDoc で書き換えられない', async () => {
    await seedProject();
    await seedKey(uid6);
    await firebase.assertFails(updateDoc(doc(ctx(uid3, 'test3').firestore(), keyPath(uid6)), { encDek: 'fake' }));
  });

  it('[A-KEY-11] 一般メンバーが自分宛ての鍵を自作（偽DEKの持ち込み）できない', async () => {
    await seedProject();
    await firebase.assertFails(setDoc(doc(ctx(uid3, 'test3').firestore(), keyPath(uid3)), keyFS(uid3, 'self-made')));
  });

  it('[A-KEY-12] 一般メンバーが管理者宛ての既存鍵を上書きできない', async () => {
    await seedProject();
    await seedKey(uid2);
    await firebase.assertFails(setDoc(doc(ctx(uid3, 'test3').firestore(), keyPath(uid2)), keyFS(uid3, 'fake')));
  });
});

describe('keys: 読み取り', () => {
  it('[A-KEY-13] 一般メンバーが keys コレクションを一覧取得できない', async () => {
    await seedProject();
    await seedKey(uid1);
    await seedKey(uid3);
    await seedKey(uid6);
    await firebase.assertFails(getDocs(collection(ctx(uid3, 'test3').firestore(), `projects/${documentId}/keys`)));
  });

  it('[A-KEY-14] 一般メンバーが他の一般メンバー宛ての鍵を読めない', async () => {
    await seedProject();
    await seedKey(uid6);
    await firebase.assertFails(getDoc(doc(ctx(uid3, 'test3').firestore(), keyPath(uid6))));
  });

  it('[A-KEY-15] 除名済みの元メンバーは消し残った自分宛ての鍵を読めない', async () => {
    // removeMemberKey の失敗は無視される(useE3kitGroup)ため、keys/{uid} が残りうる
    await seedProject();
    await seedKey(uid7);
    await firebase.assertFails(getDoc(doc(ctx(uid7, 'test7').firestore(), keyPath(uid7))));
  });

  it('[A-KEY-16] 非メンバーは存在しないプロジェクト配下の自分宛て鍵パスを読めない', async () => {
    await firebase.assertFails(getDoc(doc(ctx(uid5, 'test5').firestore(), keyPath(uid5, missingDocumentId))));
  });

  it('[A-KEY-17] メール未承認のメンバーは自分宛ての鍵を読めない', async () => {
    await seedProject();
    await seedKey(uid4);
    await firebase.assertFails(getDoc(doc(unverifiedCtx().firestore(), keyPath(uid4))));
  });

  it('[A-KEY-18] 未認証ユーザーは鍵を読めない', async () => {
    await seedProject();
    await seedKey(uid3);
    await firebase.assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), keyPath(uid3))));
  });

  it('[A-KEY-19] 他プロジェクトの管理者はこのプロジェクトのメンバー鍵を読めない', async () => {
    await seedProject();
    await seedProject({ projectId: otherDocumentId, ownerUid: uid5, adminsUid: [uid5], membersUid: [uid5] });
    await seedKey(uid3);
    await firebase.assertFails(getDoc(doc(ctx(uid5, 'test5').firestore(), keyPath(uid3))));
  });
});

describe('keys: オーナーでもメンバーでもない者・未承認・未認証の書き込み', () => {
  it('[A-KEY-20] 非メンバーが自分宛ての鍵を作って参加者になりすませない', async () => {
    await seedProject();
    await firebase.assertFails(setDoc(doc(ctx(uid5, 'test5').firestore(), keyPath(uid5)), keyFS(uid5)));
  });

  it('[A-KEY-21] 非メンバーが存在しないプロジェクトに鍵を作れない', async () => {
    await firebase.assertFails(setDoc(doc(ctx(uid5, 'test5').firestore(), keyPath(uid5, missingDocumentId)), keyFS(uid5)));
  });

  it('[A-KEY-22] 他プロジェクトのオーナー兼管理者がこのプロジェクトに鍵を作れない', async () => {
    await seedProject();
    await seedProject({ projectId: otherDocumentId, ownerUid: uid5, adminsUid: [uid5], membersUid: [uid5] });
    await firebase.assertFails(setDoc(doc(ctx(uid5, 'test5').firestore(), keyPath(uid3)), keyFS(uid5)));
  });

  it('[A-KEY-23] メール未承認の管理者は鍵を作成できない', async () => {
    await seedProject();
    await firebase.assertFails(setDoc(doc(unverifiedCtx().firestore(), keyPath(uid3)), keyFS(uid4)));
  });

  it('[A-KEY-24] メール未承認のメンバーはオーナー宛ての鍵(F4経路)も書けない', async () => {
    await seedProject();
    await firebase.assertFails(setDoc(doc(unverifiedCtx().firestore(), keyPath(uid1)), keyFS(uid4)));
  });

  it('[A-KEY-25] 未認証ユーザーはオーナー宛ての鍵を書けない', async () => {
    await seedProject();
    await firebase.assertFails(setDoc(doc(testEnv.unauthenticatedContext().firestore(), keyPath(uid1)), keyFS(uid5)));
  });

  it('[A-KEY-26] 除名済みの元メンバーはオーナー宛ての鍵を上書きできない', async () => {
    await seedProject();
    await seedKey(uid1);
    await firebase.assertFails(setDoc(doc(ctx(uid7, 'test7').firestore(), keyPath(uid1)), keyFS(uid7, 'fake')));
  });
});

describe('keys: 削除', () => {
  it('[A-KEY-27] 一般メンバーは自分宛ての鍵を削除できない', async () => {
    await seedProject();
    await seedKey(uid3);
    await firebase.assertFails(deleteDoc(doc(ctx(uid3, 'test3').firestore(), keyPath(uid3))));
  });

  it('[A-KEY-28] 一般メンバーは他メンバー宛ての鍵を削除できない', async () => {
    await seedProject();
    await seedKey(uid6);
    await firebase.assertFails(deleteDoc(doc(ctx(uid3, 'test3').firestore(), keyPath(uid6))));
  });

  it('[A-KEY-29] 管理者はオーナー宛ての鍵を削除できない（オーナーを復号不能にさせない）', async () => {
    // オーナーは管理者に外せない(keepsOwner)ので、removeMemberKey でオーナー鍵を消す正当フローは無い
    await seedProject();
    await seedKey(uid1);
    await firebase.assertFails(deleteDoc(doc(ctx(uid2, 'test2').firestore(), keyPath(uid1))));
  });

  it('[A-KEY-30] 非メンバー・未承認・未認証は鍵を削除できない', async () => {
    await seedProject();
    await seedKey(uid3);
    await firebase.assertFails(deleteDoc(doc(ctx(uid5, 'test5').firestore(), keyPath(uid3))));
    await firebase.assertFails(deleteDoc(doc(unverifiedCtx().firestore(), keyPath(uid3))));
    await firebase.assertFails(deleteDoc(doc(testEnv.unauthenticatedContext().firestore(), keyPath(uid3))));
  });
});

describe('keys: 正当なクライアントフロー（回帰防止）', () => {
  it('[L-KEY-01] オーナーは新規DEKプロジェクト作成直後に全メンバーへ鍵をバッチ配布できる（addProject）', async () => {
    await seedProject({ adminsUid: [uid1, uid2], membersUid: [uid1, uid2, uid3] });
    const db = ctx(uid1, 'test1').firestore();
    const batch = writeBatch(db);
    for (const uid of [uid1, uid2, uid3]) batch.set(doc(db, keyPath(uid)), keyFS(uid1));
    await firebase.assertSucceeds(batch.commit());
  });

  it('[L-KEY-02] 管理者は group 方式のまま全メンバーへ鍵をバッチ配布できる（migrateProjectToDEK: プロジェクト更新前）', async () => {
    await seedProject({ scheme: 'group', adminsUid: [uid1, uid2], membersUid: [uid1, uid2, uid3] });
    const db = ctx(uid2, 'test2').firestore();
    const batch = writeBatch(db);
    for (const uid of [uid1, uid2, uid3]) batch.set(doc(db, keyPath(uid)), keyFS(uid2));
    await firebase.assertSucceeds(batch.commit());
  });

  it('[L-KEY-03] 管理者はメンバー宛ての既存鍵を再共有で上書きできる（reshareMemberKey）', async () => {
    await seedProject();
    await seedKey(uid3);
    await firebase.assertSucceeds(setDoc(doc(ctx(uid2, 'test2').firestore(), keyPath(uid3)), keyFS(uid2, 'rewrapped')));
  });

  it('[L-KEY-04] 管理者は鍵リセットしたオーナー宛てに再共有できる', async () => {
    await seedProject();
    await seedKey(uid1);
    await firebase.assertSucceeds(setDoc(doc(ctx(uid2, 'test2').firestore(), keyPath(uid1)), keyFS(uid2, 'rewrapped')));
  });

  it('[L-KEY-05] オーナーは追加前のメンバー宛て鍵を作成できる（addMemberKey はプロジェクト更新より先に走る）', async () => {
    await seedProject();
    await firebase.assertSucceeds(setDoc(doc(ctx(uid1, 'test1').firestore(), keyPath(uid5)), keyFS(uid1)));
  });

  it('[L-KEY-06] オーナーはメンバー削除時にその鍵を削除できる（removeMemberKey）', async () => {
    await seedProject();
    await seedKey(uid6);
    await firebase.assertSucceeds(deleteDoc(doc(ctx(uid1, 'test1').firestore(), keyPath(uid6))));
  });

  it('[L-KEY-07] 管理者は鍵未作成メンバーの keys/{uid} を get できる（getMemberKeyFreshness の不存在判定）', async () => {
    await seedProject();
    await firebase.assertSucceeds(getDoc(doc(ctx(uid2, 'test2').firestore(), keyPath(uid6))));
  });

  it('[L-KEY-08] 管理者に追加されたメンバーは Timestamp 形式の自分宛て鍵を読める（loadProjectDEKForCurrentUser）', async () => {
    await seedProject();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), keyPath(uid6)), keyFS(uid2));
    });
    await firebase.assertSucceeds(getDoc(doc(ctx(uid6, 'test6').firestore(), keyPath(uid6))));
  });
});
