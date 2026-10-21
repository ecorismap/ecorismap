import { decryptProjectData, clearProjectCryptoCache, getAllProjects } from '../firestore';
import { unwrapDEK, decryptEThree } from '../../virgilsecurity/e3kit';
import { decryptWithDEK } from '../../virgilsecurity/dek';
import { getDoc, getDocsFromServer } from '../firebase';

jest.mock('../../../constants/AppConstants', () => ({
  FUNC_ENCRYPTION: true,
  CREATE_DEK_PROJECTS: true,
}));

jest.mock('../../virgilsecurity/e3kit', () => ({
  decryptEThree: jest.fn(),
  encryptEThree: jest.fn(),
  wrapDEKForMember: jest.fn(),
  unwrapDEK: jest.fn(),
}));

jest.mock('../../virgilsecurity/dek', () => ({
  createProjectDEK: jest.fn(),
  encryptWithDEK: jest.fn(),
  decryptWithDEK: jest.fn(),
}));

jest.mock('../../../i18n/config', () => ({ t: jest.fn((key: string) => key) }));

jest.mock('../firebase', () => ({
  auth: { currentUser: { uid: 'member-b' } },
  firestore: {},
  functions: {},
  firebaseReady: Promise.resolve(),
  // doc() はパス文字列を返し、getDoc() がパスで結果を引けるようにする
  doc: jest.fn((_db: unknown, ...segments: string[]) => segments.join('/')),
  getDoc: jest.fn(),
  collection: jest.fn(),
  deleteDoc: jest.fn(),
  getDocs: jest.fn(),
  getDocsFromServer: jest.fn(),
  httpsCallable: jest.fn(),
  query: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  where: jest.fn(),
  writeBatch: jest.fn(),
  Timestamp: { now: jest.fn(() => ({ seconds: 0, nanoseconds: 0 })) },
}));

const mockedGetDoc = getDoc as jest.Mock;
const mockedUnwrapDEK = unwrapDEK as jest.Mock;
const mockedDecryptWithDEK = decryptWithDEK as jest.Mock;
const mockedDecGroup = decryptEThree as jest.Mock;
const mockedGetDocsFromServer = getDocsFromServer as jest.Mock;

const PROJECT_ID = 'project-1';
const ENCRYPTED_AT = new Date('2026-07-01T00:00:00Z');
const TS = { seconds: 0, nanoseconds: 0 };

const setupFirestoreDocs = () => {
  mockedGetDoc.mockImplementation(async (path: string) => {
    if (path === `projects/${PROJECT_ID}`) {
      return { data: () => ({ cryptoScheme: 'dek', dekPublicKey: 'PUB_KEY' }) };
    }
    if (path === `projects/${PROJECT_ID}/keys/member-b`) {
      return { data: () => ({ encDek: 'WRAPPED_DEK', wrapperUid: 'admin-a', encryptedAt: TS }) };
    }
    return { data: () => undefined };
  });
};

describe('decryptProjectData (DEKプロジェクトの鍵キャッシュ)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearProjectCryptoCache();
    setupFirestoreDocs();
    // グループ暗号フォールバックは常に失敗させる（DEKプロジェクトにグループは無い）
    mockedDecGroup.mockResolvedValue(undefined);
    mockedDecryptWithDEK.mockImplementation(async (_encdata: string[], dekPrivateKey: string) =>
      dekPrivateKey === 'DEK_PRIV' ? { value: 'decrypted' } : undefined
    );
  });

  it('unwrap成功時はDEKがキャッシュされ、2回目以降はkeysを再読み取りしない', async () => {
    mockedUnwrapDEK.mockResolvedValue('DEK_PRIV');

    const first = await decryptProjectData(ENCRYPTED_AT, ['enc'], 'member-b', PROJECT_ID);
    const second = await decryptProjectData(ENCRYPTED_AT, ['enc'], 'member-b', PROJECT_ID);

    expect(first).toEqual({ value: 'decrypted' });
    expect(second).toEqual({ value: 'decrypted' });
    expect(mockedUnwrapDEK).toHaveBeenCalledTimes(1);
  });

  it('unwrap失敗は負キャッシュせず、再共有後の再取得だけで復号が回復する', async () => {
    // キーリセット直後: 旧公開鍵でラップされたままなので unwrap は失敗する
    mockedUnwrapDEK.mockResolvedValueOnce(undefined);
    const beforeReshare = await decryptProjectData(ENCRYPTED_AT, ['enc'], 'member-b', PROJECT_ID);
    expect(beforeReshare).toBeUndefined();

    // 管理者が新しい公開鍵でDEKを再ラップ（keys/{uid} が更新され unwrap が通るようになる）
    mockedUnwrapDEK.mockResolvedValue('DEK_PRIV');
    const afterReshare = await decryptProjectData(ENCRYPTED_AT, ['enc'], 'member-b', PROJECT_ID);

    // ログアウトやプロジェクトを開く操作なしで（＝キャッシュクリアなしで）回復すること
    expect(afterReshare).toEqual({ value: 'decrypted' });
    expect(mockedUnwrapDEK).toHaveBeenCalledTimes(2);
  });
});

