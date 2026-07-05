import { selectOrphanDatabases } from '../reduxPersistWebStorage';

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
