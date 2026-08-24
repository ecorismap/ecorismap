import reducer, { changeProjectSort, projectsUIInitialState, setShowArchive } from '../projectsUI';

describe('modules/projectsUI', () => {
  test('setShowArchiveでアーカイブ表示を切り替える', () => {
    const state = reducer(projectsUIInitialState, setShowArchive(true));
    expect(state.isShowArchive).toBe(true);
    expect(reducer(state, setShowArchive(false)).isShowArchive).toBe(false);
  });

  test('別の列を押すとその列の降順から開始する', () => {
    const state = reducer(projectsUIInitialState, changeProjectSort('name'));
    expect(state).toEqual({ ...projectsUIInitialState, sortField: 'name', sortOrder: 'DESCENDING' });
  });

  test('同じ列を押すと降順→昇順→未ソートを循環する', () => {
    let state = reducer(projectsUIInitialState, changeProjectSort('name'));
    state = reducer(state, changeProjectSort('name'));
    expect(state.sortOrder).toBe('ASCENDING');
    state = reducer(state, changeProjectSort('name'));
    expect(state.sortOrder).toBe('UNSORTED');
    state = reducer(state, changeProjectSort('name'));
    expect(state.sortOrder).toBe('DESCENDING');
  });
});
