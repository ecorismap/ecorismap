/**
 * 共同編集のデータの通し確認（2026-11-23 に main へ入れた修正: E-L1・E-L6/E-M1・E-M3・E-H1・E-M9、A-M1/S-L1 の Rules 側）。
 *
 * Firestore エミュレータと本番の firestore.rules で、src/lib/firebase/firestore.ts の実装をそのまま動かす。
 * 端末ごとの利用者は rules-unit-testing の認証済みコンテキストで切り替える。暗号化は FUNC_ENCRYPTION=false（gzip のみ）。
 *
 * 端末の手元（Redux の dataSet）は、本物の reducer（modules/dataSet）と、ストアに入る手前の所有権の規則
 * （modules/recordOwnership.resolveRecordOwnershipActions）を通して再現する。React のフックは node で動かせないので、
 * フックが呼ぶ部品（getNumberingRecordSets・getDefaultField・getRecordModifyBlock・isReferenceAddLocked・
 * getTargetRecordSet・mergeLayerData・selectors）を、フックと同じ順で呼ぶ。
 *
 * 他の班が同じエミュレータでテストを流しているので、clearFirestore は使わず、プロジェクト id をテストごとに一意にする。
 *
 * 実行:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199 GCLOUD_PROJECT=demo-ecorismap-test \
 *   npx jest --config jest.rules.config.js --runInBand src/lib/__tests__/firebase/e2e_data_collab.test.ts
 */
import * as fs from 'fs';
import * as rulesTesting from '@firebase/rules-unit-testing';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { ulid } from 'ulid';
import { UnknownAction } from '@reduxjs/toolkit';

const mockActor: { db: unknown; uid: string } = { db: undefined, uid: '' };

jest.mock('../../firebase/firebase', () => {
  const fsMod = jest.requireActual('firebase/firestore');
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
    encryptEThree: async (data: unknown) => [gzip(JSON.stringify(data))],
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
import { getDefaultField, getNumberingRecordSets, getTargetRecordSet, mergeLayerData } from '../../../utils/Data';
import { getRecordModifyBlock } from '../../../utils/recordTakeover';
import { isReferenceAddLocked } from '../../../utils/referenceLock';
import dataSetReducer, {
  addRecordsAction,
  deleteRecordsAction,
  updateDataAction,
  updateRecordsAction,
} from '../../../modules/dataSet';
import { resolveRecordOwnershipActions } from '../../../modules/recordOwnership';
import {
  selectNonDeletedAllUserRecordSet,
  selectNonDeletedLayerRecordSetWithChildren,
} from '../../../modules/selectors';
import { DataType, LayerType, RecordType, RoleType } from '../../../types';

const PROJECT_ID = 'demo-ecorismap-test';
// 班・ファイルごとに一意の接頭辞（他の班のテストと uid が重ならないように）
const RUN = `e2edata_${ulid()}`;
const OWNER = `${RUN}_owner`;
const M1 = `${RUN}_m1`;
const M2 = `${RUN}_m2`;
const OUTSIDER = `${RUN}_outsider`;

let testEnv: rulesTesting.RulesTestEnvironment;
let P = '';

const as = (uid: string) => {
  mockActor.uid = uid;
  mockActor.db = testEnv.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true }).firestore();
};

const lineCoords = (lon: number) => [
  { latitude: 35, longitude: lon },
  { latitude: 35.001, longitude: lon + 0.001 },
];

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

const layer = (id: string, type: LayerType['type'], permission: LayerType['permission'], field: LayerType['field']) =>
  ({ id, name: id, type, permission, field, active: true, visible: true, label: '', colorStyle: {} } as unknown as LayerType);

const SERIAL_FIELD = { id: 'f-no', name: 'No', format: 'SERIAL' } as LayerType['field'][number];
const MEMO_FIELD = { id: 'f-memo', name: 'memo', format: 'STRING' } as LayerType['field'][number];

