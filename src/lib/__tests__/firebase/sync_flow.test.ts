/**
 * 共同編集の同期の通し確認（docs/SYNC_AUDIT_2026-11.md の S1〜S3）。Firestore エミュレータと本番の firestore.rules で、
 * src/lib/firebase/firestore.ts の実装をそのまま動かす。端末ごとの利用者は rules-unit-testing の認証済みコンテキストで切り替える。
 * 暗号化は FUNC_ENCRYPTION=false（gzip のみ）の経路を使う（暗号方式の検証は対象外）。
 *
 * 設定の保存（useProject.saveProjectSetting → useRepository.uploadDataToRepository('Common')）の COMMON の手順は、
 * React のフックを node で動かせないため、同じ部品（buildCommonAbsorption / getTargetRecordSet / uploadDataHelper /
 * deleteOtherUsersData / deleteData）を同じ順で呼ぶ saveCommon で再現している。
 *
 * 実行: firebase emulators:exec --project demo-ecorismap-test --only firestore,storage \
 *   'npx jest --config jest.rules.config.js --runInBand src/lib/__tests__/firebase/sync_flow.test.ts'
 */
import * as fs from 'fs';
import * as rulesTesting from '@firebase/rules-unit-testing';
import { collection, doc, getDocs, setDoc, Timestamp } from 'firebase/firestore';

const mockActor: { db: unknown; uid: string } = { db: undefined, uid: '' };
// 暗号化の直前に一度だけ割り込む処理（L10: 設定を読んでから書き戻すまでの間に、別の保存を入れるため）
const mockEncryptHook: { before?: () => Promise<void> } = {};

jest.mock('../../firebase/firebase', () => {
  const fsMod = jest.requireActual('firebase/firestore');
  // 利用者を切り替えられるよう firestore と auth は読むたびに今の利用者を返す（展開でコピーされないよう後から定義する）
  const mod: Record<string, unknown> = {
    ...fsMod,
    functions: {},
    httpsCallable: jest.fn(),
    getDocsFromServer: fsMod.getDocs,
    firebaseReady: Promise.resolve(),
  };
  Object.defineProperty(mod, 'firestore', { get: () => mockActor.db, enumerable: true });
  Object.defineProperty(mod, 'auth', { get: () => ({ currentUser: { uid: mockActor.uid } }), enumerable: true });
  return mod;
});
jest.mock('../../../constants/AppConstants', () => ({
  FUNC_ENCRYPTION: false,
  CREATE_DEK_PROJECTS: false,
  ENABLE_KEY_LEDGER: false,
}));
jest.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios ?? o.default },
  Dimensions: { get: () => ({ width: 400, height: 800 }) },
}));
jest.mock('../../virgilsecurity/e3kit', () => {
  const pako = jest.requireActual('pako');
  const { Buffer } = jest.requireActual('buffer');
  const gzip = (str: string) => Buffer.from(pako.deflate(str)).toString('base64');
  const unzip = (value: string) => Buffer.from(pako.inflate(new Uint8Array(Buffer.from(value, 'base64')))).toString('utf-8');
  return {
    encryptEThree: async (data: unknown) => {
      const hook = mockEncryptHook.before;
      if (hook !== undefined) {
        mockEncryptHook.before = undefined;
        await hook();
      }
      return [gzip(JSON.stringify(data))];
    },
    // 本物と同じく、復号できないデータは例外にせず undefined を返す
    decryptEThree: async (_at: Date, encdata: string[]) => {
      try {
        return JSON.parse(unzip(encdata[0]));
      } catch (e) {
        return undefined;
      }
    },
  };
});
jest.mock('../../virgilsecurity/dek', () => ({}));
jest.mock('../../crypto', () => ({}));
jest.mock('../../firebase/publicKeys', () => ({ clearPublicKeyLedgerCache: jest.fn(), getPublicKeyFromLedger: jest.fn() }));
jest.mock('../../../i18n/config', () => ({ t: (key: string) => key }));
// utils/Data が読む画面・端末まわりのモジュール（ここで使う関数は取り込みとまとめだけなので中身は要らない）
jest.mock('../../../i18n/dayjs', () => jest.requireActual('dayjs'));
jest.mock('../../../utils/Format', () => ({ formattedInputs: jest.fn() }));
jest.mock('../../../utils/Coords', () => ({ boundingBoxFromCoords: jest.fn(), latLonDMS: jest.fn() }));
jest.mock('../../../utils/General', () => ({ isLocationType: jest.fn(() => true) }));
jest.mock('../../../utils/Zip', () => {
  const pako = jest.requireActual('pako');
  const { Buffer } = jest.requireActual('buffer');
  return {
    gzip: (str: string) => Buffer.from(pako.deflate(str)).toString('base64'),
    unzip: (value: string) => Buffer.from(pako.inflate(new Uint8Array(Buffer.from(value, 'base64')))).toString('utf-8'),
  };
});

