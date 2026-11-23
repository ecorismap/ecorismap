/**
 * PDF 取り込みの進捗表示の後始末。
 * 失敗・例外で途中の進捗が残ると、次の取り込みの処理中表示が最初から途中の%を出してしまう。
 */
import { renderHook, act } from '@testing-library/react-hooks';
import { Platform } from 'react-native';
import { TileMapType } from '../../types';
import { useMaps } from '../useMaps';

type State = { tileMaps: TileMapType[]; settings: { tileRegions: never[] } };
const mockState: State = { tileMaps: [], settings: { tileRegions: [] } };
const mockDispatch = jest.fn((action: unknown): unknown => {
  if (typeof action === 'function') return action(mockDispatch, () => mockState);
  return action;
});

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: (selector: (state: unknown) => unknown) => selector({ ...mockState, tileSignatures: {} }),
  shallowEqual: jest.fn(),
}));

jest.mock('../../i18n/config', () => ({ t: jest.fn((key: string) => key) }));

jest.mock('expo-file-system/legacy', () => ({
  deleteAsync: jest.fn(async () => undefined),
  writeAsStringAsync: jest.fn(async () => undefined),
  makeDirectoryAsync: jest.fn(async () => undefined),
  copyAsync: jest.fn(async () => undefined),
  readAsStringAsync: jest.fn(async () => ''),
  createDownloadResumable: jest.fn(),
  cacheDirectory: 'file:///cache/',
}));

jest.mock('react-native-gdalwarp', () => ({ convert: jest.fn() }));

jest.mock('../../utils/PDF', () => ({
  convertPDFToGeoTiff: jest.fn(),
  generateTilesFromPDF: jest.fn(),
}));

jest.mock('../../utils/db', () => ({
  db: { pmtiles: { put: jest.fn() }, geotiff: { put: jest.fn(), delete: jest.fn(), get: jest.fn() } },
}));

jest.mock('../../utils/tileSourceCleanup', () => ({ discardStaleTileSources: jest.fn(async () => []) }));

const { convert } = jest.requireMock('react-native-gdalwarp') as { convert: jest.Mock };
const { generateTilesFromPDF } = jest.requireMock('../../utils/PDF') as { generateTilesFromPDF: jest.Mock };
const FileSystem = jest.requireMock('expo-file-system/legacy') as { createDownloadResumable: jest.Mock };

const outputFile = {
  uri: '/tmp/page1.png',
  topLeft: { x: 15000000, y: 4000000 },
  bottomRight: { x: 15001000, y: 3999000 },
  width: 1000,
  height: 1000,
};

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = 'android';
});

describe('PDF 取り込みの進捗', () => {
  test('タイル生成の途中で失敗しても進捗を0に戻す', async () => {
    convert.mockResolvedValue({ outputFiles: [outputFile] });
    generateTilesFromPDF.mockImplementation(
      async (...args: unknown[]) => {
        const onProgress = args[7] as (ratio: number) => void;
        onProgress(0.5);
        throw new Error('disk full');
      }
    );
    const { result } = renderHook(() => useMaps());
    let error: unknown;
    await act(async () => {
      await result.current.importPdfFile('file:///cache/map.pdf', 'map.pdf').catch((e: unknown) => {
        error = e;
      });
    });
    expect(error).toBeInstanceOf(Error);
    expect(result.current.progress).toBe('0');
  });

  test('ダウンロードに失敗して戻ったときもダウンロードの進捗を持ち越さない', async () => {
    FileSystem.createDownloadResumable.mockImplementation(
      (_url: string, _to: string, _opts: unknown, onProgress: (p: { totalBytesExpectedToWrite: number; totalBytesWritten: number }) => void) => ({
        downloadAsync: async () => {
          onProgress({ totalBytesExpectedToWrite: 100, totalBytesWritten: 60 });
          return { status: 404, uri: '' };
        },
      })
    );
    const { result } = renderHook(() => useMaps());
    let res: { isOK: boolean; message: string } | undefined;
    await act(async () => {
      res = await result.current.importMapFile('https://example.com/map.pdf', 'map', 'pdf', 'ID1');
    });
    expect(res?.isOK).toBe(false);
    expect(convert).not.toHaveBeenCalled();
    expect(result.current.progress).toBe('0');
  });
});
