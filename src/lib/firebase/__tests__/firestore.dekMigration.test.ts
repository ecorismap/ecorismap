/**
 * migrateProjectToDEK（Phase ii）と、group キャッシュの寿命（enc の確かめ直し・getAllProjects の無効化）、
 * addMemberKey の在籍確認のユニットテスト。
 *
 * - 冪等判定はキャッシュでなくサーバーの doc で行い、既に dek なら新しいDEKを作らない（二重移行の防止）
 * - 方式の確定と keys の配布は1バッチ。負けた側は keys を書かない
 * - 書き戻しの失敗は移行の失敗として返し、再実行で残りだけを再暗号化する
 */
import {
  addMemberKey,
  clearProjectCryptoCache,
  decryptProjectData,
  getAllProjects,
  migrateProjectToDEK,
  setProjectCryptoCache,
  uploadCurrentPosition,
} from '../firestore';
import { decryptEThree, encryptEThree } from '../../virgilsecurity/e3kit';
import { createProjectDEK, decryptWithDEK, encryptWithDEK } from '../../virgilsecurity/dek';
import { unwrapDEK, wrapDEKForMember } from '../../crypto';
import { getDoc, getDocs, getDocsFromServer, setDoc, updateDoc, writeBatch } from '../firebase';
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
  // doc()/collection() はパス文字列、query() は「コレクション|条件」の文字列を返し、読み取りをパスで引けるようにする
  doc: jest.fn((_db: unknown, ...segments: string[]) => segments.join('/')),
  collection: jest.fn((_db: unknown, ...segments: string[]) => segments.join('/')),
  where: jest.fn((field: string, _op: string, value: unknown) => `${field}=${String(value)}`),
  query: jest.fn((col: string, ...conds: string[]) => [col, ...conds].join('|')),
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
const mockedGetDocs = getDocs as jest.Mock;
const mockedGetDocsFromServer = getDocsFromServer as jest.Mock;
const mockedSetDoc = setDoc as jest.Mock;
const mockedUpdateDoc = updateDoc as jest.Mock;
const mockedWriteBatch = writeBatch as jest.Mock;
const mockedDecGroup = decryptEThree as jest.Mock;
const mockedEncGroup = encryptEThree as jest.Mock;
const mockedCreateDEK = createProjectDEK as jest.Mock;
const mockedEncryptWithDEK = encryptWithDEK as jest.Mock;
const mockedDecryptWithDEK = decryptWithDEK as jest.Mock;
const mockedUnwrapDEK = unwrapDEK as jest.Mock;
const mockedWrapDEK = wrapDEKForMember as jest.Mock;

const PID = 'project-1';
const OWNER = 'owner-a';
const MEMBER = 'member-b';
const OLD_TS = { seconds: 1, nanoseconds: 0, toMillis: () => 1000 };

const project: ProjectType = {
  id: PID,
  name: 'P',
  members: [],
  ownerUid: OWNER,
  adminsUid: [OWNER],
  membersUid: [OWNER, MEMBER],
  license: 'Free',
  storage: { count: 0 },
} as unknown as ProjectType;

// サーバー上の状態（テストごとに書き換える）
type DataDoc = { userId: string; layerId: string; permission: string; encdata: string[]; encryptedAt: unknown; cryptoScheme?: 'dek' };
let serverProject: Record<string, unknown> | undefined;
let settingsDoc: Record<string, unknown> | undefined;
let dataDocs: DataDoc[];

type Batch = { update: jest.Mock; set: jest.Mock; delete: jest.Mock; commit: jest.Mock };
let batches: Batch[];
let commitImpl: (b: Batch) => Promise<void>;

const keySets = () =>
  batches.flatMap((b) => b.set.mock.calls).filter(([path]: [string]) => String(path).includes('/keys/'));

