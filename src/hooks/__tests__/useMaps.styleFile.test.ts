/**
 * スタイルファイルは読み取りと書き込みを分ける（読み込んだだけでは今のスタイルを置き換えない）
 */
import { renderHook } from '@testing-library/react-hooks';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { useMaps } from '../useMaps';
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
  writeAsStringAsync: jest.fn(async () => undefined),
  readAsStringAsync: jest.fn(async () => ''),
  cacheDirectory: 'file:///cache/',
}));
jest.mock('react-native-gdalwarp', () => ({ convert: jest.fn() }));
jest.mock('../../utils/PDF', () => ({ convertPDFToGeoTiff: jest.fn(), generateTilesFromPDF: jest.fn() }));
jest.mock('../../utils/db', () => ({ db: { pmtiles: {}, geotiff: {} } }));
jest.mock('../../utils/pmtilesLocalStore', () => ({ saveStyleToPmtilesDb: jest.fn(async () => undefined) }));
jest.mock('../../utils/File.web', () => ({ ...jest.requireActual('../../utils/File.web'), decodeUri: jest.fn() }));

const originalOS = Platform.OS;
const good = '{"layers":[]}';

afterEach(() => {
  Platform.OS = originalOS;
});
beforeEach(() => jest.clearAllMocks());

const setup = (os: 'ios' | 'android' | 'web') => {
  Platform.OS = os;
  return renderHook(() => useMaps()).result.current;
};
const expectNothingWritten = () => {
  expect(FileSystem.writeAsStringAsync).not.toHaveBeenCalled();
  expect(FileSystem.copyAsync).not.toHaveBeenCalled();
  expect(saveStyleToPmtilesDb).not.toHaveBeenCalled();
};

describe.each(['ios', 'android', 'web'] as const)('readStyleFile（%s）', (os) => {
  const mockRead = (json: string) =>
    ((os === 'web' ? decodeUri : FileSystem.readAsStringAsync) as jest.Mock).mockResolvedValue(json);

  it('読み取って返すだけで、端末には書かない', async () => {
    mockRead(good);
    expect(await setup(os).readStyleFile('blob:a')).toEqual({ isOK: true, message: '', style: good });
    expectNothingWritten();
  });

  it('壊れたファイルは案内を返す', async () => {
    mockRead('{broken');
    expect(await setup(os).readStyleFile('blob:a')).toEqual({ isOK: false, message: 'hooks.message.invalidStyleFile' });
    expectNothingWritten();
  });
});

describe('saveStyleFile', () => {
  it('ネイティブは地図フォルダの style.json に書く', async () => {
    expect(await setup('ios').saveStyleFile('P', good)).toEqual({ isOK: true, message: '' });
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(expect.stringMatching(/\/P\/style\.json$/), good);
  });

  it('Web は tilesDB に書く', async () => {
    expect((await setup('web').saveStyleFile('P', good)).isOK).toBe(true);
    expect(saveStyleToPmtilesDb).toHaveBeenCalledWith('P', good);
  });

  it('書けなければ失敗を返す', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    (FileSystem.writeAsStringAsync as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
    expect(await setup('ios').saveStyleFile('P', good)).toEqual({ isOK: false, message: 'hooks.message.failSaveFile' });
    log.mockRestore();
  });
});
