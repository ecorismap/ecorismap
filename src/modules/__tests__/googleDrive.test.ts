import reducer, {
  googleDriveInitialState,
  setGoogleDriveConnectedEmailAction,
  setGoogleDriveLastSyncAction,
  deleteGoogleDriveLastSyncAction,
} from '../googleDrive';

describe('modules/googleDrive', () => {
  test('初期状態が正しい', () => {
    expect(reducer(undefined, { type: 'unknown' })).toEqual(googleDriveInitialState);
  });

  test('setGoogleDriveConnectedEmailActionでメールアドレスを設定・解除できる', () => {
    let state = reducer(googleDriveInitialState, setGoogleDriveConnectedEmailAction('a@example.com'));
    expect(state.connectedEmail).toBe('a@example.com');
    state = reducer(state, setGoogleDriveConnectedEmailAction(undefined));
    expect(state.connectedEmail).toBeUndefined();
  });

  test('setGoogleDriveLastSyncActionでprojectId単位に記録する', () => {
    const state = reducer(
      googleDriveInitialState,
      setGoogleDriveLastSyncAction({
        projectId: 'P1',
        fileId: 'f1',
        headRevisionId: 'r1',
        syncedAt: '2026-07-08T00:00:00Z',
        name: 'test',
      })
    );
    expect(state.lastSync.P1).toEqual({
      fileId: 'f1',
      headRevisionId: 'r1',
      syncedAt: '2026-07-08T00:00:00Z',
      name: 'test',
    });
  });

  test('同じprojectIdは上書きされる', () => {
    let state = reducer(
      googleDriveInitialState,
      setGoogleDriveLastSyncAction({ projectId: 'P1', fileId: 'f1', headRevisionId: 'r1', syncedAt: 't1', name: 'a' })
    );
    state = reducer(
      state,
      setGoogleDriveLastSyncAction({ projectId: 'P1', fileId: 'f1', headRevisionId: 'r2', syncedAt: 't2', name: 'a' })
    );
    expect(state.lastSync.P1.headRevisionId).toBe('r2');
    expect(Object.keys(state.lastSync)).toHaveLength(1);
  });

  test('deleteGoogleDriveLastSyncActionで記録を削除する', () => {
    let state = reducer(
      googleDriveInitialState,
      setGoogleDriveLastSyncAction({ projectId: 'P1', fileId: 'f1', headRevisionId: 'r1', syncedAt: 't1', name: 'a' })
    );
    state = reducer(state, deleteGoogleDriveLastSyncAction('P1'));
    expect(state.lastSync.P1).toBeUndefined();
  });
});
