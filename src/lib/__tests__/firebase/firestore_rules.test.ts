import * as fs from 'fs';
import * as firebase from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';

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
        permission: 'Private',
        encryptedAt: '2022年1月2日',
      });
    });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}/data/${dataId2}`), {
        encdata: '',
        userId: uid1,
        layerId: layerId,
        permission: 'Common',
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
        permission: 'Private',
        encryptedAt: '2022年1月2日',
      });
    });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}/data/${dataId2}`), {
        encdata: '',
        userId: uid1,
        layerId: layerId,
        permission: 'Common',
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
        permission: 'Common',
        encryptedAt: '2022年1月2日',
      });
    });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}/data/${dataId2}`), {
        encdata: '',
        userId: uid2,
        layerId: layerId,
        permission: 'Private',
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
        query(collection(context1.firestore(), `projects/${documentId}/data`), where('permission', '==', 'Common'))
      )
    );
    await firebase.assertSucceeds(
      getDocs(
        query(collection(context2.firestore(), `projects/${documentId}/data`), where('permission', '==', 'Common'))
      )
    );
    await firebase.assertSucceeds(
      getDocs(
        query(collection(context3.firestore(), `projects/${documentId}/data`), where('permission', '==', 'Common'))
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
        permission: 'Common',
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
        query(collection(context4.firestore(), `projects/${documentId}/data`), where('permission', '==', 'Common'))
      )
    );
    await firebase.assertFails(
      getDocs(
        query(collection(context5.firestore(), `projects/${documentId}/data`), where('permission', '==', 'Common'))
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
        permission: 'Public',
        encryptedAt: '2022年1月2日',
      });
    });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}/data/${dataId2}`), {
        encdata: '',
        userId: uid2,
        layerId: layerId,
        permission: 'Private',
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
        query(collection(context1.firestore(), `projects/${documentId}/data`), where('permission', '==', 'Public'))
      )
    );
    await firebase.assertSucceeds(
      getDocs(
        query(collection(context2.firestore(), `projects/${documentId}/data`), where('permission', '==', 'Public'))
      )
    );
    await firebase.assertSucceeds(
      getDocs(
        query(collection(context3.firestore(), `projects/${documentId}/data`), where('permission', '==', 'Public'))
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
        permission: 'Private',
        encryptedAt: '2022年1月2日',
      });
    });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}/data/${dataId2}`), {
        encdata: '',
        userId: uid3,
        layerId: layerId,
        permission: 'Private',
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
          where('permission', '==', 'Private')
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
        permission: 'Public',
        encryptedAt: '2022年1月2日',
      });
    });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}/data/${dataId2}`), {
        encdata: '',
        userId: uid2,
        layerId: layerId,
        permission: 'Private',
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
          where('permission', '==', 'Private')
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
        permission: 'Common',
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
    const context3 = testEnv.authenticatedContext(uid2, {
      email: 'test3@example.com',
      email_verified: true,
    });
    await firebase.assertFails(
      setDoc(doc(context3.firestore(), `projects/${documentId}/data/${dataId1}`), {
        encdata: '',
        userId: uid3,
        layerId: layerId,
        permission: 'Common',
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
        permission: 'Common',
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
        permission: 'Private',
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
        permission: 'Private',
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
        permission: 'Private',
        encryptedAt: '2022年1月2日',
      });
    });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${documentId}/data/${dataId2}`), {
        encdata: '',
        userId: uid1,
        layerId: layerId,
        permission: 'Common',
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