// ---------------------------------------------------------------------------------------------
// 端末（手元の Redux）の再現
// ---------------------------------------------------------------------------------------------

type Device = { uid: string; role: RoleType; dataSet: DataType[]; layers: LayerType[] };

const device = (uid: string, role: RoleType, layers: LayerType[]): Device => ({ uid, role, dataSet: [], layers });

const rootState = (dev: Device) =>
  ({
    dataSet: dev.dataSet,
    layers: dev.layers,
    user: { uid: dev.uid, displayName: dev.uid, email: `${dev.uid}@example.com`, photoURL: null },
    settings: { projectId: P, isSettingProject: false, role: dev.role },
  } as never);

/** 実行中のプロジェクトでの dispatch。ストアの所有権の規則を通してから本物の reducer に渡す */
const dispatch = (dev: Device, action: UnknownAction) => {
  const resolved = resolveRecordOwnershipActions(rootState(dev), action);
  resolved.forEach((a) => {
    dev.dataSet = dataSetReducer(dev.dataSet, a);
  });
  return resolved;
};

const userOf = (dev: Device) =>
  ({ uid: dev.uid, email: `${dev.uid}@example.com`, displayName: dev.uid, photoURL: null } as never);

const isAdmin = (dev: Device) => dev.role === 'OWNER' || dev.role === 'ADMIN';

/** useRepository.uploadDataToRepository（PUBLIC/PRIVATE の実行中）の送る集合と書き込み、成功後に手元を送った版にそろえる */
const uploadOwn = async (dev: Device, l: LayerType) => {
  as(dev.uid);
  const data = getTargetRecordSet(dev.dataSet, l, userOf(dev));
  const res = await projectStore.uploadDataHelper(P, { layerId: l.id, userId: dev.uid, permission: l.permission, data });
  expect(res.isOK).toBe(true);
  dev.dataSet = dataSetReducer(dev.dataSet, updateDataAction([{ layerId: l.id, userId: dev.uid, data }]));
  return data;
};

/** 設定モードでのテンプレートの送信（userId は管理者、取得側では 'template' に読み替わる） */
const uploadTemplate = async (uid: string, layerId: string, data: RecordType[]) => {
  as(uid);
  const res = await projectStore.uploadDataHelper(P, {
    layerId,
    userId: uid,
    permission: 'TEMPLATE',
    data: data.map((r) => ({ ...r, userId: 'template', uploaded: true })),
  });
  expect(res.isOK).toBe(true);
};

/**
 * 取得（PUBLIC とテンプレート）。useRepository.createMergedDataSet と同じく、レイヤごとに mergeLayerData で
 * 利用者の版とテンプレートをまとめ、手元へ updateDataAction で入れる（競合は 'latest' で自動解決）
 */
const syncDown = async (dev: Device) => {
  as(dev.uid);
  const pub = await projectStore.downloadPublicData(P);
  expect(pub.isOK).toBe(true);
  const tmpl = await projectStore.downloadTemplateData(P);
  expect(tmpl.isOK).toBe(true);
  const publicData = pub.data ?? [];
  const templateData = (tmpl.data ?? []).map((d) => ({ ...d, userId: 'template' }));
  const layerIds = Array.from(new Set([...publicData.map((d) => d.layerId), ...templateData.map((d) => d.layerId)]));
  for (const layerId of layerIds) {
    const templateItem = templateData.find((d) => d.layerId === layerId);
    // 手元の自分の版も候補に入れる（未送信の自分の変更を取得で失わない。ownCloud の取り込みと同じ考え）
    const localOwn = dev.dataSet.filter((d) => d.layerId === layerId && d.userId === dev.uid);
    const cloudItems = publicData.filter((d) => d.layerId === layerId);
    const items = [...localOwn, ...cloudItems];
    if (items.length > 0) {
      const [merged, mergedTemplate] = await mergeLayerData({
        layerData: items,
        templateData: templateItem,
        ownUserId: dev.uid,
        strategy: 'latest',
      });
      dev.dataSet = dataSetReducer(dev.dataSet, updateDataAction(merged));
      dev.dataSet = dataSetReducer(
        dev.dataSet,
        updateDataAction([mergedTemplate ?? { layerId, userId: 'template', data: [] }])
      );
    } else if (templateItem !== undefined) {
      dev.dataSet = dataSetReducer(dev.dataSet, updateDataAction([templateItem]));
    }
  }
};

