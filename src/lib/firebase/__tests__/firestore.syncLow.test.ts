/**
 * 同期監査（docs/SYNC_AUDIT_2026-11.md）の M9・L5・L7 の回帰テスト。
 * - M9: 同じ管理者の TEMPLATE と PUBLIC の chunk を混ぜずに、両方を取り出す
 * - L7: 新しい世代の encryptedAt は既存の最大値より必ず大きい（端末の時計が遅れていても古い世代が採られない）
 * - L5: 判定に使ったクラウドの版（期待値）と、書く直前の最新の完全世代が違えば書かない
 * - L2: 復号できずに結果から除いたグループを、呼び出し側へ返す（手元の写しを消してよいかの判断に使う）
 */
import {
  clearProjectCryptoCache,
  downloadAllData,
  downloadPrivateData,
  downloadPublicData,
  downloadTemplateData,
  selectCompleteGenerationDocs,
  uploadDataHelper,
} from '../firestore';
import { decryptEThree, encryptEThree } from '../../virgilsecurity/e3kit';
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
  isDEKKeyPair: jest.fn(async () => true),
}));

jest.mock('../../../i18n/config', () => ({ t: jest.fn((key: string) => key) }));

const mockTimestamp = (ms: number) => ({
  seconds: Math.floor(ms / 1000),
  nanoseconds: (ms % 1000) * 1000000,
  toMillis: () => ms,
});

jest.mock('../firebase', () => ({
  auth: { currentUser: { uid: 'admin-a' } },
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
  Timestamp: {
    // 端末の時計: 500秒
    now: jest.fn(() => mockTimestamp(500000)),
    fromMillis: jest.fn((ms: number) => mockTimestamp(ms)),
  },
}));

const mockedGetDoc = getDoc as jest.Mock;
const mockedGetDocs = getDocs as jest.Mock;
const mockedWriteBatch = writeBatch as jest.Mock;
const mockedDecGroup = decryptEThree as jest.Mock;
const mockedEncGroup = encryptEThree as jest.Mock;

const PROJECT_ID = 'project-1';
const UID = 'admin-a';

let refSeq = 0;
const dataDoc = (fields: Record<string, unknown>) => ({ data: () => fields, ref: `ref-${refSeq++}` });

type MockBatch = { set: jest.Mock; delete: jest.Mock; commit: jest.Mock };
const batches: MockBatch[] = [];
const setupWriteBatch = (deleteFails = false) => {
  batches.length = 0;
  mockedWriteBatch.mockImplementation(() => {
    const b: MockBatch = {
      set: jest.fn(),
      delete: jest.fn().mockImplementation(() => {
        if (deleteFails) throw new Error('delete failed');
      }),
      commit: jest.fn().mockResolvedValue(undefined),
    };
    batches.push(b);
    return b;
  });
};
const allSetCalls = () => batches.flatMap((b) => b.set.mock.calls);
const allDeleteCalls = () => batches.flatMap((b) => b.delete.mock.calls);

// group 方式のプロジェクト（暗号化は encryptEThree / decryptEThree を通る）
const setupGroupProject = () => {
  mockedGetDoc.mockImplementation(async (path: string) => {
    if (path === `projects/${PROJECT_ID}`) return { data: () => ({ ownerUid: UID }) };
    return { data: () => undefined };
  });
};

const base = { layerId: 'layer-1', userId: UID, permission: 'PRIVATE' };

beforeEach(() => {
  jest.clearAllMocks();
  clearProjectCryptoCache();
  setupGroupProject();
  setupWriteBatch();
  mockedEncGroup.mockResolvedValue(['ENC']);
});

describe('M9: 同じ管理者の TEMPLATE と PUBLIC を混ぜない', () => {
  it('downloadAllData は同じ layerId・userId の TEMPLATE と PUBLIC を別々に復号して両方返す', async () => {
    const ts = { seconds: 100, nanoseconds: 0 };
    mockedGetDocs.mockResolvedValue({
      docs: [
        dataDoc({ ...base, permission: 'TEMPLATE', encdata: ['T'], chunkIndex: 0, chunkCount: 1, encryptedAt: ts }),
        dataDoc({ ...base, permission: 'PUBLIC', encdata: ['P'], chunkIndex: 0, chunkCount: 1, encryptedAt: ts }),
      ],
    });
    mockedDecGroup.mockImplementation(async (_at: Date, encdata: string[]) => ({
      data: encdata.map((v) => ({ id: v })),
    }));

    const res = await downloadAllData(PROJECT_ID);

    expect(res.isOK).toBe(true);
    // 以前は同じキーに入り、chunkIndex 0 が上書きされて片方だけになった
    expect(res.data).toHaveLength(2);
    const ids = res.data!.map((d) => d.data.map((r) => r.id)).sort();
    expect(ids).toEqual([['P'], ['T']]);
    expect(res.data!.every((d) => d.layerId === 'layer-1' && d.userId === UID)).toBe(true);
    // チャンクは混ざらずに、それぞれ1つだけで復号している
    mockedDecGroup.mock.calls.forEach((c) => expect(c[1]).toHaveLength(1));
  });
});

