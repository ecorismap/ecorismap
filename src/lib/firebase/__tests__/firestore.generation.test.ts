import {
  selectCompleteGenerationDocs,
  uploadDataHelper,
  clearProjectCryptoCache,
  collectUnmarkedDekGroups,
  downloadPublicData,
  getMyDataUpdatedAt,
  getCloudDataSummary,
} from '../firestore';
import { decryptEThree } from '../../virgilsecurity/e3kit';
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
  Timestamp: { now: jest.fn(() => ({ seconds: 500, nanoseconds: 0, toMillis: () => 500000 })) },
}));

const mockedGetDoc = getDoc as jest.Mock;
const mockedGetDocs = getDocs as jest.Mock;
const mockedWriteBatch = writeBatch as jest.Mock;
const mockedDecGroup = decryptEThree as jest.Mock;
const mockedEncryptWithDEK = encryptWithDEK as jest.Mock;
const { unwrapDEK } = jest.requireMock('../../virgilsecurity/e3kit');

const PROJECT_ID = 'project-1';
const UID = 'member-b';
const TS_OLD = { seconds: 100, nanoseconds: 0 };
const TS_NEW = { seconds: 200, nanoseconds: 0 };

// data doc のスナップショット（生のDataFS）
let refSeq = 0;
const dataDoc = (fields: Record<string, unknown>) => ({ data: () => fields, ref: `ref-${refSeq++}` });

// writeBatch のモック（バッチごとの操作と、commitの実行順を記録）
type MockBatch = { set: jest.Mock; delete: jest.Mock; commit: jest.Mock };
const batches: MockBatch[] = [];
const commitOrder: MockBatch[] = [];
const setupWriteBatch = () => {
  batches.length = 0;
  commitOrder.length = 0;
  mockedWriteBatch.mockImplementation(() => {
    const b: MockBatch = {
      set: jest.fn(),
      delete: jest.fn(),
      commit: jest.fn().mockImplementation(async () => {
        commitOrder.push(b);
      }),
    };
    batches.push(b);
    return b;
  });
};
const allSetCalls = () => batches.flatMap((b) => b.set.mock.calls);
const allDeleteCalls = () => batches.flatMap((b) => b.delete.mock.calls);

const setupDekProject = () => {
  mockedGetDoc.mockImplementation(async (path: string) => {
    if (path === `projects/${PROJECT_ID}`) {
      return { data: () => ({ cryptoScheme: 'dek', dekPublicKey: 'PUB_KEY' }) };
    }
    if (path === `projects/${PROJECT_ID}/keys/${UID}`) {
      return { data: () => ({ encDek: 'WRAPPED_DEK', wrapperUid: 'admin-a', encryptedAt: TS_OLD }) };
    }
    return { data: () => undefined };
  });
  (unwrapDEK as jest.Mock).mockResolvedValue('DEK_PRIV');
};

