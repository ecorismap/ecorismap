/**
 * プロジェクトと設定の通し確認（2026-11-23 の修正: A-M3・A-H1・A-H2・A-M2・A-H3・A-L15・M-M20・M-M4・M-M17・M-H6 副因）。
 * Firestore / Storage エミュレータと本番の firestore.rules / storage.rules で、src/lib/firebase/firestore.ts の実装をそのまま動かす。
 * 利用者は rules-unit-testing の認証済みコンテキストで切り替える。暗号化は FUNC_ENCRYPTION=false（gzip のみ）。
 *
 * useProjectEdit・useProjects は本物のフックを本物の Redux の reducer（settings/user/projects/dataSync/dataSet/
 * tileMaps/favoriteProjects/projectsUI）で動かす。useRepository・useProject・containers/ProjectEdit の手順は
 * node で動かせない依存（FileSystem・Dexie・画面）が多いので、同じ部品を同じ順で呼んで再現する（各テストに明記）。
 *
 * 他の班と同じエミュレータを使うので、clearFirestore / clearStorage は使わない。プロジェクト id・uid はこの実行だけの接頭辞で一意にする。
 *
 * 実行（エミュレータ起動済み）:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199 GCLOUD_PROJECT=demo-ecorismap-test \
 *     npx jest --config jest.rules.config.js --runInBand src/lib/__tests__/firebase/e2e_project_flow.test.ts
 */
import * as fs from 'fs';
import * as rulesTesting from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import React from 'react';
import { Provider } from 'react-redux';
import { configureStore, combineReducers } from '@reduxjs/toolkit';
import { renderHook, act } from '@testing-library/react-hooks';
import { ulid } from 'ulid';

const mockActor: { db: unknown; uid: string } = { db: undefined, uid: '' };
// 圏外の再現（getDocsFromServer だけを失敗させる。一覧の再読み込み A-M2）
const mockNet = { offline: false };
// 暗号化を失敗させる条件（新規作成の途中失敗 A-M3）
const mockEnc: { failWhen?: (data: unknown) => boolean } = {};
// Firebase Auth の照会（getUidsByEmails）。本物と同じく大文字小文字を区別しない
const mockAuthDirectory: Record<string, string> = {};
// 暗号化キー（Virgil）を登録済みの uid
const mockRegistered = new Set<string>();

