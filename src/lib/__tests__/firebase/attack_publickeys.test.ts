/**
 * Security Rules 権限網羅テスト（範囲: PUB）
 *   publicKeys/{uid}、publicKeys/{uid}/history/{keyVersion}、tileAccess、keyBackups、keyBackupAttempts、
 *   ルート直下の未定義コレクション。
 *
 * - [A-PUB-NN] 攻撃: 安全な仕様を期待値として assertFails で書く（現行Rulesに穴があれば赤になる）。
 * - [L-PUB-NN] 正当: クライアント（src/lib/firebase/publicKeys.ts）が依存するフローが通ることを assertSucceeds で固定する。
 *
 * firestore_rules.test.ts に既にあるケース（本人create/他人create/keyVersion=1以外のcreate/未定義フィールド/
 * 巻き戻し/他人update/delete/他人のhistory create/history read/tileAccess get,set/keyBackups 本人read,write）は重複させない。
 */
import * as fs from 'fs';
import * as firebase from '@firebase/rules-unit-testing';
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

let testEnv: firebase.RulesTestEnvironment;
const projectID = 'ecorismap';
const uid1 = 'testUid1'; //本人（台帳の持ち主）
const uid3 = 'testUid3'; //他の認証済みユーザー
const uid4 = 'testUid4'; //メール未承認
const uid5 = 'testUid5'; //知らない人

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
const unverifiedCtx = () =>
  testEnv.authenticatedContext(uid4, { email: 'test4@example.com', email_verified: false });

// クライアント(publishPublicKeyToLedger)と同じ形: createdAt/updatedAt は Timestamp
const entry = (keyVersion: number, publicKey = 'PUBKEY_V' + String(keyVersion)) => {
  const now = Timestamp.now();
  return { publicKey, keyVersion, createdAt: now, updatedAt: now };
};
const historyEntry = (keyVersion: number, publicKey = 'PUBKEY_V' + String(keyVersion)) => {
  const now = Timestamp.now();
  return { publicKey, keyVersion, createdAt: now, rotatedAt: now };
};

const seedPublicKey = async (uid: string, keyVersion = 1, publicKey?: string) => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), `publicKeys/${uid}`), entry(keyVersion, publicKey));
  });
};
const seedHistory = async (uid: string, keyVersion: number, publicKey?: string) => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), `publicKeys/${uid}/history/${keyVersion}`), historyEntry(keyVersion, publicKey));
  });
};

