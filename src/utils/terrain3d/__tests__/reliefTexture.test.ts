import { resolveReliefTexture } from '../reliefTexture';
import { loadDemTileAsPngBytes, loadLocalDemTileAsPngBytes } from '../../demTileLoader';
import { decodePngLite } from '../../pngLite';
import { LayerSpec } from '../types';

jest.mock('../../../constants/AppConstants', () => ({ TILE_FOLDER: 'file:///tiles' }));
jest.mock('../../demTileLoader', () => ({
  loadDemTileAsPngBytes: jest.fn(),
  loadLocalDemTileAsPngBytes: jest.fn(async () => null),
}));
// PNGの組み立てを省き、バイト列の先頭1バイトを「標高の種類」としてデコード結果を差し替える
jest.mock('../../pngLite', () => ({ decodePngLite: jest.fn() }));

const mockedRemote = loadDemTileAsPngBytes as jest.MockedFunction<typeof loadDemTileAsPngBytes>;
const mockedLocal = loadLocalDemTileAsPngBytes as jest.MockedFunction<typeof loadLocalDemTileAsPngBytes>;
const mockedDecode = decodePngLite as jest.MockedFunction<typeof decodePngLite>;

/** GSI方式で標高elevの一様な256pxタイル（RGB 3ch） */
const uniformDecoded = (elevM: number) => {
  const x = Math.round(elevM * 100);
  const raw = x < 0 ? x + 16777216 : x;
  const data = new Uint8Array(256 * 256 * 3);
  for (let i = 0; i < 256 * 256; i++) {
    data[i * 3] = (raw >> 16) & 255;
    data[i * 3 + 1] = (raw >> 8) & 255;
    data[i * 3 + 2] = raw & 255;
  }
  return { width: 256, height: 256, data, channels: 3 } as unknown as ReturnType<typeof decodePngLite>;
};

let layerSeq = 0;
const gebcoLayer = (overrides: Partial<LayerSpec> = {}): LayerSpec => ({
  id: `gebco-${layerSeq++}`,
  urlTemplate: `https://tiles.example/gebco${layerSeq}/{z}/{y}/{x}.png`,
  relief: { style: 'gebco' },
  opacity: 1,
  minimumZ: 0,
  maximumZ: 22,
  maximumNativeZ: 9,
  flipY: false,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockedLocal.mockResolvedValue(null);
  mockedDecode.mockImplementation(() => uniformDecoded(-3000));
  mockedRemote.mockImplementation(async () => new ArrayBuffer(8));
});

describe('resolveReliefTexture', () => {
  it('標高タイルから256pxのRGBAを作る（海は不透明に塗られる）', async () => {
    const result = await resolveReliefTexture(gebcoLayer(), { z: 8, x: 227, y: 100 });
    expect(result.kind).toBe('rgba');
    if (result.kind !== 'rgba') return;
    expect(result.width).toBe(256);
    expect(result.data.length).toBe(256 * 256 * 4);
    expect(result.data[3]).toBe(255);
  });

  it('URLは{z}/{y}/{x}順のテンプレートどおりに組み立てる', async () => {
    const layer = gebcoLayer();
    await resolveReliefTexture(layer, { z: 8, x: 227, y: 100 });
    const urls = mockedRemote.mock.calls.map(([url]) => url);
    expect(urls).toContain(layer.urlTemplate.replace('{z}', '8').replace('{y}', '100').replace('{x}', '227'));
  });

  it('提供上限(maximumNativeZ)より細かいズームは上限ズームのタイルから作る', async () => {
    await resolveReliefTexture(gebcoLayer(), { z: 12, x: 3640, y: 1600 });
    const zooms = new Set(mockedRemote.mock.calls.map(([url]) => url.match(/gebco\d+\/(\d+)\//)![1]));
    expect([...zooms]).toEqual(['9']);
  });

  it('オフラインのダウンロード済みタイルを優先し、ネットワークを叩かない', async () => {
    mockedLocal.mockResolvedValue(new ArrayBuffer(8));
    const layer = gebcoLayer({ offlineMode: true });
    const result = await resolveReliefTexture(layer, { z: 8, x: 10, y: 10 });
    expect(result.kind).toBe('rgba');
    expect(mockedRemote).not.toHaveBeenCalled();
    expect(mockedLocal.mock.calls.map(([uri]) => uri)).toContain(`file:///tiles/${layer.id}/8/10/10`);
  });

  it('データなし（404）ならmissing', async () => {
    mockedRemote.mockResolvedValue(null);
    const result = await resolveReliefTexture(gebcoLayer(), { z: 8, x: 1, y: 1 });
    expect(result.kind).toBe('missing');
  });

  it('中央タイルの通信エラーはthrowして確定させない', async () => {
    mockedRemote.mockRejectedValue(new Error('network'));
    await expect(resolveReliefTexture(gebcoLayer(), { z: 8, x: 2, y: 2 })).rejects.toThrow();
  });

  it('同じタイルの2回目は生成済みを返す（再取得しない）', async () => {
    const layer = gebcoLayer();
    await resolveReliefTexture(layer, { z: 8, x: 3, y: 3 });
    const calls = mockedRemote.mock.calls.length;
    await resolveReliefTexture(layer, { z: 8, x: 3, y: 3 });
    expect(mockedRemote.mock.calls.length).toBe(calls);
  });
});
