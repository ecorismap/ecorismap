import {
  migrateSelfDataToDEK,
  uploadDataHelper,
  clearProjectCryptoCache,
  collectUnmarkedDekGroups,
  SelfMigrationInputType,
} from '../firestore';
import { unwrapDEK } from '../../virgilsecurity/e3kit';
import { encryptWithDEK } from '../../virgilsecurity/dek';
import { getDoc, getDocs, writeBatch } from '../firebase';

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
  Timestamp: { now: jest.fn(() => ({ seconds: 0, nanoseconds: 0, toMillis: () => 0 })) },
}));

const mockedGetDoc = getDoc as jest.Mock;
const mockedGetDocs = getDocs as jest.Mock;
const mockedWriteBatch = writeBatch as jest.Mock;
const mockedUnwrapDEK = unwrapDEK as jest.Mock;
const mockedEncryptWithDEK = encryptWithDEK as jest.Mock;

const PROJECT_ID = 'project-1';
const UID = 'member-b';
const TS = { seconds: 0, nanoseconds: 0 };

// projects doc / keys doc（DEKプロジェクト）
const setupDekProject = () => {
  mockedGetDoc.mockImplementation(async (path: string) => {
    if (path === `projects/${PROJECT_ID}`) {
      return { data: () => ({ cryptoScheme: 'dek', dekPublicKey: 'PUB_KEY' }) };
    }
    if (path === `projects/${PROJECT_ID}/keys/${UID}`) {
      return { data: () => ({ encDek: 'WRAPPED_DEK', wrapperUid: 'admin-a', encryptedAt: TS }) };
    }
    return { data: () => undefined };
  });
  mockedUnwrapDEK.mockResolvedValue('DEK_PRIV');
};

// data doc のスナップショット（生のDataFS）
const dataDoc = (fields: Record<string, unknown>) => ({ data: () => fields, ref: `ref-${fields.layerId}` });

// writeBatch の set 呼び出しを記録するモック
const batches: { set: jest.Mock; delete: jest.Mock; commit: jest.Mock }[] = [];
const setupWriteBatch = () => {
  batches.length = 0;
  mockedWriteBatch.mockImplementation(() => {
    const b = { set: jest.fn(), delete: jest.fn(), commit: jest.fn().mockResolvedValue(undefined) };
    batches.push(b);
    return b;
  });
};
const allSetCalls = () => batches.flatMap((b) => b.set.mock.calls);

// migrateSelfDataToDEK への入力（ダウンロード済みデータの代役）
const inputWith = (over: Partial<SelfMigrationInputType>): SelfMigrationInputType => ({
  unmarkedGroups: [],
  privateData: [],
  publicData: [],
  ...over,
});

describe('collectUnmarkedDekGroups (印なしグループの算出)', () => {
  it('印なしdocを含むグループをuserId×layerIdで重複なく返す', () => {
    const docs = [
      dataDoc({ userId: UID, layerId: 'layer-1', permission: 'PRIVATE', chunkIndex: 0 }),
      dataDoc({ userId: UID, layerId: 'layer-1', permission: 'PRIVATE', chunkIndex: 1 }), // 同一グループの別チャンク
      dataDoc({ userId: 'other', layerId: 'layer-2', permission: 'PRIVATE', chunkIndex: 0 }),
    ];
    expect(collectUnmarkedDekGroups(docs, 'PRIVATE')).toEqual([
      { userId: UID, layerId: 'layer-1', permission: 'PRIVATE' },
      { userId: 'other', layerId: 'layer-2', permission: 'PRIVATE' },
    ]);
  });

  it('全docに印があれば空配列を返す', () => {
    const docs = [
      dataDoc({ userId: UID, layerId: 'layer-1', permission: 'PUBLIC', chunkIndex: 0, cryptoScheme: 'dek' }),
    ];
    expect(collectUnmarkedDekGroups(docs, 'PUBLIC')).toEqual([]);
  });
});

