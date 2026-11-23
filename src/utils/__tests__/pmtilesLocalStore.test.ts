// タイル監査 M-H5: スタイル読み込みと地図編集の保存で、style.json や取り込んだ PMTiles 本体を消さない
import * as FileSystem from 'expo-file-system/legacy';
import {
  cleanupPmtilesOnSave,
  getPmtilesSaveCleanup,
  isTileCacheEntry,
  saveStyleToPmtilesDb,
} from '../pmtilesLocalStore';
import { TILE_FOLDER } from '../../constants/AppConstants';

type PMTilesRecord = { mapId: string; blob: Blob | undefined; boundary: string; style: string | undefined };

const mockStore = new Map<string, PMTilesRecord>();

// Dexie の put（丸ごと置き換え）と update（部分更新・件数を返す）の違いを再現する
jest.mock('../db', () => ({
  db: {
    pmtiles: {
      get: jest.fn(async (id: string) => mockStore.get(id)),
      put: jest.fn(async (item: PMTilesRecord) => {
        mockStore.set(item.mapId, item);
        return item.mapId;
      }),
      update: jest.fn(async (id: string, changes: Partial<PMTilesRecord>) => {
        const current = mockStore.get(id);
        if (current === undefined) return 0;
        mockStore.set(id, { ...current, ...changes });
        return 1;
      }),
      delete: jest.fn(async (id: string) => {
        mockStore.delete(id);
      }),
    },
  },
}));

jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: jest.fn(),
  readDirectoryAsync: jest.fn(),
  deleteAsync: jest.fn(async () => undefined),
}));

const platform = (require('react-native') as { Platform: { OS: string } }).Platform;
const mockedFS = FileSystem as jest.Mocked<typeof FileSystem>;

const blob = new Blob(['pmtiles-body']);

beforeEach(() => {
  mockStore.clear();
  jest.clearAllMocks();
});

describe('saveStyleToPmtilesDb', () => {
  it('取り込んだ PMTiles の blob と boundary を残して style だけを書く', async () => {
    mockStore.set('m1', { mapId: 'm1', blob, boundary: '{"b":1}', style: undefined });
    await saveStyleToPmtilesDb('m1', '{"version":8}');
    expect(mockStore.get('m1')).toEqual({ mapId: 'm1', blob, boundary: '{"b":1}', style: '{"version":8}' });
  });

  it('レコードが無いときだけ新しく作る', async () => {
    await saveStyleToPmtilesDb('m2', '{"version":8}');
    expect(mockStore.get('m2')).toEqual({ mapId: 'm2', blob: undefined, boundary: '', style: '{"version":8}' });
  });
});

describe('getPmtilesSaveCleanup', () => {
  const prev = { url: 'pmtiles://https://example.com/a.pmtiles', styleURL: '' };
  const none = { source: false, renderedTiles: false, style: false };

  it('新規作成（元の地図なし）では何も消さない', () => {
    expect(getPmtilesSaveCleanup(undefined, prev)).toEqual(none);
  });

  it('何も変わっていなければ何も消さない', () => {
    expect(getPmtilesSaveCleanup(prev, { ...prev })).toEqual(none);
    // undefined と '' は同じ「スタイルなし」
    expect(getPmtilesSaveCleanup({ url: prev.url, styleURL: undefined }, prev)).toEqual(none);
  });

  it('端末内スタイル（style://）へ切り替えたら、描画済み画像だけを消す', () => {
    expect(getPmtilesSaveCleanup(prev, { ...prev, styleURL: 'style://style.json' })).toEqual({
      source: false,
      renderedTiles: true,
      style: false,
    });
  });

  it('https のスタイル同士の変更では style.json は残す（オンラインで上書きされる）', () => {
    const httpsPrev = { ...prev, styleURL: 'https://example.com/a.json' };
    expect(getPmtilesSaveCleanup(httpsPrev, { ...prev, styleURL: 'https://example.com/b.json' })).toEqual({
      source: false,
      renderedTiles: true,
      style: false,
    });
  });

  it('スタイル欄を空に戻したら style.json も消す', () => {
    expect(getPmtilesSaveCleanup({ ...prev, styleURL: 'style://style.json' }, { ...prev, styleURL: '' })).toEqual({
      source: false,
      renderedTiles: true,
      style: true,
    });
    expect(
      getPmtilesSaveCleanup({ ...prev, styleURL: 'https://example.com/a.json' }, { ...prev, styleURL: undefined }).style
    ).toBe(true);
  });

  it('style:// のまま URL を変えても、旧ソースのタイルと boundary を消す', () => {
    const styled = { ...prev, styleURL: 'style://style.json' };
    expect(getPmtilesSaveCleanup(styled, { ...styled, url: 'pmtiles://https://example.com/b.pmtiles' })).toEqual({
      source: true,
      renderedTiles: true,
      style: false,
    });
  });
});

describe('isTileCacheEntry', () => {
  it('ズームの数字ディレクトリと .pbf だけをタイルとみなす', () => {
    expect(isTileCacheEntry('14')).toBe(true);
    expect(isTileCacheEntry('0')).toBe(true);
    expect(isTileCacheEntry('tile.pbf')).toBe(true);
    expect(isTileCacheEntry('style.json')).toBe(false);
    expect(isTileCacheEntry('boundary.json')).toBe(false);
    expect(isTileCacheEntry('area.pmtiles')).toBe(false);
    expect(isTileCacheEntry('14a')).toBe(false);
  });
});

