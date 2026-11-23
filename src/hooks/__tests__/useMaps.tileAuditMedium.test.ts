/**
 * タイル監査（docs/TILE_AUDIT_2026-11.md）の medium の回帰テスト（useMaps）。
 * - M-M9: 地図リストの CSV を RFC 4180 で読み、応答の失敗・不正な行を知らせる
 * - M-M10: Web の PMTiles 取り込みで保存に失敗したら blob: を片付けて失敗を返す
 * - M-M11: 複数ページの PDF をダウンロードし直したら、前回のページ地図を置き換える（増やさない）
 */
import { renderHook, act } from '@testing-library/react-hooks';
import { Platform } from 'react-native';
import { TileMapType } from '../../types';
import { useMaps } from '../useMaps';

type State = { tileMaps: TileMapType[]; settings: { tileRegions: never[] } };
let mockState: State = { tileMaps: [], settings: { tileRegions: [] } };
const mockActions: { type: string; payload: unknown }[] = [];
const mockDispatch = jest.fn((action: unknown): unknown => {
  if (typeof action === 'function') return action(mockDispatch, () => mockState);
  mockActions.push(action as { type: string; payload: unknown });
  return action;
});
let mockSelected: Record<string, unknown> = {};

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: (selector: (state: unknown) => unknown) =>
    selector({ ...mockState, settings: { ...mockState.settings, ...mockSelected }, tileSignatures: {} }),
  shallowEqual: jest.fn(),
}));

jest.mock('../../i18n/config', () => ({
  t: jest.fn((key: string, opts?: { count?: number }) => (opts?.count !== undefined ? `${key}:${opts.count}` : key)),
}));

jest.mock('expo-file-system/legacy', () => ({
  deleteAsync: jest.fn(async () => undefined),
  writeAsStringAsync: jest.fn(async () => undefined),
  makeDirectoryAsync: jest.fn(async () => undefined),
  copyAsync: jest.fn(async () => undefined),
  readAsStringAsync: jest.fn(async () => ''),
  cacheDirectory: 'file:///cache/',
}));

jest.mock('react-native-gdalwarp', () => ({ convert: jest.fn() }));

jest.mock('../../utils/PDF', () => ({
  convertPDFToGeoTiff: jest.fn(),
  generateTilesFromPDF: jest.fn(async () => undefined),
}));

jest.mock('../../utils/db', () => ({
  db: {
    pmtiles: { put: jest.fn(), get: jest.fn(), update: jest.fn() },
    geotiff: { put: jest.fn(), delete: jest.fn(async () => undefined), get: jest.fn() },
  },
}));

jest.mock('../../utils/tileSourceCleanup', () => ({ discardStaleTileSources: jest.fn(async () => []) }));

const FileSystem = jest.requireMock('expo-file-system/legacy') as { deleteAsync: jest.Mock };
const { convert } = jest.requireMock('react-native-gdalwarp') as { convert: jest.Mock };
const { db } = jest.requireMock('../../utils/db') as {
  db: { pmtiles: { put: jest.Mock }; geotiff: { delete: jest.Mock } };
};

const MAP_LIST_URL = 'https://docs.google.com/spreadsheets/d/e/abc/pub?output=csv';
const HEADER =
  'name,url,attribution,transparency,overzoomThreshold,highResolutionEnabled,minimumZ,maximumZ,flipY,styleURL,isVector';

const mockFetch = (body: string, ok = true) => {
  global.fetch = jest.fn(async () => ({ ok, status: ok ? 200 : 403, text: async () => body })) as never;
};

const outputFile = (n: number) => ({
  uri: `/tmp/page${n}.png`,
  topLeft: { x: 15000000, y: 4000000 },
  bottomRight: { x: 15001000, y: 3999000 },
  width: 1000,
  height: 1000,
});

const baseMap = (extra: Partial<TileMapType>): TileMapType => ({
  id: 'X',
  name: 'X',
  url: '',
  attribution: '',
  maptype: 'none',
  visible: true,
  transparency: 0,
  overzoomThreshold: 18,
  highResolutionEnabled: false,
  minimumZ: 0,
  maximumZ: 22,
  flipY: false,
  ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockActions.length = 0;
  mockState = { tileMaps: [], settings: { tileRegions: [] } };
  mockSelected = { mapListURL: MAP_LIST_URL };
  Platform.OS = 'ios';
});

