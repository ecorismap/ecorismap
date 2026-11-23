/** A-L13: Drive 保存の既定名は今のデータに対応するファイルの名前、なければ日付名 */
import reducer, {
  deleteGoogleDriveLastSyncAction,
  googleDriveInitialState,
  GoogleDriveState,
  selectGoogleDriveDefaultSaveName,
  setGoogleDriveConnectedEmailAction,
  setGoogleDriveCurrentFileAction,
  setGoogleDriveLastSyncAction,
} from '../googleDrive';
import { setDataSetAction } from '../dataSet';

const FALLBACK = 'ecorismap_2026-11-23';

const synced = (): GoogleDriveState => {
  let state = reducer(googleDriveInitialState, setGoogleDriveConnectedEmailAction('a@example.com'));
  state = reducer(
    state,
    setGoogleDriveLastSyncAction({
      projectId: 'PA',
      fileId: 'fA',
      headRevisionId: 'r',
      syncedAt: '2026-11-01',
      name: 'A',
    })
  );
  state = reducer(
    state,
    setGoogleDriveLastSyncAction({
      projectId: 'PB',
      fileId: 'fB',
      headRevisionId: 'r',
      syncedAt: '2026-11-02',
      name: 'B',
    })
  );
  return state;
};

describe('selectGoogleDriveDefaultSaveName', () => {
  test('今のデータに対応するファイルがなければ、直前に同期した別のファイル名ではなく日付名', () => {
    expect(selectGoogleDriveDefaultSaveName(synced(), FALLBACK)).toBe(FALLBACK);
  });

  test('対応するファイルがあればその名前（最新の同期でなくても）', () => {
    const state = reducer(synced(), setGoogleDriveCurrentFileAction('fA'));
    expect(selectGoogleDriveDefaultSaveName(state, FALLBACK)).toBe('A');
  });

  test('対応するファイルの同期記録が無ければ日付名', () => {
    const state = reducer(synced(), setGoogleDriveCurrentFileAction('fX'));
    expect(selectGoogleDriveDefaultSaveName(state, FALLBACK)).toBe(FALLBACK);
  });
});

describe('対応を外す', () => {
  test('データを丸ごと置き換えたら（新規・ファイルを開く・プロジェクトを開くなど）外す', () => {
    const state = reducer(reducer(synced(), setGoogleDriveCurrentFileAction('fA')), setDataSetAction([]));
    expect(state.currentFileId).toBeUndefined();
  });

  test('接続解除・別アカウントへの切替で外し、同じアカウントの再通知では残す', () => {
    const current = reducer(synced(), setGoogleDriveCurrentFileAction('fA'));
    expect(reducer(current, setGoogleDriveConnectedEmailAction('a@example.com')).currentFileId).toBe('fA');
    expect(reducer(current, setGoogleDriveConnectedEmailAction('b@example.com')).currentFileId).toBeUndefined();
    expect(reducer(current, setGoogleDriveConnectedEmailAction(undefined)).currentFileId).toBeUndefined();
  });

  test('対応するファイルを Drive から消したら外し、別のファイルの削除では残す', () => {
    const current = reducer(synced(), setGoogleDriveCurrentFileAction('fA'));
    expect(reducer(current, deleteGoogleDriveLastSyncAction('PB')).currentFileId).toBe('fA');
    expect(reducer(current, deleteGoogleDriveLastSyncAction('PA')).currentFileId).toBeUndefined();
  });
});