beforeEach(() => {
  jest.clearAllMocks();
  clearProjectCryptoCache();
  serverProject = { ownerUid: OWNER, adminsUid: [OWNER], membersUid: [OWNER, MEMBER], encdata: ['META_G'] };
  settingsDoc = { editorUid: MEMBER, encdata: ['SETTINGS_G'], encryptedAt: OLD_TS };
  dataDocs = [
    { userId: MEMBER, layerId: 'L1', permission: 'COMMON', encdata: ['COMMON_G'], encryptedAt: OLD_TS },
    { userId: OWNER, layerId: 'T1', permission: 'TEMPLATE', encdata: ['TEMPLATE_G'], encryptedAt: OLD_TS },
  ];
  batches = [];
  commitImpl = async () => undefined;

  mockedGetDoc.mockImplementation(async (path: string) => {
    if (path === `projects/${PID}`) return { data: () => serverProject };
    if (path === `projects/${PID}/settings/default`) return { data: () => settingsDoc };
    if (path === `projects/${PID}/keys/${OWNER}`) {
      return { data: () => ({ encDek: 'WRAPPED', wrapperUid: OWNER, encryptedAt: OLD_TS }) };
    }
    return { data: () => undefined };
  });
  mockedGetDocs.mockImplementation(async (q: string) => {
    const [, ...conds] = q.split('|');
    const docs = dataDocs
      .filter((d) => conds.every((c) => {
        const [field, value] = c.split('=');
        return String((d as Record<string, unknown>)[field]) === value;
      }))
      .map((d) => ({ data: () => d, ref: `ref-${d.layerId}` }));
    return { docs, empty: docs.length === 0 };
  });
  mockedWriteBatch.mockImplementation(() => {
    const b: Batch = { update: jest.fn(), set: jest.fn(), delete: jest.fn(), commit: jest.fn() };
    b.commit.mockImplementation(() => commitImpl(b));
    batches.push(b);
    return b;
  });
  mockedSetDoc.mockResolvedValue(undefined);

  mockedDecGroup.mockImplementation(async (_at: Date, encdata: string[]) => {
    if (encdata[0] === 'SETTINGS_G') return { layers: [], updatedAt: 'x' };
    if (encdata[0] === 'META_G') return { name: 'P' };
    return { data: [{ id: encdata[0] }] };
  });
  mockedEncGroup.mockResolvedValue(['GROUP_ENC']);
  mockedCreateDEK.mockResolvedValue({ publicKey: 'DEK_PUB', privateKey: 'DEK_PRIV' });
  mockedEncryptWithDEK.mockResolvedValue(['DEK_ENC']);
  // DEKで開けるのは DEK で暗号化したものだけ
  mockedDecryptWithDEK.mockImplementation(async (encdata: string[]) => {
    if (encdata[0] === 'DEK_ENC') return { data: [] };
    throw new Error('not DEK');
  });
  mockedUnwrapDEK.mockResolvedValue('DEK_PRIV');
  mockedWrapDEK.mockImplementation(async (_priv: string, uid: string) => `wrapped-for-${uid}`);
});