/** データ一覧に出る記録（子を除く・墓標を除く） */
const listRecords = (dev: Device, layerId: string): RecordType[] =>
  selectNonDeletedAllUserRecordSet(rootState(dev), layerId);
/** レイヤの全記録（子を含む・墓標を除く） */
const layerRecordsWithChildren = (dev: Device, layerId: string): RecordType[] =>
  selectNonDeletedLayerRecordSetWithChildren(rootState(dev), layerId);

/** useData.addDefaultRecord の採番（E-L1）: 前回値=自分の記録の末尾、連番=レイヤの全記録の最大値+1 */
const addRecordFromList = (dev: Device, l: LayerType, coords?: RecordType['coords']) => {
  const id = ulid();
  const allUserRecordSet = listRecords(dev, l.id);
  const ownRecordSet = allUserRecordSet.filter((d) => d.userId === dev.uid);
  const numbering = getNumberingRecordSets(allUserRecordSet, layerRecordsWithChildren(dev, l.id), dev.uid);
  const field = getDefaultField(l, ownRecordSet, id, { numbering });
  const newRecord = rec(id, dev.uid, { field, coords: coords ?? { latitude: 35, longitude: 139 }, updatedAt: Date.now() });
  dispatch(dev, addRecordsAction({ layerId: l.id, userId: dev.uid, data: [newRecord] }));
  return newRecord;
};

/**
 * 親の削除で子（_group）も消すときの権限判定（useDataEdit.deleteRecord と useDrawTool.deleteDraw の E-M1・E-L6）。
 * 消せない子が1件でもあれば、その理由を返す
 */
const childDeleteBlock = (dev: Device, l: LayerType, parentId: string) =>
  dev.dataSet
    .flatMap((d) => (d.layerId === l.id ? d.data : []))
    .filter((d) => d.deleted !== true && d.field._group === parentId)
    .map((child) =>
      getRecordModifyBlock({
        layer: l,
        recordUserId: child.userId,
        action: 'delete',
        ownUserId: dev.uid,
        isOwnerAdmin: isAdmin(dev),
        isRunningProject: true,
      })
    )
    .find((block) => block !== undefined);

/** 親と子を名義ごとに消す（useData の byBucket・deleteDrawRecord と同じく、集合ごとに deleteRecordsAction を出す） */
const deleteWithChildren = (dev: Device, l: LayerType, parent: RecordType) => {
  const targets = dev.dataSet
    .flatMap((d) => (d.layerId === l.id ? d.data : []))
    .filter((d) => d.deleted !== true && (d.id === parent.id || d.field._group === parent.id));
  const byBucket = new Map<string | undefined, RecordType[]>();
  targets.forEach((r) => byBucket.set(r.userId, [...(byBucket.get(r.userId) ?? []), r]));
  byBucket.forEach((data, userId) => dispatch(dev, deleteRecordsAction({ layerId: l.id, userId, data })));
};

beforeAll(async () => {
  testEnv = await rulesTesting.initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host: '127.0.0.1', port: 8080, rules: fs.readFileSync('./firestore.rules', 'utf8') },
  });
});

beforeEach(async () => {
  // 全体を消さず、テストごとに新しいプロジェクトを作る
  P = `e2e_data_${ulid()}`;
  projectStore.clearProjectCryptoCache();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), `projects/${P}`), {
      ownerUid: OWNER,
      adminsUid: [OWNER],
      membersUid: [OWNER, M1, M2],
      encdata: [''],
      encryptedAt: Timestamp.now(),
    });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

// ---------------------------------------------------------------------------------------------