describe('migrateSelfDataToDEK (自己DEK移行)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearProjectCryptoCache();
    setupDekProject();
    setupWriteBatch();
    mockedEncryptWithDEK.mockResolvedValue(['ENC_DEK_DATA']);
  });

  it('印なしの自分のグループを移行し、cryptoScheme印付きで書き戻す（追加ダウンロードなし）', async () => {
    mockedGetDocs.mockResolvedValueOnce({ docs: [] }); // uploadDataHelper内の既存doc取得

    const res = await migrateSelfDataToDEK(
      PROJECT_ID,
      inputWith({
        unmarkedGroups: [{ userId: UID, layerId: 'layer-1', permission: 'PRIVATE' }],
        privateData: [{ userId: UID, layerId: 'layer-1', data: [{ id: 'r1' }] as any }],
      })
    );

    expect(res).toEqual({ isOK: true, message: '', migratedCount: 1, failedCount: 0 });
    // 書き戻しはDEKで暗号化され、印が付く
    const setCalls = allSetCalls();
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0][1]).toEqual(
      expect.objectContaining({
        userId: UID,
        layerId: 'layer-1',
        permission: 'PRIVATE',
        encdata: ['ENC_DEK_DATA'],
        cryptoScheme: 'dek',
      })
    );
    // data サブコレクションへのクエリは書き戻し時の既存doc削除の1回だけ（判定用の追加ダウンロードが無い）
    expect(mockedGetDocs).toHaveBeenCalledTimes(1);
  });

  it('対象グループが無ければ通信ゼロで即終了する', async () => {
    const res = await migrateSelfDataToDEK(PROJECT_ID, inputWith({}));

    expect(res).toEqual({ isOK: true, message: '', migratedCount: 0, failedCount: 0 });
    expect(mockedGetDoc).not.toHaveBeenCalled();
    expect(mockedGetDocs).not.toHaveBeenCalled();
    expect(mockedWriteBatch).not.toHaveBeenCalled();
  });

  it('他人の印なしグループは対象にしない', async () => {
    const res = await migrateSelfDataToDEK(
      PROJECT_ID,
      inputWith({
        unmarkedGroups: [{ userId: 'other-user', layerId: 'layer-1', permission: 'PUBLIC' }],
        publicData: [{ userId: 'other-user', layerId: 'layer-1', data: [{ id: 'r1' }] as any }],
      })
    );

    expect(res).toEqual({ isOK: true, message: '', migratedCount: 0, failedCount: 0 });
    expect(mockedWriteBatch).not.toHaveBeenCalled();
  });

  it('groupプロジェクトでは何もしない', async () => {
    mockedGetDoc.mockImplementation(async (path: string) => {
      if (path === `projects/${PROJECT_ID}`) {
        return { data: () => ({}) }; // cryptoSchemeなし = group
      }
      return { data: () => undefined };
    });

    const res = await migrateSelfDataToDEK(
      PROJECT_ID,
      inputWith({
        unmarkedGroups: [{ userId: UID, layerId: 'layer-1', permission: 'PRIVATE' }],
        privateData: [{ userId: UID, layerId: 'layer-1', data: [{ id: 'r1' }] as any }],
      })
    );

    expect(res).toEqual({ isOK: true, message: '', migratedCount: 0, failedCount: 0 });
    expect(mockedWriteBatch).not.toHaveBeenCalled();
  });

  it('DEK秘密鍵を開封できない（再共有待ち等）場合は何もしない', async () => {
    mockedUnwrapDEK.mockResolvedValue(undefined);

    const res = await migrateSelfDataToDEK(
      PROJECT_ID,
      inputWith({
        unmarkedGroups: [{ userId: UID, layerId: 'layer-1', permission: 'PRIVATE' }],
        privateData: [{ userId: UID, layerId: 'layer-1', data: [{ id: 'r1' }] as any }],
      })
    );

    expect(res).toEqual({ isOK: true, message: '', migratedCount: 0, failedCount: 0 });
    expect(mockedWriteBatch).not.toHaveBeenCalled();
  });

  it('ダウンロード結果に無いグループ(復号失敗)はfailedCountに計上して継続し、isOKはtrueのまま', async () => {
    mockedGetDocs.mockResolvedValueOnce({ docs: [] }); // 成功する方の既存doc取得

    const res = await migrateSelfDataToDEK(
      PROJECT_ID,
      inputWith({
        unmarkedGroups: [
          { userId: UID, layerId: 'layer-broken', permission: 'PRIVATE' }, // 復号失敗でprivateDataに無い
          { userId: UID, layerId: 'layer-ok', permission: 'PRIVATE' },
        ],
        privateData: [{ userId: UID, layerId: 'layer-ok', data: [{ id: 'r1' }] as any }],
      })
    );

    expect(res).toEqual({ isOK: true, message: '', migratedCount: 1, failedCount: 1 });
    expect(allSetCalls()).toHaveLength(1);
  });
});

describe('uploadDataHelper のcryptoScheme印付与', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearProjectCryptoCache();
    setupWriteBatch();
    mockedEncryptWithDEK.mockResolvedValue(['ENC_DEK_DATA']);
  });

  it('既存docの削除と新チャンクの書き込みを同一バッチでコミットする（中断で消えない）', async () => {
    setupDekProject();
    const oldDoc = dataDoc({ userId: UID, layerId: 'layer-1', permission: 'PRIVATE', chunkIndex: 0 });
    mockedGetDocs.mockResolvedValue({ docs: [oldDoc] });

    const res = await uploadDataHelper(PROJECT_ID, {
      userId: UID,
      layerId: 'layer-1',
      permission: 'PRIVATE',
      data: [],
    });

    expect(res.isOK).toBe(true);
    expect(batches).toHaveLength(1); // 削除と書き込みが1つのバッチ
    expect(batches[0].delete).toHaveBeenCalledWith(oldDoc.ref);
    expect(batches[0].set).toHaveBeenCalledTimes(1);
    expect(batches[0].commit).toHaveBeenCalledTimes(1);
  });

  it('DEKプロジェクトでは印が付く', async () => {
    setupDekProject();
    mockedGetDocs.mockResolvedValue({ docs: [] }); // 既存doc取得

    const res = await uploadDataHelper(PROJECT_ID, {
      userId: UID,
      layerId: 'layer-1',
      permission: 'PRIVATE',
      data: [],
    });

    expect(res.isOK).toBe(true);
    const setCalls = allSetCalls();
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0][1].cryptoScheme).toBe('dek');
  });

  it('groupプロジェクトでは印フィールド自体が存在しない', async () => {
    mockedGetDoc.mockImplementation(async (path: string) => {
      if (path === `projects/${PROJECT_ID}`) {
        return { data: () => ({}) }; // group
      }
      return { data: () => undefined };
    });
    const { encryptEThree } = jest.requireMock('../../virgilsecurity/e3kit');
    (encryptEThree as jest.Mock).mockResolvedValue(['ENC_GROUP_DATA']);
    mockedGetDocs.mockResolvedValue({ docs: [] }); // 既存doc取得

    const res = await uploadDataHelper(PROJECT_ID, {
      userId: UID,
      layerId: 'layer-1',
      permission: 'PRIVATE',
      data: [],
    });

    expect(res.isOK).toBe(true);
    const setCalls = allSetCalls();
    expect(setCalls).toHaveLength(1);
    expect('cryptoScheme' in setCalls[0][1]).toBe(false);
  });
});