describe('migrateProjectToDEK: 冪等判定と二重移行', () => {
  it('キャッシュが group でもサーバーが既に dek なら新しいDEKを作らず keys も dekPublicKey も書かない', async () => {
    setProjectCryptoCache(PID, { scheme: 'group', ownerUid: OWNER, confirmedAt: Date.now() });
    serverProject = { ...serverProject, cryptoScheme: 'dek', dekPublicKey: 'DEK_PUB' };
    settingsDoc = { editorUid: MEMBER, encdata: ['DEK_ENC'], encryptedAt: OLD_TS };
    dataDocs = dataDocs.map((d) => ({ ...d, encdata: ['DEK_ENC'], cryptoScheme: 'dek' as const }));

    const res = await migrateProjectToDEK(project);

    expect(res.isOK).toBe(true);
    expect(mockedCreateDEK).not.toHaveBeenCalled();
    expect(keySets()).toHaveLength(0);
    expect(batches.some((b) => b.update.mock.calls.length > 0)).toBe(false);
    expect(mockedUpdateDoc).not.toHaveBeenCalled();
    expect(mockedSetDoc).not.toHaveBeenCalled();
  });

  it('方式の確定と全メンバーへの keys 配布を同じ1バッチで書く', async () => {
    const res = await migrateProjectToDEK(project);

    expect(res.isOK).toBe(true);
    const migrationBatch = batches.find((b) => b.update.mock.calls.length > 0)!;
    expect(migrationBatch.update).toHaveBeenCalledWith(
      `projects/${PID}`,
      expect.objectContaining({ cryptoScheme: 'dek', dekPublicKey: 'DEK_PUB', encdata: ['DEK_ENC'] })
    );
    const keyPaths = migrationBatch.set.mock.calls.map(([path]: [string]) => path);
    expect(keyPaths).toEqual([`projects/${PID}/keys/${OWNER}`, `projects/${PID}/keys/${MEMBER}`]);
    // keys を先に別コミットで配っていない
    expect(keySets()).toHaveLength(2);
    expect(mockedUpdateDoc).not.toHaveBeenCalled();
  });

  it('設定は更新日時・最終編集者を据え置いてDEKで書き戻し、COMMON・TEMPLATE も再暗号化する', async () => {
    const res = await migrateProjectToDEK(project);

    expect(res.isOK).toBe(true);
    expect(mockedSetDoc).toHaveBeenCalledWith(`projects/${PID}/settings/default`, {
      editorUid: MEMBER,
      encdata: ['DEK_ENC'],
      encryptedAt: OLD_TS,
    });
    const dataSets = batches
      .flatMap((b) => b.set.mock.calls)
      .filter(([path]: [string]) => !String(path).includes('/keys/'))
      .map(([, d]: [string, DataDoc]) => d);
    expect(dataSets.map((d) => [d.permission, d.layerId, d.cryptoScheme])).toEqual([
      ['COMMON', 'L1', 'dek'],
      ['TEMPLATE', 'T1', 'dek'],
    ]);
  });

  it('バッチが拒否され、サーバーが先に dek になっていたら自分のDEKを捨てて残りだけを片付ける', async () => {
    commitImpl = async (b) => {
      if (b.update.mock.calls.length > 0) {
        // 別端末の移行が先に確定した（Rules の keepsDekPublicKey で拒否される）
        serverProject = { ...serverProject, cryptoScheme: 'dek', dekPublicKey: 'OTHER_PUB' };
        settingsDoc = { editorUid: MEMBER, encdata: ['DEK_ENC'], encryptedAt: OLD_TS };
        dataDocs = dataDocs.map((d) => ({ ...d, encdata: ['DEK_ENC'], cryptoScheme: 'dek' as const }));
        throw new Error('permission-denied');
      }
    };

    const res = await migrateProjectToDEK(project);

    expect(res.isOK).toBe(true);
    expect(mockedCreateDEK).toHaveBeenCalledTimes(1);
    // 拒否されたバッチ以外で keys を書いていない
    expect(batches.filter((b) => b.update.mock.calls.length === 0 && b.set.mock.calls.length > 0)).toHaveLength(0);
    expect(mockedSetDoc).not.toHaveBeenCalled();
    // 以後の暗号化は勝った側の dekPublicKey を使う（捨てたDEKをキャッシュに残さない）
    mockedEncryptWithDEK.mockClear();
    await uploadCurrentPosition(OWNER, PID, { icon: { photoURL: null, initial: 'A' }, coords: {} as never });
    expect(mockedEncryptWithDEK).toHaveBeenCalledWith(expect.anything(), 'OTHER_PUB');
  });

  it('バッチが拒否され、サーバーがまだ group なら失敗を返す', async () => {
    commitImpl = async (b) => {
      if (b.update.mock.calls.length > 0) throw new Error('unavailable');
    };
    const res = await migrateProjectToDEK(project);
    expect(res.isOK).toBe(false);
  });
});

