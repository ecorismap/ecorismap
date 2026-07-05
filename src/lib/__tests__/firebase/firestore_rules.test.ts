import * as fs from 'fs';
import * as firebase from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';

let testEnv: firebase.RulesTestEnvironment;
const projectID = 'ecorismap';
const documentId = 'testDocument';
const layerId = 'testLayer';
const dataId1 = 'testData1';
const dataId2 = 'testData2';
const uid1 = 'testUid1'; //オーナー
const uid2 = 'testUid2'; //管理者
const uid3 = 'testUid3'; //メンバー
const uid4 = 'testUid4'; //メール未承認
const uid5 = 'testUid5'; //知らない人

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

describe('projects collection', () => {
  it('get: メンバーは取得できる', async () => {
    //更新、読み取り用のデータを事前にセット。await忘れずに。
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}`), {
        ownerUid: uid1,
        adminsUid: [uid1, uid2],
        membersUid: [uid1, uid2, uid3],
      });
    });

    const context1 = testEnv.authenticatedContext(uid1, {
      email: 'test1@example.com',
      email_verified: true,
    });
    const context2 = testEnv.authenticatedContext(uid2, {
      email: 'test2@example.com',
      email_verified: true,
    });
    const context3 = testEnv.authenticatedContext(uid3, {
      email: 'test3@example.com',
      email_verified: true,
    });
    await firebase.assertSucceeds(getDoc(doc(context1.firestore(), `projects/${documentId}`)));
    await firebase.assertSucceeds(getDoc(doc(context2.firestore(), `projects/${documentId}`)));
    await firebase.assertSucceeds(getDoc(doc(context3.firestore(), `projects/${documentId}`)));
  });

  it('get: 承認されたメンバー以外は取得できない', async () => {
    //更新、読み取り用のデータを事前にセット。await忘れずに。
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}`), {
        ownerUid: uid1,
        adminsUid: [uid1, uid2],
        membersUid: [uid1, uid2, uid3, uid4],
      });
    });

    const context4 = testEnv.authenticatedContext(uid4, {
      email: 'test4@example.com',
      email_verified: false,
    });
    const context5 = testEnv.unauthenticatedContext();

    await firebase.assertFails(getDoc(doc(context4.firestore(), `projects/${documentId}`)));
    await firebase.assertFails(getDoc(doc(context5.firestore(), `projects/${documentId}`)));
  });

  it('get: メール未承認のオーナーは取得できない（演算子優先順位の回帰テスト）', async () => {
    // オーナーをmembersUidに含めず、read条件のオーナー分岐だけを検証する。
    // 括弧が無いと (isSignedIn && member) || owner と解釈され、未承認オーナーが通ってしまう。
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}`), {
        ownerUid: uid4,
        adminsUid: [uid4],
        membersUid: [uid1, uid2],
      });
    });

    const unverifiedOwner = testEnv.authenticatedContext(uid4, {
      email: 'test4@example.com',
      email_verified: false,
    });
    await firebase.assertFails(getDoc(doc(unverifiedOwner.firestore(), `projects/${documentId}`)));
  });

  it('get: メール承認済みのオーナーはmembersUidに含まれなくても取得できる', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}`), {
        ownerUid: uid1,
        adminsUid: [uid1],
        membersUid: [uid2, uid3],
      });
    });

    const verifiedOwner = testEnv.authenticatedContext(uid1, {
      email: 'test1@example.com',
      email_verified: true,
    });
    await firebase.assertSucceeds(getDoc(doc(verifiedOwner.firestore(), `projects/${documentId}`)));
  });

  it('create: 自身のドキュメントなら作成できる', async () => {
    const context1 = testEnv.authenticatedContext(uid1, {
      email: 'test@example.com',
      email_verified: true,
    });
    await firebase.assertSucceeds(
      setDoc(doc(context1.firestore(), `projects/${documentId}`), {
        ownerUid: uid1,
        adminsUid: [uid1],
        membersUid: [uid1],
        encryptedAt: '2022年1月2日',
        encdata: '',
      })
    );
  });

  it('create: 他人のドキュメントは作成できない', async () => {
    const context1 = testEnv.authenticatedContext(uid1, {
      email: 'test@example.com',
      email_verified: true,
    });
    await firebase.assertFails(
      setDoc(doc(context1.firestore(), `projects/${documentId}`), {
        ownerUid: uid2,
        adminsUid: [uid1],
        membersUid: [uid1],
        encryptedAt: '2022年1月2日',
        encdata: '',
      })
    );
  });

  it('create: メール未承認だとドキュメントは作成できない', async () => {
    const context4 = testEnv.authenticatedContext(uid4, {
      email: 'test4@example.com',
      email_verified: false,
    });
    await firebase.assertFails(
      setDoc(doc(context4.firestore(), `projects/${documentId}`), {
        ownerUid: uid4,
        adminsUid: [uid4],
        membersUid: [uid4],
        encryptedAt: '2022年1月2日',
        encdata: '',
      })
    );
  });

  it('create: 未認証だと作成できない', async () => {
    const context5 = testEnv.unauthenticatedContext();
    await firebase.assertFails(
      setDoc(doc(context5.firestore(), `projects/${documentId}`), {
        ownerUid: uid5,
        adminsUid: [uid5],
        membersUid: [uid5],
        encryptedAt: '2022年1月2日',
        encdata: '',
      })
    );
  });

  it('update: オーナーなら編集できる', async () => {
    //更新、読み取り用のデータを事前にセット。await忘れずに。
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}`), {
        encdata: '',
        ownerUid: uid1,
        adminsUid: [uid1, uid2],
        membersUid: [uid1, uid2, uid3, uid4],
        encryptedAt: '2022年1月2日',
      });
    });

    const context1 = testEnv.authenticatedContext(uid1, {
      email: 'test@example.com',
      email_verified: true,
    });
    await firebase.assertSucceeds(
      setDoc(doc(context1.firestore(), `projects/${documentId}`), {
        encdata: '',
        ownerUid: uid1,
        adminsUid: [uid1],
        membersUid: [uid1],
        encryptedAt: '2022年1月2日',
      })
    );
  });

  it('update: 管理者はプロジェクトの情報は編集できない', async () => {
    //更新、読み取り用のデータを事前にセット。await忘れずに。
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}`), {
        encdata: '',
        ownerUid: uid1,
        adminsUid: [uid1, uid2],
        membersUid: [uid1, uid2, uid3, uid4],
        encryptedAt: '2022年1月2日',
      });
    });

    const context2 = testEnv.authenticatedContext(uid2, {
      email: 'test2@example.com',
      email_verified: true,
    });
    await firebase.assertFails(
      setDoc(doc(context2.firestore(), `projects/${documentId}`), {
        encdata: '',
        ownerUid: uid1,
        adminsUid: [uid1, uid2],
        membersUid: [uid1, uid2],
        encryptedAt: '2022年1月2日',
      })
    );
  });

  it('update: メンバーは編集できない', async () => {
    //更新、読み取り用のデータを事前にセット。await忘れずに。
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}`), {
        encdata: '',
        ownerUid: uid1,
        adminsUid: [uid1, uid2],
        membersUid: [uid1, uid2, uid3, uid4],
        encryptedAt: '2022年1月2日',
      });
    });

    const context3 = testEnv.authenticatedContext(uid3, {
      email: 'test3@example.com',
      email_verified: true,
    });
    await firebase.assertFails(
      setDoc(doc(context3.firestore(), `projects/${documentId}`), {
        encdata: '',
        ownerUid: uid1,
        adminsUid: [uid1, uid2, uid3],
        membersUid: [uid1, uid2],
        encryptedAt: '2022年1月2日',
      })
    );
  });

  it('update: ownerUidは編集できない', async () => {
    //更新、読み取り用のデータを事前にセット。await忘れずに。
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}`), {
        encdata: '',
        ownerUid: uid1,
        adminsUid: [uid1, uid2],
        membersUid: [uid1, uid2, uid3, uid4],
        encryptedAt: '2022年1月2日',
      });
    });

    const context1 = testEnv.authenticatedContext(uid1, {
      email: 'test1@example.com',
      email_verified: true,
    });
    await firebase.assertFails(
      setDoc(doc(context1.firestore(), `projects/${documentId}`), {
        encdata: '',
        ownerUid: uid2,
        adminsUid: [uid1, uid2],
        membersUid: [uid1, uid2, uid3, uid4],
        encryptedAt: '2022年1月2日',
      })
    );
  });

  it('update: adminsUidからownerは削除できない', async () => {
    //更新、読み取り用のデータを事前にセット。await忘れずに。
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}`), {
        encdata: '',
        ownerUid: uid1,
        adminsUid: [uid1, uid2],
        membersUid: [uid1, uid2, uid3, uid4],
        encryptedAt: '2022年1月2日',
      });
    });

    const context2 = testEnv.authenticatedContext(uid2, {
      email: 'test2@example.com',
      email_verified: true,
    });
    await firebase.assertFails(
      setDoc(doc(context2.firestore(), `projects/${documentId}`), {
        encdata: '',
        ownerUid: uid1,
        adminsUid: [uid2],
        membersUid: [uid1, uid2, uid3, uid4],
        encryptedAt: '2022年1月2日',
      })
    );
  });
});

describe('settings subcollection', () => {
  it('get: メンバーは取得できる', async () => {
    //更新、読み取り用のデータを事前にセット。await忘れずに。
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}`), {
        ownerUid: uid1,
        adminsUid: [uid1, uid2],
        membersUid: [uid1, uid2, uid3, uid4],
        encryptedAt: '2022年1月2日',
      });
    });

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}/settings/default`), {
        layers: [],
      });
    });

    const context1 = testEnv.authenticatedContext(uid1, {
      email: 'test1@example.com',
      email_verified: true,
    });
    const context2 = testEnv.authenticatedContext(uid2, {
      email: 'test2@example.com',
      email_verified: true,
    });
    const context3 = testEnv.authenticatedContext(uid3, {
      email: 'test3@example.com',
      email_verified: true,
    });
    await firebase.assertSucceeds(getDoc(doc(context1.firestore(), `projects/${documentId}/settings/default`)));
    await firebase.assertSucceeds(getDoc(doc(context2.firestore(), `projects/${documentId}/settings/default`)));
    await firebase.assertSucceeds(getDoc(doc(context3.firestore(), `projects/${documentId}/settings/default`)));
  });

  it('get: 承認されたメンバー以外は取得できない', async () => {
    //更新、読み取り用のデータを事前にセット。await忘れずに。
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}`), {
        ownerUid: uid1,
        adminsUid: [uid1, uid2],
        membersUid: [uid1, uid2, uid3, uid4],
        encryptedAt: '2022年1月2日',
      });
    });

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}/settings/default`), {
        layers: [],
      });
    });

    const context4 = testEnv.authenticatedContext(uid4, {
      email: 'test4@example.com',
      email_verified: false,
    });
    const context5 = testEnv.unauthenticatedContext();

    await firebase.assertFails(getDoc(doc(context4.firestore(), `projects/${documentId}/settings/default`)));
    await firebase.assertFails(getDoc(doc(context5.firestore(), `projects/${documentId}/settings/default`)));
  });

  it('create: 管理者なら作成、編集できる', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}`), {
        encdata: '',
        ownerUid: uid1,
        adminsUid: [uid1, uid2],
        membersUid: [uid1, uid2, uid3, uid4],
        encryptedAt: '2022年1月2日',
      });
    });
    const context1 = testEnv.authenticatedContext(uid1, {
      email: 'test@example.com',
      email_verified: true,
    });
    await firebase.assertSucceeds(
      setDoc(doc(context1.firestore(), `projects/${documentId}/settings/default`), {
        editorUid: uid1,
        encdata: '1',
        encryptedAt: '2022年1月2日',
      })
    );
    const context2 = testEnv.authenticatedContext(uid2, {
      email: 'test@example.com',
      email_verified: true,
    });
    await firebase.assertSucceeds(
      setDoc(doc(context2.firestore(), `projects/${documentId}/settings/default`), {
        editorUid: uid1,
        encdata: '2',
        encryptedAt: '2022年1月2日',
      })
    );
  });

  it('create: メンバーは作成、編集できない', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}`), {
        ownerUid: uid1,
        adminsUid: [uid1, uid2],
        membersUid: [uid1, uid2, uid3, uid4],
        encdata: '',
        encryptedAt: '2022年1月2日',
      });
    });
    const context3 = testEnv.authenticatedContext(uid3, {
      email: 'test@example.com',
      email_verified: true,
    });
    await firebase.assertFails(
      setDoc(doc(context3.firestore(), `projects/${documentId}/settings/default`), {
        editorUid: uid1,
        encdata: '1',
        encryptedAt: '2022年1月2日',
      })
    );
  });

  it('create: 未認証だと作成、編集できない', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}`), {
        ownerUid: uid1,
        adminsUid: [uid1, uid2],
        membersUid: [uid1, uid2, uid3, uid4],
        encdata: '',
        encryptedAt: '2022年1月2日',
      });
    });
    const context5 = testEnv.unauthenticatedContext();
    await firebase.assertFails(
      setDoc(doc(context5.firestore(), `projects/${documentId}/settings/default`), {
        editorUid: uid1,
        encdata: '1',
        encryptedAt: '2022年1月2日',
      })
    );
  });
});

