import * as FileSystem from 'expo-file-system/legacy';
import { needsMapterhornUrl, runDemSourceMigrationWith, toMapterhornDemUrl } from '../demSourceMigrationCore';
import { runDemSourceMigration } from '../demSourceMigration';

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///test/',
  cacheDirectory: 'file:///cache/',
  deleteAsync: jest.fn(() => Promise.resolve()),
}));

const region = (id: string, tileMapId: string) => ({
  id,
  tileMapId,
  coords: [],
  centroid: { latitude: 0, longitude: 0 },
});

const map = (id: string, url: string, attribution = '') => ({ id, url, attribution, name: id });

/** reducerを持たない簡易store。dispatchされたactionでstateを差し替える */
const createStore = (tileMaps: ReturnType<typeof map>[], tileRegions: ReturnType<typeof region>[]) => {
  const state = { tileMaps, settings: { tileRegions } };
  const dispatch = jest.fn((action: { type: string; payload: never }) => {
    if (action.type.endsWith('setTileMapsAction')) state.tileMaps = action.payload;
    if (action.type.endsWith('editSettingsAction')) {
      state.settings = { ...state.settings, ...(action.payload as object) } as typeof state.settings;
    }
    return action;
  });
  return { store: { getState: () => state as never, dispatch: dispatch as never }, state, dispatch };
};

const GSJ_HILLSHADE = 'hillshade://https://tiles.gsj.jp/tiles/elev/mixed/{z}/{y}/{x}.png';
const MAPTERHORN_HILLSHADE = 'hillshade://https://tiles.mapterhorn.com/{z}/{x}/{y}.webp';
const GEBCO = 'relief://https://tiles.gsj.jp/tiles/elev/gebco/{z}/{y}/{x}.png#style=gebco';

describe('needsMapterhornUrl / toMapterhornDemUrl', () => {
  it('Mapterhorn以外の陰影起伏・汎用段彩だけが対象（GEBCO段彩・通常の地図は対象外）', () => {
    expect(needsMapterhornUrl(GSJ_HILLSHADE)).toBe(true);
    expect(needsMapterhornUrl('relief://https://example.com/dem/{z}/{x}/{y}.png')).toBe(true);
    expect(needsMapterhornUrl(MAPTERHORN_HILLSHADE)).toBe(false);
    expect(needsMapterhornUrl(GEBCO)).toBe(false);
    expect(needsMapterhornUrl('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png')).toBe(false);
  });

  it('接頭辞とフラグメントを保ってMapterhornへ差し替える', () => {
    expect(toMapterhornDemUrl(GSJ_HILLSHADE)).toBe(MAPTERHORN_HILLSHADE);
    expect(toMapterhornDemUrl('relief://https://example.com/{z}/{x}/{y}.png#style=dynamic')).toBe(
      'relief://https://tiles.mapterhorn.com/{z}/{x}/{y}.webp#style=dynamic'
    );
  });
});

describe('runDemSourceMigration', () => {
  beforeEach(() => jest.clearAllMocks());

  it('旧dem_viewshedの領域記録を消し、保存フォルダを削除する', () => {
    const { store, state } = createStore([], [region('a', 'dem_viewshed'), region('b', 'M1')]);
    runDemSourceMigration(store);
    expect(state.settings.tileRegions.map((r) => r.id)).toEqual(['b']);
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith('file:///test/tiles/dem_viewshed', { idempotent: true });
    // 旧方式のディスクキャッシュも消す
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith('file:///cache/dem_png', { idempotent: true });
  });

  it('旧形式の陰影起伏はURL・出典を書き換え、旧形式のキャッシュとダウンロード記録を消す', () => {
    const { store, state } = createStore(
      [map('H', GSJ_HILLSHADE, '産総研シームレス標高タイル'), map('G', GEBCO), map('S', 'https://std/{z}/{x}/{y}.png')],
      [region('r1', 'H'), region('r2', 'G')]
    );
    runDemSourceMigration(store);
    expect(state.tileMaps.find((m) => m.id === 'H')?.url).toBe(MAPTERHORN_HILLSHADE);
    expect(state.tileMaps.find((m) => m.id === 'H')?.attribution).toContain('Mapterhorn');
    expect(state.tileMaps.find((m) => m.id === 'G')?.url).toBe(GEBCO);
    expect(state.settings.tileRegions.map((r) => r.id)).toEqual(['r2']);
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith('file:///test/tiles/H', { idempotent: true });
    expect(FileSystem.deleteAsync).not.toHaveBeenCalledWith('file:///test/tiles/G', { idempotent: true });
  });

  it('対象が無ければstoreは触らない（毎回の起動で呼んでよい）', () => {
    const { store, dispatch } = createStore([map('H', MAPTERHORN_HILLSHADE)], [region('c', 'dem_mapterhorn')]);
    runDemSourceMigrationWith(store, () => {});
    expect(dispatch).not.toHaveBeenCalled();
  });
});