describe('migrateProjectToDEK: 途中失敗と再実行', () => {
  it('設定の読み出しが例外（一時的な障害）なら何も書かずに失敗する', async () => {
    const baseGetDoc = mockedGetDoc.getMockImplementation()!;
    mockedGetDoc.mockImplementation(async (path: string) => {
      if (path === `projects/${PID}/settings/default`) throw new Error('unavailable');
      return baseGetDoc(path);
    });
    const res = await migrateProjectToDEK(project);
    expect(res.isOK).toBe(false);
    expect(mockedCreateDEK).not.toHaveBeenCalled();
    expect(batches).toHaveLength(0);
    expect(mockedSetDoc).not.toHaveBeenCalled();
  });

  it('設定が恒久的に復号できなければ警告して設定をグループ暗号のまま残し、移行は続ける（ロックアウトしない）', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockedDecGroup.mockImplementation(async (_at: Date, encdata: string[]) =>
      encdata[0] === 'SETTINGS_G' ? undefined : { data: [{ id: encdata[0] }] }
    );

    const res = await migrateProjectToDEK(project);

    expect(res.isOK).toBe(true);
    expect(warn).toHaveBeenCalled();
    // 方式の確定と keys 配布は行う
    const migrationBatch = batches.find((b) => b.update.mock.calls.length > 0)!;
    expect(migrationBatch.update).toHaveBeenCalledWith(
      `projects/${PID}`,
      expect.objectContaining({ cryptoScheme: 'dek', dekPublicKey: 'DEK_PUB' })
    );
    expect(keySets()).toHaveLength(2);
    // 設定は書き戻さない（グループ暗号のまま）、COMMON・TEMPLATE は再暗号化する
    expect(mockedSetDoc).not.toHaveBeenCalledWith(`projects/${PID}/settings/default`, expect.anything());
    const rewritten = batches
      .flatMap((b) => b.set.mock.calls)
      .filter(([path]: [string]) => !String(path).includes('/keys/'))
      .map(([, d]: [string, DataDoc]) => d.layerId);
    expect(rewritten).toEqual(['L1', 'T1']);
    warn.mockRestore();
  });

  it('移行済みプロジェクトの再実行でも、復号できない設定は残したまま成功を返す（毎回失敗しない）', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    serverProject = { ...serverProject, cryptoScheme: 'dek', dekPublicKey: 'DEK_PUB' };
    dataDocs = [
      { userId: MEMBER, layerId: 'L1', permission: 'COMMON', encdata: ['COMMON_G'], encryptedAt: OLD_TS },
      { userId: OWNER, layerId: 'T1', permission: 'TEMPLATE', encdata: ['DEK_ENC'], encryptedAt: OLD_TS, cryptoScheme: 'dek' },
    ];
    mockedDecGroup.mockImplementation(async (_at: Date, encdata: string[]) =>
      encdata[0] === 'SETTINGS_G' ? undefined : { data: [{ id: encdata[0] }] }
    );

    const res = await migrateProjectToDEK(project);

    expect(res.isOK).toBe(true);
    expect(warn).toHaveBeenCalled();
    expect(mockedSetDoc).not.toHaveBeenCalled();
    const rewritten = batches.flatMap((b) => b.set.mock.calls).map(([, d]: [string, DataDoc]) => d.layerId);
    expect(rewritten).toEqual(['L1']);
    warn.mockRestore();
  });

  it('移行済みプロジェクトの再実行で設定の読み出しが例外なら失敗を返す', async () => {
    serverProject = { ...serverProject, cryptoScheme: 'dek', dekPublicKey: 'DEK_PUB' };
    const baseGetDoc = mockedGetDoc.getMockImplementation()!;
    mockedGetDoc.mockImplementation(async (path: string) => {
      if (path === `projects/${PID}/settings/default`) throw new Error('unavailable');
      return baseGetDoc(path);
    });
    const res = await migrateProjectToDEK(project);
    expect(res.isOK).toBe(false);
    expect(mockedSetDoc).not.toHaveBeenCalled();
  });

  it('DEKキャッシュへの切り替えはバッチ確定後。確定前の並行書き込みはグループ暗号のまま、メタは生成したDEKで暗号化する', async () => {
    setProjectCryptoCache(PID, { scheme: 'group', ownerUid: OWNER, confirmedAt: Date.now() });
    const position = { icon: { photoURL: null, initial: 'A' }, coords: {} as never };
    commitImpl = async (b) => {
      if (b.update.mock.calls.length > 0) {
        // コミット中に並行して書き込みが走った
        await uploadCurrentPosition(OWNER, PID, position);
        throw new Error('unavailable');
      }
    };

    const res = await migrateProjectToDEK(project);

    expect(res.isOK).toBe(false);
    expect(mockedEncGroup).toHaveBeenCalledWith(position, OWNER, PID, OWNER);
    expect(mockedEncryptWithDEK).not.toHaveBeenCalledWith(position, 'DEK_PUB');
    expect(mockedEncryptWithDEK).toHaveBeenCalledWith(expect.objectContaining({ name: 'P' }), 'DEK_PUB');
  });

  it('設定の書き戻しに失敗したら移行全体を失敗として返す', async () => {
    mockedSetDoc.mockRejectedValue(new Error('unavailable'));
    const res = await migrateProjectToDEK(project);
    expect(res.isOK).toBe(false);
  });

  it('COMMON の書き戻しに失敗したら移行全体を失敗として返す', async () => {
    commitImpl = async (b) => {
      if (b.update.mock.calls.length === 0) throw new Error('unavailable');
    };
    const res = await migrateProjectToDEK(project);
    expect(res.isOK).toBe(false);
  });

  it('前回の失敗後の再実行では、グループ暗号のまま残った設定・COMMON だけを再暗号化する', async () => {
    // 前回の移行で方式は確定したが、設定と COMMON の L1 が書き戻されなかった
    serverProject = { ...serverProject, cryptoScheme: 'dek', dekPublicKey: 'DEK_PUB' };
    dataDocs = [
      { userId: MEMBER, layerId: 'L1', permission: 'COMMON', encdata: ['COMMON_G'], encryptedAt: OLD_TS },
      { userId: MEMBER, layerId: 'L2', permission: 'COMMON', encdata: ['DEK_ENC'], encryptedAt: OLD_TS, cryptoScheme: 'dek' },
      { userId: OWNER, layerId: 'T1', permission: 'TEMPLATE', encdata: ['DEK_ENC'], encryptedAt: OLD_TS, cryptoScheme: 'dek' },
    ];

    const res = await migrateProjectToDEK(project);

    expect(res.isOK).toBe(true);
    expect(mockedCreateDEK).not.toHaveBeenCalled();
    expect(keySets()).toHaveLength(0);
    expect(mockedSetDoc).toHaveBeenCalledWith(
      `projects/${PID}/settings/default`,
      expect.objectContaining({ editorUid: MEMBER, encryptedAt: OLD_TS })
    );
    const rewritten = batches.flatMap((b) => b.set.mock.calls).map(([, d]: [string, DataDoc]) => d.layerId);
    expect(rewritten).toEqual(['L1']);
  });

  it('再実行で自分のDEKが開けなければ失敗を返す', async () => {
    serverProject = { ...serverProject, cryptoScheme: 'dek', dekPublicKey: 'DEK_PUB' };
    mockedUnwrapDEK.mockResolvedValue(undefined);
    const res = await migrateProjectToDEK(project);
    expect(res.isOK).toBe(false);
    expect(mockedSetDoc).not.toHaveBeenCalled();
  });
});

