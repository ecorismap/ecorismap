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
} from 'firebase/firestore';

// projects/{project} ドキュメント本体の権限網羅テスト。
// A-PRJ-NN: 通ってはいけない操作（assertFails＝安全な仕様を期待値にする。現行Rulesで穴なら赤になる）
// L-PRJ-NN: クライアント(src/lib/firebase/firestore.ts)が依存する正当な操作（assertSucceeds＝回帰防止）

let testEnv: firebase.RulesTestEnvironment;
const projectID = 'ecorismap';
const documentId = 'testDocument';
const otherDocumentId = 'otherDocument';
const uid1 = 'testUid1'; //オーナー
const uid2 = 'testUid2'; //管理者
const uid3 = 'testUid3'; //メンバー
const uid4 = 'testUid4'; //メール未承認（管理者・メンバー）
const uid5 = 'testUid5'; //知らない人
const uid6 = 'testUid6'; //もう一人の管理者

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

const verified = (uid: string) =>
  testEnv.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true }).firestore();
const unverified = (uid: string) =>
  testEnv.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: false }).firestore();
const anonymous = () => testEnv.unauthenticatedContext().firestore();

const baseMembers = {
  ownerUid: uid1,
  adminsUid: [uid1, uid2, uid4, uid6],
  membersUid: [uid1, uid2, uid3, uid4, uid6],
};

const seed = async (id: string, data: Record<string, unknown>) => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), `projects/${id}`), data);
  });
};
// DEK方式（addProject の CREATE_DEK_PROJECTS 経路と同じ構成）
const seedDekProject = (id = documentId) =>
  seed(id, {
    ...baseMembers,
    encdata: [''],
    encryptedAt: '2022年1月1日',
    cryptoScheme: 'dek',
    dekPublicKey: 'PUBKEY',
  });
// 従来のグループ方式（cryptoScheme無し）
const seedGroupProject = (id = documentId) =>
  seed(id, {
    ...baseMembers,
    encdata: [''],
    encryptedAt: '2022年1月1日',
  });

const projectRef = (db: ReturnType<typeof verified>, id = documentId) => doc(db, `projects/${id}`);