describe('L7: 新しい世代の encryptedAt は単調増加', () => {
  // 20000文字×n個のencdata（5MB超で世代方式になる）
  const bigEncdata = (n: number) => Array.from({ length: n }, () => 'a'.repeat(20000));

  it('端末の時計が既存の世代より遅れていても、既存の最大値より大きい encryptedAt で書く', async () => {
    // 時計の進んだ別端末が 900 秒の世代を書いていた（この端末の時計は 500 秒）
    const existing = dataDoc({
      ...base,
      chunkIndex: 0,
      chunkCount: 1,
      encryptedAt: { seconds: 900, nanoseconds: 0 },
    });
    mockedGetDocs.mockResolvedValue({ docs: [existing] });

    const res = await uploadDataHelper(PROJECT_ID, { ...base, permission: 'PRIVATE', data: [] });

    expect(res.isOK).toBe(true);
    expect(res.encryptedAt).toBe(900001);
    expect(allSetCalls()[0][1].encryptedAt.toMillis()).toBe(900001);
  });

  it('時計が正しければ現在時刻のまま書く', async () => {
    const existing = dataDoc({ ...base, chunkIndex: 0, chunkCount: 1, encryptedAt: { seconds: 100, nanoseconds: 0 } });
    mockedGetDocs.mockResolvedValue({ docs: [existing] });

    const res = await uploadDataHelper(PROJECT_ID, { ...base, permission: 'PRIVATE', data: [] });

    expect(res.encryptedAt).toBe(500000);
  });

  it('旧世代の削除に失敗し時計が遅れていても、読み側は新しく書いた世代を採る。残った世代は次のアップロードで消す', async () => {
    mockedEncGroup.mockResolvedValue(bigEncdata(300)); // 約5.9MB → 世代方式（書き切ってから旧世代を削除）
    setupWriteBatch(true); // 旧世代の削除が失敗する
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const oldGen = dataDoc({ ...base, chunkIndex: 0, chunkCount: 1, encryptedAt: { seconds: 900, nanoseconds: 0 } });
    mockedGetDocs.mockResolvedValue({ docs: [oldGen] });

    const res = await uploadDataHelper(PROJECT_ID, { ...base, permission: 'PRIVATE', data: [] });
    expect(res.isOK).toBe(true);
    warnSpy.mockRestore();

    // クラウドには旧世代と新世代が並ぶ
    const newGen = allSetCalls().map(([, d]) => dataDoc(d));
    expect(newGen.length).toBeGreaterThan(1);
    const selected = selectCompleteGenerationDocs([oldGen, ...newGen]);
    // 以前は新世代の encryptedAt(500秒) が旧世代(900秒)より小さく、旧世代が採られた
    expect(selected).toEqual(newGen);

    // 次のアップロードは、残った旧世代も含めて既存の doc をすべて消す
    setupWriteBatch();
    mockedEncGroup.mockResolvedValue(['ENC']);
    mockedGetDocs.mockResolvedValue({ docs: [oldGen, ...newGen] });
    await uploadDataHelper(PROJECT_ID, { ...base, permission: 'PRIVATE', data: [] });
    expect(allDeleteCalls().map((c) => c[0])).toEqual([oldGen, ...newGen].map((d) => d.ref));
  });
});