describe('group キャッシュの寿命', () => {
  const position = { icon: { photoURL: null, initial: 'A' }, coords: {} as never };

  it('確かめてから時間が経った group キャッシュは、書き込み前にサーバーで確かめ直し dek ならDEKで暗号化する', async () => {
    setProjectCryptoCache(PID, { scheme: 'group', ownerUid: OWNER, confirmedAt: 0 });
    serverProject = { ...serverProject, cryptoScheme: 'dek', dekPublicKey: 'DEK_PUB' };

    const res = await uploadCurrentPosition(OWNER, PID, position);

    expect(res.isOK).toBe(true);
    expect(mockedEncGroup).not.toHaveBeenCalled();
    expect(mockedEncryptWithDEK).toHaveBeenCalledWith(position, 'DEK_PUB');
  });

  it('確かめた直後の group キャッシュは読み直さずにグループ暗号で書く', async () => {
    setProjectCryptoCache(PID, { scheme: 'group', ownerUid: OWNER, confirmedAt: Date.now() });

    await uploadCurrentPosition(OWNER, PID, position);

    expect(mockedGetDoc).not.toHaveBeenCalledWith(`projects/${PID}`);
    expect(mockedEncGroup).toHaveBeenCalledWith(position, OWNER, PID, OWNER);
  });

  it('サーバーで確かめても group のままならグループ暗号で書く', async () => {
    setProjectCryptoCache(PID, { scheme: 'group', ownerUid: OWNER, confirmedAt: 0 });

    await uploadCurrentPosition(OWNER, PID, position);

    expect(mockedGetDoc).toHaveBeenCalledWith(`projects/${PID}`);
    expect(mockedEncGroup).toHaveBeenCalled();
    expect(mockedEncryptWithDEK).not.toHaveBeenCalled();
  });

  it('getAllProjects が dek の doc を見たら group キャッシュを捨て、以後は dek として復号する', async () => {
    setProjectCryptoCache(PID, { scheme: 'group', ownerUid: OWNER, confirmedAt: Date.now() });
    mockedGetDocsFromServer.mockImplementation(async (q: string) => {
      if (q.startsWith('projects|')) {
        return {
          docs: [
            {
              id: PID,
              data: () => ({
                ownerUid: OWNER,
                adminsUid: [OWNER],
                membersUid: [OWNER, MEMBER],
                encdata: ['DEK_ENC'],
                encryptedAt: OLD_TS,
                cryptoScheme: 'dek',
                dekPublicKey: 'DEK_PUB',
              }),
            },
          ],
        };
      }
      return { docs: [], empty: true };
    });
    serverProject = { ...serverProject, cryptoScheme: 'dek', dekPublicKey: 'DEK_PUB' };
    mockedDecryptWithDEK.mockResolvedValue({ name: 'P' });

    const res = await getAllProjects(OWNER);

    expect(res.projects).toHaveLength(1);
    expect(mockedDecGroup).not.toHaveBeenCalled();
    mockedDecryptWithDEK.mockClear();
    await decryptProjectData(new Date(), ['DEK_ENC'], OWNER, PID);
    expect(mockedDecryptWithDEK).toHaveBeenCalledWith(['DEK_ENC'], 'DEK_PRIV');
  });
});