describe('projects: create の検証不足', () => {
  it('[A-PRJ-01] create: cryptoScheme=dek なのに dekPublicKey が無いプロジェクトは作れない', async () => {
    await firebase.assertFails(
      setDoc(projectRef(verified(uid1)), {
        ownerUid: uid1,
        adminsUid: [uid1],
        membersUid: [uid1],
        encdata: [''],
        encryptedAt: '2022年1月1日',
        cryptoScheme: 'dek',
      })
    );
  });

  it('[A-PRJ-02] create: cryptoScheme に未知の値（"dek"以外）は入れられない', async () => {
    await firebase.assertFails(
      setDoc(projectRef(verified(uid1)), {
        ownerUid: uid1,
        adminsUid: [uid1],
        membersUid: [uid1],
        encdata: [''],
        encryptedAt: '2022年1月1日',
        cryptoScheme: 'none',
        dekPublicKey: 'PUBKEY',
      })
    );
  });

  it('[A-PRJ-03] create: cryptoScheme 無しで dekPublicKey だけを持つプロジェクトは作れない', async () => {
    await firebase.assertFails(
      setDoc(projectRef(verified(uid1)), {
        ownerUid: uid1,
        adminsUid: [uid1],
        membersUid: [uid1],
        encdata: [''],
        encryptedAt: '2022年1月1日',
        dekPublicKey: 'PUBKEY',
      })
    );
  });

  it('[A-PRJ-04] create: dekPublicKey は文字列以外（map）にできない', async () => {
    await firebase.assertFails(
      setDoc(projectRef(verified(uid1)), {
        ownerUid: uid1,
        adminsUid: [uid1],
        membersUid: [uid1],
        encdata: [''],
        encryptedAt: '2022年1月1日',
        cryptoScheme: 'dek',
        dekPublicKey: { k: 'PUBKEY' },
      })
    );
  });

  it('[A-PRJ-05] create: adminsUid/membersUid を map にした型違いのプロジェクトは作れない', async () => {
    await firebase.assertFails(
      setDoc(projectRef(verified(uid1)), {
        ownerUid: uid1,
        adminsUid: { [uid1]: true },
        membersUid: { [uid1]: true },
        encdata: [''],
        encryptedAt: '2022年1月1日',
      })
    );
  });

  it('[A-PRJ-06] create: オーナー自身を membersUid/adminsUid に含めないプロジェクトは作れない', async () => {
    await firebase.assertFails(
      setDoc(projectRef(verified(uid1)), {
        ownerUid: uid1,
        adminsUid: [uid2],
        membersUid: [uid2],
        encdata: [''],
        encryptedAt: '2022年1月1日',
      })
    );
  });

  it('[A-PRJ-07] create: サーバー管理フィールド（storage/archived）付きでは作れない', async () => {
    await firebase.assertFails(
      setDoc(projectRef(verified(uid1)), {
        ownerUid: uid1,
        adminsUid: [uid1],
        membersUid: [uid1],
        encdata: [''],
        encryptedAt: '2022年1月1日',
        storage: { count: 0, limit: 999999 },
      })
    );
    await firebase.assertFails(
      setDoc(projectRef(verified(uid1)), {
        ownerUid: uid1,
        adminsUid: [uid1],
        membersUid: [uid1],
        encdata: [''],
        encryptedAt: '2022年1月1日',
        archived: true,
      })
    );
  });

  it('[A-PRJ-08] create: 必須フィールド(encdata)欠落では作れない', async () => {
    await firebase.assertFails(
      setDoc(projectRef(verified(uid1)), {
        ownerUid: uid1,
        adminsUid: [uid1],
        membersUid: [uid1],
        encryptedAt: '2022年1月1日',
      })
    );
  });

  it('[A-PRJ-09] create→update: 他人の既存プロジェクトを ownerUid=自分 の setDoc で乗っ取れない', async () => {
    await seedDekProject();
    await firebase.assertFails(
      setDoc(projectRef(verified(uid5)), {
        ownerUid: uid5,
        adminsUid: [uid5],
        membersUid: [uid5],
        encdata: [''],
        encryptedAt: '2022年1月1日',
      })
    );
  });
});