describe('cleanupPmtilesOnSave', () => {
  const sourceChange = { source: true, renderedTiles: true, style: false };
  const styleChange = { source: false, renderedTiles: true, style: false };
  const styleCleared = { source: false, renderedTiles: true, style: true };

  // TILE_FOLDER/m1 の中身: 12/34/{56, 56.pbf}・boundary.json・style.json・area.pmtiles
  const mockNativeFolder = () => {
    mockedFS.getInfoAsync.mockResolvedValue({ exists: true, isDirectory: true } as never);
    mockedFS.readDirectoryAsync.mockImplementation(async (path: string) => {
      if (path === `${TILE_FOLDER}/m1`) return ['12', 'x.pbf', 'boundary.json', 'style.json', 'area.pmtiles'];
      if (path === `${TILE_FOLDER}/m1/12`) return ['34'];
      if (path === `${TILE_FOLDER}/m1/12/34`) return ['56', '56.pbf'];
      throw new Error('not found');
    });
  };
  const deletedPaths = () => mockedFS.deleteAsync.mock.calls.map((c) => c[0]);

  afterEach(() => {
    platform.OS = 'ios';
  });

  it('何も変わっていなければ触らない', async () => {
    platform.OS = 'ios';
    await cleanupPmtilesOnSave('m1', { source: false, renderedTiles: false, style: false });
    expect(mockedFS.getInfoAsync).not.toHaveBeenCalled();
  });

  it('URL が変わったらタイルと boundary.json だけを消し、style.json と取り込んだ本体は残す', async () => {
    platform.OS = 'ios';
    mockNativeFolder();
    await cleanupPmtilesOnSave('m1', sourceChange);
    expect(deletedPaths()).toEqual([`${TILE_FOLDER}/m1/12`, `${TILE_FOLDER}/m1/x.pbf`, `${TILE_FOLDER}/m1/boundary.json`]);
    expect(deletedPaths()).not.toContain(`${TILE_FOLDER}/m1`);
  });

  it('style:// へ切り替えたら描画済み画像 {z}/{x}/{y} だけを消し、{y}.pbf・style.json・boundary.json は残す', async () => {
    platform.OS = 'android';
    mockNativeFolder();
    await cleanupPmtilesOnSave('m1', styleChange);
    expect(deletedPaths()).toEqual([`${TILE_FOLDER}/m1/12/34/56`]);
  });

  it('スタイル欄を空にしたら style.json も消す', async () => {
    platform.OS = 'ios';
    mockNativeFolder();
    await cleanupPmtilesOnSave('m1', styleCleared);
    expect(deletedPaths()).toEqual([`${TILE_FOLDER}/m1/12/34/56`, `${TILE_FOLDER}/m1/style.json`]);
  });

  it('ネイティブでフォルダが無ければ何もしない', async () => {
    platform.OS = 'android';
    mockedFS.getInfoAsync.mockResolvedValue({ exists: false, isDirectory: false } as never);
    await cleanupPmtilesOnSave('m1', sourceChange);
    expect(mockedFS.readDirectoryAsync).not.toHaveBeenCalled();
    expect(mockedFS.deleteAsync).not.toHaveBeenCalled();
  });

  it('Web で URL を変えたら取り込んだ本体を捨て、style は残して boundary を空にする', async () => {
    platform.OS = 'web';
    mockStore.set('m1', { mapId: 'm1', blob, boundary: '{"b":1}', style: '{"version":8}' });
    await cleanupPmtilesOnSave('m1', sourceChange);
    expect(mockStore.get('m1')).toEqual({ mapId: 'm1', blob: undefined, boundary: '', style: '{"version":8}' });
  });

  it('Web で URL を変えたあと、起動時の URL 復元（updatePmtilesURL 相当）が古い本体へ書き戻さない', async () => {
    platform.OS = 'web';
    mockStore.set('m1', { mapId: 'm1', blob, boundary: '{"b":1}', style: undefined });
    await cleanupPmtilesOnSave('m1', sourceChange);
    // updatePmtilesURL は blob があるときだけ url を ObjectURL に差し替える
    expect(mockStore.get('m1')?.blob).toBeUndefined();
  });

  it('Web でスタイルだけ変えたら取り込んだ本体と boundary はそのまま', async () => {
    platform.OS = 'web';
    mockStore.set('m1', { mapId: 'm1', blob, boundary: '{"b":1}', style: '{"version":8}' });
    await cleanupPmtilesOnSave('m1', styleChange);
    expect(mockStore.get('m1')).toEqual({ mapId: 'm1', blob, boundary: '{"b":1}', style: '{"version":8}' });
  });

  it('Web でスタイル欄を空にしたら style を捨て、本体は残す', async () => {
    platform.OS = 'web';
    mockStore.set('m1', { mapId: 'm1', blob, boundary: '{"b":1}', style: '{"version":8}' });
    await cleanupPmtilesOnSave('m1', styleCleared);
    expect(mockStore.get('m1')).toEqual({ mapId: 'm1', blob, boundary: '{"b":1}', style: undefined });
  });

  it('Web で残すものが無くなったレコードは消す', async () => {
    platform.OS = 'web';
    mockStore.set('m1', { mapId: 'm1', blob: undefined, boundary: '{"b":1}', style: undefined });
    await cleanupPmtilesOnSave('m1', sourceChange);
    expect(mockStore.has('m1')).toBe(false);
  });
});