describe('M-M9: 地図リストの読み込み', () => {
  const fetchList = async () => {
    const { result } = renderHook(() => useMaps());
    let res: { isOK: boolean; message: string } | undefined;
    await act(async () => {
      res = await result.current.fetchMapList(new AbortController().signal);
    });
    const listAction = mockActions.filter((a) => a.type === 'settings/editSettingsAction').pop();
    return { res, mapList: (listAction?.payload as { mapList: unknown[] }).mapList };
  };

  test('引用符で囲まれたカンマ・改行・"" を含むセルと、数字だけの名前を読める', async () => {
    mockFetch(
      `${HEADER}\n` +
        '"2024","https://a/{z}/{x}/{y}.png","国土地理院, 環境省",0.5,18,false,0,22,false,,\n' +
        '"植生図\n(改訂)","https://b/{z}/{x}/{y}.png","""出典""",0,16,TRUE,2,18,false,https://b/style.json,true\n'
    );
    const { res, mapList } = await fetchList();
    expect(res).toEqual({ isOK: true, message: '' });
    expect(mapList).toEqual([
      {
        name: '2024',
        url: 'https://a/{z}/{x}/{y}.png',
        attribution: '国土地理院, 環境省',
        transparency: 0.5,
        overzoomThreshold: 18,
        highResolutionEnabled: false,
        minimumZ: 0,
        maximumZ: 22,
        flipY: false,
      },
      {
        name: '植生図\n(改訂)',
        url: 'https://b/{z}/{x}/{y}.png',
        attribution: '"出典"',
        transparency: 0,
        overzoomThreshold: 16,
        highResolutionEnabled: true,
        minimumZ: 2,
        maximumZ: 18,
        flipY: false,
        styleURL: 'https://b/style.json',
        isVector: true,
      },
    ]);
  });

  test('不正な行だけ除き、除いた件数を知らせる', async () => {
    mockFetch(
      `${HEADER}\n` +
        'OK,https://a/{z}/{x}/{y}.png,A,0,18,false,0,22,false,,\n' +
        'NG,https://b/{z}/{x}/{y}.png,B,abc,18,false,0,22,false,,\n'
    );
    const { res, mapList } = await fetchList();
    expect(res).toEqual({ isOK: false, message: 'hooks.message.someInvalidMapList:1' });
    expect((mapList as TileMapType[]).map((m) => m.name)).toEqual(['OK']);
  });

  test('応答が失敗（公開停止など）なら取得失敗として知らせる', async () => {
    mockFetch('<html>error</html>', false);
    const { res } = await fetchList();
    expect(res).toEqual({ isOK: false, message: 'hooks.message.failGetData' });
  });

  test('引用符が閉じていない CSV はデータ形式の誤りとして知らせる', async () => {
    mockFetch(`${HEADER}\n"OK,https://a,A,0,18,false,0,22,false,,\n`);
    const { res } = await fetchList();
    expect(res).toEqual({ isOK: false, message: 'hooks.message.invalidDataFormat' });
  });
});