describe('projects: update の3分岐の抜け道', () => {
  it('[A-PRJ-10] update: 管理者は group 方式を dekPublicKey 無しで cryptoScheme=dek に切り替えられない', async () => {
    await seedGroupProject();
    // dekPublicKey が無いと以降の enc が 'DEK public key not available' で失敗し、全員が復号不能になる
    await firebase.assertFails(updateDoc(projectRef(verified(uid2)), { cryptoScheme: 'dek' }));
  });

  it('[A-PRJ-11] update: 管理者は dek 方式を group へ巻き戻せない', async () => {
    await seedDekProject();
    await firebase.assertFails(
      updateDoc(projectRef(verified(uid2)), { cryptoScheme: 'group', encdata: ['downgraded'] })
    );
  });

  it('[A-PRJ-12] update: 管理者は deleteField で cryptoScheme を消して group 扱いへ戻せない', async () => {
    await seedDekProject();
    await firebase.assertFails(updateDoc(projectRef(verified(uid2)), { cryptoScheme: deleteField() }));
  });

  it('[A-PRJ-13] update: 管理者は deleteField で dekPublicKey を消せない（keepsDekPublicKey の迂回）', async () => {
    await seedDekProject();
    await firebase.assertFails(
      updateDoc(projectRef(verified(uid2)), { dekPublicKey: deleteField(), encdata: ['reenc'] })
    );
  });

  it('[A-PRJ-14] update: オーナーでも dek 方式を group へ巻き戻せない（ダウングレード禁止）', async () => {
    await seedDekProject();
    await firebase.assertFails(
      updateDoc(projectRef(verified(uid1)), {
        cryptoScheme: 'group',
        dekPublicKey: deleteField(),
        encdata: ['downgraded'],
      })
    );
  });

  it('[A-PRJ-32] update: オーナーでも既に dek のプロジェクトの dekPublicKey を差し替えられない（二重移行の上書き防止）', async () => {
    await seedDekProject();
    // migrateProjectToDEK と同じ構成で再移行しても、既に確定した dekPublicKey は上書きできない
    await firebase.assertFails(
      updateDoc(projectRef(verified(uid1)), {
        encdata: ['reenc'],
        encryptedAt: Timestamp.now(),
        cryptoScheme: 'dek',
        dekPublicKey: 'NEW_PUBKEY',
      })
    );
  });

  it('[A-PRJ-33] update: オーナーでも deleteField で dekPublicKey を消せない', async () => {
    await seedDekProject();
    await firebase.assertFails(updateDoc(projectRef(verified(uid1)), { dekPublicKey: deleteField() }));
  });

  it('[A-PRJ-15] update: 管理者は membersUid/adminsUid を map 化して keepsOwner をすり抜けられない', async () => {
    await seedDekProject();
    // `in` は map のキーにも真を返すため keepsOwner を満たすが、array-contains の一覧クエリから全員分消える
    await firebase.assertFails(
      updateDoc(projectRef(verified(uid2)), {
        adminsUid: { [uid1]: true, [uid2]: true },
        membersUid: { [uid1]: true, [uid2]: true, [uid3]: true },
      })
    );
  });

  it('[A-PRJ-16] update: 管理者は updateDoc で ownerUid を自分へ差し替えられない', async () => {
    await seedDekProject();
    await firebase.assertFails(updateDoc(projectRef(verified(uid2)), { ownerUid: uid2 }));
  });

  it('[A-PRJ-17] update: オーナーでも deleteField で ownerUid を消せない', async () => {
    await seedDekProject();
    await firebase.assertFails(updateDoc(projectRef(verified(uid1)), { ownerUid: deleteField() }));
  });

  it('[A-PRJ-18] update: オーナー/管理者でもサーバー管理フィールド(storage/license)は書けない', async () => {
    await seedDekProject();
    await firebase.assertFails(updateDoc(projectRef(verified(uid1)), { storage: { count: 0, limit: 999999 } }));
    await firebase.assertFails(updateDoc(projectRef(verified(uid2)), { license: 'Premium' }));
  });

  it('[A-PRJ-19] update: 一般メンバーは dek 方式でも自分を adminsUid に足せない（昇格）', async () => {
    await seedDekProject();
    await firebase.assertFails(
      updateDoc(projectRef(verified(uid3)), { adminsUid: [...baseMembers.adminsUid, uid3] })
    );
  });

  it('[A-PRJ-20] update: 非メンバーは自分を membersUid に足せない', async () => {
    await seedDekProject();
    await firebase.assertFails(
      updateDoc(projectRef(verified(uid5)), { membersUid: [...baseMembers.membersUid, uid5] })
    );
  });

  it('[A-PRJ-21] update: archived 分岐で archived に boolean 以外は入れられない', async () => {
    await seedGroupProject();
    // getAllProjects は archived !== true で振り分けるため、'true' 等の文字列だと表示状態が壊れる
    await firebase.assertFails(updateDoc(projectRef(verified(uid2)), { archived: 'true' }));
  });

  it('[A-PRJ-22] update: 非メンバー・一般メンバーは archived だけの更新もできない（dek方式）', async () => {
    await seedDekProject();
    await firebase.assertFails(updateDoc(projectRef(verified(uid5)), { archived: true }));
    await firebase.assertFails(updateDoc(projectRef(verified(uid3)), { archived: true }));
  });

  it('[A-PRJ-23] update: メール未承認の管理者は archived もメンバー追加もできない', async () => {
    await seedDekProject();
    await firebase.assertFails(updateDoc(projectRef(unverified(uid4)), { archived: true }));
    await firebase.assertFails(
      updateDoc(projectRef(unverified(uid4)), { membersUid: [...baseMembers.membersUid, uid5] })
    );
  });

  it('[A-PRJ-24] update: メール未承認のオーナー・未認証は更新できない', async () => {
    await seedDekProject();
    await firebase.assertFails(updateDoc(projectRef(unverified(uid1)), { encdata: ['x'] }));
    await firebase.assertFails(updateDoc(projectRef(anonymous()), { archived: true }));
  });

  // 既知受容（2026-10-25判断で現状維持）。管理者同士の階層は未導入のため skip。導入時に有効化する。
  it.skip('[A-PRJ-25] update: 管理者は他の管理者を adminsUid から外せない', async () => {
    await seedDekProject();
    await firebase.assertFails(
      updateDoc(projectRef(verified(uid2)), { adminsUid: [uid1, uid2, uid4] })
    );
  });

  // 既知受容（2026-10-25判断で現状維持）。管理者同士の階層は未導入のため skip。導入時に有効化する。
  it.skip('[A-PRJ-26] update: 管理者は外部uidを管理者に追加できない（メンバー外の昇格）', async () => {
    await seedDekProject();
    await firebase.assertFails(
      updateDoc(projectRef(verified(uid2)), {
        adminsUid: [...baseMembers.adminsUid, uid5],
        membersUid: [...baseMembers.membersUid, uid5],
      })
    );
  });
});

