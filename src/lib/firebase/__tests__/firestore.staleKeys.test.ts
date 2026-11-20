import { findStaleMemberKeys } from '../firestore';
import { getDoc, getDocsFromServer } from '../firebase';

jest.mock('../../../constants/AppConstants', () => ({
  FUNC_ENCRYPTION: true,
  CREATE_DEK_PROJECTS: true,
  ENABLE_KEY_LEDGER: true,
}));

jest.mock('../../virgilsecurity/e3kit', () => ({
  decryptEThree: jest.fn(),
  encryptEThree: jest.fn(),
  wrapDEKForMember: jest.fn(),
  unwrapDEK: jest.fn(),
}));

jest.mock('../../crypto', () => ({
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

jest.mock('../firebase', () => ({
  auth: { currentUser: { uid: 'me' } },
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
  Timestamp: { now: jest.fn(() => ({ seconds: 0, nanoseconds: 0 })) },
}));

const mockedGetDoc = getDoc as jest.Mock;
const mockedGetDocsFromServer = getDocsFromServer as jest.Mock;

const ts = (iso: string) => ({ seconds: Math.floor(new Date(iso).getTime() / 1000), nanoseconds: 0 });
const OLD = ts('2026-07-31T00:00:00Z');
const RESET = ts('2026-11-18T10:28:06Z');
const NEWER = ts('2026-11-19T00:00:00Z');

const projectDoc = (id: string, data: object) => ({ id, data: () => data });

// Firestore上の状態: パス → ドキュメント
const setupDocs = (docs: { [path: string]: object | undefined }) => {
  mockedGetDoc.mockImplementation(async (path: string) => ({
    exists: () => docs[path] !== undefined,
    data: () => docs[path],
  }));
};

describe('findStaleMemberKeys', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('自分が管理者のDEKプロジェクトで、鍵リセット後に包み直されていないメンバーだけを返す', async () => {
    mockedGetDocsFromServer.mockResolvedValue({
      docs: [
        // 管理者・DEK: kimoto は古いラップ → 対象、ok-member は新しいラップ → 対象外
        projectDoc('p-admin', {
          cryptoScheme: 'dek',
          ownerUid: 'owner',
          adminsUid: ['owner', 'me'],
          membersUid: ['owner', 'me', 'kimoto', 'ok-member'],
        }),
        // オーナー・DEK・アーカイブ済み: 対象に含める
        projectDoc('p-owner', {
          cryptoScheme: 'dek',
          ownerUid: 'me',
          adminsUid: ['me'],
          membersUid: ['me', 'kimoto'],
          archived: true,
        }),
        // 一般メンバー: 対象外（keysを読む権限もない）
        projectDoc('p-member', {
          cryptoScheme: 'dek',
          ownerUid: 'owner',
          adminsUid: ['owner'],
          membersUid: ['owner', 'me', 'kimoto'],
        }),
        // グループ暗号: 対象外
        projectDoc('p-group', {
          cryptoScheme: 'group',
          ownerUid: 'me',
          adminsUid: ['me'],
          membersUid: ['me', 'kimoto'],
        }),
      ],
    });
    setupDocs({
      'publicKeys/kimoto': { publicKey: 'K', keyVersion: 2, createdAt: RESET },
      'publicKeys/ok-member': { publicKey: 'O', keyVersion: 2, createdAt: RESET },
      'publicKeys/owner': { publicKey: 'W', keyVersion: 1, createdAt: OLD },
      'projects/p-admin/keys/kimoto': { encDek: 'x', wrapperUid: 'owner', encryptedAt: OLD },
      'projects/p-admin/keys/ok-member': { encDek: 'x', wrapperUid: 'owner', encryptedAt: NEWER },
      'projects/p-admin/keys/owner': { encDek: 'x', wrapperUid: 'owner', encryptedAt: OLD },
      'projects/p-owner/keys/kimoto': { encDek: 'x', wrapperUid: 'me', encryptedAt: OLD },
    });

    const progress: [number, number][] = [];
    const result = await findStaleMemberKeys('me', (d, t) => progress.push([d, t]));

    expect(result.map((r) => `${r.projectId}:${r.uid}`).sort()).toEqual(['p-admin:kimoto', 'p-owner:kimoto']);
    const admin = result.find((r) => r.projectId === 'p-admin')!;
    expect(admin.ownerUid).toBe('owner');
    expect(admin.keyChangedAt.toISOString()).toBe('2026-11-18T10:28:06.000Z');
    // 自分自身の keys は読まない
    expect(mockedGetDoc.mock.calls.map((c) => c[0])).not.toContain('projects/p-admin/keys/me');
    expect(progress[0]).toEqual([0, 2]);
    expect(progress[progress.length - 1]).toEqual([2, 2]);
  });

  it('対象がなければ空配列', async () => {
    mockedGetDocsFromServer.mockResolvedValue({ docs: [] });
    setupDocs({});
    await expect(findStaleMemberKeys('me')).resolves.toEqual([]);
  });
});