describe('addMemberKey: 在籍確認', () => {
  beforeEach(() => {
    serverProject = { ...serverProject, cryptoScheme: 'dek', dekPublicKey: 'DEK_PUB' };
  });

  it('requireCurrentMember のとき、サーバーの membersUid に居ない宛先には鍵を作らない', async () => {
    const res = await addMemberKey(PID, 'removed-c', { requireCurrentMember: true });
    expect(res.isOK).toBe(false);
    expect(mockedSetDoc).not.toHaveBeenCalled();
    expect(mockedWrapDEK).not.toHaveBeenCalled();
  });

  it('requireCurrentMember のとき、在籍中の宛先には鍵を作り直す', async () => {
    const res = await addMemberKey(PID, MEMBER, { requireCurrentMember: true });
    expect(res.isOK).toBe(true);
    expect(mockedSetDoc).toHaveBeenCalledWith(
      `projects/${PID}/keys/${MEMBER}`,
      expect.objectContaining({ encDek: `wrapped-for-${MEMBER}`, wrapperUid: OWNER })
    );
  });

  it('既定（メンバー追加: プロジェクト保存より先に呼ばれる）では在籍を確かめずに鍵を作る', async () => {
    const res = await addMemberKey(PID, 'new-d');
    expect(res.isOK).toBe(true);
    expect(mockedSetDoc).toHaveBeenCalledWith(`projects/${PID}/keys/new-d`, expect.anything());
  });
});
