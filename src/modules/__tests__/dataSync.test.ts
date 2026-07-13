import reducer, {
  dataSyncInitialState,
  dataSyncKey,
  setDataSyncTimestampsAction,
  clearDataSyncProjectAction,
  setDataSyncAllAction,
} from '../dataSync';

describe('dataSync slice', () => {
  it('初期状態は空オブジェクト', () => {
    expect(reducer(undefined, { type: 'unknown' })).toEqual(dataSyncInitialState);
    expect(dataSyncInitialState).toEqual({});
  });

  it('dataSyncKey は layerId_permission を返す', () => {
    expect(dataSyncKey('l1', 'PRIVATE')).toBe('l1_PRIVATE');
  });

  it('setDataSyncTimestampsAction でプロジェクトの基準値を設定できる', () => {
    const state = reducer(
      {},
      setDataSyncTimestampsAction({ projectId: 'p1', entries: { l1_PRIVATE: 100, l2_PUBLIC: 200 } })
    );
    expect(state).toEqual({ p1: { l1_PRIVATE: 100, l2_PUBLIC: 200 } });
  });

  it('既存の基準値をマージ更新する（他キーは保持）', () => {
    const prev = { p1: { l1_PRIVATE: 100, l2_PUBLIC: 200 } };
    const state = reducer(prev, setDataSyncTimestampsAction({ projectId: 'p1', entries: { l1_PRIVATE: 999 } }));
    expect(state.p1).toEqual({ l1_PRIVATE: 999, l2_PUBLIC: 200 });
  });

  it('value が undefined のキーは削除される（空アップロード＝未確立を表す）', () => {
    const prev = { p1: { l1_PRIVATE: 100, l2_PUBLIC: 200 } };
    const state = reducer(prev, setDataSyncTimestampsAction({ projectId: 'p1', entries: { l1_PRIVATE: undefined } }));
    expect(state.p1).toEqual({ l2_PUBLIC: 200 });
  });

  it('clearDataSyncProjectAction で指定プロジェクトを破棄する', () => {
    const prev = { p1: { l1_PRIVATE: 100 }, p2: { l3_PRIVATE: 300 } };
    const state = reducer(prev, clearDataSyncProjectAction('p1'));
    expect(state).toEqual({ p2: { l3_PRIVATE: 300 } });
  });

  it('setDataSyncAllAction で全体を置換する（バックアップ復元用）', () => {
    const prev = { p1: { l1_PRIVATE: 100 } };
    const next = { p2: { l3_PRIVATE: 300 } };
    expect(reducer(prev, setDataSyncAllAction(next))).toEqual(next);
    expect(reducer(prev, setDataSyncAllAction({}))).toEqual({});
  });
});