describe('[PUB] publicKeys/{uid} 攻撃', () => {
  it('[A-PUB-01] list: 認証済みユーザーが台帳を一覧して全ユーザーのuidを列挙できない', async () => {
    await seedPublicKey(uid1);
    await seedPublicKey(uid3);
    await firebase.assertFails(getDocs(collection(ctx(uid5, 'test5').firestore(), 'publicKeys')));
  });

  it('[A-PUB-02] create: メール未承認ユーザーは自分のuidでも登録できない', async () => {
    await firebase.assertFails(setDoc(doc(unverifiedCtx().firestore(), `publicKeys/${uid4}`), entry(1)));
  });

  it('[A-PUB-03] create: email_verified クレーム無しのトークンでは登録できない', async () => {
    const noClaim = testEnv.authenticatedContext(uid1, { email: 'test1@example.com' });
    await firebase.assertFails(setDoc(doc(noClaim.firestore(), `publicKeys/${uid1}`), entry(1)));
  });

  it('[A-PUB-04] create: 未認証では登録できない', async () => {
    await firebase.assertFails(
      setDoc(doc(testEnv.unauthenticatedContext().firestore(), `publicKeys/${uid1}`), entry(1))
    );
  });

  it('[A-PUB-05] create: keyVersion が文字列 "1" では登録できない', async () => {
    await firebase.assertFails(
      setDoc(doc(ctx(uid1, 'test1').firestore(), `publicKeys/${uid1}`), { ...entry(1), keyVersion: '1' })
    );
  });

  it('[A-PUB-06] create: publicKey が文字列でない（map）と登録できない', async () => {
    await firebase.assertFails(
      setDoc(doc(ctx(uid1, 'test1').firestore(), `publicKeys/${uid1}`), {
        ...entry(1),
        publicKey: { kty: 'EC', x: 'evil' },
      })
    );
  });

  it('[A-PUB-07] create: publicKey が空文字では登録できない', async () => {
    await firebase.assertFails(
      setDoc(doc(ctx(uid1, 'test1').firestore(), `publicKeys/${uid1}`), { ...entry(1), publicKey: '' })
    );
  });

  it('[A-PUB-08] update: 同一 keyVersion のまま publicKey を差し替えできない（>= の抜け道）', async () => {
    await seedPublicKey(uid1, 2, 'ORIGINAL_V2');
    await firebase.assertFails(
      setDoc(doc(ctx(uid1, 'test1').firestore(), `publicKeys/${uid1}`), entry(2, 'SWAPPED_V2'))
    );
  });

  it('[A-PUB-09] update: updateDoc で publicKey だけ書き換え（keyVersion据え置き）できない', async () => {
    await seedPublicKey(uid1, 1, 'ORIGINAL_V1');
    await firebase.assertFails(updateDoc(doc(ctx(uid1, 'test1').firestore(), `publicKeys/${uid1}`), { publicKey: 'SWAPPED' }));
  });

  it('[A-PUB-10] update: keyVersion を小数（1.5）にできない', async () => {
    await seedPublicKey(uid1, 1);
    await firebase.assertFails(setDoc(doc(ctx(uid1, 'test1').firestore(), `publicKeys/${uid1}`), entry(1.5, 'NEW')));
  });

  it('[A-PUB-11] update: keyVersion を文字列にできない', async () => {
    await seedPublicKey(uid1, 1);
    await firebase.assertFails(
      setDoc(doc(ctx(uid1, 'test1').firestore(), `publicKeys/${uid1}`), { ...entry(2, 'NEW'), keyVersion: '2' })
    );
  });

  it('[A-PUB-12] update: keyVersion を負数にできない', async () => {
    await seedPublicKey(uid1, 1);
    await firebase.assertFails(setDoc(doc(ctx(uid1, 'test1').firestore(), `publicKeys/${uid1}`), entry(-1, 'NEW')));
  });

  it('[A-PUB-13] update: keyVersion を+1以外（+99）に飛ばせない', async () => {
    await seedPublicKey(uid1, 1);
    await firebase.assertFails(setDoc(doc(ctx(uid1, 'test1').firestore(), `publicKeys/${uid1}`), entry(100, 'NEW')));
  });

  it('[A-PUB-14] update: 旧世代を history へ退避せずにローテーションできない', async () => {
    await seedPublicKey(uid1, 1, 'OLD_V1');
    await firebase.assertFails(setDoc(doc(ctx(uid1, 'test1').firestore(), `publicKeys/${uid1}`), entry(2, 'NEW_V2')));
  });

  it('[A-PUB-15] update: メール未承認の本人は更新できない', async () => {
    await seedPublicKey(uid4, 1);
    await firebase.assertFails(setDoc(doc(unverifiedCtx().firestore(), `publicKeys/${uid4}`), entry(2)));
  });

  it('[A-PUB-16] update: 必須フィールド（createdAt）を消せない', async () => {
    await seedPublicKey(uid1, 1);
    await firebase.assertFails(
      setDoc(doc(ctx(uid1, 'test1').firestore(), `publicKeys/${uid1}`), {
        publicKey: 'NEW',
        keyVersion: 2,
        updatedAt: Timestamp.now(),
      })
    );
  });

  it('[A-PUB-17] subcollection: publicKeys/{uid} 配下の未定義サブコレクションには本人でも書けない', async () => {
    await seedPublicKey(uid1, 1);
    await firebase.assertFails(
      setDoc(doc(ctx(uid1, 'test1').firestore(), `publicKeys/${uid1}/privateKeys/1`), { privateKey: 'X' })
    );
  });
});