import * as projectStore from '../../firebase/firestore';
import { buildCommonAbsorption, getTargetRecordSet } from '../../../utils/Data';
import { DataType, LayerType, RecordType } from '../../../types';

const PROJECT_ID = 'demo-ecorismap-test';
const P = 'syncProject';
const OWNER = 'owner';
const ADMIN2 = 'admin2';
const M1 = 'member1';
const M2 = 'member2';
const M3 = 'member3';

let testEnv: rulesTesting.RulesTestEnvironment;

const as = (uid: string) => {
  mockActor.uid = uid;
  mockActor.db = testEnv.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true }).firestore();
};

const rec = (id: string, userId: string, extra: Partial<RecordType> = {}): RecordType => ({
  id,
  userId,
  displayName: userId,
  visible: true,
  redraw: false,
  coords: { latitude: 35, longitude: 139 },
  field: {},
  updatedAt: 100,
  ...extra,
});

const layer = (id: string, permission: LayerType['permission']): LayerType =>
  ({ id, name: id, type: 'POINT', permission, field: [], active: false, visible: true } as unknown as LayerType);

const upload = async (uid: string, layerId: string, permission: string, data: RecordType[]) => {
  as(uid);
  const res = await projectStore.uploadDataHelper(P, { layerId, userId: uid, permission: permission as never, data });
  expect(res.isOK).toBe(true);
  return res;
};

/** 生の data doc を Rules を通さずに数える（userId×permission） */
const rawDocs = async (layerId: string) => {
  let rows: { userId: string; permission: string }[] = [];
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const snap = await getDocs(collection(context.firestore(), 'projects', P, 'data'));
    rows = snap.docs
      .map((d) => d.data() as { userId: string; permission: string; layerId: string })
      .filter((d) => d.layerId === layerId)
      .map(({ userId, permission }) => ({ userId, permission }));
  });
  return rows.sort((a, b) => `${a.userId}${a.permission}`.localeCompare(`${b.userId}${b.permission}`));
};

const commonOf = async (uid: string, layerId: string) => {
  as(uid);
  const res = await projectStore.downloadCommonData(P);
  expect(res.isOK).toBe(true);
  return (res.data ?? []).filter((d) => d.layerId === layerId);
};

/**
 * useProject.saveProjectSetting の COMMON の手順（取得→取り込み→まとめて書く→片付け）を同じ部品で行う。
 * skipCleanup で「書けたが片付けの前に失敗した」場面を作る
 */
const saveCommon = async (
  uid: string,
  localDataSet: DataType[],
  layers: LayerType[],
  opts: { skipCleanup?: boolean } = {}
) => {
  as(uid);
  const commonLayers = layers.filter((l) => l.permission === 'COMMON');
  const cloud = await projectStore.downloadCommonData(P);
  expect(cloud.isOK).toBe(true);
  const absorption = buildCommonAbsorption({
    localDataSet,
    cloudCommonDataSet: cloud.data ?? [],
    layerIds: commonLayers.map((l) => l.id),
    ownUserId: uid,
  });
  const user = { uid, email: `${uid}@example.com`, displayName: uid, photoURL: null } as never;
  const consolidated: DataType[] = [];
  for (const l of commonLayers) {
    const records = getTargetRecordSet([...localDataSet, ...absorption.extraCommonDataSet], l, user);
    const res = await projectStore.uploadDataHelper(P, { layerId: l.id, userId: uid, permission: 'COMMON', data: records });
    expect(res.isOK).toBe(true);
    consolidated.push({ layerId: l.id, userId: uid, data: records });
    if (opts.skipCleanup) continue;
    const cleanup = await projectStore.deleteOtherUsersData(P, l.id, 'COMMON', uid, absorption.representedUserIds[l.id] ?? []);
    expect(cleanup.isOK).toBe(true);
    const tmpl = await projectStore.deleteData(P, l.id, 'TEMPLATE');
    expect(tmpl.isOK).toBe(true);
  }
  return consolidated;
};

