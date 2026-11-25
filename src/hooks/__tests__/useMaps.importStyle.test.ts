/**
 * 壊れたスタイルファイルは、今のスタイルを置き換えずに失敗として返す
 */
import { act, renderHook } from '@testing-library/react-hooks';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { useMaps } from '../useMaps';
import { TileMapType } from '../../types';
import { saveStyleToPmtilesDb } from '../../utils/pmtilesLocalStore';
import { decodeUri } from '../../utils/File.web';

const mockState = { tileMaps: [], settings: { tileRegions: [] }, tileSignatures: {} };
jest.mock('react-redux', () => ({
  useDispatch: () => jest.fn(),
  useSelector: (selector: (state: unknown) => unknown) => selector(mockState),
  shallowEqual: jest.fn(),
}));
jest.mock('../../i18n/config', () => ({ t: jest.fn((key: string) => key) }));
jest.mock('expo-file-system/legacy', () => ({
  deleteAsync: jest.fn(async () => undefined),
  makeDirectoryAsync: jest.fn(async () => undefined),
  copyAsync: jest.fn(async () => undefined),
  readAsStringAsync: jest.fn(async () => ''),
  cacheDirectory: 'file:///cache/',
}));
jest.mock('react-native-gdalwarp', () => ({ convert: jest.fn() }));
jest.mock('../../utils/PDF', () => ({ convertPDFToGeoTiff: jest.fn(), generateTilesFromPDF: jest.fn() }));
jest.mock('../../utils/db', () => ({ db: { pmtiles: {}, geotiff: {} } }));
jest.mock('../../utils/pmtilesLocalStore', () => ({ saveStyleToPmtilesDb: jest.fn(async () => undefined) }));
jest.mock('../../utils/File.web', () => ({ ...jest.requireActual('../../utils/File.web'), decodeUri: jest.fn() }));

const map = { id: 'P', name: 'P', url: 'pmtiles://x' } as TileMapType;
const originalOS = Platform.OS;
const good = '{"layers":[]}';

describe('importStyleFile', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => {
    Platform.OS = originalOS;
  });

  it.each([
    ['{broken', false],
    [good, true],
  ])('ネイティブ: %s', async (json, isOK) => {
    Platform.OS = 'ios';
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(json);
    const { result } = renderHook(() => useMaps());
    let ret: { isOK: boolean; message: string } | undefined;
    await act(async () => {
      ret = await result.current.importStyleFile('file:///a.json', 'a.json', map);
    });
    expect(ret).toEqual({ isOK, message: isOK ? '' : 'hooks.message.invalidStyleFile' });
    expect(FileSystem.copyAsync).toHaveBeenCalledTimes(isOK ? 1 : 0);
  });

  it.each([
    ['{broken', false],
    [good, true],
  ])('Web: %s', async (json, isOK) => {
    Platform.OS = 'web';
    (decodeUri as jest.Mock).mockResolvedValue(json);
    const { result } = renderHook(() => useMaps());
    let ret: { isOK: boolean; message: string } | undefined;
    await act(async () => {
      ret = await result.current.importStyleFile('blob:a', 'a.json', map);
    });
    expect(ret?.isOK).toBe(isOK);
    expect(saveStyleToPmtilesDb).toHaveBeenCalledTimes(isOK ? 1 : 0);
  });
});