describe('[PUB] publicKeys/{uid}/history/{keyVersion} 攻撃', () => {
  it('[A-PUB-18] history update: 既存の旧世代鍵を上書き（過去鍵の改ざん）できない', async () => {
    await seedPublicKey(uid1, 2);
    await seedHistory(uid1, 1, 'GENUINE_OLD_V1');
    await firebase.assertFails(
      setDoc(doc(ctx(uid1, 'test1').firestore(), `publicKeys/${uid1}/history/1`), historyEntry(1, 'FORGED_V1'))
    );
  });

  it('[A-PUB-19] history create: ドキュメントIDと keyVersion が食い違うと書けない', async () => {
    await seedPublicKey(uid1, 3);
    await firebase.assertFails(
      setDoc(doc(ctx(uid1, 'test1').firestore(), `publicKeys/${uid1}/history/1`), historyEntry(2))
    );
  });

  it('[A-PUB-20] history create: 必須フィールド無し（空ドキュメント）では書けない', async () => {
    await seedPublicKey(uid1, 2);
    await firebase.assertFails(setDoc(doc(ctx(uid1, 'test1').firestore(), `publicKeys/${uid1}/history/1`), {}));
  });

  it('[A-PUB-21] history create: publicKey 欠落では書けない', async () => {
    await seedPublicKey(uid1, 2);
    await firebase.assertFails(
      setDoc(doc(ctx(uid1, 'test1').firestore(), `publicKeys/${uid1}/history/1`), {
        keyVersion: 1,
        createdAt: Timestamp.now(),
        rotatedAt: Timestamp.now(),
      })
    );
  });

  it('[A-PUB-22] history create: 現行 keyVersion 以上の世代（未来の世代）を偽装登録できない', async () => {
    await seedPublicKey(uid1, 1);
    await firebase.assertFails(
      setDoc(doc(ctx(uid1, 'test1').firestore(), `publicKeys/${uid1}/history/5`), historyEntry(5, 'ATTACKER_KEY'))
    );
  });

  it('[A-PUB-23] history create: keyVersion が文字列では書けない', async () => {
    await seedPublicKey(uid1, 2);
    await firebase.assertFails(
      setDoc(doc(ctx(uid1, 'test1').firestore(), `publicKeys/${uid1}/history/1`), {
        ...historyEntry(1),
        keyVersion: '1',
      })
    );
  });

  it('[A-PUB-24] history create: 数値でないドキュメントID（history/latest）には書けない', async () => {
    await seedPublicKey(uid1, 2);
    await firebase.assertFails(
      setDoc(doc(ctx(uid1, 'test1').firestore(), `publicKeys/${uid1}/history/latest`), historyEntry(1))
    );
  });

  it('[A-PUB-25] history create: 台帳本体が存在しない uid の history は作れない', async () => {
    await firebase.assertFails(
      setDoc(doc(ctx(uid1, 'test1').firestore(), `publicKeys/${uid1}/history/1`), historyEntry(1))
    );
  });

  it('[A-PUB-26] rotation: 退避する history の publicKey が現行の公開鍵と食い違うローテーションはできない', async () => {
    await seedPublicKey(uid1, 1, 'GENUINE_V1');
    const db = ctx(uid1, 'test1').firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, `publicKeys/${uid1}/history/1`), historyEntry(1, 'FORGED_V1'));
    batch.set(doc(db, `publicKeys/${uid1}`), entry(2, 'NEW_V2'));
    await firebase.assertFails(batch.commit());
  });

  it('[A-PUB-27] history update: 他人の既存 history を上書きできない', async () => {
    await seedPublicKey(uid1, 2);
    await seedHistory(uid1, 1);
    await firebase.assertFails(
      setDoc(doc(ctx(uid5, 'test5').firestore(), `publicKeys/${uid1}/history/1`), historyEntry(1, 'FORGED'))
    );
  });

  it('[A-PUB-28] history create: メール未承認の本人は書けない', async () => {
    await seedPublicKey(uid4, 2);
    await firebase.assertFails(
      setDoc(doc(unverifiedCtx().firestore(), `publicKeys/${uid4}/history/1`), historyEntry(1))
    );
  });

  it('[A-PUB-29] history delete: 本人でも旧世代を削除できない', async () => {
    await seedPublicKey(uid1, 2);
    await seedHistory(uid1, 1);
    await firebase.assertFails(deleteDoc(doc(ctx(uid1, 'test1').firestore(), `publicKeys/${uid1}/history/1`)));
  });

  it('[A-PUB-30] history read: 未認証では読めない', async () => {
    await seedHistory(uid1, 1);
    await firebase.assertFails(
      getDocs(collection(testEnv.unauthenticatedContext().firestore(), `publicKeys/${uid1}/history`))
    );
  });

  it('[A-PUB-31] history collectionGroup: 全ユーザーの history を横断クエリできない', async () => {
    await seedHistory(uid1, 1);
    await seedHistory(uid3, 1);
    await firebase.assertFails(getDocs(collectionGroup(ctx(uid5, 'test5').firestore(), 'history')));
  });
});

