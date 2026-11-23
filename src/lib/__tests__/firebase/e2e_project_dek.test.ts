/**
 * 新規プロジェクトの作成が途中で失敗したときの通し確認（アカウント監査 A-M3 の DEK 方式の経路）。
 * Firestore エミュレータと本番の firestore.rules で、src/lib/firebase/firestore.ts の addProject / discardCreatedProject /
 * distributeProjectDEK をそのまま動かす。DEK 方式（FUNC_ENCRYPTION=true・CREATE_DEK_PROJECTS=true）の経路を通すため、
 * 暗号そのもの（DEK の生成・暗号化・メンバー公開鍵でのラップ）は対になっているかだけを確かめる偽物に差し替える
 * （暗号方式の検証は対象外。Rules・doc の作成と片付け・暗号情報のキャッシュの扱いを確かめる）。
 *
 * useRepository.createProject と containers/ProjectEdit.saveNewProject の手順は同じ部品を同じ順で呼んで再現する。
 * 他の班と同じエミュレータを使うので clearFirestore は使わず、id・uid はこの実行だけの接頭辞で一意にする。
 *
 * 実行（エミュレータ起動済み）:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199 GCLOUD_PROJECT=demo-ecorismap-test \
 *     npx jest --config jest.rules.config.js --runInBand src/lib/__tests__/firebase/e2e_project_dek.test.ts
 */
import * as fs from 'fs';
import * as rulesTesting from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import { ulid } from 'ulid';

const mockActor: { db: unknown; uid: string } = { db: undefined, uid: '' };
// メンバー宛ての鍵のラップを失敗させる uid と失敗の種類
const mockWrap: { failFor: Set<string>; errorName?: string } = { failFor: new Set() };

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
  FUNC_ENCRYPTION: true,
  CREATE_DEK_PROJECTS: true,
  ENABLE_KEY_LEDGER: false,
}));
jest.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios ?? o.default },
  Dimensions: { get: () => ({ width: 400, height: 800 }) },
}));
// DEK は「pub-n / priv-n」の対。暗号文は公開鍵の名前と平文を gzip したもので、対の秘密鍵でだけ戻せる
jest.mock('../../virgilsecurity/dek', () => {
  const pako = jest.requireActual('pako');
  const { Buffer } = jest.requireActual('buffer');
  let n = 0;
  const pairOf = (priv: string) => priv.replace(/^priv-/, 'pub-');
  return {
    createProjectDEK: async () => {
      n += 1;
      const id = `${Date.now()}-${n}`;
      return { publicKey: `pub-${id}`, privateKey: `priv-${id}` };
    },
    isDEKKeyPair: async (priv: string, pub: string) => pairOf(priv) === pub,
    encryptWithDEK: async (data: unknown, pub: string) => [
      Buffer.from(pako.deflate(JSON.stringify({ pub, data }))).toString('base64'),
    ],
    decryptWithDEK: async (encdata: string[], priv: string) => {
      const box = JSON.parse(Buffer.from(pako.inflate(new Uint8Array(Buffer.from(encdata[0], 'base64')))).toString('utf-8'));
      if (box.pub !== pairOf(priv)) throw new Error('wrong DEK');
      return box.data;
    },
  };
});
jest.mock('../../crypto', () => ({
  wrapDEKForMember: async (priv: string, uid: string) => {
    if (mockWrap.failFor.has(uid)) {
      const e = new Error('wrap failed (test)');
      if (mockWrap.errorName) e.name = mockWrap.errorName;
      throw e;
    }
    return `wrap|${uid}|${priv}`;
  },
  unwrapDEK: async (wrapped: string) => {
    const [, uid, priv] = wrapped.split('|');
    return uid === mockActor.uid ? priv : undefined;
  },
}));
jest.mock('../../virgilsecurity/e3kit', () => ({
  encryptEThree: async () => {
    throw new Error('group encryption is not used in this test');
  },
  decryptEThree: async () => undefined,
}));
jest.mock('../../firebase/publicKeys', () => ({ clearPublicKeyLedgerCache: jest.fn(), getPublicKeyFromLedger: jest.fn() }));
jest.mock('../../../i18n/config', () => ({ t: (key: string) => key }));
jest.mock('../../../utils/Format', () => ({ formattedInputs: jest.fn(() => ({ isOK: true })) }));
jest.mock('../../../components/atoms/Alert', () => ({ Alert: { alert: jest.fn() } }));