describe('projects: delete', () => {
  it('[A-PRJ-27] delete: 管理者・一般メンバー・非メンバーはプロジェクトを削除できない', async () => {
    await seedDekProject();
    await firebase.assertFails(deleteDoc(projectRef(verified(uid2))));
    await firebase.assertFails(deleteDoc(projectRef(verified(uid3))));
    await firebase.assertFails(deleteDoc(projectRef(verified(uid5))));
  });

  it('[A-PRJ-28] delete: メール未承認のオーナー・未認証は削除できない', async () => {
    await seedDekProject();
    await firebase.assertFails(deleteDoc(projectRef(unverified(uid1))));
    await firebase.assertFails(deleteDoc(projectRef(anonymous())));
  });
});

describe('projects: get / list', () => {
  it('[A-PRJ-29] get: メール承認済みでも非メンバーは取得できない／存在しないプロジェクトも探れない', async () => {
    await seedDekProject();
    await firebase.assertFails(getDoc(projectRef(verified(uid5))));
    await firebase.assertFails(getDoc(projectRef(verified(uid5), 'noSuchProject')));
  });

  it('[A-PRJ-30] list: 絞り込み無し・他人uidの array-contains・他人の ownerUid では一覧できない', async () => {
    await seedDekProject();
    await seedGroupProject(otherDocumentId);
    const db = verified(uid5);
    await firebase.assertFails(getDocs(collection(db, 'projects')));
    await firebase.assertFails(getDocs(query(collection(db, 'projects'), where('membersUid', 'array-contains', uid3))));
    await firebase.assertFails(getDocs(query(collection(db, 'projects'), where('ownerUid', '==', uid1))));
  });

  it('[A-PRJ-31] list: メール未承認・未認証は自分のuidの array-contains でも一覧できない', async () => {
    await seedDekProject();
    await firebase.assertFails(
      getDocs(query(collection(unverified(uid4), 'projects'), where('membersUid', 'array-contains', uid4)))
    );
    await firebase.assertFails(
      getDocs(query(collection(anonymous(), 'projects'), where('membersUid', 'array-contains', uid3)))
    );
  });
});