describe('data subcollection', () => {
  it('get: メンバーは自分のデータは取得できる', async () => {
    //更新、読み取り用のデータを事前にセット。await忘れずに。
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}`), {
        ownerUid: uid1,
        adminsUid: [uid1, uid2],
        membersUid: [uid1, uid2, uid3, uid4],
        encdata: '',
        encryptedAt: '2022年1月2日',
      });
    });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}/data/${dataId1}`), {
        encdata: '',
        userId: uid3,
        layerId: layerId,
        permission: 'PRIVATE',
        encryptedAt: '2022年1月2日',
      });
    });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}/data/${dataId2}`), {
        encdata: '',
        userId: uid1,
        layerId: layerId,
        permission: 'COMMON',
        encryptedAt: '2022年1月2日',
      });
    });

    const context3 = testEnv.authenticatedContext(uid3, {
      email: 'test3@example.com',
      email_verified: true,
    });

    await firebase.assertSucceeds(
      getDocs(
        query(
          collection(context3.firestore(), `projects/${documentId}/data`),
          where('userId', '==', uid3),
          where('layerId', '==', layerId)
        )
      )
    );
  });

  it('get: 管理者はすべてのデータを取得できる', async () => {
    //更新、読み取り用のデータを事前にセット。await忘れずに。
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}`), {
        ownerUid: uid1,
        adminsUid: [uid1, uid2],
        membersUid: [uid1, uid2, uid3, uid4],
        encdata: '',
        encryptedAt: '2022年1月2日',
      });
    });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}/data/${dataId1}`), {
        encdata: '',
        userId: uid3,
        layerId: layerId,
        permission: 'PRIVATE',
        encryptedAt: '2022年1月2日',
      });
    });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}/data/${dataId2}`), {
        encdata: '',
        userId: uid1,
        layerId: layerId,
        permission: 'COMMON',
        encryptedAt: '2022年1月2日',
      });
    });

    const context1 = testEnv.authenticatedContext(uid1, {
      email: 'test1@example.com',
      email_verified: true,
    });

    await firebase.assertSucceeds(getDocs(query(collection(context1.firestore(), `projects/${documentId}/data`))));
  });

  it('get: メンバーはCommonデータは取得できる', async () => {
    //更新、読み取り用のデータを事前にセット。await忘れずに。
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}`), {
        ownerUid: uid1,
        adminsUid: [uid1, uid2],
        membersUid: [uid1, uid2, uid3, uid4],
        encdata: '',
        encryptedAt: '2022年1月2日',
      });
    });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}/data/${dataId1}`), {
        encdata: '',
        userId: uid1,
        layerId: layerId,
        permission: 'COMMON',
        encryptedAt: '2022年1月2日',
      });
    });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}/data/${dataId2}`), {
        encdata: '',
        userId: uid2,
        layerId: layerId,
        permission: 'PRIVATE',
        encryptedAt: '2022年1月2日',
      });
    });

    const context1 = testEnv.authenticatedContext(uid1, {
      email: 'test1@example.com',
      email_verified: true,
    });
    const context2 = testEnv.authenticatedContext(uid2, {
      email: 'test2@example.com',
      email_verified: true,
    });
    const context3 = testEnv.authenticatedContext(uid3, {
      email: 'test3@example.com',
      email_verified: true,
    });
    await firebase.assertSucceeds(
      getDocs(
        query(collection(context1.firestore(), `projects/${documentId}/data`), where('permission', '==', 'COMMON'))
      )
    );
    await firebase.assertSucceeds(
      getDocs(
        query(collection(context2.firestore(), `projects/${documentId}/data`), where('permission', '==', 'COMMON'))
      )
    );
    await firebase.assertSucceeds(
      getDocs(
        query(collection(context3.firestore(), `projects/${documentId}/data`), where('permission', '==', 'COMMON'))
      )
    );
  });

  it('get: 承認されたメンバー以外はCommonデータは取得できない', async () => {
    //更新、読み取り用のデータを事前にセット。await忘れずに。
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}`), {
        ownerUid: uid1,
        adminsUid: [uid1, uid2],
        membersUid: [uid1, uid2, uid3, uid4],
        encdata: '',
        encryptedAt: '2022年1月2日',
      });
    });

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}/data/${dataId1}`), {
        encdata: '',
        userId: uid1,
        layerId: layerId,
        permission: 'COMMON',
        encryptedAt: '2022年1月2日',
      });
    });

    const context4 = testEnv.authenticatedContext(uid4, {
      email: 'test4@example.com',
      email_verified: false,
    });
    const context5 = testEnv.unauthenticatedContext();

    await firebase.assertFails(
      getDocs(
        query(collection(context4.firestore(), `projects/${documentId}/data`), where('permission', '==', 'COMMON'))
      )
    );
    await firebase.assertFails(
      getDocs(
        query(collection(context5.firestore(), `projects/${documentId}/data`), where('permission', '==', 'COMMON'))
      )
    );
  });

  it('get: メンバーはPublicデータは取得できる', async () => {
    //更新、読み取り用のデータを事前にセット。await忘れずに。
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}`), {
        ownerUid: uid1,
        adminsUid: [uid1, uid2],
        membersUid: [uid1, uid2, uid3, uid4],
        encdata: '',
        encryptedAt: '2022年1月2日',
      });
    });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}/data/${dataId1}`), {
        encdata: '',
        userId: uid1,
        layerId: layerId,
        permission: 'PUBLIC',
        encryptedAt: '2022年1月2日',
      });
    });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}/data/${dataId2}`), {
        encdata: '',
        userId: uid2,
        layerId: layerId,
        permission: 'PRIVATE',
        encryptedAt: '2022年1月2日',
      });
    });

    const context1 = testEnv.authenticatedContext(uid1, {
      email: 'test1@example.com',
      email_verified: true,
    });
    const context2 = testEnv.authenticatedContext(uid2, {
      email: 'test2@example.com',
      email_verified: true,
    });
    const context3 = testEnv.authenticatedContext(uid3, {
      email: 'test3@example.com',
      email_verified: true,
    });

    await firebase.assertSucceeds(
      getDocs(
        query(collection(context1.firestore(), `projects/${documentId}/data`), where('permission', '==', 'PUBLIC'))
      )
    );
    await firebase.assertSucceeds(
      getDocs(
        query(collection(context2.firestore(), `projects/${documentId}/data`), where('permission', '==', 'PUBLIC'))
      )
    );
    await firebase.assertSucceeds(
      getDocs(
        query(collection(context3.firestore(), `projects/${documentId}/data`), where('permission', '==', 'PUBLIC'))
      )
    );
  });

  it('get: メンバーは自分のPrivateデータは取得できる', async () => {
    //更新、読み取り用のデータを事前にセット。await忘れずに。
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}`), {
        ownerUid: uid1,
        adminsUid: [uid1, uid2],
        membersUid: [uid1, uid2, uid3, uid4],
        encdata: '',
        encryptedAt: '2022年1月2日',
      });
    });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}/data/${dataId1}`), {
        encdata: '',
        userId: uid1,
        layerId: layerId,
        permission: 'PRIVATE',
        encryptedAt: '2022年1月2日',
      });
    });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}/data/${dataId2}`), {
        encdata: '',
        userId: uid3,
        layerId: layerId,
        permission: 'PRIVATE',
        encryptedAt: '2022年1月2日',
      });
    });

    const context3 = testEnv.authenticatedContext(uid3, {
      email: 'test3@example.com',
      email_verified: true,
    });

    await firebase.assertSucceeds(
      getDocs(
        query(
          collection(context3.firestore(), `projects/${documentId}/data`),
          where('userId', '==', uid3),
          where('permission', '==', 'PRIVATE')
        )
      )
    );
  });

  it('get: メンバーは自分以外のPrivateデータは取得できない', async () => {
    //更新、読み取り用のデータを事前にセット。await忘れずに。
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}`), {
        ownerUid: uid1,
        adminsUid: [uid1, uid2],
        membersUid: [uid1, uid2, uid3, uid4],
        encdata: '',
        encryptedAt: '2022年1月2日',
      });
    });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}/data/${dataId1}`), {
        encdata: '',
        userId: uid1,
        layerId: layerId,
        permission: 'PUBLIC',
        encryptedAt: '2022年1月2日',
      });
    });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}/data/${dataId2}`), {
        encdata: '',
        userId: uid2,
        layerId: layerId,
        permission: 'PRIVATE',
        encryptedAt: '2022年1月2日',
      });
    });

    const context3 = testEnv.authenticatedContext(uid3, {
      email: 'test3@example.com',
      email_verified: true,
    });

    await firebase.assertFails(
      getDocs(
        query(
          collection(context3.firestore(), `projects/${documentId}/data`),
          where('userId', '==', uid2),
          where('permission', '==', 'PRIVATE')
        )
      )
    );
  });

  it('create: 管理者ならCommonデータを作成、編集できる。', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}`), {
        ownerUid: uid1,
        adminsUid: [uid1, uid2],
        membersUid: [uid1, uid2, uid3, uid4],
        encdata: '',
        encryptedAt: '2022年1月2日',
      });
    });
    const context2 = testEnv.authenticatedContext(uid2, {
      email: 'test2@example.com',
      email_verified: true,
    });
    await firebase.assertSucceeds(
      setDoc(doc(context2.firestore(), `projects/${documentId}/data/${dataId1}`), {
        encdata: '',
        userId: uid2,
        layerId: layerId,
        permission: 'COMMON',
        encryptedAt: '2022年1月2日',
      })
    );
  });

  it('create: メンバーはCommonデータを作成、編集できない。', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}`), {
        ownerUid: uid1,
        adminsUid: [uid1, uid2],
        membersUid: [uid1, uid2, uid3, uid4],
        encdata: '',
        encryptedAt: '2022年1月2日',
      });
    });
    // uid3 は一般メンバー（adminsUidに含まれない）。COMMONの作成は管理者専用なので失敗する。
    const context3 = testEnv.authenticatedContext(uid3, {
      email: 'test3@example.com',
      email_verified: true,
    });
    await firebase.assertFails(
      setDoc(doc(context3.firestore(), `projects/${documentId}/data/${dataId1}`), {
        encdata: '',
        userId: uid3,
        layerId: layerId,
        permission: 'COMMON',
        encryptedAt: '2022年1月2日',
      })
    );
  });

  it('create: 不正なデータではCommonデータを作成できない。', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}`), {
        ownerUid: uid1,
        adminsUid: [uid1, uid2],
        membersUid: [uid1, uid2, uid3, uid4],
        encdata: '',
        encryptedAt: '2022年1月2日',
      });
    });
    const context2 = testEnv.authenticatedContext(uid2, {
      email: 'test2@example.com',
      email_verified: true,
    });
    await firebase.assertFails(
      setDoc(doc(context2.firestore(), `projects/${documentId}/data/${dataId1}`), {
        wrongdata: '',
        userId: uid2,
        layerId: layerId,
        permission: 'COMMON',
        encryptedAt: '2022年1月2日',
      })
    );
  });

  it('create: メンバーならPrivateデータを作成、編集できる。', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}`), {
        ownerUid: uid1,
        adminsUid: [uid1, uid2],
        membersUid: [uid1, uid2, uid3, uid4],
        encdata: '',
        encryptedAt: '2022年1月2日',
      });
    });
    const context3 = testEnv.authenticatedContext(uid3, {
      email: 'test3@example.com',
      email_verified: true,
    });
    await firebase.assertSucceeds(
      setDoc(doc(context3.firestore(), `projects/${documentId}/data/${dataId1}`), {
        encdata: '',
        userId: uid3,
        layerId: layerId,
        permission: 'PRIVATE',
        encryptedAt: '2022年1月2日',
      })
    );
  });

  it('create: 他人(userIdが自分ではない)のPrivateデータは作成できない。', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}`), {
        ownerUid: uid1,
        adminsUid: [uid1, uid2],
        membersUid: [uid1, uid2, uid3, uid4],
        encdata: '',
        encryptedAt: '2022年1月2日',
      });
    });
    const context3 = testEnv.authenticatedContext(uid3, {
      email: 'test3@example.com',
      email_verified: true,
    });
    await firebase.assertFails(
      setDoc(doc(context3.firestore(), `projects/${documentId}/data/${dataId1}`), {
        encdata: '',
        userId: uid2,
        layerId: layerId,
        permission: 'PRIVATE',
        encryptedAt: '2022年1月2日',
      })
    );
  });

  it('delete: メンバーなら自分のデータを削除できる。', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}`), {
        ownerUid: uid1,
        adminsUid: [uid1, uid2],
        membersUid: [uid1, uid2, uid3, uid4],
        encdata: '',
        encryptedAt: '2022年1月2日',
      });
    });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}/data/${dataId1}`), {
        encdata: '',
        userId: uid3,
        layerId: layerId,
        permission: 'PRIVATE',
        encryptedAt: '2022年1月2日',
      });
    });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}/data/${dataId2}`), {
        encdata: '',
        userId: uid1,
        layerId: layerId,
        permission: 'COMMON',
        encryptedAt: '2022年1月2日',
      });
    });
    const context3 = testEnv.authenticatedContext(uid3, {
      email: 'test3@example.com',
      email_verified: true,
    });
    await firebase.assertSucceeds(deleteDoc(doc(context3.firestore(), `projects/${documentId}/data/${dataId1}`)));
  });
});

