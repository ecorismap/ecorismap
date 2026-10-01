import { resolveReliefTexture, toTileSizeElevation } from '../reliefTexture';
import { decodeDemTileFile, fetchDemTileFile, localDemTileFile } from '../../demTileLoader';
import { LayerSpec } from '../types';

jest.mock('../../../constants/AppConstants', () => ({ TILE_FOLDER: 'file:///tiles' }));
jest.mock('../../demTileLoader', () => ({
  fetchDemTileFile: jest.fn(),
  localDemTileFile: jest.fn(async () => null),
  decodeDemTileFile: jest.fn(),
}));

const mockedRemote = fetchDemTileFile as jest.MockedFunction<typeof fetchDemTileFile>;
const mockedLocal = localDemTileFile as jest.MockedFunction<typeof localDemTileFile>;
const mockedDecode = decodeDemTileFile as jest.MockedFunction<typeof decodeDemTileFile>;

/** 標高elevの一様な256pxタイル（デコード済み） */
const uniformDecoded = (elevM: number) => ({ size: 256, elev: new Float32Array(256 * 256).fill(elevM) });

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
  mockedDecode.mockImplementation(async () => uniformDecoded(-3000));
  mockedRemote.mockImplementation(async (url: string) => `file:///cache/${encodeURIComponent(url)}`);
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
    mockedLocal.mockImplementation(async (uri: string) => uri);
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

  it('GEBCOはGSI形式、それ以外（Mapterhorn）はterrarium形式でデコードする', async () => {
    await resolveReliefTexture(gebcoLayer(), { z: 8, x: 4, y: 4 });
    expect(mockedDecode.mock.calls.every(([, encoding]) => encoding === 'gsi')).toBe(true);
    mockedDecode.mockClear();
    await resolveReliefTexture(gebcoLayer({ relief: { style: 'default' } }), { z: 8, x: 4, y: 4 });
    expect(mockedDecode.mock.calls.every(([, encoding]) => encoding === 'terrarium')).toBe(true);
  });

  it('同じタイルの2回目は生成済みを返す（再取得しない）', async () => {
    const layer = gebcoLayer();
    await resolveReliefTexture(layer, { z: 8, x: 3, y: 3 });
    const calls = mockedRemote.mock.calls.length;
    await resolveReliefTexture(layer, { z: 8, x: 3, y: 3 });
    expect(mockedRemote.mock.calls.length).toBe(calls);
  });
});

describe('toTileSizeElevation', () => {
  it('512pxは1画素おきに間引いて256pxにする', () => {
    const elev = Float32Array.from({ length: 512 * 512 }, (_, i) => i % 512);
    const out = toTileSizeElevation(elev, 512);
    expect(out?.length).toBe(256 * 256);
    expect(out?.[1]).toBe(2);
    expect(toTileSizeElevation(new Float32Array(300 * 300), 300)).toBeNull();
  });
});
