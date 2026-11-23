/**
 * A-M3（ACCOUNT_AUDIT_2026-11）: 新規プロジェクトの作成が doc を作った後で失敗したら、doc と暗号情報のキャッシュを消す。
 * 残すと、やり直しが新しいDEKで同じ doc に書いて Rules（keepsDekPublicKey）に拒否され、
 * 鍵が配られていなければ誰も開けも消せもしない doc が残る。
 */
import { addProject, clearProjectCryptoCache, decryptProjectData, discardCreatedProject } from '../firestore';
import { createProjectDEK, encryptWithDEK } from '../../virgilsecurity/dek';
import { wrapDEKForMember } from '../../crypto';
import { deleteDoc, getDoc, setDoc, writeBatch } from '../firebase';
import { ProjectType } from '../../../types';

jest.mock('../../../constants/AppConstants', () => ({
  FUNC_ENCRYPTION: true,
  CREATE_DEK_PROJECTS: true,
  ENABLE_KEY_LEDGER: true,
}));
jest.mock('../../virgilsecurity/e3kit', () => ({
  decryptEThree: jest.fn(),
  encryptEThree: jest.fn(),
}));
jest.mock('../../crypto', () => ({
  wrapDEKForMember: jest.fn(),
  unwrapDEK: jest.fn(),
}));
jest.mock('../publicKeys', () => ({
  clearPublicKeyLedgerCache: jest.fn(),
  getPublicKeyFromLedger: jest.fn(),
}));
jest.mock('../../virgilsecurity/dek', () => ({
  createProjectDEK: jest.fn(),
  encryptWithDEK: jest.fn(),
  decryptWithDEK: jest.fn(),
  isDEKKeyPair: jest.fn(async () => true),
}));
jest.mock('../../../i18n/config', () => ({ t: jest.fn((key: string) => key) }));
jest.mock('../firebase', () => ({
  auth: { currentUser: { uid: 'owner-a' } },
  firestore: {},
  functions: {},
  firebaseReady: Promise.resolve(),
  doc: jest.fn((_db: unknown, ...segments: string[]) => segments.join('/')),
  collection: jest.fn((_db: unknown, ...segments: string[]) => segments.join('/')),
  where: jest.fn(),
  query: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  getDocsFromServer: jest.fn(),
  deleteDoc: jest.fn(),
  httpsCallable: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  writeBatch: jest.fn(),
  Timestamp: { now: jest.fn(() => ({ seconds: 100, nanoseconds: 0, toMillis: () => 100000 })) },
}));

const mockedGetDoc = getDoc as jest.Mock;
const mockedSetDoc = setDoc as jest.Mock;
const mockedDeleteDoc = deleteDoc as jest.Mock;
const mockedWriteBatch = writeBatch as jest.Mock;
const mockedCreateDEK = createProjectDEK as jest.Mock;
const mockedEncryptWithDEK = encryptWithDEK as jest.Mock;
const mockedWrapDEK = wrapDEKForMember as jest.Mock;

const PID = 'project-new';
const OWNER = 'owner-a';

const project = {
  id: PID,
  name: 'New',
  members: [],
  ownerUid: OWNER,
  adminsUid: [OWNER],
  membersUid: [OWNER],
  abstract: '',
  storage: { count: 0 },
} as unknown as ProjectType;

let commit: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  clearProjectCryptoCache();
  commit = jest.fn(async () => undefined);
  mockedWriteBatch.mockImplementation(() => ({ set: jest.fn(), commit }));
  mockedSetDoc.mockResolvedValue(undefined);
  mockedDeleteDoc.mockResolvedValue(undefined);
  mockedGetDoc.mockResolvedValue({ data: () => undefined });
  mockedCreateDEK.mockResolvedValue({ publicKey: 'DEK_PUB', privateKey: 'DEK_PRIV' });
  mockedEncryptWithDEK.mockResolvedValue(['DEK_ENC']);
  mockedWrapDEK.mockResolvedValue('WRAPPED');
});

/** キャッシュが残っていればサーバーの doc を読まずに復号へ進む。読みに行けばキャッシュは消えている */
const cacheWasDiscarded = async () => {
  mockedGetDoc.mockClear();
  await decryptProjectData(new Date(), ['X'], OWNER, PID).catch(() => undefined);
  return mockedGetDoc.mock.calls.some(([path]) => path === `projects/${PID}`);
};

describe('addProject の失敗時の後始末', () => {
  it('成功時は doc を消さない', async () => {
    await expect(addProject(project)).resolves.toEqual({ isOK: true, message: '' });
    expect(mockedDeleteDoc).not.toHaveBeenCalled();
  });

  it('鍵の配布（batch.commit）が失敗したら作った doc を消してキャッシュも捨てる', async () => {
    commit.mockRejectedValue(new Error('PERMISSION_DENIED'));
    const res = await addProject(project);
    expect(res.isOK).toBe(false);
    expect(mockedDeleteDoc).toHaveBeenCalledWith(`projects/${PID}`);
    expect(await cacheWasDiscarded()).toBe(true);
  });

  it('doc の作成自体が失敗したら消しに行かない（キャッシュだけ捨てる）', async () => {
    mockedSetDoc.mockRejectedValue(new Error('offline'));
    const res = await addProject(project);
    expect(res).toEqual({ isOK: false, message: 'firebase.message.failAddProject' });
    expect(mockedDeleteDoc).not.toHaveBeenCalled();
    expect(await cacheWasDiscarded()).toBe(true);
  });

  it('後始末の削除に失敗しても作成失敗として返す（投げない）', async () => {
    commit.mockRejectedValue(new Error('PERMISSION_DENIED'));
    mockedDeleteDoc.mockRejectedValue(new Error('offline'));
    const res = await addProject(project);
    expect(res.isOK).toBe(false);
  });
});

describe('discardCreatedProject', () => {
  it('doc を消し、失敗しても投げない', async () => {
    await discardCreatedProject(PID);
    expect(mockedDeleteDoc).toHaveBeenCalledWith(`projects/${PID}`);
    mockedDeleteDoc.mockRejectedValue(new Error('offline'));
    await expect(discardCreatedProject(PID)).resolves.toBeUndefined();
  });

  // レビュー指摘: 圏外では Firestore の書き込みが resolve しない。待つと作成画面の Loading が消えない
  it('削除がサーバー応答待ちのままでもすぐ返る', async () => {
    mockedDeleteDoc.mockReturnValue(new Promise<void>(() => undefined));
    await expect(discardCreatedProject(PID)).resolves.toBeUndefined();
  });

  it('削除が終わらなくても addProject は作成失敗を返す', async () => {
    commit.mockRejectedValue(new Error('PERMISSION_DENIED'));
    mockedDeleteDoc.mockReturnValue(new Promise<void>(() => undefined));
    const res = await addProject(project);
    expect(res.isOK).toBe(false);
  });
});