beforeAll(async () => {
  testEnv = await rulesTesting.initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host: 'localhost', port: 8080, rules: fs.readFileSync('./firestore.rules', 'utf8') },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  projectStore.clearProjectCryptoCache();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), `projects/${P}`), {
      ownerUid: OWNER,
      adminsUid: [OWNER, ADMIN2],
      membersUid: [OWNER, ADMIN2, M1, M2, M3],
      encdata: [''],
      encryptedAt: Timestamp.now(),
    });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

const ids = (dataSet: DataType[]) => dataSet.flatMap((d) => d.data.filter((r) => !r.deleted).map((r) => r.id)).sort();

describe('S3: PUBLIC → COMMON の付け替え', () => {
  test('メンバー全員の記録・テンプレートの編集版・管理者自身の記録が共通データに残り、元の doc は片付く', async () => {
    // テンプレート T・U（U は誰も編集していない）
    await upload(OWNER, 'L', 'TEMPLATE', [rec('T', 'template', { field: { v: 'tpl' } }), rec('U', 'template')]);
    // メンバーが T をそれぞれ編集し、自分の記録も付けた
    await upload(M1, 'L', 'PUBLIC', [rec('T', M1, { field: { v: 'm1' }, updatedAt: 200 }), rec('R1', M1)]);
    await upload(M2, 'L', 'PUBLIC', [rec('T', M2, { field: { v: 'm2' }, updatedAt: 300 }), rec('R2', M2)]);
    // 管理者自身の PUBLIC の記録
    await upload(OWNER, 'L', 'PUBLIC', [rec('O1', OWNER)]);

    // 管理者が設定モードで開いた手元（テンプレートだけがある）。L を COMMON に変えて保存する
    as(OWNER);
    const perm = await projectStore.updateLayerDataPermission(P, 'L', 'PUBLIC', 'COMMON');
    expect(perm.isOK).toBe(true);
    const local: DataType[] = [
      { layerId: 'L', userId: 'template', data: [rec('T', 'template', { field: { v: 'tpl' } }), rec('U', 'template')] },
    ];
    await saveCommon(OWNER, local, [layer('L', 'COMMON')]);

    expect(await rawDocs('L')).toEqual([{ userId: OWNER, permission: 'COMMON' }]);
    const common = await commonOf(M1, 'L');
    const records = common.flatMap((d) => d.data);
    // テンプレートを編集した2つの版はどちらも残る（どちらが元の id を保つかはクラウドの並び順による）
    expect(records.map((r) => `${r.id}:${r.field.v ?? ''}`).filter((v) => !v.startsWith('T:') && v.split(':')[0].length <= 2).sort()).toEqual([
      'O1:',
      'R1:',
      'R2:',
      'U:',
    ]);
    const editions = records.filter((r) => r.field.v === 'm1' || r.field.v === 'm2');
    expect(editions.map((r) => r.field.v).sort()).toEqual(['m1', 'm2']);
    expect(editions.map((r) => r.id).filter((id) => id === 'T')).toHaveLength(1);
    expect(records).toHaveLength(6);
  });

  test('片付けの前に失敗して保存し直しても、記録は消えず複製もされない', async () => {
    await upload(M1, 'L', 'PUBLIC', [rec('T', M1, { field: { v: 'm1' }, updatedAt: 200 }), rec('R1', M1)]);
    await upload(M2, 'L', 'PUBLIC', [rec('T', M2, { field: { v: 'm2' }, updatedAt: 300 }), rec('R2', M2)]);
    as(OWNER);
    await projectStore.updateLayerDataPermission(P, 'L', 'PUBLIC', 'COMMON');
    const local: DataType[] = [{ layerId: 'L', userId: 'template', data: [rec('T', 'template')] }];
    await saveCommon(OWNER, local, [layer('L', 'COMMON')], { skipCleanup: true });
    expect(await rawDocs('L')).toEqual([
      { userId: M1, permission: 'COMMON' },
      { userId: M2, permission: 'COMMON' },
      { userId: OWNER, permission: 'COMMON' },
    ]);

    // 手元をそろえ損ねた最悪の場合（テンプレートだけの手元のまま）で保存し直す
    await saveCommon(OWNER, local, [layer('L', 'COMMON')]);
    expect(await rawDocs('L')).toEqual([{ userId: OWNER, permission: 'COMMON' }]);
    const records = (await commonOf(M1, 'L')).flatMap((d) => d.data);
    expect(records).toHaveLength(4);
    expect(records.map((r) => r.field.v ?? r.id).sort()).toEqual(['R1', 'R2', 'm1', 'm2']);
  });

  test('復号できないメンバーの doc は取り込めないので消さずに残す', async () => {
    await upload(M1, 'L', 'PUBLIC', [rec('R1', M1)]);
    // M3 の doc は壊れていて読めない
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${P}/data/broken`), {
        userId: M3,
        layerId: 'L',
        permission: 'PUBLIC',
        encdata: ['not-gzip'],
        encryptedAt: Timestamp.now(),
        chunkIndex: 0,
        chunkCount: 1,
      });
    });
    as(OWNER);
    await projectStore.updateLayerDataPermission(P, 'L', 'PUBLIC', 'COMMON');
    await saveCommon(OWNER, [], [layer('L', 'COMMON')]);
    expect(await rawDocs('L')).toEqual([
      { userId: M3, permission: 'COMMON' },
      { userId: OWNER, permission: 'COMMON' },
    ]);
    expect(ids(await commonOf(OWNER, 'L'))).toEqual(['R1']);
  });
});

describe('S2: 管理者が2人いる COMMON', () => {
  test('別の管理者が編集・追加した記録が、もう一人の保存で消えない', async () => {
    // オーナーが COMMON に X を置く
    await upload(OWNER, 'C', 'COMMON', [rec('X', OWNER, { field: { v: 'orig' } })]);
    // 管理者2が設定モードで開き（オーナーのバケットを取得）、X を編集して Y を足して保存する
    const opened = await commonOf(ADMIN2, 'C');
    const ownerBucket = opened[0];
    const local: DataType[] = [
      { ...ownerBucket, data: ownerBucket.data.map((r) => ({ ...r, deleted: true, uploaded: true, updatedAt: 200 })) },
      { layerId: 'C', userId: ADMIN2, data: [rec('X', ADMIN2, { field: { v: 'edited' }, updatedAt: 200 }), rec('Y', ADMIN2)] },
    ];
    await saveCommon(ADMIN2, local, [layer('C', 'COMMON')]);
    expect(await rawDocs('C')).toEqual([{ userId: ADMIN2, permission: 'COMMON' }]);
    const records = (await commonOf(M1, 'C')).flatMap((d) => d.data).filter((r) => !r.deleted);
    expect(records.map((r) => `${r.id}:${r.field.v ?? ''}`).sort()).toEqual(['X:edited', 'Y:']);
  });

  test('開いた後に別の管理者が足した記録も、保存で消えない', async () => {
    await upload(OWNER, 'C', 'COMMON', [rec('X', OWNER)]);
    const local = await commonOf(ADMIN2, 'C'); // 管理者2が開いた時点
    await upload(OWNER, 'C', 'COMMON', [rec('X', OWNER), rec('Z', OWNER)]); // その後にオーナーが Z を足した
    await saveCommon(ADMIN2, local, [layer('C', 'COMMON')]);
    expect(ids(await commonOf(M1, 'C'))).toEqual(['X', 'Z']);
  });
});

describe('S1: アップロード前の衝突確認に使う取得', () => {
  test('自分のデータが復号できないとき、更新時刻は返るが中身は返らない（アップロード側はこのレイヤを送らない）', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${P}/data/brokenOwn`), {
        userId: M1,
        layerId: 'track',
        permission: 'PRIVATE',
        encdata: ['not-gzip'],
        encryptedAt: Timestamp.now(),
        chunkIndex: 0,
        chunkCount: 1,
      });
    });
    await upload(M1, 'P1', 'PUBLIC', [rec('a', M1)]);
    as(M1);
    const times = await projectStore.getMyDataUpdatedAt(P, M1);
    expect(times.isOK).toBe(true);
    expect(times.data?.has('track_PRIVATE')).toBe(true);
    const priv = await projectStore.downloadPrivateData(P, { userId: M1 });
    expect(priv.isOK).toBe(true);
    expect((priv.data ?? []).find((d) => d.layerId === 'track')).toBeUndefined();
  });

  test('メンバーは他人の COMMON の doc を片付けられない（片付けは管理者だけ）', async () => {
    await upload(OWNER, 'C', 'COMMON', [rec('X', OWNER)]);
    as(M1);
    const res = await projectStore.deleteOtherUsersData(P, 'C', 'COMMON', M1, [OWNER]);
    expect(res.isOK).toBe(false);
    expect(await rawDocs('C')).toEqual([{ userId: OWNER, permission: 'COMMON' }]);
  });
});