import * as projectStore from '../../firebase/firestore';
import { pickNewProjectIdForSave } from '../../../utils/Project';
import { ProjectSettingsType, ProjectType } from '../../../types';

const PROJECT_ID = 'demo-ecorismap-test';
const RUN = `e2eprojdek${ulid().slice(-10).toLowerCase()}`;
const OWNER = `${RUN}_owner`;
const M1 = `${RUN}_m1`;
const M2 = `${RUN}_m2`;

let testEnv: rulesTesting.RulesTestEnvironment;
jest.setTimeout(60000);

const as = (uid: string) => {
  mockActor.uid = uid;
  mockActor.db = testEnv.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true }).firestore();
};

const draftProject = (members: string[]): ProjectType => ({
  id: `${RUN}_${ulid()}`,
  name: 'dek-project',
  members: [OWNER, ...members].map((uid, i) => ({
    uid,
    email: `${uid}@example.com`,
    verified: 'HOLD' as const,
    role: i === 0 ? ('OWNER' as const) : ('MEMBER' as const),
  })),
  ownerUid: OWNER,
  adminsUid: [OWNER],
  membersUid: [OWNER, ...members],
  abstract: '',
  storage: { count: 0 },
});

const defaultSettings = (): ProjectSettingsType => ({
  layers: [],
  tileMaps: [],
  mapType: 'none',
  mapRegion: { latitude: 35, longitude: 135, latitudeDelta: 0.00922, longitudeDelta: 0.00922, zoom: 15 },
  plugins: {},
  updatedAt: '',
});

/** useRepository.createProject（addProject → uploadDefaultProjectSettings → 失敗なら discardCreatedProject）の再現 */
const createProjectLike = async (project: ProjectType) => {
  const add = await projectStore.addProject(project);
  if (!add.isOK) return add;
  const res = await projectStore.uploadProjectSettings(project.id, project.ownerUid, defaultSettings());
  if (!res.isOK) {
    await projectStore.discardCreatedProject(project.id);
    return { isOK: false, message: res.message };
  }
  return { isOK: true, message: '' };
};

const raw = async (path: string) => {
  let data: Record<string, unknown> | undefined;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const snap = await getDoc(doc(context.firestore(), path));
    data = snap.exists() ? (snap.data() as Record<string, unknown>) : undefined;
  });
  return data;
};

const waitForGone = async (path: string, timeoutMs = 5000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if ((await raw(path)) === undefined) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
};

beforeAll(async () => {
  testEnv = await rulesTesting.initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host: '127.0.0.1', port: 8080, rules: fs.readFileSync('./firestore.rules', 'utf8') },
  });
});