describe('selectCompleteGenerationDocs (世代選別)', () => {
  const base = { layerId: 'layer-1', userId: UID, permission: 'PRIVATE' };

  it('レガシーdoc群はencryptedAtが不揃いでも1つの世代として全doc返る（データ喪失回帰）', () => {
    // 旧実装はチャンクごとに別のTimestamp.now()を書いていたため、encryptedAtで分割してはならない
    const docs = [
      dataDoc({ ...base, chunkIndex: 0, encryptedAt: { seconds: 100, nanoseconds: 0 } }),
      dataDoc({ ...base, chunkIndex: 1, encryptedAt: { seconds: 101, nanoseconds: 500 } }),
      dataDoc({ ...base, chunkIndex: 2, encryptedAt: { seconds: 102, nanoseconds: 999 } }),
    ];
    expect(selectCompleteGenerationDocs(docs)).toHaveLength(3);
  });

  it('完全な新世代が最新ならそれだけを返す（レガシー旧世代は除外）', () => {
    const legacyOld = dataDoc({ ...base, chunkIndex: 0, encryptedAt: TS_OLD });
    const gen = [
      dataDoc({ ...base, chunkIndex: 0, chunkCount: 2, encryptedAt: TS_NEW }),
      dataDoc({ ...base, chunkIndex: 1, chunkCount: 2, encryptedAt: TS_NEW }),
    ];
    const result = selectCompleteGenerationDocs([legacyOld, ...gen]);
    expect(result).toHaveLength(2);
    expect(result).toEqual(expect.arrayContaining(gen));
  });

  it('不完全な新世代（doc数<chunkCount）は無視して旧世代を採用する', () => {
    const complete = [
      dataDoc({ ...base, chunkIndex: 0, chunkCount: 1, encryptedAt: TS_OLD }),
    ];
    const incomplete = [
      dataDoc({ ...base, chunkIndex: 0, chunkCount: 3, encryptedAt: TS_NEW }),
      dataDoc({ ...base, chunkIndex: 1, chunkCount: 3, encryptedAt: TS_NEW }),
    ];
    const result = selectCompleteGenerationDocs([...incomplete, ...complete]);
    expect(result).toEqual(complete);
  });

  it('完全な世代が2つあれば新しい方を採用する', () => {
    const older = [dataDoc({ ...base, chunkIndex: 0, chunkCount: 1, encryptedAt: TS_OLD })];
    const newer = [dataDoc({ ...base, chunkIndex: 0, chunkCount: 1, encryptedAt: TS_NEW })];
    expect(selectCompleteGenerationDocs([...older, ...newer])).toEqual(newer);
    // ナノ秒差でも新しい方
    const newerNs = [dataDoc({ ...base, chunkIndex: 0, chunkCount: 1, encryptedAt: { seconds: 100, nanoseconds: 1 } })];
    expect(selectCompleteGenerationDocs([...older, ...newerNs])).toEqual(newerNs);
  });

  it('世代IDが衝突してdoc数>chunkCountになった場合は不完全扱いで旧世代へフォールバックする', () => {
    const complete = [dataDoc({ ...base, chunkIndex: 0, chunkCount: 1, encryptedAt: TS_OLD })];
    // 同一encryptedAtに2端末の書き込みが混ざった（chunkIndex重複）
    const collided = [
      dataDoc({ ...base, chunkIndex: 0, chunkCount: 1, encryptedAt: TS_NEW }),
      dataDoc({ ...base, chunkIndex: 0, chunkCount: 1, encryptedAt: TS_NEW }),
    ];
    expect(selectCompleteGenerationDocs([...collided, ...complete])).toEqual(complete);
  });

  it('グループ（layerId×userId×permission）ごとに独立して選別される', () => {
    const groupA = [dataDoc({ ...base, chunkIndex: 0, chunkCount: 1, encryptedAt: TS_NEW })];
    const groupB = [dataDoc({ ...base, permission: 'PUBLIC', chunkIndex: 0, encryptedAt: TS_OLD })]; // レガシー
    const groupC = [dataDoc({ ...base, userId: 'other', chunkIndex: 0, chunkCount: 1, encryptedAt: TS_OLD })];
    const result = selectCompleteGenerationDocs([...groupA, ...groupB, ...groupC]);
    expect(result).toHaveLength(3);
  });

  it('完全な世代が1つも無いグループは従来挙動のため全docを返す', () => {
    const docs = [
      dataDoc({ ...base, chunkIndex: 0, chunkCount: 3, encryptedAt: TS_NEW }),
      dataDoc({ ...base, chunkIndex: 1, chunkCount: 3, encryptedAt: TS_NEW }),
    ];
    expect(selectCompleteGenerationDocs(docs)).toHaveLength(2);
  });

  it('空配列は空配列を返す', () => {
    expect(selectCompleteGenerationDocs([])).toEqual([]);
  });
});

