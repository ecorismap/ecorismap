import { generateTileMap } from '../PDF';
import { renderPmtile } from '../terrain3d/pmtileRasterizer';
import { TileMapType } from '../../types';

jest.mock('react-native-fs', () => ({ exists: jest.fn().mockResolvedValue(false), copyFile: jest.fn() }));
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  downloadAsync: jest.fn(),
}));
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { PNG: 'png' },
  manipulateAsync: jest.fn().mockResolvedValue({ uri: 'file:///cache/out.png', base64: 'BASE64' }),
}));
jest.mock('@react-native-community/image-editor', () => ({}));
jest.mock('react-native-gdalwarp', () => ({}));
jest.mock('../File', () => ({ moveFile: jest.fn(), unlink: jest.fn() }));
jest.mock('../terrain3d/pmtileRasterizer', () => ({ renderPmtile: jest.fn() }));

const pmtilesMap: TileMapType = {
  id: 'vec',
  name: 'vector',
  url: 'pmtiles://https://example.com/a.pmtiles',
  styleURL: 'https://example.com/style.json',
  attribution: '',
  transparency: 0,
  overzoomThreshold: 20,
  highResolutionEnabled: false,
  minimumZ: 0,
  maximumZ: 22,
  flipY: false,
  maptype: 'none',
  visible: true,
  isVector: true,
};
const region = { minLon: 135.0, minLat: 35.0, maxLon: 135.001, maxLat: 35.001 };
const mockRender = renderPmtile as jest.Mock;

describe('generateTileMap（モバイルのPMTiles）', () => {
  beforeEach(() => jest.clearAllMocks());

  it('2Dと同じ指定でネイティブ描画し、base64で貼る', async () => {
    mockRender.mockResolvedValue(512);
    const html = await generateTileMap([pmtilesMap], region, '16', { isOffline: true, tileSignatures: {} });
    expect(mockRender).toHaveBeenCalled();
    const params = mockRender.mock.calls[0][0];
    expect(params).toMatchObject({
      urlTemplate: 'https://example.com/a.pmtiles',
      styleURL: 'https://example.com/style.json',
      z: 16,
      minimumZ: 0,
      maximumZ: 22,
      //オフラインのベクタは保存した18から拡大
      maximumNativeZ: 18,
      offlineMode: true,
      isVector: true,
      flipY: false,
    });
    expect(params.tileCachePath).toMatch(/\/vec$/);
    expect(params.outputPath).toMatch(/^file:\/\/\/cache\/pdf-tiles\/vec_16_/);
    expect(html).toContain('data:image/png;base64,BASE64');
  });

  it('タイルなし・描画失敗のタイルは貼らない', async () => {
    mockRender.mockResolvedValueOnce(0).mockRejectedValue(new Error('network'));
    const html = await generateTileMap([pmtilesMap], region, '16');
    expect(html).not.toContain('<img');
  });
});
