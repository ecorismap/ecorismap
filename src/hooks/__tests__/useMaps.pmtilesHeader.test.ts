/**
 * URL で登録した PMTiles のヘッダーは iOS/Android でも読む（保存時に最大ズームを合わせ、拡大しても消えないように）
 */
import { renderHook } from '@testing-library/react-hooks';
import { Platform } from 'react-native';
import { useMaps } from '../useMaps';

const mockState = { tileMaps: [], settings: { tileRegions: [], isOffline: false }, tileSignatures: {} };
jest.mock('react-redux', () => ({
  useDispatch: () => jest.fn(),
  useSelector: (selector: (state: unknown) => unknown) => selector(mockState),
  shallowEqual: jest.fn(),
}));
jest.mock('../../i18n/config', () => ({ t: jest.fn((key: string) => key) }));
jest.mock('expo-file-system/legacy', () => ({ cacheDirectory: 'file:///cache/' }));
jest.mock('react-native-gdalwarp', () => ({ convert: jest.fn() }));
jest.mock('../../utils/PDF', () => ({ convertPDFToGeoTiff: jest.fn(), generateTilesFromPDF: jest.fn() }));
jest.mock('../../utils/db', () => ({ db: { pmtiles: {}, geotiff: {} } }));
const mockGetHeader = jest.fn();
const mockPMTiles = jest.fn((_url: string) => ({ getHeader: mockGetHeader }));
jest.mock('pmtiles', () => ({ PMTiles: jest.fn((url: string) => mockPMTiles(url)), Protocol: jest.fn() }));

const originalOS = Platform.OS;
const header = {
  minZoom: 5,
  maxZoom: 10,
  minLon: 140,
  maxLon: 141,
  minLat: 38,
  maxLat: 39,
  centerLon: 140.5,
  centerLat: 38.5,
};
const read = (os: 'ios' | 'android' | 'web', url: string) => {
  Platform.OS = os;
  return renderHook(() => useMaps()).result.current.getPmtilesBoundary(url);
};

describe('getPmtilesBoundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockState.settings.isOffline = false;
    mockGetHeader.mockResolvedValue(header);
  });
  afterEach(() => {
    Platform.OS = originalOS;
    jest.useRealTimers();
  });

  it.each(['ios', 'android', 'web'] as const)('%s: 配信元のヘッダーを読む', async (os) => {
    const { header: h, boundary } = await read(os, 'pmtiles://https://example.com/a.pmtiles');
    expect(h).toEqual(header);
    expect(boundary?.zoom).toBe(7);
    expect(mockPMTiles).toHaveBeenCalledWith('https://example.com/a.pmtiles');
  });

  it('ネイティブでは端末内のファイルやオフラインのときは取りに行かない', async () => {
    expect((await read('android', 'pmtiles://file:///a.pmtiles')).header).toBeUndefined();
    mockState.settings.isOffline = true;
    expect((await read('ios', 'pmtiles://https://example.com/a.pmtiles')).header).toBeUndefined();
    expect(mockPMTiles).not.toHaveBeenCalled();
  });

  it('応答が来なければあきらめる', async () => {
    jest.useFakeTimers();
    mockGetHeader.mockReturnValue(new Promise(() => undefined));
    const result = read('android', 'pmtiles://https://example.com/a.pmtiles');
    await jest.advanceTimersByTimeAsync(5000);
    expect(await result).toEqual({ header: undefined, boundary: undefined });
  });
});
