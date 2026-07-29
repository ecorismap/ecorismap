import { migrateSelfDataToDEK, uploadDataHelper, clearProjectCryptoCache } from '../firestore';
import { unwrapDEK, decryptEThree } from '../../virgilsecurity/e3kit';
import { decryptWithDEK, encryptWithDEK } from '../../virgilsecurity/dek';
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
const mockedDecryptWithDEK = decryptWithDEK as jest.Mock;
const mockedEncryptWithDEK = encryptWithDEK as jest.Mock;
const mockedDecGroup = decryptEThree as jest.Mock;

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

describe('migrateSelfDataToDEK (自己DEK移行)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearProjectCryptoCache();
    setupDekProject();
    setupWriteBatch();
    // DEK復号は旧グループ暗号データでは失敗し(dual-readでdecGroupへ)、暗号化はDEKで行われる
    mockedDecryptWithDEK.mockRejectedValue(new Error('not dek data'));
    mockedDecGroup.mockResolvedValue({ data: [{ id: 'r1' }] });
    mockedEncryptWithDEK.mockResolvedValue(['ENC_DEK_DATA']);
  });

  it('印なしの自分のPRIVATEデータを移行し、cryptoScheme印付きで書き戻す', async () => {
    const legacyDoc = dataDoc({
      userId: UID,
      layerId: 'layer-1',
      permission: 'PRIVATE',
      encdata: ['G'],
      encryptedAt: TS,
      chunkIndex: 0,
    });
    mockedGetDocs
      .mockResolvedValueOnce({ docs: [legacyDoc] }) // 軽量チェック(自分のdoc列挙)
      .mockResolvedValueOnce({ docs: [legacyDoc] }) // downloadPrivateData
      .mockResolvedValueOnce({ docs: [legacyDoc] }); // deleteExistingData

    const res = await migrateSelfDataToDEK(PROJECT_ID);

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
  });

  it('全docに印がある場合は高速パスで何もしない', async () => {
    const markedDoc = dataDoc({
      userId: UID,
      layerId: 'layer-1',
      permission: 'PRIVATE',
      encdata: ['D'],
      encryptedAt: TS,
      chunkIndex: 0,
      cryptoScheme: 'dek',
    });
    mockedGetDocs.mockResolvedValueOnce({ docs: [markedDoc] });

    const res = await migrateSelfDataToDEK(PROJECT_ID);

    expect(res).toEqual({ isOK: true, message: '', migratedCount: 0, failedCount: 0 });
    expect(mockedGetDocs).toHaveBeenCalledTimes(1); // 軽量チェックのみ
    expect(mockedWriteBatch).not.toHaveBeenCalled();
  });

  it('COMMON/TEMPLATEの印なしdocは対象にしない', async () => {
    const commonDoc = dataDoc({
      userId: UID,
      layerId: 'layer-1',
      permission: 'COMMON',
      encdata: ['G'],
      encryptedAt: TS,
      chunkIndex: 0,
    });
    mockedGetDocs.mockResolvedValueOnce({ docs: [commonDoc] });

    const res = await migrateSelfDataToDEK(PROJECT_ID);

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

    const res = await migrateSelfDataToDEK(PROJECT_ID);

    expect(res).toEqual({ isOK: true, message: '', migratedCount: 0, failedCount: 0 });
    expect(mockedGetDocs).not.toHaveBeenCalled();
  });

  it('復号できないグループはfailedCountに計上して継続し、isOKはtrueのまま', async () => {
    const brokenDoc = dataDoc({
      userId: UID,
      layerId: 'layer-broken',
      permission: 'PRIVATE',
      encdata: ['?'],
      encryptedAt: TS,
      chunkIndex: 0,
    });
    // DEKでもグループでも復号不能 → projectDataSetToDataSetでnull落ち
    mockedDecGroup.mockResolvedValue(undefined);
    mockedGetDocs
      .mockResolvedValueOnce({ docs: [brokenDoc] }) // 軽量チェック
      .mockResolvedValueOnce({ docs: [brokenDoc] }); // downloadPrivateData

    const res = await migrateSelfDataToDEK(PROJECT_ID);

    expect(res).toEqual({ isOK: true, message: '', migratedCount: 0, failedCount: 1 });
    expect(mockedWriteBatch).not.toHaveBeenCalled();
  });
});

describe('uploadDataHelper のcryptoScheme印付与', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearProjectCryptoCache();
    setupWriteBatch();
    mockedEncryptWithDEK.mockResolvedValue(['ENC_DEK_DATA']);
  });

  it('DEKプロジェクトでは印が付く', async () => {
    setupDekProject();
    mockedGetDocs.mockResolvedValue({ docs: [] }); // deleteExistingData

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
    mockedGetDocs.mockResolvedValue({ docs: [] }); // deleteExistingData

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
