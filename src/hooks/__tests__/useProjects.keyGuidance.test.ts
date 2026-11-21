import { renderHook } from '@testing-library/react-hooks';
import { resolveKeyGuidance, resolveKeyRestoreMessage, useProjects } from '../useProjects';
import { getKeyMigrationState, KeyMigrationState } from '../../lib/crypto/migration';
import { getKeyBackupStatus } from '../../lib/crypto/backup';
import { getAllProjects } from '../../lib/firebase/firestore';
import { initializeUser, isInitialized } from '../../lib/virgilsecurity/e3kit';

const mockUser = { uid: 'user-uid', email: 'user@example.com', displayName: 'user', photoURL: null };
const mockState = {
  user: mockUser,
  projects: [],
  favoriteProjects: { projectIds: [], showOnlyFavorites: false },
  projectsUI: undefined,
};

jest.mock('react-redux', () => ({
  useDispatch: () => jest.fn(),
  useSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));

jest.mock('../../lib/crypto/migration', () => ({ getKeyMigrationState: jest.fn() }));
jest.mock('../../lib/crypto/backup', () => ({ getKeyBackupStatus: jest.fn() }));
jest.mock('../../lib/firebase/firestore', () => ({ getAllProjects: jest.fn() }));
jest.mock('../../lib/virgilsecurity/e3kit', () => ({ isInitialized: jest.fn(), initializeUser: jest.fn() }));
jest.mock('../../i18n/config', () => ({ t: jest.fn((key: string) => key) }));
jest.mock('../../constants/AppConstants', () => ({
  FUNC_ENCRYPTION: true,
  ENABLE_DEK_MIGRATION: false,
  ENABLE_KEY_LEDGER: true,
}));

const mockGetKeyMigrationState = getKeyMigrationState as jest.MockedFunction<typeof getKeyMigrationState>;
const mockGetKeyBackupStatus = getKeyBackupStatus as jest.MockedFunction<typeof getKeyBackupStatus>;
const mockGetAllProjects = getAllProjects as jest.MockedFunction<typeof getAllProjects>;
const mockIsInitialized = isInitialized as jest.MockedFunction<typeof isInitialized>;
const mockInitializeUser = initializeUser as jest.MockedFunction<typeof initializeUser>;

describe('resolveKeyGuidance', () => {
  it.each<[string, KeyMigrationState, ReturnType<typeof resolveKeyGuidance>]>([
    [
      '未移行は移行フォーム',
      { state: 'needs-migration' },
      { accountFormState: 'migrateEncryptPassword', message: 'hooks.message.migrateEncryptPassword' },
    ],
    [
      '鍵リセット中断はバックアップフォーム',
      { state: 'needs-backup', reason: 'reset-pending' },
      { accountFormState: 'backupEncryptPassword', message: 'hooks.message.resumeKeyBackupAfterReset' },
    ],
    [
      'バックアップが古い場合は移行フォームで作り直し',
      { state: 'needs-backup', reason: 'backup-stale' },
      { accountFormState: 'migrateEncryptPassword', message: 'hooks.message.rebackupStaleKey' },
    ],
    [
      '端末の鍵が古い場合は復元フォーム',
      { state: 'migrated-need-restore', reason: 'stale-local-key' },
      { accountFormState: 'restoreEncryptKey', message: 'hooks.message.inputNewPinRestoreStaleKey' },
    ],
    ['移行済みは誘導しない', { state: 'migrated' }, undefined],
    ['エラー（オフライン等）は誘導しない', { state: 'error', message: 'offline' }, undefined],
    // 台帳を照合できなかったときにも返るため、e3kitに鍵がある復帰セッションでは誘導しない
    ['理由なしの要復元は誘導しない', { state: 'migrated-need-restore', lockedUntil: null }, undefined],
  ])('%s', (_label, state, expected) => {
    expect(resolveKeyGuidance(state)).toEqual(expected);
  });
});

describe('resolveKeyRestoreMessage', () => {
  it('古い鍵・移行済み・未移行でメッセージを出し分ける', () => {
    expect(resolveKeyRestoreMessage({ state: 'migrated-need-restore', reason: 'stale-local-key' })).toBe(
      'hooks.message.inputNewPinRestoreStaleKey'
    );
    expect(resolveKeyRestoreMessage({ state: 'migrated-need-restore' })).toBe('hooks.message.inputNewPinRestore');
    expect(resolveKeyRestoreMessage({ state: 'needs-migration' })).toBe('hooks.message.inputEncryptPassword');
  });
});

describe('useProjects.fetchProjects の鍵誘導', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsInitialized.mockReturnValue(true);
    mockGetAllProjects.mockResolvedValue({ isOK: true, message: '', projects: [] });
  });

  it('backup-stale は一覧を読み込んだうえで再バックアップへ誘導する', async () => {
    mockGetKeyMigrationState.mockResolvedValue({ state: 'needs-backup', reason: 'backup-stale' });
    const { result } = renderHook(() => useProjects());
    const res = await result.current.fetchProjects(false);
    expect(res.isOK).toBe(true);
    expect(res.needsKeyMigration).toBe(false);
    expect(res.keyGuidance).toEqual({
      accountFormState: 'migrateEncryptPassword',
      message: 'hooks.message.rebackupStaleKey',
    });
    // サーバー照会が成功しないと返らない状態なので、到達確認は不要
    expect(mockGetKeyBackupStatus).not.toHaveBeenCalled();
  });

  it('stale-local-key は復元フォームへ誘導する', async () => {
    mockGetKeyMigrationState.mockResolvedValue({ state: 'migrated-need-restore', reason: 'stale-local-key' });
    const { result } = renderHook(() => useProjects());
    const res = await result.current.fetchProjects(false);
    expect(res.keyGuidance?.accountFormState).toBe('restoreEncryptKey');
  });

  it('needs-migration は従来どおり needsKeyMigration も返す', async () => {
    mockGetKeyMigrationState.mockResolvedValue({ state: 'needs-migration' });
    const { result } = renderHook(() => useProjects());
    const res = await result.current.fetchProjects(false);
    expect(res.needsKeyMigration).toBe(true);
    expect(res.keyGuidance?.accountFormState).toBe('migrateEncryptPassword');
  });

  it('reset-pending はサーバーへ届くときだけバックアップフォームへ誘導する', async () => {
    mockGetKeyMigrationState.mockResolvedValue({ state: 'needs-backup', reason: 'reset-pending' });
    mockGetKeyBackupStatus.mockResolvedValue({ isOK: true, status: { exists: true } } as Awaited<
      ReturnType<typeof getKeyBackupStatus>
    >);
    const { result } = renderHook(() => useProjects());
    const res = await result.current.fetchProjects(false);
    expect(res.keyGuidance?.accountFormState).toBe('backupEncryptPassword');
  });

  it('reset-pending でもオフライン（サーバー照会失敗）なら誘導しない', async () => {
    mockGetKeyMigrationState.mockResolvedValue({ state: 'needs-backup', reason: 'reset-pending' });
    mockGetKeyBackupStatus.mockResolvedValue({ isOK: false, message: 'unavailable' });
    const { result } = renderHook(() => useProjects());
    const res = await result.current.fetchProjects(false);
    expect(res.isOK).toBe(true);
    expect(res.keyGuidance).toBeUndefined();
  });

  it('台帳を照合できない（理由なしの要復元・エラー）ときは誘導しない', async () => {
    mockGetKeyMigrationState.mockResolvedValueOnce({ state: 'migrated-need-restore', lockedUntil: null });
    const { result } = renderHook(() => useProjects());
    expect((await result.current.fetchProjects(false)).keyGuidance).toBeUndefined();
    mockGetKeyMigrationState.mockResolvedValueOnce({ state: 'error', message: 'offline' });
    expect((await result.current.fetchProjects(false)).keyGuidance).toBeUndefined();
  });

  it('端末に鍵がない復帰セッションは古い鍵の文言で復元フォームへ', async () => {
    mockIsInitialized.mockReturnValue(false);
    mockInitializeUser.mockResolvedValue({ isOK: false, message: 'not-localkey' });
    mockGetKeyMigrationState.mockResolvedValue({ state: 'migrated-need-restore', reason: 'stale-local-key' });
    const { result } = renderHook(() => useProjects());
    const res = await result.current.fetchProjects(false);
    expect(res).toEqual({
      isOK: false,
      message: '',
      needsKeyRestore: true,
      restoreMessage: 'hooks.message.inputNewPinRestoreStaleKey',
    });
    expect(mockGetAllProjects).not.toHaveBeenCalled();
  });
});