describe('DEK(エンベロープ暗号): keys サブコレクションと管理者によるメンバー追加', () => {
  const ctx = (uid: string, n: string) => testEnv.authenticatedContext(uid, { email: `${n}@example.com`, email_verified: true });

  // DEK方式のプロジェクトを準備
  const seedDekProject = async (membersUid = [uid1, uid2, uid3]) => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}`), {
        ownerUid: uid1,
        adminsUid: [uid1, uid2],
        membersUid,
        encdata: [''],
        encryptedAt: '2022年1月1日',
        cryptoScheme: 'dek',
        dekPublicKey: 'PUBKEY',
      });
    });
  };
  // 従来のグループ方式（cryptoScheme無し）のプロジェクトを準備
  const seedGroupProject = async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}`), {
        ownerUid: uid1,
        adminsUid: [uid1, uid2],
        membersUid: [uid1, uid2, uid3],
        encdata: [''],
        encryptedAt: '2022年1月1日',
      });
    });
  };
  const seedKey = async (uid: string) => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}/keys/${uid}`), {
        encDek: 'wrapped',
        wrapperUid: uid1,
        encryptedAt: '2022年1月1日',
      });
    });
  };

  it('keys read: メンバーは自分宛ての鍵を読める', async () => {
    await seedDekProject();
    await seedKey(uid3);
    await firebase.assertSucceeds(getDoc(doc(ctx(uid3, 'test3').firestore(), `projects/${documentId}/keys/${uid3}`)));
  });

  it('keys read: メンバーは他人宛ての鍵を読めない', async () => {
    await seedDekProject();
    await seedKey(uid1);
    // uid3(一般メンバー)が uid1宛ての鍵を読もうとする → 拒否
    await firebase.assertFails(getDoc(doc(ctx(uid3, 'test3').firestore(), `projects/${documentId}/keys/${uid1}`)));
  });

  it('keys read: 管理者は他メンバーの鍵を読める', async () => {
    await seedDekProject();
    await seedKey(uid3);
    await firebase.assertSucceeds(getDoc(doc(ctx(uid2, 'test2').firestore(), `projects/${documentId}/keys/${uid3}`)));
  });

  it('keys create: 管理者は新メンバーの鍵を作成できる（オーナー不要）', async () => {
    await seedDekProject();
    await firebase.assertSucceeds(
      setDoc(doc(ctx(uid2, 'test2').firestore(), `projects/${documentId}/keys/${uid5}`), {
        encDek: 'wrapped',
        wrapperUid: uid2,
        encryptedAt: '2022年1月1日',
      })
    );
  });

  it('keys create: 一般メンバーは鍵を作成できない', async () => {
    await seedDekProject();
    await firebase.assertFails(
      setDoc(doc(ctx(uid3, 'test3').firestore(), `projects/${documentId}/keys/${uid5}`), {
        encDek: 'wrapped',
        wrapperUid: uid3,
        encryptedAt: '2022年1月1日',
      })
    );
  });

  it('keys create: 一般メンバーはオーナー宛ての鍵は作成できる（オーナー復旧用）', async () => {
    await seedDekProject();
    await firebase.assertSucceeds(
      setDoc(doc(ctx(uid3, 'test3').firestore(), `projects/${documentId}/keys/${uid1}`), {
        encDek: 'wrapped',
        wrapperUid: uid3,
        encryptedAt: '2022年1月1日',
      })
    );
  });

  it('keys update: 一般メンバーはオーナー宛ての鍵を更新できる（オーナー復旧用）', async () => {
    await seedDekProject();
    await seedKey(uid1);
    await firebase.assertSucceeds(
      setDoc(doc(ctx(uid3, 'test3').firestore(), `projects/${documentId}/keys/${uid1}`), {
        encDek: 'rewrapped',
        wrapperUid: uid3,
        encryptedAt: '2022年1月2日',
      })
    );
  });

  it('keys create: 一般メンバーはオーナー以外宛ての鍵を作成できない（管理者宛ても不可）', async () => {
    await seedDekProject();
    await firebase.assertFails(
      setDoc(doc(ctx(uid3, 'test3').firestore(), `projects/${documentId}/keys/${uid2}`), {
        encDek: 'wrapped',
        wrapperUid: uid3,
        encryptedAt: '2022年1月1日',
      })
    );
  });

  it('keys create: 非メンバーはオーナー宛てでも鍵を作成できない', async () => {
    await seedDekProject();
    await firebase.assertFails(
      setDoc(doc(ctx(uid5, 'test5').firestore(), `projects/${documentId}/keys/${uid1}`), {
        encDek: 'wrapped',
        wrapperUid: uid5,
        encryptedAt: '2022年1月1日',
      })
    );
  });

  it('keys delete: 一般メンバーはオーナー宛ての鍵を削除できない', async () => {
    await seedDekProject();
    await seedKey(uid1);
    await firebase.assertFails(deleteDoc(doc(ctx(uid3, 'test3').firestore(), `projects/${documentId}/keys/${uid1}`)));
  });

  it('keys delete: 管理者は鍵を削除できる', async () => {
    await seedDekProject();
    await seedKey(uid3);
    await firebase.assertSucceeds(deleteDoc(doc(ctx(uid2, 'test2').firestore(), `projects/${documentId}/keys/${uid3}`)));
  });

  it('project update: DEK方式では管理者がメンバーを追加できる', async () => {
    await seedDekProject();
    await firebase.assertSucceeds(
      updateDoc(doc(ctx(uid2, 'test2').firestore(), `projects/${documentId}`), {
        membersUid: [uid1, uid2, uid3, uid5],
      })
    );
  });

  it('project update: グループ方式では管理者はメンバーを追加できない（オーナーのみ）', async () => {
    await seedGroupProject();
    await firebase.assertFails(
      updateDoc(doc(ctx(uid2, 'test2').firestore(), `projects/${documentId}`), {
        membersUid: [uid1, uid2, uid3, uid5],
      })
    );
  });

  it('project update: グループ方式でもオーナーはメンバーを追加できる', async () => {
    await seedGroupProject();
    await firebase.assertSucceeds(
      updateDoc(doc(ctx(uid1, 'test1').firestore(), `projects/${documentId}`), {
        membersUid: [uid1, uid2, uid3, uid5],
      })
    );
  });

  it('project create: オーナーは cryptoScheme/dekPublicKey 付きで作成できる', async () => {
    await firebase.assertSucceeds(
      setDoc(doc(ctx(uid1, 'test1').firestore(), `projects/${documentId}`), {
        ownerUid: uid1,
        adminsUid: [uid1],
        membersUid: [uid1],
        encdata: [''],
        encryptedAt: '2022年1月1日',
        cryptoScheme: 'dek',
        dekPublicKey: 'PUBKEY',
      })
    );
  });

  // ---- Phase ii(遅延移行): group → dek 移行 ----

  it('migration: 管理者はグループ方式をDEK方式へ移行できる（cryptoScheme=dekを設定）', async () => {
    await seedGroupProject();
    await firebase.assertSucceeds(
      updateDoc(doc(ctx(uid2, 'test2').firestore(), `projects/${documentId}`), {
        encdata: ['reenc'],
        encryptedAt: '2022年2月2日',
        cryptoScheme: 'dek',
        dekPublicKey: 'PUBKEY',
      })
    );
  });

  it('migration: 一般メンバーはDEKへ移行できない', async () => {
    await seedGroupProject();
    await firebase.assertFails(
      updateDoc(doc(ctx(uid3, 'test3').firestore(), `projects/${documentId}`), {
        encdata: ['reenc'],
        encryptedAt: '2022年2月2日',
        cryptoScheme: 'dek',
        dekPublicKey: 'PUBKEY',
      })
    );
  });

  it('migration: 管理者はCOMMONデータを他人のuserIdで再暗号化・書き戻しできる', async () => {
    await seedDekProject();
    // 管理者 uid2 が、所有者 uid1 のCOMMONデータを書き戻す（移行時の再暗号化）。
    await firebase.assertSucceeds(
      setDoc(doc(ctx(uid2, 'test2').firestore(), `projects/${documentId}/data/common1`), {
        layerId: 'layer1',
        userId: uid1,
        permission: 'COMMON',
        encdata: ['reenc'],
        encryptedAt: '2022年2月2日',
        chunkIndex: 0,
      })
    );
  });

  it('migration: 管理者はTEMPLATEデータを他人のuserIdで再暗号化・書き戻しできる', async () => {
    await seedDekProject();
    await firebase.assertSucceeds(
      setDoc(doc(ctx(uid2, 'test2').firestore(), `projects/${documentId}/data/template1`), {
        layerId: 'layer1',
        userId: uid1,
        permission: 'TEMPLATE',
        encdata: ['reenc'],
        encryptedAt: '2022年2月2日',
        chunkIndex: 0,
      })
    );
  });

  it('migration: 一般メンバーは他人userIdのCOMMONを書けない（緩和は管理者限定）', async () => {
    await seedDekProject();
    await firebase.assertFails(
      setDoc(doc(ctx(uid3, 'test3').firestore(), `projects/${documentId}/data/common2`), {
        layerId: 'layer1',
        userId: uid1,
        permission: 'COMMON',
        encdata: ['reenc'],
        encryptedAt: '2022年2月2日',
        chunkIndex: 0,
      })
    );
  });
});