describe('uploadDataHelper (世代方式)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearProjectCryptoCache();
    setupWriteBatch();
    setupDekProject();
  });

  // 20000文字×n個のencdata（DEK暗号化の実際のチャンク長と同じ）
  const bigEncdata = (n: number) => Array.from({ length: n }, () => 'a'.repeat(20000));

  it('小グループは従来どおり削除+書き込み1バッチで、chunkCountが付く', async () => {
    mockedEncryptWithDEK.mockResolvedValue(['ENC1']);
    const oldDoc = dataDoc({ userId: UID, layerId: 'layer-1', permission: 'PRIVATE', chunkIndex: 0 });
    mockedGetDocs.mockResolvedValue({ docs: [oldDoc] });

    const res = await uploadDataHelper(PROJECT_ID, { userId: UID, layerId: 'layer-1', permission: 'PRIVATE', data: [] });

    expect(res.isOK).toBe(true);
    expect(batches).toHaveLength(1);
    expect(batches[0].delete).toHaveBeenCalledWith(oldDoc.ref);
    expect(batches[0].set).toHaveBeenCalledTimes(1);
    expect(batches[0].set.mock.calls[0][1]).toEqual(
      expect.objectContaining({ chunkIndex: 0, chunkCount: 1, encryptedAt: expect.anything() })
    );
  });

  it('5MB超は世代方式: 複数バッチで書き切ってから旧docを削除し、全docが同一世代になる', async () => {
    // 900個×20000文字 ≒ 17.6MB → 複数の書き込みバッチに分割される
    mockedEncryptWithDEK.mockResolvedValue(bigEncdata(900));
    const oldDocs = [
      dataDoc({ userId: UID, layerId: 'layer-1', permission: 'PRIVATE', chunkIndex: 0 }),
      dataDoc({ userId: UID, layerId: 'layer-1', permission: 'PRIVATE', chunkIndex: 1 }),
    ];
    mockedGetDocs.mockResolvedValue({ docs: oldDocs });

    const res = await uploadDataHelper(PROJECT_ID, { userId: UID, layerId: 'layer-1', permission: 'PRIVATE', data: [] });

    expect(res.isOK).toBe(true);
    expect(res.encryptedAt).toBe(500000);

    // 書き込みバッチが複数に分割されている
    const writeBatches = batches.filter((b) => b.set.mock.calls.length > 0);
    const deleteBatches = batches.filter((b) => b.delete.mock.calls.length > 0);
    expect(writeBatches.length).toBeGreaterThan(1);
    // 書き込みバッチに削除は同梱されない
    writeBatches.forEach((b) => expect(b.delete).not.toHaveBeenCalled());

    // 全ての書き込みcommitが全ての削除commitより先
    const lastWriteCommit = Math.max(...writeBatches.map((b) => commitOrder.indexOf(b)));
    const firstDeleteCommit = Math.min(...deleteBatches.map((b) => commitOrder.indexOf(b)));
    expect(lastWriteCommit).toBeLessThan(firstDeleteCommit);

    // 旧docは全て削除対象
    expect(allDeleteCalls().map((c) => c[0])).toEqual(expect.arrayContaining(oldDocs.map((d) => d.ref)));

    // 全setが同一encryptedAt・連番chunkIndex・chunkCount=総数
    const setCalls = allSetCalls();
    const total = setCalls.length;
    expect(total).toBeGreaterThan(1);
    const indexes = setCalls.map((c) => c[1].chunkIndex).sort((a, b) => a - b);
    expect(indexes).toEqual(Array.from({ length: total }, (_, i) => i));
    setCalls.forEach((c) => {
      expect(c[1].chunkCount).toBe(total);
      expect(c[1].encryptedAt).toEqual(setCalls[0][1].encryptedAt);
    });
  });

  it('既存docが多い（400超）場合も世代方式になり削除がバッチ分割される', async () => {
    mockedEncryptWithDEK.mockResolvedValue(['ENC1']);
    const oldDocs = Array.from({ length: 401 }, (_, i) =>
      dataDoc({ userId: UID, layerId: 'layer-1', permission: 'PRIVATE', chunkIndex: i })
    );
    mockedGetDocs.mockResolvedValue({ docs: oldDocs });

    const res = await uploadDataHelper(PROJECT_ID, { userId: UID, layerId: 'layer-1', permission: 'PRIVATE', data: [] });

    expect(res.isOK).toBe(true);
    const deleteBatches = batches.filter((b) => b.delete.mock.calls.length > 0);
    expect(deleteBatches.length).toBe(2); // 400 + 1
    expect(allDeleteCalls()).toHaveLength(401);
  });

  it('書き込みフェーズの失敗は例外になり、削除フェーズは実行されない', async () => {
    mockedEncryptWithDEK.mockResolvedValue(bigEncdata(900));
    const oldDoc = dataDoc({ userId: UID, layerId: 'layer-1', permission: 'PRIVATE', chunkIndex: 0 });
    mockedGetDocs.mockResolvedValue({ docs: [oldDoc] });
    // 2回目のcommitで失敗させる
    let commitCount = 0;
    mockedWriteBatch.mockImplementation(() => {
      const b: MockBatch = {
        set: jest.fn(),
        delete: jest.fn(),
        commit: jest.fn().mockImplementation(async () => {
          commitCount += 1;
          if (commitCount === 2) throw new Error('network error');
          commitOrder.push(b);
        }),
      };
      batches.push(b);
      return b;
    });

    await expect(
      uploadDataHelper(PROJECT_ID, { userId: UID, layerId: 'layer-1', permission: 'PRIVATE', data: [] })
    ).rejects.toThrow('network error');
    expect(allDeleteCalls()).toHaveLength(0);
  });

  it('削除フェーズの失敗は成功扱い（新世代は読める・残骸は次回一掃）', async () => {
    mockedEncryptWithDEK.mockResolvedValue(bigEncdata(300)); // 約5.9MB → 世代方式
    const oldDoc = dataDoc({ userId: UID, layerId: 'layer-1', permission: 'PRIVATE', chunkIndex: 0 });
    mockedGetDocs.mockResolvedValue({ docs: [oldDoc] });
    mockedWriteBatch.mockImplementation(() => {
      const b: MockBatch = {
        set: jest.fn(),
        delete: jest.fn().mockImplementation(() => {
          throw new Error('delete failed');
        }),
        commit: jest.fn().mockResolvedValue(undefined),
      };
      batches.push(b);
      return b;
    });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const res = await uploadDataHelper(PROJECT_ID, { userId: UID, layerId: 'layer-1', permission: 'PRIVATE', data: [] });

    expect(res.isOK).toBe(true);
    expect(res.encryptedAt).toBe(500000);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('読み側の世代選別', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearProjectCryptoCache();
    setupWriteBatch();
  });

  it('downloadPublicData: 不完全な新世代を無視し、旧世代のチャンクとencryptedAtで復号する', async () => {
    // groupプロジェクト（decGroup経路）
    mockedGetDoc.mockImplementation(async (path: string) => {
      if (path === `projects/${PROJECT_ID}`) {
        return { data: () => ({ ownerUid: 'owner-x' }) };
      }
      return { data: () => undefined };
    });
    mockedDecGroup.mockResolvedValue({ data: [] });
    const oldGen = dataDoc({
      encdata: ['OLD1'],
      layerId: 'layer-1',
      userId: 'member-a',
      permission: 'PUBLIC',
      chunkIndex: 0,
      encryptedAt: TS_OLD,
    });
    const incompleteNewGen = dataDoc({
      encdata: ['NEW1'],
      layerId: 'layer-1',
      userId: 'member-a',
      permission: 'PUBLIC',
      chunkIndex: 0,
      chunkCount: 2, // 2チャンク中1つしか無い＝書き込み中断の残骸
      encryptedAt: TS_NEW,
    });
    mockedGetDocs.mockResolvedValue({ docs: [incompleteNewGen, oldGen] });

    const res = await downloadPublicData(PROJECT_ID);

    expect(res.isOK).toBe(true);
    expect(mockedDecGroup).toHaveBeenCalledTimes(1);
    expect(mockedDecGroup).toHaveBeenCalledWith(new Date(TS_OLD.seconds * 1000), ['OLD1'], 'member-a', PROJECT_ID, 'owner-x');
  });

  it('getMyDataUpdatedAt: 不完全な新世代の値を基準値に採用しない', async () => {
    mockedGetDocs.mockResolvedValue({
      docs: [
        dataDoc({ layerId: 'layer-1', userId: UID, permission: 'PRIVATE', chunkIndex: 0, chunkCount: 1, encryptedAt: TS_OLD }),
        dataDoc({ layerId: 'layer-1', userId: UID, permission: 'PRIVATE', chunkIndex: 0, chunkCount: 5, encryptedAt: TS_NEW }),
      ],
    });

    const res = await getMyDataUpdatedAt(PROJECT_ID, UID);

    expect(res.isOK).toBe(true);
    expect(res.data!.get('layer-1_PRIVATE')).toBe(TS_OLD.seconds * 1000);
  });

  it('getCloudDataSummary: 採用世代のdoc数・最終更新のみ集計する', async () => {
    mockedGetDocs.mockResolvedValue({
      docs: [
        // 完全な新世代(2doc) + 削除し損ねた旧世代レガシー(1doc)
        dataDoc({ layerId: 'layer-1', userId: UID, permission: 'PRIVATE', chunkIndex: 0, chunkCount: 2, encryptedAt: TS_NEW }),
        dataDoc({ layerId: 'layer-1', userId: UID, permission: 'PRIVATE', chunkIndex: 1, chunkCount: 2, encryptedAt: TS_NEW }),
        dataDoc({ layerId: 'layer-1', userId: UID, permission: 'PRIVATE', chunkIndex: 0, encryptedAt: TS_OLD }),
      ],
    });

    const res = await getCloudDataSummary(PROJECT_ID);

    expect(res.isOK).toBe(true);
    expect(res.data).toHaveLength(1);
    expect(res.data![0].chunkCount).toBe(2);
    expect(res.data![0].lastUpdatedAt).toEqual(new Date(TS_NEW.seconds * 1000));
  });

  it('collectUnmarkedDekGroups: 旧世代の無印doc残骸では再移行がトリガーされない', () => {
    const docs = [
      // 採用される新世代はdek印付き
      dataDoc({ layerId: 'layer-1', userId: UID, permission: 'PRIVATE', chunkIndex: 0, chunkCount: 1, encryptedAt: TS_NEW, cryptoScheme: 'dek' }),
      // 削除し損ねた旧世代（無印レガシー）
      dataDoc({ layerId: 'layer-1', userId: UID, permission: 'PRIVATE', chunkIndex: 0, encryptedAt: TS_OLD }),
    ];
    expect(collectUnmarkedDekGroups(docs, 'PRIVATE')).toEqual([]);
  });
});