jest.mock('../../firebase/firebase', () => {
  const fsMod = jest.requireActual('firebase/firestore');
  const mod: Record<string, unknown> = {
    ...fsMod,
    functions: {},
    httpsCallable: (_functions: unknown, name: string) => async (payload: { emails?: string[]; email?: string }) => {
      if (name === 'getUidsByEmails') {
        return { data: (payload.emails ?? []).map((e) => mockAuthDirectory[e.trim().toLowerCase()] ?? null) };
      }
      if (name === 'getUidByEmail') return { data: mockAuthDirectory[(payload.email ?? '').trim().toLowerCase()] ?? null };
      throw new Error(`unexpected callable ${name}`);
    },
    getDocsFromServer: async (q: unknown) => {
      if (mockNet.offline) throw new Error('Failed to get documents from server. (offline)');
      return fsMod.getDocs(q);
    },
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
  ENABLE_DEK_MIGRATION: false,
  DEFAULT_MAP_LIST_URL: '',
  TILE_FOLDER: 'file:///tiles',
  COLOR: {},
}));
jest.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios ?? o.default },
  Dimensions: { get: () => ({ width: 400, height: 800 }) },
}));
jest.mock('expo-file-system/legacy', () => ({}));
jest.mock('../../../utils/db', () => ({ db: {} }));
jest.mock('../../virgilsecurity/e3kit', () => {
  const pako = jest.requireActual('pako');
  const { Buffer } = jest.requireActual('buffer');
  const gzip = (str: string) => Buffer.from(pako.deflate(str)).toString('base64');
  const unzip = (value: string) => Buffer.from(pako.inflate(new Uint8Array(Buffer.from(value, 'base64')))).toString('utf-8');
  return {
    encryptEThree: async (data: unknown) => {
      if (mockEnc.failWhen?.(data)) throw new Error('encrypt failed (test)');
      return [gzip(JSON.stringify(data))];
    },
    decryptEThree: async (_at: Date, encdata: string[]) => {
      try {
        return JSON.parse(unzip(encdata[0]));
      } catch (e) {
        return undefined;
      }
    },
    hasRegisterdUser: async (uid: string | null) => uid !== null && mockRegistered.has(uid),
    isInitialized: () => true,
    initializeUser: async () => ({ isOK: true, message: '' }),
  };
});
jest.mock('../../virgilsecurity/dek', () => ({}));
jest.mock('../../crypto', () => ({}));
jest.mock('../../crypto/migration', () => ({ getKeyMigrationState: jest.fn() }));
jest.mock('../../crypto/backup', () => ({ getKeyBackupStatus: jest.fn() }));
jest.mock('../../firebase/publicKeys', () => ({ clearPublicKeyLedgerCache: jest.fn(), getPublicKeyFromLedger: jest.fn() }));
jest.mock('../../../i18n/config', () => ({
  __esModule: true,
  t: (key: string) => key,
  default: { language: 'en', t: (key: string) => key },
}));
jest.mock('../../../components/molecules/AlertAsync', () => ({
  ConfirmAsync: jest.fn(async () => true),
  AlertAsync: jest.fn(async () => undefined),
}));
jest.mock('../../../components/atoms/Alert', () => ({ Alert: { alert: jest.fn() } }));
jest.mock('../../../utils/General', () => ({
  getExt: (path: string) => {
    const m = /\.([^./?#]+)(?:[?#].*)?$/.exec(path);
    return m ? m[1] : '';
  },
}));

import * as projectStore from '../../firebase/firestore';
import { useProjectEdit } from '../../../hooks/useProjectEdit';
import { useProjects } from '../../../hooks/useProjects';
import settingsReducer, { editSettingsAction, settingsInitialState } from '../../../modules/settings';
import userReducer from '../../../modules/user';
import projectsReducer, { addProjectAction } from '../../../modules/projects';
import dataSyncReducer, { clearDataSyncProjectAction } from '../../../modules/dataSync';
import dataSetReducer, { setDataSetAction } from '../../../modules/dataSet';
import tileMapsReducer, { setTileMapsAction } from '../../../modules/tileMaps';
import favoriteProjectsReducer from '../../../modules/favoriteProjects';
import projectsUIReducer from '../../../modules/projectsUI';
import { createInitialTileMaps } from '../../../constants/Maps';
import { mapTypeFromTileMaps } from '../../../utils/baseMapType';
import { pickNewProjectIdForSave } from '../../../utils/Project';
import { findTileSourceChanges } from '../../../utils/tileSourceChange';
import { needsMapterhornUrl, withMapterhornDemUrls } from '../../../utils/demSourceMigrationCore';
import { LayerType, ProjectSettingsType, ProjectType, RecordType, TileMapType } from '../../../types';

const PROJECT_ID = 'demo-ecorismap-test';
const RUN = `e2eproj${ulid().slice(-10).toLowerCase()}`;
const OWNER = `${RUN}_owner`;
const M1 = `${RUN}_m1`;
const M2 = `${RUN}_m2`;
const PENDING = `${RUN}_pending`;
const TARO = `${RUN}_taro`;
const emailOf = (uid: string) => `${uid}@example.com`;

let testEnv: rulesTesting.RulesTestEnvironment;

jest.setTimeout(60000);

const as = (uid: string) => {
  mockActor.uid = uid;
  mockActor.db = testEnv.authenticatedContext(uid, { email: emailOf(uid), email_verified: true }).firestore();
};

const newProjectId = () => `${RUN}_${ulid()}`;

const memberRow = (uid: string, role: 'OWNER' | 'ADMIN' | 'MEMBER') => ({
  uid,
  email: emailOf(uid),
  verified: 'OK' as const,
  role,
});

const makeProject = (id: string, members: ProjectType['members'], extra: Partial<ProjectType> = {}): ProjectType => ({
  id,
  name: `name-${id.slice(-6)}`,
  members,
  ownerUid: OWNER,
  adminsUid: [...new Set(members.filter((m) => m.uid && m.role !== 'MEMBER').map((m) => m.uid as string))],
  membersUid: [...new Set(members.map((m) => m.uid).filter((u): u is string => !!u))],
  abstract: '',
  storage: { count: 0 },
  ...extra,
});

const layer = (id: string, permission: LayerType['permission']): LayerType =>
  ({ id, name: id, type: 'POINT', permission, field: [], active: false, visible: true } as unknown as LayerType);

const rec = (id: string, userId: string): RecordType => ({
  id,
  userId,
  displayName: userId,
  visible: true,
  redraw: false,
  coords: { latitude: 35, longitude: 139 },
  field: {},
  updatedAt: 100,
});

const settingsOf = (overrides: Partial<ProjectSettingsType> = {}): ProjectSettingsType => ({
  layers: [layer('L', 'PRIVATE'), layer('P', 'PUBLIC')],
  tileMaps: createInitialTileMaps('en'),
  mapType: 'standard',
  mapRegion: { latitude: 35, longitude: 135, latitudeDelta: 0.01, longitudeDelta: 0.01, zoom: 15 },
  plugins: {},
  updatedAt: '',
  ...overrides,
});

/** オーナーとしてプロジェクトと設定を作る（作成の正常経路） */
const seedProject = async (project: ProjectType, settings: ProjectSettingsType = settingsOf()) => {
  as(project.ownerUid);
  const add = await projectStore.addProject(project);
  expect(add.isOK).toBe(true);
  const res = await projectStore.uploadProjectSettings(project.id, project.ownerUid, settings);
  expect(res.isOK).toBe(true);
  return res;
};

const rawProjectDoc = async (id: string) => {
  let data: Record<string, unknown> | undefined;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const snap = await getDoc(doc(context.firestore(), 'projects', id));
    data = snap.exists() ? (snap.data() as Record<string, unknown>) : undefined;
  });
  return data;
};

/** discardCreatedProject の削除は待たない作りなので、消えるまで待つ */
const waitForDocGone = async (id: string, timeoutMs = 5000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if ((await rawProjectDoc(id)) === undefined) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
};

const makeStore = (preloaded: Record<string, unknown> = {}) =>
  configureStore({
    reducer: combineReducers({
      settings: settingsReducer,
      user: userReducer,
      projects: projectsReducer,
      dataSync: dataSyncReducer,
      dataSet: dataSetReducer,
      tileMaps: tileMapsReducer,
      favoriteProjects: favoriteProjectsReducer,
      projectsUI: projectsUIReducer,
    }),
    preloadedState: preloaded as never,
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
type TestStore = ReturnType<typeof makeStore>;

const userState = (uid: string) => ({ uid, email: emailOf(uid), displayName: uid, photoURL: null });

const wrapperOf =
  (store: TestStore) =>
  ({ children }: { children: React.ReactNode }) =>
    // eslint-disable-next-line react/no-children-prop
    React.createElement(Provider, { store, children });

const flush = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
};

/** useProject.clearProject の Redux 部分（バックアップ・辞書の片付けを除く）を同じ順で行う */
const clearProjectLike = (store: TestStore) => {
  const state = store.getState();
  if (state.settings.projectId !== undefined) store.dispatch(clearDataSyncProjectAction(state.settings.projectId));
  const initialTileMaps = createInitialTileMaps('en');
  store.dispatch(
    editSettingsAction({
      role: undefined,
      isSettingProject: false,
      isSynced: false,
      projectId: undefined,
      projectName: undefined,
      projectSessionUid: undefined,
      mapType: mapTypeFromTileMaps(initialTileMaps) ?? state.settings.mapType,
    })
  );
  store.dispatch(setDataSetAction([]));
  store.dispatch(setTileMapsAction(initialTileMaps));
};

beforeAll(async () => {
  testEnv = await rulesTesting.initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host: '127.0.0.1', port: 8080, rules: fs.readFileSync('./firestore.rules', 'utf8') },
    storage: { host: '127.0.0.1', port: 9199, rules: fs.readFileSync('./storage.rules', 'utf8') },
  });
  for (const uid of [OWNER, M1, M2, PENDING, TARO]) mockAuthDirectory[emailOf(uid)] = uid;
});