describe('M-M10: Web の PMTiles 取り込みで保存に失敗したとき', () => {
  test('blob: を片付けて失敗を返し、地図を追加しない', async () => {
    Platform.OS = 'web';
    const blob = { size: 10 };
    global.fetch = jest.fn(async () => ({ blob: async () => blob })) as never;
    const revoke = jest.fn();
    const g = global as unknown as { URL: { createObjectURL: unknown; revokeObjectURL: unknown } };
    const origCreate = g.URL.createObjectURL;
    const origRevoke = g.URL.revokeObjectURL;
    g.URL.createObjectURL = jest.fn(() => 'blob:abc');
    g.URL.revokeObjectURL = revoke;
    const pmtiles = require('pmtiles');
    const headerSpy = jest.spyOn(pmtiles.PMTiles.prototype, 'getHeader').mockResolvedValue({
      centerLat: 35,
      centerLon: 135,
      minZoom: 0,
      maxZoom: 14,
      maxLat: 36,
      minLat: 34,
      minLon: 134,
      maxLon: 136,
      tileType: 1,
    });
    db.pmtiles.put.mockRejectedValue(new Error('QuotaExceededError'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { result } = renderHook(() => useMaps());
    let res: { isOK: boolean; message: string } | undefined;
    await act(async () => {
      res = await result.current.importPmtilesFile('blob:picked', 'big.pmtiles');
    });
    expect(res).toEqual({ isOK: false, message: 'hooks.message.failReceiveFile' });
    expect(revoke).toHaveBeenCalledWith('blob:abc');
    expect(mockActions.some((a) => a.type === 'tileMaps/addTileMapAction')).toBe(false);
    headerSpy.mockRestore();
    errorSpy.mockRestore();
    g.URL.createObjectURL = origCreate;
    g.URL.revokeObjectURL = origRevoke;
  });
});

describe('M-M11: 複数ページの PDF のダウンロードし直し', () => {
  const source = baseMap({ id: 'SRC', name: '現地植生図', url: 'https://example.com/veg.pdf', attribution: '環境省' });

  const importPages = async (pages: number) => {
    convert.mockResolvedValue({ outputFiles: Array.from({ length: pages }, (_, i) => outputFile(i + 1)) });
    const { result } = renderHook(() => useMaps());
    await act(async () => {
      await result.current.importPdfFile('file:///cache/veg.pdf', source.name, source.id);
    });
  };

  test('初回は元の地図の id とページ番号を持つページ地図を追加する', async () => {
    mockState.tileMaps = [source];
    await importPages(2);
    const added = mockActions.filter((a) => a.type === 'tileMaps/addTileMapAction').map((a) => a.payload as TileMapType);
    expect(added.map((m) => [m.name, m.pdfSourceId, m.pdfPage, m.attribution])).toEqual([
      ['現地植生図_page01', 'SRC', 1, 'PDF'],
      ['現地植生図_page02', 'SRC', 2, 'PDF'],
    ]);
  });

  test('2回目は前回のページ地図を置き換え、名前・表示は引き継ぎ、減ったページは消す', async () => {
    const page1 = baseMap({
      id: 'P1',
      name: '利用者が付けた名前',
      url: 'file://現地植生図',
      attribution: 'PDF',
      visible: false,
      pdfSourceId: 'SRC',
      pdfPage: 1,
    });
    // pdfSourceId の無い以前のページ地図も名前と url で拾う
    const legacyPage2 = baseMap({ id: 'P2', name: '現地植生図_page02', url: 'file://現地植生図', attribution: 'PDF' });
    const legacyPage3 = baseMap({ id: 'P3', name: '現地植生図_page03', url: 'file://現地植生図', attribution: 'PDF' });
    mockState.tileMaps = [source, page1, legacyPage2, legacyPage3];
    await importPages(2);

    expect(mockActions.some((a) => a.type === 'tileMaps/addTileMapAction')).toBe(false);
    const updated = mockActions
      .filter((a) => a.type === 'tileMaps/updateTileMapAction')
      .map((a) => a.payload as TileMapType);
    expect(updated.map((m) => [m.id, m.name, m.visible, m.pdfSourceId, m.pdfPage])).toEqual([
      ['P1', '利用者が付けた名前', false, 'SRC', 1],
      ['P2', '現地植生図_page02', true, 'SRC', 2],
    ]);
    const deleted = mockActions
      .filter((a) => a.type === 'tileMaps/deleteTileMapAction')
      .map((a) => (a.payload as TileMapType).id);
    expect(deleted).toEqual(['P3']);
    const deletedPaths = FileSystem.deleteAsync.mock.calls.map(([p]) => p as string);
    expect(deletedPaths.some((p) => p.endsWith('/P1'))).toBe(true);
    expect(deletedPaths.some((p) => p.endsWith('/P3'))).toBe(true);
    // 元の地図（ダウンロードした項目）は消さない
    expect(deletedPaths.some((p) => p.endsWith('/SRC'))).toBe(false);
    expect(db.geotiff.delete).not.toHaveBeenCalled();
  });

  test('ローカルの取り込み（id なし）は既存の地図に触れず追加する', async () => {
    const other = baseMap({ id: 'P9', name: 'veg.pdf_page01', url: 'file://veg.pdf', attribution: 'PDF' });
    mockState.tileMaps = [other];
    convert.mockResolvedValue({ outputFiles: [outputFile(1), outputFile(2)] });
    const { result } = renderHook(() => useMaps());
    await act(async () => {
      await result.current.importPdfFile('file:///tmp/veg.pdf', 'veg.pdf');
    });
    expect(mockActions.filter((a) => a.type === 'tileMaps/addTileMapAction')).toHaveLength(2);
    expect(mockActions.some((a) => a.type === 'tileMaps/deleteTileMapAction')).toBe(false);
    expect(mockActions.some((a) => a.type === 'tileMaps/updateTileMapAction')).toBe(false);
  });

  test('共有されたページ地図（pdf://）を押すと、そのページだけで自身を置き換え、地図を増やさない', async () => {
    const sharedPage2 = baseMap({
      id: 'P2',
      name: '現地植生図_page02',
      url: 'pdf://https://storage.example.com/PDF/P2',
      attribution: 'PDF',
      encryptKey: 'KEY',
      groupId: 'G1',
      pdfSourceId: 'SRC',
      pdfPage: 2,
    });
    mockState.tileMaps = [sharedPage2];
    convert.mockResolvedValue({ outputFiles: [outputFile(1), outputFile(2), outputFile(3)] });
    const { generateTilesFromPDF } = jest.requireMock('../../utils/PDF') as { generateTilesFromPDF: jest.Mock };
    const { result } = renderHook(() => useMaps());
    await act(async () => {
      await result.current.importPdfFile('file:///cache/P2.pdf', sharedPage2.name, sharedPage2.id);
    });
    expect(mockActions.some((a) => a.type === 'tileMaps/addTileMapAction')).toBe(false);
    expect(mockActions.some((a) => a.type === 'tileMaps/deleteTileMapAction')).toBe(false);
    const updated = mockActions
      .filter((a) => a.type === 'tileMaps/updateTileMapAction')
      .map((a) => a.payload as TileMapType);
    expect(updated.map((m) => [m.id, m.name, m.url, m.encryptKey, m.groupId, m.pdfSourceId, m.pdfPage])).toEqual([
      ['P2', '現地植生図_page02', sharedPage2.url, 'KEY', 'G1', 'SRC', 2],
    ]);
    // 作るのは押したページ（2ページ目）だけ
    expect(generateTilesFromPDF).toHaveBeenCalledTimes(1);
    expect(generateTilesFromPDF.mock.calls[0][0]).toBe('file:///tmp/page2.png');
  });
});