describe('[PUB] tileAccess / keyBackups / keyBackupAttempts 攻撃（既存テストに無い操作）', () => {
  it('[A-PUB-32] tileAccess list: 認証済みユーザーでも一覧できない', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'tileAccess/layerA'), { allowedDomains: ['example.com'], allowedEmails: [] });
    });
    await firebase.assertFails(getDocs(collection(ctx(uid1, 'test1').firestore(), 'tileAccess')));
  });

  it('[A-PUB-33] tileAccess update/delete: 既存の許可リストを書き換え・削除できない', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'tileAccess/layerA'), { allowedDomains: ['example.com'], allowedEmails: [] });
    });
    const db = ctx(uid1, 'test1').firestore();
    await firebase.assertFails(updateDoc(doc(db, 'tileAccess/layerA'), { allowedEmails: ['attacker@evil.example'] }));
    await firebase.assertFails(deleteDoc(doc(db, 'tileAccess/layerA')));
  });

  it('[A-PUB-34] keyBackups: 他人のバックアップblobを読めない・一覧できない', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `keyBackups/${uid1}`), { encPrivateKey: 'ENC', salt: 'S', keyVersion: 1 });
    });
    const db = ctx(uid5, 'test5').firestore();
    await firebase.assertFails(getDoc(doc(db, `keyBackups/${uid1}`)));
    await firebase.assertFails(getDocs(collection(db, 'keyBackups')));
  });

  it('[A-PUB-35] keyBackups delete: 本人でも削除できない（Functions経由のみ）', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `keyBackups/${uid1}`), { encPrivateKey: 'ENC', salt: 'S', keyVersion: 1 });
    });
    await firebase.assertFails(deleteDoc(doc(ctx(uid1, 'test1').firestore(), `keyBackups/${uid1}`)));
  });

  it('[A-PUB-36] keyBackupAttempts: 本人が失敗カウンタをリセット・削除できない（総当たり制限の解除）', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `keyBackupAttempts/${uid1}`), { failCount: 9, lockedUntil: Timestamp.now() });
    });
    const db = ctx(uid1, 'test1').firestore();
    await firebase.assertFails(updateDoc(doc(db, `keyBackupAttempts/${uid1}`), { failCount: 0 }));
    await firebase.assertFails(deleteDoc(doc(db, `keyBackupAttempts/${uid1}`)));
  });
});

