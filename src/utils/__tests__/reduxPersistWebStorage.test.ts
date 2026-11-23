import { parseTileMapIdsFromPersistedRoot, selectOrphanDatabases } from '../reduxPersistWebStorage';

const DB_PREFIX = 'ecorismapReduxPersist-';

describe('selectOrphanDatabases', () => {
  it('生存タブが保持していないDBのみ孤児と判定する', () => {
    const dbNames = [`${DB_PREFIX}tab1`, `${DB_PREFIX}tab2`, `${DB_PREFIX}tab3`];
    const alive = new Set(['tab1']);
    expect(selectOrphanDatabases(dbNames, alive, 'tab2')).toEqual([`${DB_PREFIX}tab3`]);
  });

  it('自タブのDBはロック状態に関わらず孤児にしない', () => {
    const dbNames = [`${DB_PREFIX}self`];
    expect(selectOrphanDatabases(dbNames, new Set(), 'self')).toEqual([]);
  });

  it('プレフィックスが異なるDB（tilesDB等）は対象外', () => {
    const dbNames = ['tilesDB', `${DB_PREFIX}tab1`];
    expect(selectOrphanDatabases(dbNames, new Set(), 'current')).toEqual([`${DB_PREFIX}tab1`]);
  });

  it('pending扱いのタブID（起動中タブ）は生存として保護される', () => {
    const dbNames = [`${DB_PREFIX}starting`];
    const alive = new Set(['starting']); // held + pending を合わせた集合
    expect(selectOrphanDatabases(dbNames, alive, 'current')).toEqual([]);
  });

  it('空のDBリストなら空を返す', () => {
    expect(selectOrphanDatabases([], new Set(['a']), 'b')).toEqual([]);
  });
});

describe('parseTileMapIdsFromPersistedRoot（永続化監査 S-H1）', () => {
  const root = (tileMaps: unknown) => JSON.stringify({ tileMaps: JSON.stringify(tileMaps), _persist: '{}' });

  it('redux-persist の保存形式から tileMaps の id を取り出す', () => {
    expect(parseTileMapIdsFromPersistedRoot(root([{ id: 'a' }, { id: 'b' }]))).toEqual(['a', 'b']);
  });

  it('まだ書いていないタブ・tileMaps の無い保存値は空', () => {
    expect(parseTileMapIdsFromPersistedRoot(undefined)).toEqual([]);
    expect(parseTileMapIdsFromPersistedRoot(null)).toEqual([]);
    expect(parseTileMapIdsFromPersistedRoot(JSON.stringify({ settings: '{}' }))).toEqual([]);
  });

  it('読めない保存値は undefined（消去を諦めさせる）', () => {
    expect(parseTileMapIdsFromPersistedRoot('{broken')).toBeUndefined();
    expect(parseTileMapIdsFromPersistedRoot(JSON.stringify({ tileMaps: '{broken' }))).toBeUndefined();
    expect(parseTileMapIdsFromPersistedRoot(JSON.stringify({ tileMaps: JSON.stringify({ id: 'x' }) }))).toBeUndefined();
  });
});