describe('M9・L5・L7: 書き込みと読み出しの版', () => {
  test('M9: 同じ管理者が同じレイヤに書いた TEMPLATE と PUBLIC を、エクスポートの全件取得で両方取り出す', async () => {
    await upload(OWNER, 'L', 'TEMPLATE', [rec('T', OWNER)]);
    await upload(OWNER, 'L', 'PUBLIC', [rec('P', OWNER)]);
    as(OWNER);
    const all = await projectStore.downloadAllData(P);
    expect(all.isOK).toBe(true);
    expect(ids((all.data ?? []).filter((d) => d.layerId === 'L'))).toEqual(['P', 'T']);
  });

  test('L5: 判定のあとに同じアカウントの別端末が書いていたら、期待値の照合で書かずに残す', async () => {
    await upload(M1, 'L', 'PRIVATE', [rec('v1', M1)]);
    // 端末A: 衝突判定でクラウドの版を見る
    as(M1);
    const judged = await projectStore.getMyDataUpdatedAt(P, M1);
    expect(judged.isOK).toBe(true);
    const expected = judged.data?.get('L_PRIVATE');
    expect(expected).toBeDefined();
    // 端末B: その間に同じレイヤを書く
    await upload(M1, 'L', 'PRIVATE', [rec('fromB', M1)]);
    // 端末A: 判定した版を期待値にして書く → 書かない
    as(M1);
    const stale = await projectStore.uploadDataHelper(
      P,
      { layerId: 'L', userId: M1, permission: 'PRIVATE', data: [rec('fromA', M1)] },
      { expected: { encryptedAt: expected } }
    );
    expect(stale.isOK).toBe(false);
    expect(stale.staleExpectation).toBe(true);
    const priv = await projectStore.downloadPrivateData(P, { userId: M1 });
    expect(ids(priv.data ?? [])).toEqual(['fromB']);

    // 判定し直した版なら書ける（getMyDataUpdatedAt の値と書く直前の値が、実際の Timestamp でも一致する）
    const rejudged = await projectStore.getMyDataUpdatedAt(P, M1);
    const ok = await projectStore.uploadDataHelper(
      P,
      { layerId: 'L', userId: M1, permission: 'PRIVATE', data: [rec('fromA', M1)] },
      { expected: { encryptedAt: rejudged.data?.get('L_PRIVATE') } }
    );
    expect(ok.isOK).toBe(true);
    expect(ids((await projectStore.downloadPrivateData(P, { userId: M1 })).data ?? [])).toEqual(['fromA']);
  });

  test('L7: 時計の進んだ端末が書いた世代が削除し損ねで残っていても、次に書いた世代が採られ、残りは消える', async () => {
    // 1時間先の時刻で書かれた世代（gzip の平文。FUNC_ENCRYPTION=false の経路で読める）
    const future = Timestamp.fromMillis(Date.now() + 60 * 60 * 1000);
    const { encryptEThree } = jest.requireMock('../../virgilsecurity/e3kit');
    const encdata = await encryptEThree({ data: [rec('stale', M1)] });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${P}/data/futureGen`), {
        userId: M1,
        layerId: 'L',
        permission: 'PRIVATE',
        encdata,
        encryptedAt: future,
        chunkIndex: 0,
        chunkCount: 1,
      });
    });
    const res = await upload(M1, 'L', 'PRIVATE', [rec('fresh', M1)]);
    expect(res.encryptedAt).toBeGreaterThan(future.toMillis());
    as(M1);
    expect(ids((await projectStore.downloadPrivateData(P, { userId: M1 })).data ?? [])).toEqual(['fresh']);
    expect(await rawDocs('L')).toEqual([{ userId: M1, permission: 'PRIVATE' }]);
  });
});

describe('L10: クラウドデータ管理のレイヤ削除', () => {
  const settingsOf = (layerIds: string[]) =>
    ({
      layers: layerIds.map((id) => layer(id, 'PUBLIC')),
      tileMaps: [],
      mapType: 'none',
      mapRegion: { latitude: 35, longitude: 135, latitudeDelta: 0.01, longitudeDelta: 0.01, zoom: 15 },
      plugins: {},
      updatedAt: '',
    } as never);
  const layerIdsOf = async (uid: string) => {
    as(uid);
    const res = await projectStore.downloadProjectSettings(P);
    expect(res.isOK).toBe(true);
    return (res.data?.layers ?? []).map((l) => l.id).sort();
  };

  afterEach(() => {
    mockEncryptHook.before = undefined;
  });

  test('指定したレイヤだけを設定から外す', async () => {
    as(OWNER);
    expect((await projectStore.uploadProjectSettings(P, OWNER, settingsOf(['A', 'B']))).isOK).toBe(true);
    const res = await projectStore.deleteLayerFromSettings(P, OWNER, ['A']);
    expect(res.isOK).toBe(true);
    expect(res.timestamp).toBeInstanceOf(Date);
    expect(await layerIdsOf(M1)).toEqual(['B']);
  });

  test('読んでから書き戻すまでの間に別の管理者が保存しても、その変更を消さない（読み直してやり直す）', async () => {
    as(OWNER);
    expect((await projectStore.uploadProjectSettings(P, OWNER, settingsOf(['A', 'B']))).isOK).toBe(true);
    const { encryptEThree } = jest.requireMock('../../virgilsecurity/e3kit');
    // 削除の書き戻しの暗号化の直前に、もう一人の管理者がレイヤ C を足した設定を保存する（Rules を通さずに直接書く）
    const concurrent = await encryptEThree({ ...(settingsOf(['A', 'B', 'C']) as object), updatedAt: '' });
    mockEncryptHook.before = async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), `projects/${P}/settings/default`), {
          editorUid: ADMIN2,
          encdata: concurrent,
          encryptedAt: Timestamp.now(),
        });
      });
    };
    as(OWNER);
    const res = await projectStore.deleteLayerFromSettings(P, OWNER, ['A']);
    expect(res.isOK).toBe(true);
    expect(mockEncryptHook.before).toBeUndefined();
    // A だけが外れ、もう一人の管理者が足した C は残る
    expect(await layerIdsOf(M1)).toEqual(['B', 'C']);
  });

  test('一般メンバーは設定からレイヤを外せない', async () => {
    as(OWNER);
    expect((await projectStore.uploadProjectSettings(P, OWNER, settingsOf(['A', 'B']))).isOK).toBe(true);
    as(M1);
    const res = await projectStore.deleteLayerFromSettings(P, M1, ['A']);
    expect(res.isOK).toBe(false);
    expect(await layerIdsOf(M1)).toEqual(['A', 'B']);
  });
});