describe('[PUB] ルート直下の未定義コレクション 攻撃', () => {
  it('[A-PUB-37] users/{uid}: 本人でも作成・読み取りできない（デフォルト拒否）', async () => {
    const db = ctx(uid1, 'test1').firestore();
    await firebase.assertFails(setDoc(doc(db, `users/${uid1}`), { role: 'admin' }));
    await firebase.assertFails(getDoc(doc(db, `users/${uid1}`)));
  });

  it('[A-PUB-38] organizations: 認証済みユーザーが組織ドキュメントを作れない', async () => {
    await firebase.assertFails(
      setDoc(doc(ctx(uid1, 'test1').firestore(), 'organizations/org1'), { ownerUid: uid1, seats: 9999 })
    );
  });

  it('[A-PUB-39] 未定義コレクション: シード済みデータも一覧・取得できない', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'secrets/s1'), { value: 'x' });
    });
    const db = ctx(uid1, 'test1').firestore();
    await firebase.assertFails(getDocs(collection(db, 'secrets')));
    await firebase.assertFails(getDoc(doc(db, 'secrets/s1')));
  });
});

describe('[PUB] 正当なフロー（クライアント依存の回帰防止）', () => {
  it('[L-PUB-01] 初回登録: Timestamp の createdAt/updatedAt で keyVersion=1 を作成できる', async () => {
    await firebase.assertSucceeds(setDoc(doc(ctx(uid1, 'test1').firestore(), `publicKeys/${uid1}`), entry(1)));
  });

  it('[L-PUB-02] 未登録確認: 存在しない台帳を getDoc できる（publishの事前読み取り・fetchPublicKey）', async () => {
    const snap = await firebase.assertSucceeds(getDoc(doc(ctx(uid1, 'test1').firestore(), `publicKeys/${uid1}`)));
    expect(snap.exists()).toBe(false);
  });

  it('[L-PUB-03] ローテーション: history/{旧version} 退避と keyVersion+1 上書きを同一バッチでできる', async () => {
    await seedPublicKey(uid1, 1, 'OLD_V1');
    const db = ctx(uid1, 'test1').firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, 'publicKeys', uid1, 'history', '1'), historyEntry(1, 'OLD_V1'));
    batch.set(doc(db, 'publicKeys', uid1), entry(2, 'NEW_V2'));
    await firebase.assertSucceeds(batch.commit());
  });

  it('[L-PUB-04] ローテーション（card付き・2回目）: v2→v3 を history/2 退避つきでできる', async () => {
    await seedPublicKey(uid1, 2, 'OLD_V2');
    await seedHistory(uid1, 1, 'OLD_V1');
    const db = ctx(uid1, 'test1').firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, 'publicKeys', uid1, 'history', '2'), historyEntry(2, 'OLD_V2'));
    batch.set(doc(db, 'publicKeys', uid1), { ...entry(3, 'NEW_V3'), card: 'EXPORTED_CARD' });
    await firebase.assertSucceeds(batch.commit());
  });

  it('[L-PUB-05] 他人の公開鍵 get: メンバー追加時のDEKラップで他ユーザーの台帳を読める', async () => {
    await seedPublicKey(uid1, 1);
    await firebase.assertSucceeds(getDoc(doc(ctx(uid5, 'test5').firestore(), `publicKeys/${uid1}`)));
  });

  it('[L-PUB-06] history list: 他ユーザーの旧世代を getDocs で一覧できる（署名検証フォールバック）', async () => {
    await seedPublicKey(uid1, 3);
    await seedHistory(uid1, 1);
    await seedHistory(uid1, 2);
    const snap = await firebase.assertSucceeds(
      getDocs(collection(ctx(uid3, 'test3').firestore(), 'publicKeys', uid1, 'history'))
    );
    expect(snap.size).toBe(2);
  });

  it('[L-PUB-07] history 未作成ユーザー: 空の history を getDocs できる', async () => {
    await seedPublicKey(uid1, 1);
    await firebase.assertSucceeds(getDocs(collection(ctx(uid3, 'test3').firestore(), 'publicKeys', uid1, 'history')));
  });
});