describe('getAllProjects (復号ペイロードによる平文フィールドの上書き防止)', () => {
  const projectDoc = {
    id: PROJECT_ID,
    data: () => ({
      encdata: ['enc'],
      ownerUid: 'owner-a',
      encryptedAt: TS,
      storage: { count: 3 },
      adminsUid: ['owner-a'],
      membersUid: ['owner-a', 'member-b'],
    }),
  };

  const loadProjectsWithPayload = async (payload: Record<string, unknown>) => {
    // 1回目はプロジェクト一覧、以降は設定の更新日時（設定なし）の取得
    mockedGetDocsFromServer.mockResolvedValueOnce({ docs: [projectDoc] });
    mockedGetDocsFromServer.mockResolvedValue({ empty: true, docs: [] });
    mockedDecGroup.mockResolvedValue(payload);
    const { projects } = await getAllProjects('member-b');
    return projects;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    clearProjectCryptoCache();
  });

  it('ペイロードに仕込んだ id / ownerUid / storage は無視され、平文の値が使われる', async () => {
    // 管理者が encdata に別プロジェクトのIDや偽のオーナーを入れても、一覧の項目は本物のdocを指す
    const projects = await loadProjectsWithPayload({
      name: 'B（更新）',
      id: 'victim-project-b',
      ownerUid: 'attacker',
      storage: { count: 999 },
      members: [{ uid: 'attacker', role: 'OWNER' }],
    });

    expect(projects).toHaveLength(1);
    expect(projects[0].id).toBe(PROJECT_ID);
    expect(projects[0].ownerUid).toBe('owner-a');
    expect(projects[0].storage).toEqual({ count: 3 });
    // 平文の adminsUid / membersUid もペイロードより優先される
    expect(projects[0].adminsUid).toEqual(['owner-a']);
    expect(projects[0].membersUid).toEqual(['owner-a', 'member-b']);
    // 暗号化されている本来の項目（名前・メンバー一覧）はペイロードから取る
    expect(projects[0].name).toBe('B（更新）');
  });

  it('ペイロードの adminsUid / membersUid は平文の値を上書きしない', async () => {
    const projects = await loadProjectsWithPayload({
      name: 'P',
      adminsUid: ['attacker'],
      membersUid: ['attacker'],
    });

    expect(projects[0].adminsUid).toEqual(['owner-a']);
    expect(projects[0].membersUid).toEqual(['owner-a', 'member-b']);
  });

  it('正規のペイロードでは従来どおりの値になる', async () => {
    const members = [
      { uid: 'owner-a', email: 'a@example.com', role: 'OWNER' },
      { uid: 'member-b', email: 'b@example.com', role: 'MEMBER' },
    ];
    const projects = await loadProjectsWithPayload({ name: 'P', members, abstract: 'x' });

    expect(projects[0]).toMatchObject({
      id: PROJECT_ID,
      ownerUid: 'owner-a',
      storage: { count: 3 },
      name: 'P',
      members,
      abstract: 'x',
      cryptoScheme: 'group',
      archived: false,
      settingsEncryptedAt: undefined,
    });
  });
});