describe('projects: クライアントが依存する正当な操作', () => {
  it('[L-PRJ-01] list: getAllProjects の membersUid array-contains 自分 のクエリが通る', async () => {
    await seedDekProject();
    await seedGroupProject(otherDocumentId);
    for (const uid of [uid1, uid2, uid3]) {
      await firebase.assertSucceeds(
        getDocs(query(collection(verified(uid), 'projects'), where('membersUid', 'array-contains', uid)))
      );
    }
  });

  it('[L-PRJ-02] list: getOwnedProjectIds/deleteAllProjects の ownerUid == 自分 のクエリが通る', async () => {
    await seedDekProject();
    await firebase.assertSucceeds(getDocs(query(collection(verified(uid1), 'projects'), where('ownerUid', '==', uid1))));
  });

  it('[L-PRJ-03] create: addProject(group) の Timestamp 付き構成で作成できる', async () => {
    await firebase.assertSucceeds(
      setDoc(projectRef(verified(uid1)), {
        ownerUid: uid1,
        adminsUid: [uid1],
        membersUid: [uid1, uid3],
        encdata: ['enc'],
        encryptedAt: Timestamp.now(),
      })
    );
  });

  it('[L-PRJ-04] update: updateProject の構成（adminsUid/membersUid/encdata/encryptedAt）で dek 方式の管理者がメンバーを追加できる', async () => {
    await seedDekProject();
    await firebase.assertSucceeds(
      updateDoc(projectRef(verified(uid2)), {
        adminsUid: baseMembers.adminsUid,
        membersUid: [...baseMembers.membersUid, uid5],
        encdata: ['reenc'],
        encryptedAt: Timestamp.now(),
      })
    );
  });

  it('[L-PRJ-05] update: updateProject の構成で group 方式のオーナーが更新できる', async () => {
    await seedGroupProject();
    await firebase.assertSucceeds(
      updateDoc(projectRef(verified(uid1)), {
        adminsUid: [uid1, uid2],
        membersUid: [uid1, uid2, uid3],
        encdata: ['reenc'],
        encryptedAt: Timestamp.now(),
      })
    );
  });

  it('[L-PRJ-06] update: unarchiveProject（archived:false のみ）を管理者が group/dek どちらでも実行できる', async () => {
    await seedGroupProject();
    await seedDekProject(otherDocumentId);
    await firebase.assertSucceeds(updateDoc(projectRef(verified(uid2)), { archived: false }));
    await firebase.assertSucceeds(updateDoc(projectRef(verified(uid2), otherDocumentId), { archived: false }));
  });

  it('[L-PRJ-07] update: migrateProjectToDEK の構成（encdata/encryptedAt/cryptoScheme/dekPublicKey）を管理者が Timestamp 付きで実行できる', async () => {
    await seedGroupProject();
    await firebase.assertSucceeds(
      updateDoc(projectRef(verified(uid2)), {
        encdata: ['reenc'],
        encryptedAt: Timestamp.now(),
        cryptoScheme: 'dek',
        dekPublicKey: 'NEW_PUBKEY',
      })
    );
  });

  it('[L-PRJ-10] update: オーナーは group 方式から dekPublicKey を設定して移行できる', async () => {
    await seedGroupProject();
    await firebase.assertSucceeds(
      updateDoc(projectRef(verified(uid1)), {
        encdata: ['reenc'],
        encryptedAt: Timestamp.now(),
        cryptoScheme: 'dek',
        dekPublicKey: 'NEW_PUBKEY',
      })
    );
  });

  it('[L-PRJ-11] update: オーナーは dek 方式で dekPublicKey を据え置いたままメタ・メンバーを更新できる（updateProject）', async () => {
    await seedDekProject();
    await firebase.assertSucceeds(
      updateDoc(projectRef(verified(uid1)), {
        adminsUid: [uid1, uid2],
        membersUid: [uid1, uid2, uid3],
        encdata: ['reenc'],
        encryptedAt: Timestamp.now(),
      })
    );
  });

  it('[L-PRJ-08] delete: deleteProject でオーナーは自分のプロジェクトを削除できる', async () => {
    await seedDekProject();
    await firebase.assertSucceeds(deleteDoc(projectRef(verified(uid1))));
  });

  it('[L-PRJ-09] get: getProjectCrypto の getDoc を一般メンバーが dek 方式で実行できる', async () => {
    await seedDekProject();
    await firebase.assertSucceeds(getDoc(projectRef(verified(uid3))));
  });
});