describe('E-L1: 一覧からの追加の連番は、他のメンバー・テンプレートを含むレイヤ全体の最大値+1', () => {
  const PT = layer('PT', 'POINT', 'PUBLIC', [SERIAL_FIELD, MEMO_FIELD]);

  test('テンプレート1〜3のあと、メンバー2人が順に一覧から足して同期しても、連番が重複しない', async () => {
    await uploadTemplate(OWNER, 'PT', [1, 2, 3].map((n) => rec(`t${n}`, 'template', { field: { No: n, memo: '' } })));

    const m1 = device(M1, 'MEMBER', [PT]);
    await syncDown(m1);
    // 修正前の数え方（自分の記録だけ）では 1 になり、テンプレートの1と重なっていた
    const own = listRecords(m1, 'PT').filter((r) => r.userId === M1);
    expect(getDefaultField(PT, own, 'x').No).toBe(1);
    const a = addRecordFromList(m1, PT);
    expect(a.field.No).toBe(4);
    await uploadOwn(m1, PT);

    const m2 = device(M2, 'MEMBER', [PT]);
    await syncDown(m2);
    const b = addRecordFromList(m2, PT);
    expect(b.field.No).toBe(5);
    await uploadOwn(m2, PT);

    // M1 が続けて足す（M2 の 5 を取得した後）
    await syncDown(m1);
    const c = addRecordFromList(m1, PT);
    expect(c.field.No).toBe(6);
    await uploadOwn(m1, PT);

    // 第三者（管理者）の端末で全部を取得し、一覧に出る連番がそろって重複しない
    const owner = device(OWNER, 'OWNER', [PT]);
    await syncDown(owner);
    const numbers = listRecords(owner, 'PT')
      .map((r) => r.field.No as number)
      .sort((x, y) => x - y);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test('墓標（削除済み）の連番は数えず、子の記号は数える（作図と同じ集合）', async () => {
    const m1 = device(M1, 'MEMBER', [PT]);
    dispatch(m1, addRecordsAction({ layerId: 'PT', userId: M1, data: [rec('p1', M1, { field: { No: 7 }, uploaded: true })] }));
    dispatch(m1, deleteRecordsAction({ layerId: 'PT', userId: M1, data: [rec('p1', M1)] }));
    expect(m1.dataSet[0].data[0].deleted).toBe(true);
    dispatch(m1, addRecordsAction({ layerId: 'PT', userId: M1, data: [rec('c1', M1, { field: { No: 3, _group: 'x' } })] }));
    const added = addRecordFromList(m1, PT);
    expect(added.field.No).toBe(4);
  });
});

describe('E-L6・E-M1: 子の記号に消せない名義が含まれると、削除全体を止める', () => {
  const FLY = layer('FLY', 'LINE', 'PUBLIC', [MEMO_FIELD]);
  const parent = (id: string, userId: string, extra: Partial<RecordType> = {}) =>
    rec(id, userId, { coords: lineCoords(139), field: { memo: '' }, ...extra });
  const child = (id: string, userId: string, group: string) =>
    rec(id, userId, { coords: { latitude: 35, longitude: 139.0005 }, field: { memo: '', _group: group } });

  test('テンプレートの飛翔線を一般メンバーが編集（自分の名義へ持ち替え）した後に消そうとすると止まり、クラウドに孤児の記号が残らない', async () => {
    await uploadTemplate(OWNER, 'FLY', [parent('P', 'template'), child('S1', 'template', 'P'), child('S2', 'template', 'P')]);

    const m1 = device(M1, 'MEMBER', [FLY]);
    await syncDown(m1);
    // 親の属性を直す → テンプレートの編集なので自分の名義へ持ち替える（子は移らない）
    const p = m1.dataSet.find((d) => d.userId === 'template')!.data.find((r) => r.id === 'P')!;
    dispatch(
      m1,
      updateRecordsAction({ layerId: 'FLY', userId: 'template', data: [{ ...p, field: { memo: 'edited' }, updatedAt: Date.now() }] })
    );
    expect(m1.dataSet.find((d) => d.userId === M1)?.data.map((r) => r.id)).toEqual(['P']);

    // 自分の親を消そうとする → 子がテンプレート名義なので全体を止める
    expect(childDeleteBlock(m1, FLY, 'P')).toBe('adminOnly');
    await uploadOwn(m1, FLY);

    // 別のメンバーの端末: 親（M1 の版）と2つの子がそろって見え、親のない子は無い
    const m2 = device(M2, 'MEMBER', [FLY]);
    await syncDown(m2);
    const all = layerRecordsWithChildren(m2, 'FLY');
    const parents = new Set(all.filter((r) => r.field._group === undefined || r.field._group === '').map((r) => r.id));
    const children = all.filter((r) => typeof r.field._group === 'string' && r.field._group !== '');
    expect(children.map((r) => r.id).sort()).toEqual(['S1', 'S2']);
    children.forEach((c) => expect(parents.has(c.field._group as string)).toBe(true));
    expect(all.find((r) => r.id === 'P')?.field.memo).toBe('edited');
  });

  test('止めずに消した場合（修正前）は、所有権の規則で子への削除だけが黙って捨てられ、親のない子がクラウドに残る（検出できることの確認）', async () => {
    await uploadTemplate(OWNER, 'FLY', [parent('P', 'template'), child('S1', 'template', 'P')]);
    const m1 = device(M1, 'MEMBER', [FLY]);
    await syncDown(m1);
    const p = m1.dataSet.find((d) => d.userId === 'template')!.data.find((r) => r.id === 'P')!;
    dispatch(m1, updateRecordsAction({ layerId: 'FLY', userId: 'template', data: [{ ...p, field: { memo: 'x' }, updatedAt: Date.now() }] }));
    deleteWithChildren(m1, FLY, { ...p, userId: M1 });
    await uploadOwn(m1, FLY);
    const m2 = device(M2, 'MEMBER', [FLY]);
    await syncDown(m2);
    const all = layerRecordsWithChildren(m2, 'FLY');
    expect(all.map((r) => r.id)).toEqual(['S1']);
  });

  test('自分の親に、他のメンバーが描いた子が付いていると、削除全体を止める', async () => {
    const m2 = device(M2, 'MEMBER', [FLY]);
    const m1 = device(M1, 'MEMBER', [FLY]);
    dispatch(m1, addRecordsAction({ layerId: 'FLY', userId: M1, data: [parent('Q', M1)] }));
    await uploadOwn(m1, FLY);
    await syncDown(m2);
    dispatch(m2, addRecordsAction({ layerId: 'FLY', userId: M2, data: [child('S3', M2, 'Q')] }));
    await uploadOwn(m2, FLY);

    await syncDown(m1);
    expect(childDeleteBlock(m1, FLY, 'Q')).toBe('adminOnly');
    // 子が自分のものだけなら止めない
    dispatch(m1, addRecordsAction({ layerId: 'FLY', userId: M1, data: [parent('R', M1), child('S4', M1, 'R')] }));
    expect(childDeleteBlock(m1, FLY, 'R')).toBeUndefined();
  });

  test('管理者（公開レイヤ）はテンプレートの親と子をまとめて消せ、他のメンバーの画面からも親子とも消える', async () => {
    await uploadTemplate(OWNER, 'FLY', [parent('P2', 'template'), child('S5', 'template', 'P2'), parent('K', 'template')]);
    const owner = device(OWNER, 'OWNER', [FLY]);
    await syncDown(owner);
    expect(childDeleteBlock(owner, FLY, 'P2')).toBeUndefined();
    const p2 = owner.dataSet.find((d) => d.userId === 'template')!.data.find((r) => r.id === 'P2')!;
    deleteWithChildren(owner, FLY, p2);
    // 引き継いだ墓標として管理者の名義に入る
    const ownBucket = owner.dataSet.find((d) => d.userId === OWNER)!;
    expect(ownBucket.data.map((r) => `${r.id}:${r.deleted === true}`).sort()).toEqual(['P2:true', 'S5:true']);
    await uploadOwn(owner, FLY);

    const m2 = device(M2, 'MEMBER', [FLY]);
    await syncDown(m2);
    expect(layerRecordsWithChildren(m2, 'FLY').map((r) => r.id)).toEqual(['K']);
  });

  test('一般メンバーはテンプレートを書き換えられない（子だけ消す・親だけ消すといった部分的な削除をクラウドへ書けない）', async () => {
    await uploadTemplate(OWNER, 'FLY', [parent('P', 'template'), child('S1', 'template', 'P')]);
    as(M1);
    await expect(
      projectStore.uploadDataHelper(P, { layerId: 'FLY', userId: M1, permission: 'TEMPLATE', data: [parent('P', 'template')] })
    ).rejects.toThrow();
  });
});

describe('E-M3: 実行中プロジェクトの COMMON への参照追加をロックで止める', () => {
  const REF_PUBLIC_STALE = layer('REF', 'POINT', 'PUBLIC', [MEMO_FIELD]);
  const REF_COMMON = layer('REF', 'POINT', 'COMMON', [MEMO_FIELD]);

  test('画面の params のレイヤが古くても、最新の layers で COMMON ならロックする。実行中でなければロックしない', () => {
    expect(isReferenceAddLocked(REF_PUBLIC_STALE, [REF_COMMON], true)).toBe(true);
    expect(isReferenceAddLocked(REF_COMMON, [REF_COMMON], false)).toBe(false);
    expect(isReferenceAddLocked(REF_PUBLIC_STALE, [REF_PUBLIC_STALE], true)).toBe(false);
  });

  test('ロックの理由: 一般メンバーが足した COMMON の記録は送れない（送る集合に入らず、COMMON への書き込みは Rules が拒否する）', async () => {
    const m1 = device(M1, 'MEMBER', [REF_COMMON]);
    // ロックを通らずに足せていた場合の手元
    dispatch(m1, addRecordsAction({ layerId: 'REF', userId: M1, data: [rec('r1', M1)] }));
    // 一般メンバーのアップロード対象（PublicAndPrivate）には COMMON のレイヤが入らない。仮に送っても Rules が拒否する
    as(M1);
    await expect(
      projectStore.uploadDataHelper(P, {
        layerId: 'REF',
        userId: M1,
        permission: 'COMMON',
        data: getTargetRecordSet(m1.dataSet, REF_COMMON, userOf(m1)),
      })
    ).rejects.toThrow();
    // 他のメンバーには届かない（手元だけに残る）
    as(M2);
    const common = await projectStore.downloadCommonData(P);
    expect(common.isOK).toBe(true);
    expect((common.data ?? []).filter((d) => d.layerId === 'REF')).toEqual([]);
  });
});

describe('E-H1: 位置を直した後に属性だけ保存しても、形が編集前に戻らない', () => {
  const POLY = layer('POLY', 'POLYGON', 'PUBLIC', [MEMO_FIELD]);
  const oldCoords = [
    { latitude: 35, longitude: 139 },
    { latitude: 35.001, longitude: 139 },
    { latitude: 35.001, longitude: 139.001 },
    { latitude: 35, longitude: 139 },
  ];
  const newCoords = [
    { latitude: 35, longitude: 139 },
    { latitude: 35.002, longitude: 139 },
    { latitude: 35.002, longitude: 139.002 },
    { latitude: 35, longitude: 139 },
  ];

  test('一覧の先頭の面（記録番号1）でも、新しい形のままアップロードされ、他のメンバーが新しい形で取得する', async () => {
    const m1 = device(M1, 'MEMBER', [POLY]);
    const original = rec('A', M1, { coords: oldCoords, field: { memo: '' }, updatedAt: 100 });
    dispatch(m1, addRecordsAction({ layerId: 'POLY', userId: M1, data: [original, rec('B', M1, { coords: oldCoords, field: { memo: '' } })] }));
    await uploadOwn(m1, POLY);

    // データ編集画面を開いた時点の写し（params.targetData）
    const snapshot = listRecords(m1, 'POLY')[0];
    expect(snapshot.id).toBe('A');
    // 地図で頂点を動かして閉じる（savePolygon がストアへ新しい形を保存）
    dispatch(m1, updateRecordsAction({ layerId: 'POLY', userId: M1, data: [{ ...snapshot, coords: newCoords, updatedAt: Date.now() }] }));

    // DataEdit の再マウント: [record] の effect は渡された写しではなくストアの版を使う（修正後の useDataEdit）
    const allUserRecordSet = listRecords(m1, 'POLY');
    const initialRecordNumber = allUserRecordSet.findIndex((d) => d.id === snapshot.id) + 1;
    expect(initialRecordNumber).toBe(1);
    const targetRecord = initialRecordNumber > 0 ? allUserRecordSet[initialRecordNumber - 1] : snapshot;
    // 属性だけ直して保存（saveData は targetRecord 全体に新しい updatedAt を付けて書く）
    dispatch(
      m1,
      updateRecordsAction({
        layerId: 'POLY',
        userId: M1,
        data: [{ ...targetRecord, field: { memo: 'note' }, updatedAt: Date.now() + 1 }],
      })
    );
    await uploadOwn(m1, POLY);

    const m2 = device(M2, 'MEMBER', [POLY]);
    await syncDown(m2);
    const got = listRecords(m2, 'POLY').find((r) => r.id === 'A')!;
    expect(got.field.memo).toBe('note');
    expect(got.coords).toEqual(newCoords);
    // 写し（修正前の使い方）は古い形のまま。これで保存していたら形が戻っていた
    expect(snapshot.coords).toEqual(oldCoords);
  });
});

describe('E-M9: 作図の確定で、削除済みの記録を復活させない', () => {
  const LN = layer('LN', 'LINE', 'PUBLIC', [MEMO_FIELD]);

  /** useRecord.findRecord（lineDataSet は墓標を含まない）と useDrawTool.isRemovedFromStore */
  const isRemovedFromStore = (dev: Device, selected: RecordType, properties: string[] = []) => {
    if (properties.includes('SPLIT')) return false;
    const latest = dev.dataSet
      .find((d) => d.layerId === 'LN' && d.userId === selected.userId)
      ?.data.filter((r) => !r.deleted)
      .find((r) => r.id === selected.id);
    return latest === undefined || latest.deleted === true;
  };
  /** saveLine の確定（修正後: 削除済み・存在しない記録は保存しない） */
  const confirmDraw = (dev: Device, selected: RecordType, coords: RecordType['coords']) => {
    if (isRemovedFromStore(dev, selected)) return false;
    dispatch(dev, updateRecordsAction({ layerId: 'LN', userId: selected.userId, data: [{ ...selected, coords, updatedAt: Date.now() }] }));
    return true;
  };

  test('作図で選んだまま一覧で消して同期し、地図で確定しても記録は戻らず、他のメンバーにも出ない', async () => {
    const m1 = device(M1, 'MEMBER', [LN]);
    dispatch(m1, addRecordsAction({ layerId: 'LN', userId: M1, data: [rec('L1', M1, { coords: lineCoords(139) }), rec('L2', M1, { coords: lineCoords(140) })] }));
    await uploadOwn(m1, LN);

    const selected = listRecords(m1, 'LN').find((r) => r.id === 'L1')!; // 作図で選んだ時点の版（drawLine.record）
    dispatch(m1, deleteRecordsAction({ layerId: 'LN', userId: M1, data: [selected] })); // 一覧から削除（アップロード済み→墓標）
    await uploadOwn(m1, LN);

    expect(confirmDraw(m1, selected, lineCoords(141))).toBe(false);
    await uploadOwn(m1, LN);

    const m2 = device(M2, 'MEMBER', [LN]);
    await syncDown(m2);
    expect(listRecords(m2, 'LN').map((r) => r.id)).toEqual(['L2']);
  });

  test('同じアカウントの別端末で消された記録も、取得の後に確定すれば復活しない', async () => {
    const devA = device(M1, 'MEMBER', [LN]);
    dispatch(devA, addRecordsAction({ layerId: 'LN', userId: M1, data: [rec('L3', M1, { coords: lineCoords(139), updatedAt: 100 })] }));
    await uploadOwn(devA, LN);
    const selected = listRecords(devA, 'LN')[0];

    // 端末B: 取得して消し、送る
    const devB = device(M1, 'MEMBER', [LN]);
    await syncDown(devB);
    dispatch(devB, deleteRecordsAction({ layerId: 'LN', userId: M1, data: [selected] }));
    await uploadOwn(devB, LN);

    // 端末A: 取得（自分のクラウドの版を取り込む）してから確定
    await syncDown(devA);
    expect(listRecords(devA, 'LN')).toEqual([]);
    expect(confirmDraw(devA, selected, lineCoords(142))).toBe(false);
    await uploadOwn(devA, LN);

    const m2 = device(M2, 'MEMBER', [LN]);
    await syncDown(m2);
    expect(listRecords(m2, 'LN')).toEqual([]);
  });

  test('分割でできた新しい線（SPLIT）はストアに無くても保存の対象（除外しすぎない）', () => {
    const m1 = device(M1, 'MEMBER', [LN]);
    const fresh = rec('new', M1, { coords: lineCoords(139) });
    expect(isRemovedFromStore(m1, fresh, ['SPLIT'])).toBe(false);
    expect(isRemovedFromStore(m1, fresh)).toBe(true);
  });
});

describe('A-M1・S-L1: 別アカウント・名義なしでの書き込みは Rules が拒否する', () => {
  const PT = layer('PT', 'POINT', 'PUBLIC', [MEMO_FIELD]);

  test('前の人（M1）のプロジェクトが開いたままでも、メンバーでない人はそのプロジェクトへデータを送れない', async () => {
    const m1 = device(M1, 'MEMBER', [PT]);
    dispatch(m1, addRecordsAction({ layerId: 'PT', userId: M1, data: [rec('a', M1)] }));
    as(OUTSIDER);
    await expect(
      projectStore.uploadDataHelper(P, { layerId: 'PT', userId: OUTSIDER, permission: 'PUBLIC', data: [rec('a', OUTSIDER)] })
    ).rejects.toThrow();
  });

  test('メンバーでない人は位置共有の位置を書けない（isSynced が残っていても送れない）', async () => {
    as(OUTSIDER);
    const res = await projectStore.uploadCurrentPosition(OUTSIDER, P, {
      icon: { photoURL: null, initial: 'O' },
      coords: { latitude: 35, longitude: 139 } as never,
    });
    expect(res.isOK).toBe(false);
  });

  test('別のメンバー（M2）が、前の人（M1）の名義のまま手元のデータを送ることはできない', async () => {
    as(M2);
    await expect(
      projectStore.uploadDataHelper(P, { layerId: 'PT', userId: M1, permission: 'PUBLIC', data: [rec('a', M1)] })
    ).rejects.toThrow();
  });

  test('名義（userId）を持たないデータ doc は、ログイン中の人でも書けない（S-L1 の uid:null 復元の状態）', async () => {
    const ctx = testEnv.authenticatedContext(M1, { email: `${M1}@example.com`, email_verified: true });
    await rulesTesting.assertFails(
      setDoc(doc(ctx.firestore(), `projects/${P}/data/${ulid()}`), {
        layerId: 'PT',
        permission: 'PUBLIC',
        encdata: ['x'],
        encryptedAt: Timestamp.now(),
        chunkIndex: 0,
        chunkCount: 1,
      })
    );
  });
});