beforeEach(() => {
  projectStore.clearProjectCryptoCache();
  mockNet.offline = false;
  mockEnc.failWhen = undefined;
  mockRegistered.clear();
  [OWNER, M1, M2, TARO].forEach((u) => mockRegistered.add(u));
});

afterAll(async () => {
  await testEnv.cleanup();
});

// ---------------------------------------------------------------------------------------------
describe('A-M3: 新規作成が途中で失敗したら doc が残らず、やり直せる', () => {
  /**
   * useRepository.createProject（addProject → uploadDefaultProjectSettings → 失敗なら discardCreatedProject、
   * 成功なら addProjectAction）と、containers/ProjectEdit.saveNewProject（pickNewProjectIdForSave）を同じ順で再現する
   */
  const createProjectLike = async (store: TestStore, project: ProjectType) => {
    const add = await projectStore.addProject(project);
    if (!add.isOK) return add;
    const tileMaps = createInitialTileMaps('en');
    const res = await projectStore.uploadProjectSettings(project.id, project.ownerUid, {
      layers: [layer('L', 'PRIVATE')],
      tileMaps,
      mapType: mapTypeFromTileMaps(tileMaps) ?? 'none',
      mapRegion: { latitude: 35, longitude: 135, latitudeDelta: 0.00922, longitudeDelta: 0.00922, zoom: 15 },
      plugins: {},
      updatedAt: '',
    });
    if (!res.isOK) {
      await projectStore.discardCreatedProject(project.id);
      return { isOK: false, message: res.message };
    }
    store.dispatch(addProjectAction(project));
    return { isOK: true, message: '' };
  };

  test('設定のアップロードで失敗すると doc を消して一覧にも載せず、新しい id での再保存は成功してメンバーが開ける', async () => {
    const store = makeStore({ user: userState(OWNER) });
    const attempted = new Set<string>();
    const draft = makeProject(newProjectId(), [memberRow(OWNER, 'OWNER'), memberRow(M1, 'MEMBER')]);

    as(OWNER);
    // 1回目: 設定の暗号化で失敗する
    mockEnc.failWhen = (data) => typeof data === 'object' && data !== null && 'tileMaps' in data;
    const firstId = pickNewProjectIdForSave(draft.id, attempted, ulid);
    const first = await createProjectLike(store, { ...draft, id: firstId });
    expect(first.isOK).toBe(false);
    expect(await waitForDocGone(firstId)).toBe(true);
    expect(store.getState().projects.find((p) => p.id === firstId)).toBeUndefined();
    const ownerList = await projectStore.getAllProjects(OWNER);
    expect(ownerList.projects.map((p) => p.id)).not.toContain(firstId);

    // 2回目: 同じ画面のまま保存し直す。消した id は使い回さない
    mockEnc.failWhen = undefined;
    const secondId = pickNewProjectIdForSave(draft.id, attempted, ulid);
    expect(secondId).not.toBe(firstId);
    const second = await createProjectLike(store, { ...draft, id: secondId });
    expect(second.isOK).toBe(true);
    expect(store.getState().projects.map((p) => p.id)).toEqual([secondId]);

    // メンバーの一覧に出て、設定も読める（開ける）
    as(M1);
    const memberList = await projectStore.getAllProjects(M1);
    expect(memberList.projects.map((p) => p.id)).toContain(secondId);
    expect(memberList.projects.map((p) => p.id)).not.toContain(firstId);
    const settings = await projectStore.downloadProjectSettings(secondId);
    expect(settings.isOK).toBe(true);
  });

  test('project doc の作成自体が失敗（暗号化の失敗）しても doc は無く、同じ下書きで作り直せる', async () => {
    const store = makeStore({ user: userState(OWNER) });
    const attempted = new Set<string>();
    const draft = makeProject(newProjectId(), [memberRow(OWNER, 'OWNER')]);
    as(OWNER);
    mockEnc.failWhen = (data) => typeof data === 'object' && data !== null && 'members' in data;
    const firstId = pickNewProjectIdForSave(draft.id, attempted, ulid);
    expect((await createProjectLike(store, { ...draft, id: firstId })).isOK).toBe(false);
    expect(await rawProjectDoc(firstId)).toBeUndefined();
    mockEnc.failWhen = undefined;
    const secondId = pickNewProjectIdForSave(draft.id, attempted, ulid);
    expect((await createProjectLike(store, { ...draft, id: secondId })).isOK).toBe(true);
    expect(await rawProjectDoc(secondId)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------------------------
describe('A-H1: 設定モードのまま通常の「開く」をしても設定モードが残らない', () => {
  test('本物の useProjectEdit.openProject で設定モードが解け、開いた後の送信は自分の PRIVATE をテンプレートとして配らない', async () => {
    const projectA = makeProject(newProjectId(), [memberRow(OWNER, 'OWNER'), memberRow(M1, 'MEMBER')]);
    const projectB = makeProject(newProjectId(), [memberRow(OWNER, 'OWNER'), memberRow(M1, 'MEMBER')]);
    await seedProject(projectA);
    await seedProject(projectB);

    // A を設定モードで開いている管理者
    const store = makeStore({
      user: userState(OWNER),
      projects: [projectA, projectB],
      settings: { ...settingsInitialState, projectId: projectA.id, projectName: projectA.name, isSettingProject: true },
    });
    const { result } = renderHook(() => useProjectEdit(projectB, false), { wrapper: wrapperOf(store) });
    await flush();

    // containers/ProjectEdit.pressOpenProject(false) の手順: 設定の取得 → 開く（openProject）
    as(OWNER);
    const settings = await projectStore.downloadProjectSettings(projectB.id);
    expect(settings.isOK).toBe(true);
    act(() => result.current.openProject());
    expect(store.getState().settings.isSettingProject).toBe(false);
    expect(store.getState().settings.projectId).toBe(projectB.id);
    expect(store.getState().settings.role).toBe('OWNER');

    // 同じプロジェクトを設定モードで開き直したときは、開いた後に startProjectSetting で立て直す（pressSettingProject の順）
    act(() => result.current.openProject());
    act(() => result.current.startProjectSetting());
    expect(store.getState().settings.isSettingProject).toBe(true);
    // そこから通常の「開く」をすると再び解ける
    act(() => result.current.openProject());
    expect(store.getState().settings.isSettingProject).toBe(false);

    // 設定モードでない「保存」は uploadData（PublicAndPrivate）なので、PRIVATE は PRIVATE のまま書かれ、他メンバーには見えない
    as(OWNER);
    const up = await projectStore.uploadDataHelper(projectB.id, {
      layerId: 'L',
      userId: OWNER,
      permission: 'PRIVATE',
      data: [rec('ownerPrivate', OWNER)],
    });
    expect(up.isOK).toBe(true);
    as(M1);
    const tmpl = await projectStore.downloadTemplateData(projectB.id);
    expect(tmpl.isOK).toBe(true);
    expect((tmpl.data ?? []).flatMap((d) => d.data).map((r) => r.id)).not.toContain('ownerPrivate');
    const pub = await projectStore.downloadPublicData(projectB.id);
    expect((pub.data ?? []).flatMap((d) => d.data).map((r) => r.id)).not.toContain('ownerPrivate');
  });
});

// ---------------------------------------------------------------------------------------------
describe('A-H2: 切替の途中で失敗しても、元のプロジェクトのクラウドを空で上書きしない', () => {
  test('B を開くのに失敗したら閉じた状態に落ち、A の基準値も捨てられ、クラウドの A の自分のデータは残る', async () => {
    const projectA = makeProject(newProjectId(), [memberRow(OWNER, 'OWNER'), memberRow(M1, 'MEMBER')]);
    const projectB = makeProject(newProjectId(), [memberRow(OWNER, 'OWNER'), memberRow(M1, 'MEMBER')]);
    await seedProject(projectA);
    await seedProject(projectB);
    // M1 が A に自分の記録を上げてある（基準値もある）
    as(M1);
    const upA = await projectStore.uploadDataHelper(projectA.id, {
      layerId: 'L',
      userId: M1,
      permission: 'PRIVATE',
      data: [rec('a1', M1), rec('a2', M1)],
    });
    expect(upA.isOK).toBe(true);
    // 一覧を取った後で、M1 は B から外された（B を開くと Rules で拒否される）
    as(OWNER);
    const removed = await projectStore.updateProject({ ...projectB, membersUid: [OWNER], members: [memberRow(OWNER, 'OWNER')] });
    expect(removed.isOK).toBe(true);

    const store = makeStore({
      user: userState(M1),
      projects: [projectA, projectB],
      settings: { ...settingsInitialState, projectId: projectA.id, projectName: projectA.name, role: 'MEMBER' },
      dataSync: {
        [projectA.id]: { L_PRIVATE: upA.encryptedAt },
        [projectB.id]: { L_PRIVATE: 1 },
      },
      dataSet: [{ layerId: 'L', userId: M1, data: [rec('a1', M1), rec('a2', M1)] }],
    });
    const { result } = renderHook(() => useProjectEdit(projectB, false), { wrapper: wrapperOf(store) });
    await flush();

    // containers/ProjectEdit.pressOpenProject の手順を同じ順で: 基準値を捨てる → 手元を空にして設定を取得 → 失敗 → 閉じる
    const isProjectOpen = store.getState().settings.projectId !== undefined;
    act(() => result.current.discardSyncBaselines());
    const hasTouchedLocal = true;
    store.dispatch(setDataSetAction([])); // useRepository.downloadProjectSettings の「データを最初に削除」
    as(M1);
    const opened = await projectStore.downloadProjectSettings(projectB.id);
    expect(opened.isOK).toBe(false);
    if (hasTouchedLocal && isProjectOpen) clearProjectLike(store);

    const state = store.getState();
    expect(state.settings.projectId).toBeUndefined();
    expect(state.settings.projectName).toBeUndefined();
    expect(state.dataSync[projectA.id]).toBeUndefined();
    expect(state.dataSync[projectB.id]).toBeUndefined();
    // 閉じているので useProject.project は undefined になり、uploadData は送らずに失敗する
    expect(state.projects.find((p) => p.id === state.settings.projectId)).toBeUndefined();

    // クラウドの A の自分のデータはそのまま
    as(M1);
    const cloudA = await projectStore.downloadPrivateData(projectA.id, { userId: M1 });
    expect(cloudA.isOK).toBe(true);
    expect((cloudA.data ?? []).flatMap((d) => d.data).map((r) => r.id).sort()).toEqual(['a1', 'a2']);
    // 開き直して送るときも、基準値が無いのでクラウドの版がある＝必ず内容を比べる候補になる（useRepository の衝突判定の入力）
    const versions = await projectStore.getMyDataUpdatedAt(projectA.id, M1);
    expect(versions.isOK).toBe(true);
    expect(versions.data?.get('L_PRIVATE')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------------------------
describe('A-M2: 一覧の再読み込みに失敗しても、開いているプロジェクトの送受信が壊れない', () => {
  test('本物の useProjects.fetchProjects が圏外で失敗しても一覧は残り、開いているプロジェクトへ送受信できる', async () => {
    const projectA = makeProject(newProjectId(), [memberRow(OWNER, 'OWNER'), memberRow(M2, 'MEMBER')]);
    await seedProject(projectA);
    const store = makeStore({
      user: userState(M2),
      settings: { ...settingsInitialState, projectId: projectA.id, projectName: projectA.name, role: 'MEMBER' },
    });
    as(M2);
    const { result } = renderHook(() => useProjects(), { wrapper: wrapperOf(store) });

    // オンラインで一覧を取る
    let res: { isOK: boolean; message: string } = { isOK: false, message: '' };
    await act(async () => {
      res = await result.current.fetchProjects();
    });
    expect(res.isOK).toBe(true);
    expect(store.getState().projects.map((p) => p.id)).toContain(projectA.id);

    // 圏外で再読み込み
    mockNet.offline = true;
    await act(async () => {
      res = await result.current.fetchProjects();
    });
    expect(res.isOK).toBe(false);
    expect(res.message).toBe('common.message.failGetProjects');
    expect(store.getState().projects.map((p) => p.id)).toContain(projectA.id);
    // アーカイブ表示の切替でも同じ
    await act(async () => {
      res = await result.current.toggleShowArchive();
    });
    expect(res.isOK).toBe(false);
    expect(store.getState().projects.map((p) => p.id)).toContain(projectA.id);

    // useProject の project（projects.find(projectId)）が引けるので、送信・受信は続けられる
    mockNet.offline = false;
    const state = store.getState();
    const project = state.projects.find((p) => p.id === state.settings.projectId);
    expect(project).toBeDefined();
    as(M2);
    const up = await projectStore.uploadDataHelper(project!.id, {
      layerId: 'P',
      userId: M2,
      permission: 'PUBLIC',
      data: [rec('m2pub', M2)],
    });
    expect(up.isOK).toBe(true);
    const down = await projectStore.downloadPublicData(project!.id);
    expect((down.data ?? []).flatMap((d) => d.data).map((r) => r.id)).toContain('m2pub');
  });
});

// ---------------------------------------------------------------------------------------------
describe('A-H3: 保留メンバーの再チェックで一般メンバーが開ける', () => {
  test('一般メンバーでは再チェックで「変更あり」にならず（開くが有効）、プロジェクトを開ける。管理者が保存すると保留メンバーも開ける', async () => {
    const pendingRow = { uid: null, email: emailOf(PENDING), verified: 'NO_ACCOUNT' as const, role: 'MEMBER' as const };
    const project = makeProject(newProjectId(), [memberRow(OWNER, 'OWNER'), memberRow(M1, 'MEMBER'), pendingRow]);
    await seedProject(project);
    // 保留メンバーはその後アカウントと暗号化キーを登録した
    mockRegistered.add(PENDING);

    // 一般メンバー M1 がプロジェクト画面を開く
    as(M1);
    const listed = await projectStore.getAllProjects(M1);
    const fromList = listed.projects.find((p) => p.id === project.id);
    expect(fromList).toBeDefined();
    const memberStore = makeStore({ user: userState(M1), projects: listed.projects });
    const member = renderHook(() => useProjectEdit(fromList!, false), { wrapper: wrapperOf(memberStore) });
    await flush();
    await flush();
    // 再チェックで保留メンバーは HOLD（オレンジ）になるが、保存できない一般メンバーでは変更ありにしない
    expect(member.result.current.targetProject.members.find((m) => m.email === emailOf(PENDING))?.verified).toBe('HOLD');
    expect(member.result.current.isEdited).toBe(false); // pages/ProjectEdit の「開く」は disabled={isEdited}
    // 開く（pressOpenProject の手順）: 設定の取得 → openProject
    const settings = await projectStore.downloadProjectSettings(project.id);
    expect(settings.isOK).toBe(true);
    act(() => member.result.current.openProject());
    expect(memberStore.getState().settings.projectId).toBe(project.id);
    expect(memberStore.getState().settings.role).toBe('MEMBER');

    // 管理者では変更ありになり、保存すると保留メンバーが membersUid に入って開けるようになる
    as(OWNER);
    const ownerStore = makeStore({ user: userState(OWNER), projects: [fromList!] });
    const owner = renderHook(() => useProjectEdit(fromList!, false), { wrapper: wrapperOf(ownerStore) });
    await flush();
    await flush();
    expect(owner.result.current.isEdited).toBe(true);
    let checked: Awaited<ReturnType<typeof owner.result.current.checkedProject>> | undefined;
    await act(async () => {
      checked = await owner.result.current.checkedProject();
    });
    expect(checked?.isOK).toBe(true);
    expect(checked?.project?.membersUid.sort()).toEqual([M1, OWNER, PENDING].sort());
    const saved = await projectStore.updateProject(checked!.project!);
    expect(saved.isOK).toBe(true);
    as(PENDING);
    const pendingList = await projectStore.getAllProjects(PENDING);
    expect(pendingList.projects.map((p) => p.id)).toContain(project.id);
    expect((await projectStore.downloadProjectSettings(project.id)).isOK).toBe(true);
  });

  test('再チェックの照会に失敗しても一般メンバーの「開く」は無効にならない', async () => {
    const pendingRow = { uid: null, email: `${RUN}_nobody@example.com`, verified: 'NO_ACCOUNT' as const, role: 'MEMBER' as const };
    const project = makeProject(newProjectId(), [memberRow(OWNER, 'OWNER'), memberRow(M1, 'MEMBER'), pendingRow]);
    await seedProject(project);
    as(M1);
    const store = makeStore({ user: userState(M1), projects: [project] });
    const member = renderHook(() => useProjectEdit(project, false), { wrapper: wrapperOf(store) });
    await flush();
    expect(member.result.current.isEdited).toBe(false);
    expect(member.result.current.targetProject.members.find((m) => m.uid === null)?.verified).toBe('NO_ACCOUNT');
  });
});

// ---------------------------------------------------------------------------------------------
describe('A-L15: メールの大文字小文字の重複', () => {
  test('大文字小文字だけ違うメールは足されず、旧データの重複行は保存前に止まり、片方を消して保存すると管理者権限が本当に外れる', async () => {
    // 旧データ: 同じ人が大文字小文字違いで2行（片方 ADMIN）。membersUid にも同じ uid が2つ入っている
    const id = newProjectId();
    const legacy: ProjectType = {
      id,
      name: `legacy-${id.slice(-6)}`,
      members: [
        memberRow(OWNER, 'OWNER'),
        { uid: TARO, email: emailOf(TARO).toUpperCase(), verified: 'OK', role: 'ADMIN' },
        { uid: TARO, email: emailOf(TARO), verified: 'OK', role: 'MEMBER' },
      ],
      ownerUid: OWNER,
      adminsUid: [OWNER, TARO],
      membersUid: [OWNER, TARO, TARO],
      abstract: '',
      storage: { count: 0 },
    };
    await seedProject(legacy);
    // Rules は membersUid の重複を拒まない（今の状態の確認）
    expect(((await rawProjectDoc(id))?.membersUid as string[]).length).toBe(3);

    const store = makeStore({ user: userState(OWNER), projects: [legacy] });
    const { result } = renderHook(() => useProjectEdit(legacy, false), { wrapper: wrapperOf(store) });
    await flush();

    // 追加: 大文字小文字違いは足さない。新しい人は小文字で足す
    act(() => result.current.addMembers(`${emailOf(TARO).toUpperCase()} ${emailOf(M2).toUpperCase()}`));
    const emails = result.current.targetProject.members.map((m) => m.email);
    expect(emails.filter((e) => e.toLowerCase() === emailOf(TARO))).toHaveLength(2); // 旧データの2行のまま
    expect(emails).toContain(emailOf(M2));
    expect(emails).not.toContain(emailOf(M2).toUpperCase());

    // 保存前の確認: 大文字小文字違いの重複行があるので止まる
    let checked: Awaited<ReturnType<typeof result.current.checkedProject>> | undefined;
    await act(async () => {
      checked = await result.current.checkedProject();
    });
    expect(checked?.isOK).toBe(false);
    expect(checked?.message).toBe('hooks.message.duplicateMembers');

    // ADMIN の行を消して保存し直す
    const adminIdx = result.current.targetProject.members.findIndex((m) => m.role === 'ADMIN');
    act(() => result.current.deleteMember(adminIdx));
    await act(async () => {
      checked = await result.current.checkedProject();
    });
    expect(checked?.isOK).toBe(true);
    const project = checked!.project!;
    expect(project.membersUid.filter((u) => u === TARO)).toHaveLength(1);
    expect(project.adminsUid).not.toContain(TARO);
    expect(project.members.every((m) => m.email === m.email.toLowerCase())).toBe(true);
    as(OWNER);
    expect((await projectStore.updateProject(project)).isOK).toBe(true);
    const raw = await rawProjectDoc(id);
    expect(raw?.adminsUid).toEqual([OWNER]);
    expect((raw?.membersUid as string[]).filter((u) => u === TARO)).toHaveLength(1);

    // TARO は読めるが、設定はもう書けない（管理者権限が本当に外れた）
    as(TARO);
    expect((await projectStore.downloadProjectSettings(id)).isOK).toBe(true);
    const write = await projectStore.uploadProjectSettings(id, TARO, settingsOf());
    expect(write.isOK).toBe(false);
  });

  test('別のメールが同じアカウントに解決されたら、保存前に止める（uid の重複）', async () => {
    const id = newProjectId();
    const project = makeProject(id, [memberRow(OWNER, 'OWNER')]);
    await seedProject(project);
    mockAuthDirectory[`${RUN}_alias@example.com`] = M1;
    mockAuthDirectory[emailOf(M1)] = M1;
    const store = makeStore({ user: userState(OWNER), projects: [project] });
    const { result } = renderHook(() => useProjectEdit(project, false), { wrapper: wrapperOf(store) });
    await flush();
    act(() => result.current.addMembers(`${emailOf(M1)} ${RUN}_alias@example.com`));
    let checked: Awaited<ReturnType<typeof result.current.checkedProject>> | undefined;
    await act(async () => {
      checked = await result.current.checkedProject();
    });
    expect(checked?.isOK).toBe(false);
    expect(checked?.message).toBe('hooks.message.duplicateMemberAccounts');
  });
});

// ---------------------------------------------------------------------------------------------
describe('M-M20: 新規プロジェクトの既定設定の mapType が tileMaps から導かれる', () => {
  /** useRepository.uploadDefaultProjectSettings と同じ値で既定の設定を書く */
  const defaultSettings = (language: string): ProjectSettingsType => {
    const tileMaps = createInitialTileMaps(language);
    return settingsOf({ tileMaps, mapType: mapTypeFromTileMaps(tileMaps) ?? 'none' });
  };
  /** useRepository.downloadProjectSettings が手元に入れる mapType */
  const openedMapType = (s: ProjectSettingsType) => mapTypeFromTileMaps(s.tileMaps) ?? s.mapType;

  test.each([
    ['en', 'standard'],
    ['ja', 'none'],
  ])('%s 環境で作ったプロジェクトは、保存値もメンバーが開いた値も一覧の表示と一致する（%s）', async (language, expected) => {
    const project = makeProject(newProjectId(), [memberRow(OWNER, 'OWNER'), memberRow(M1, 'MEMBER')]);
    await seedProject(project, defaultSettings(language));
    as(M1);
    const res = await projectStore.downloadProjectSettings(project.id);
    expect(res.isOK).toBe(true);
    const s = res.data!;
    expect(s.mapType).toBe(expected);
    expect(openedMapType(s)).toBe(expected);
    const standard = s.tileMaps.find((m) => m.id === 'standard');
    expect(standard?.visible).toBe(expected === 'standard');
  });

  test('以前の既定（mapType が none なのに標準地図が表示）で保存されたプロジェクトも、開くと standard になる', async () => {
    const project = makeProject(newProjectId(), [memberRow(OWNER, 'OWNER'), memberRow(M1, 'MEMBER')]);
    await seedProject(project, settingsOf({ tileMaps: createInitialTileMaps('en'), mapType: 'none' }));
    as(M1);
    const res = await projectStore.downloadProjectSettings(project.id);
    expect(res.data?.mapType).toBe('none');
    expect(openedMapType(res.data!)).toBe('standard');
  });

  test('衛星写真で閉じても、閉じた後の mapType は初期の一覧（標準地図）と一致する', () => {
    const store = makeStore({ user: userState(M1), settings: { ...settingsInitialState, projectId: 'x', mapType: 'hybrid' } });
    clearProjectLike(store);
    expect(store.getState().settings.mapType).toBe(mapTypeFromTileMaps(store.getState().tileMaps));
    expect(store.getState().settings.mapType).toBe('standard');
  });
});

// ---------------------------------------------------------------------------------------------
describe('M-M4 / M-M17 / M-H6 副因: 共有スタイル・地図の共有設定', () => {
  const putStyle = async (uid: string, projectId: string, mapId: string, body: string) => {
    const ctx = testEnv.authenticatedContext(uid, { email: emailOf(uid), email_verified: true });
    const ref = ctx.storage().ref(`projects/${projectId}/STYLE/${mapId}`);
    await ref.put(new TextEncoder().encode(body), { contentType: 'application/json' }).then();
    return (await ref.getDownloadURL()) as string;
  };
  const pmtilesMap = (id: string, styleURL?: string, encryptKey?: string): TileMapType =>
    ({
      id,
      name: id,
      url: `https://example.com/${id}.pmtiles`,
      attribution: '',
      maptype: 'none',
      visible: true,
      transparency: 0,
      overzoomThreshold: 18,
      highResolutionEnabled: false,
      minimumZ: 0,
      maximumZ: 16,
      flipY: false,
      styleURL,
      encryptKey,
    } as unknown as TileMapType);

  /**
   * useRepository.downloadStyle のループ（M-M4 修正後）を同じ順で再現する。ネイティブの storage.downloadStyle は
   * FileSystem.downloadAsync(url) でトークン付き URL を取るので、ここでは fetch で取る（復号は対象外）
   */
  const downloadStylesLike = async (tileMaps: TileMapType[]) => {
    const fetched: string[] = [];
    const failedNames: string[] = [];
    for (const tileMap of tileMaps) {
      if (tileMap.styleURL === undefined || tileMap.encryptKey === undefined) continue;
      const url = tileMap.styleURL.startsWith('style://') ? tileMap.styleURL.replace('style://', '') : tileMap.styleURL;
      const res = await fetch(url);
      if (res.status !== 200) {
        failedNames.push(tileMap.name);
        continue;
      }
      fetched.push(await res.text());
    }
    return { fetched, failedNames };
  };

  test('M-M4: 共有スタイルが2つ以上あるとき、メンバーが開くと全部取り込まれる（途中の1つが失敗しても残りは続く）', async () => {
    const project = makeProject(newProjectId(), [memberRow(OWNER, 'OWNER'), memberRow(M1, 'MEMBER')]);
    const url1 = await (async () => {
      await seedProject(project);
      return putStyle(OWNER, project.id, 'map1', '{"name":"s1"}');
    })();
    const url2 = await putStyle(OWNER, project.id, 'map2', '{"name":"s2"}');
    const url3 = await putStyle(OWNER, project.id, 'map3', '{"name":"s3"}');
    const tileMaps = [
      pmtilesMap('map1', `style://${url1}`, 'k1'),
      pmtilesMap('map2', `style://${url2}`, 'k2'),
      pmtilesMap('map3', `style://${url3}`, 'k3'),
    ];
    as(OWNER);
    expect((await projectStore.uploadProjectSettings(project.id, OWNER, settingsOf({ tileMaps }))).isOK).toBe(true);
    // map2 のスタイルが何らかの理由で消えた（途中の失敗）
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.storage().ref(`projects/${project.id}/STYLE/map2`).delete();
    });

    as(M1);
    const settings = await projectStore.downloadProjectSettings(project.id);
    expect(settings.isOK).toBe(true);
    const { fetched, failedNames } = await downloadStylesLike(settings.data!.tileMaps);
    expect(fetched.sort()).toEqual(['{"name":"s1"}', '{"name":"s3"}']);
    expect(failedNames).toEqual(['map2']);
  });

  test('M-M17: blob: の地図（Web で取り込んだ PMTiles）はスタイルが付いていても共有設定に載らない', async () => {
    const project = makeProject(newProjectId(), [memberRow(OWNER, 'OWNER'), memberRow(M1, 'MEMBER')]);
    await seedProject(project);
    const local: TileMapType[] = [
      { ...pmtilesMap('localPm'), url: 'pmtiles://blob:https://ecorismap.web.app/1234', styleURL: 'style://style.json' },
      pmtilesMap('shared'),
    ];
    // useRepository.uploadTileMaps の判定順（blob: のスキップが style:// の分岐より先）を再現する
    const uploaded = local.filter((m) => !m.url.includes('blob:'));
    as(OWNER);
    expect((await projectStore.uploadProjectSettings(project.id, OWNER, settingsOf({ tileMaps: uploaded }))).isOK).toBe(true);
    as(M1);
    const res = await projectStore.downloadProjectSettings(project.id);
    expect(res.data!.tileMaps.map((m) => m.id)).toEqual(['shared']);
    expect(res.data!.tileMaps.some((m) => m.url.includes('blob:'))).toBe(false);
  });

  describe('M-H6 副因: 設定の反映で地図の片付けが要るかの判定', () => {
    const legacyHillshade = 'hillshade://https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png';
    const baseMaps = (): TileMapType[] => [
      ...createInitialTileMaps('ja'),
      { ...pmtilesMap('hs'), url: legacyHillshade },
      { ...pmtilesMap('xyz'), url: 'https://tiles.example.com/{z}/{x}/{y}.png' },
      { ...pmtilesMap('vec'), styleURL: 'https://example.com/style.json' },
    ];

    test('前提: 旧形式の陰影起伏 URL は移行の対象', () => {
      expect(needsMapterhornUrl(legacyHillshade)).toBe(true);
    });

    test('管理者が地図を変えずに保存し直しても、メンバーが開き直したときに片付けの対象にならない', async () => {
      const project = makeProject(newProjectId(), [memberRow(OWNER, 'OWNER'), memberRow(M1, 'MEMBER')]);
      await seedProject(project, settingsOf({ tileMaps: baseMaps() }));
      // メンバーが一度開いた後の手元（開いた直後に標高移行が陰影起伏の URL を書き換える）
      as(M1);
      const first = await projectStore.downloadProjectSettings(project.id);
      const local = withMapterhornDemUrls(first.data!.tileMaps);
      // 管理者が何も変えずに保存し直す（ネイティブの管理者の手元は旧 URL のまま上がることもある）
      as(OWNER);
      expect((await projectStore.uploadProjectSettings(project.id, OWNER, settingsOf({ tileMaps: baseMaps() }))).isOK).toBe(true);
      as(M1);
      const second = await projectStore.downloadProjectSettings(project.id);
      // useRepository.downloadProjectSettings → discardStaleTileSources の判定と同じ入力
      expect(findTileSourceChanges(local, withMapterhornDemUrls(second.data!.tileMaps))).toEqual([]);
      // 署名付き配信の署名だけが付いた手元でも同じ
      const signed = local.map((m) => (m.id === 'xyz' ? { ...m, url: `${m.url}?expires=1&sig=abc` } : m));
      expect(findTileSourceChanges(signed, withMapterhornDemUrls(second.data!.tileMaps))).toEqual([]);
    });

    test('管理者が地図の URL を差し替えたら、その地図だけが片付けの対象になる', async () => {
      const project = makeProject(newProjectId(), [memberRow(OWNER, 'OWNER'), memberRow(M1, 'MEMBER')]);
      await seedProject(project, settingsOf({ tileMaps: baseMaps() }));
      as(M1);
      const local = withMapterhornDemUrls((await projectStore.downloadProjectSettings(project.id)).data!.tileMaps);
      as(OWNER);
      const changed = baseMaps().map((m) => (m.id === 'xyz' ? { ...m, url: 'https://tiles2.example.com/{z}/{x}/{y}.png' } : m));
      expect((await projectStore.uploadProjectSettings(project.id, OWNER, settingsOf({ tileMaps: changed }))).isOK).toBe(true);
      as(M1);
      const next = withMapterhornDemUrls((await projectStore.downloadProjectSettings(project.id)).data!.tileMaps);
      expect(findTileSourceChanges(local, next)).toEqual([
        { id: 'xyz', cleanup: { source: true, renderedTiles: true, style: false } },
      ]);
    });

    // TODO(tmizu23): 方針決定後 - 保存のたびにスタイルを暗号化し直すため URL が変わる既知の不具合。直し方（内容ハッシュのパスか、内容比較で引き継ぐか）が決まるまで skip
    test.skip('Web の管理者がスタイルを変えずに設定を保存し直しても、共有スタイルの URL は変わらない（描画済みタイルを捨てさせない）', async () => {
      // useRepository.uploadTileMaps（Web）は style:// の地図のスタイルを保存のたびに同じパスへ上げ直し、
      // getDownloadURL の URL を styleURL として設定に書く。URL のトークンが上げ直しで変わると、
      // メンバーが開き直すたびにスタイルの変更とみなされ、描画済みタイルが捨てられる
      const project = makeProject(newProjectId(), [memberRow(OWNER, 'OWNER'), memberRow(M1, 'MEMBER')]);
      await seedProject(project);
      const firstUrl = await putStyle(OWNER, project.id, 'vec', '{"name":"same"}');
      const secondUrl = await putStyle(OWNER, project.id, 'vec', '{"name":"same"}');
      // 前提の確認: 同じパス・同じ内容で、違うのはダウンロードトークンだけ
      const withoutToken = (u: string) => u.replace(/([?&])token=[^&]*/, '$1token=');
      expect(withoutToken(secondUrl)).toBe(withoutToken(firstUrl));
      const local = [pmtilesMap('vec', `style://${firstUrl}`, 'k')];
      const next = [pmtilesMap('vec', `style://${secondUrl}`, 'k2')];
      expect(findTileSourceChanges(local, next)).toEqual([]);
    });
  });
});