describe('L5: 判定に使った版と書く直前の版が違えば書かない', () => {
  const cloudDoc = (seconds: number) =>
    dataDoc({ ...base, chunkIndex: 0, chunkCount: 1, encryptedAt: { seconds, nanoseconds: 0 } });

  it('書く直前の版が期待値と違えば、何も書かずに staleExpectation を返す', async () => {
    // 判定したときは 100 秒の版。その後に別端末が 200 秒の版を書いた
    mockedGetDocs.mockResolvedValue({ docs: [cloudDoc(200)] });

    const res = await uploadDataHelper(
      PROJECT_ID,
      { ...base, permission: 'PRIVATE', data: [] },
      { expected: { encryptedAt: 100000 } }
    );

    expect(res).toEqual({
      isOK: false,
      message: 'hooks.message.cloudDataChangedByOtherDevice',
      staleExpectation: true,
    });
    expect(mockedWriteBatch).not.toHaveBeenCalled();
  });

  it('期待値と同じなら書く', async () => {
    mockedGetDocs.mockResolvedValue({ docs: [cloudDoc(100)] });

    const res = await uploadDataHelper(
      PROJECT_ID,
      { ...base, permission: 'PRIVATE', data: [] },
      { expected: { encryptedAt: 100000 } }
    );

    expect(res.isOK).toBe(true);
    expect(allSetCalls()).toHaveLength(1);
  });

  it('判定のときクラウドに無かったのに、書く直前にはあれば書かない（別端末の初回アップロード）', async () => {
    mockedGetDocs.mockResolvedValue({ docs: [cloudDoc(200)] });

    const res = await uploadDataHelper(
      PROJECT_ID,
      { ...base, permission: 'PRIVATE', data: [] },
      { expected: { encryptedAt: undefined } }
    );

    expect(res.staleExpectation).toBe(true);
    expect(mockedWriteBatch).not.toHaveBeenCalled();
  });

  it('判定のときも書く直前もクラウドに無ければ書く', async () => {
    mockedGetDocs.mockResolvedValue({ docs: [] });

    const res = await uploadDataHelper(
      PROJECT_ID,
      { ...base, permission: 'PRIVATE', data: [] },
      { expected: { encryptedAt: undefined } }
    );

    expect(res.isOK).toBe(true);
  });

  it('不完全な新世代（別端末の書き込み途中）は版として数えない（getMyDataUpdatedAt と同じ）', async () => {
    const incomplete = dataDoc({ ...base, chunkIndex: 0, chunkCount: 3, encryptedAt: { seconds: 300, nanoseconds: 0 } });
    mockedGetDocs.mockResolvedValue({ docs: [cloudDoc(100), incomplete] });

    const res = await uploadDataHelper(
      PROJECT_ID,
      { ...base, permission: 'PRIVATE', data: [] },
      { expected: { encryptedAt: 100000 } }
    );

    expect(res.isOK).toBe(true);
  });

  it('期待値を渡さなければ従来どおり照合せずに書く', async () => {
    mockedGetDocs.mockResolvedValue({ docs: [cloudDoc(200)] });

    const res = await uploadDataHelper(PROJECT_ID, { ...base, permission: 'PRIVATE', data: [] });

    expect(res.isOK).toBe(true);
  });
});

describe('L2: 復号できなかったグループを返す', () => {
  const ts = { seconds: 100, nanoseconds: 0 };
  const docs = (permission: string) => [
    dataDoc({ ...base, permission, userId: 'ok-user', encdata: ['OK'], chunkIndex: 0, chunkCount: 1, encryptedAt: ts }),
    dataDoc({ ...base, permission, userId: 'ng-user', encdata: ['NG'], chunkIndex: 0, chunkCount: 1, encryptedAt: ts }),
  ];
  beforeEach(() => {
    // 'NG' のチャンクだけ復号できない（鍵が共有されていない等）
    mockedDecGroup.mockImplementation(async (_at: Date, encdata: string[]) =>
      encdata.includes('NG') ? undefined : { data: [{ id: 'r1' }] }
    );
  });

  it('downloadPublicData は読めたものだけを data に、読めなかったものを undecryptableGroups に返す', async () => {
    mockedGetDocs.mockResolvedValue({ docs: docs('PUBLIC') });
    const res = await downloadPublicData(PROJECT_ID);
    expect(res.data!.map((d) => d.userId)).toEqual(['ok-user']);
    expect(res.undecryptableGroups).toEqual([{ layerId: 'layer-1', userId: 'ng-user', permission: 'PUBLIC' }]);
  });

  it('downloadPrivateData は除外した利用者の分を undecryptableGroups にも含めない', async () => {
    mockedGetDocs.mockResolvedValue({ docs: docs('PRIVATE') });
    const res = await downloadPrivateData(PROJECT_ID, { excludeUserId: 'ng-user' });
    expect(res.data!.map((d) => d.userId)).toEqual(['ok-user']);
    expect(res.undecryptableGroups).toEqual([]);
    const all = await downloadPrivateData(PROJECT_ID);
    expect(all.undecryptableGroups).toEqual([{ layerId: 'layer-1', userId: 'ng-user', permission: 'PRIVATE' }]);
  });

  it('downloadTemplateData も読めなかったテンプレートを返す', async () => {
    mockedGetDocs.mockResolvedValue({ docs: docs('TEMPLATE') });
    const res = await downloadTemplateData(PROJECT_ID);
    expect(res.undecryptableGroups).toEqual([{ layerId: 'layer-1', userId: 'ng-user', permission: 'TEMPLATE' }]);
  });
});