beforeEach(() => {
  projectStore.clearProjectCryptoCache();
  mockWrap.failFor.clear();
  mockWrap.errorName = undefined;
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('A-M3（DEK 方式）: 新規作成が途中で失敗したら doc が残らず、やり直せる', () => {
  test('鍵の配布で失敗すると doc を消して失敗を返し、新しい id での再保存は鍵も配られてメンバーが開ける', async () => {
    const attempted = new Set<string>();
    const draft = draftProject([M1]);
    as(OWNER);
    mockWrap.failFor.add(M1); // 公開鍵の取得失敗など、UsersNotFoundError 以外の失敗
    const firstId = pickNewProjectIdForSave(draft.id, attempted, ulid);
    const first = await createProjectLike({ ...draft, id: firstId });
    expect(first.isOK).toBe(false);
    expect(await waitForGone(`projects/${firstId}`)).toBe(true);
    expect((await projectStore.getAllProjects(OWNER)).projects.map((p) => p.id)).not.toContain(firstId);

    mockWrap.failFor.clear();
    const secondId = pickNewProjectIdForSave(draft.id, attempted, ulid);
    expect(secondId).not.toBe(firstId);
    const second = await createProjectLike({ ...draft, id: secondId });
    expect(second.isOK).toBe(true);
    const created = await raw(`projects/${secondId}`);
    expect(created?.cryptoScheme).toBe('dek');
    expect(await raw(`projects/${secondId}/keys/${OWNER}`)).toBeDefined();
    expect(await raw(`projects/${secondId}/keys/${M1}`)).toBeDefined();

    // 別の端末のメンバー（キャッシュなし）が一覧から開ける
    projectStore.clearProjectCryptoCache();
    as(M1);
    const list = await projectStore.getAllProjects(M1);
    expect(list.message).toBe('');
    expect(list.projects.map((p) => p.id)).toContain(secondId);
    expect((await projectStore.downloadProjectSettings(secondId)).isOK).toBe(true);
  });

  test('設定のアップロードで失敗しても doc を消し、オーナーの一覧に「読み込めないプロジェクト」を残さない', async () => {
    const draft = draftProject([M1]);
    as(OWNER);
    const add = await projectStore.addProject(draft);
    expect(add.isOK).toBe(true);
    // 設定の書き込みに失敗した場面（editorUid を他人にすると Rules で拒否される）
    const bad = await projectStore.uploadProjectSettings(draft.id, M1, defaultSettings());
    expect(bad.isOK).toBe(false);
    await projectStore.discardCreatedProject(draft.id);
    expect(await waitForGone(`projects/${draft.id}`)).toBe(true);
    projectStore.clearProjectCryptoCache();
    const list = await projectStore.getAllProjects(OWNER);
    expect(list.projects.map((p) => p.id)).not.toContain(draft.id);
    expect(list.message).toBe('');
  });

  test('公開鍵が無いメンバー（UsersNotFoundError）は飛ばして作成は成功する', async () => {
    const draft = draftProject([M1, M2]);
    as(OWNER);
    mockWrap.failFor.add(M2);
    mockWrap.errorName = 'UsersNotFoundError';
    expect((await createProjectLike(draft)).isOK).toBe(true);
    expect(await raw(`projects/${draft.id}/keys/${M1}`)).toBeDefined();
    expect(await raw(`projects/${draft.id}/keys/${M2}`)).toBeUndefined();
  });

  test('消し損ねた doc が残っていると同じ id では作り直せない（Rules）が、手元の暗号情報は新しい DEK で上書きされない', async () => {
    // 前提の確認: 新しい id で作り直す必要がある理由（keepsDekPublicKey はオーナーにも掛かる）
    const draft = draftProject([M1]);
    as(OWNER);
    expect((await createProjectLike(draft)).isOK).toBe(true);
    const before = await raw(`projects/${draft.id}`);
    const retry = await projectStore.addProject(draft); // 同じ id・新しい DEK
    expect(retry.isOK).toBe(false);
    const after = await raw(`projects/${draft.id}`);
    expect(after?.dekPublicKey).toBe(before?.dekPublicKey);
    // 拒否の前にキャッシュへ入れた新しい DEK は失敗時に捨てられるので、同じ端末で元のプロジェクトを読み書きできる
    const list = await projectStore.getAllProjects(OWNER);
    expect(list.projects.map((p) => p.id)).toContain(draft.id);
    expect(list.message).toBe('');
    expect((await projectStore.downloadProjectSettings(draft.id)).isOK).toBe(true);
    expect((await projectStore.uploadProjectSettings(draft.id, OWNER, defaultSettings())).isOK).toBe(true);
    // 新しく書いた設定は、キャッシュなしの別端末のメンバーも読める（古い DEK のまま書かれている）
    projectStore.clearProjectCryptoCache();
    as(M1);
    expect((await projectStore.downloadProjectSettings(draft.id)).isOK).toBe(true);
  });
});
