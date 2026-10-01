import { getDemTile } from '../../demSource';
import { loadReliefElevation } from '../reliefTexture';
import { clampDemZoom, elevationBlocks, resolveTerrainDem } from '../terrainDem';
import { LayerSpec } from '../types';

jest.mock('../../demSource', () => ({
  DEM_SOURCE_TILE_SIZE: 512,
  getDemTile: jest.fn(),
}));

jest.mock('../reliefTexture', () => ({
  RELIEF_ELEVATION_TILE_SIZE: 256,
  loadReliefElevation: jest.fn(),
}));

const mockGetDemTile = getDemTile as jest.Mock;
const mockLoadRelief = loadReliefElevation as jest.Mock;

const SIZE = 512;
const tileOf = (elev: Float32Array) => ({ z: 10, x: 1, y: 2, size: SIZE, elev, min: 0, max: 0 });

const gebcoLayer = {
  id: 'gebco',
  urlTemplate: 'https://tiles.gsj.jp/tiles/elev/gebco/{z}/{y}/{x}.png',
  relief: { style: 'gebco' },
  maximumZ: 22,
  maximumNativeZ: 9,
} as unknown as LayerSpec;

describe('clampDemZoom', () => {
  it('512pxのDEMはz7〜13に収める', () => {
    expect(clampDemZoom(3)).toBe(7);
    expect(clampDemZoom(10)).toBe(10);
    expect(clampDemZoom(16)).toBe(13);
  });
});

describe('elevationBlocks', () => {
  it('8×8ブロック毎の最小・最大を求める', () => {
    const elev = new Float32Array(SIZE * SIZE);
    // 左上ブロック(64px)の中に100mと-5m、右下ブロックに3000m
    elev[10 * SIZE + 10] = 100;
    elev[20 * SIZE + 30] = -5;
    elev[(SIZE - 1) * SIZE + (SIZE - 1)] = 3000;
    const { blockMin, blockMax } = elevationBlocks(elev, SIZE);
    expect(blockMin.length).toBe(64);
    expect(blockMin[0]).toBe(-5);
    expect(blockMax[0]).toBe(100);
    expect(blockMax[63]).toBe(3000);
    expect(blockMin[1]).toBe(0);
  });
});

describe('resolveTerrainDem', () => {
  beforeEach(() => jest.clearAllMocks());

  it('通常モードはMapterhornの標高をそのまま使う', async () => {
    const elev = new Float32Array(SIZE * SIZE).fill(1234);
    mockGetDemTile.mockResolvedValue(tileOf(elev));
    const dem = await resolveTerrainDem(10, 1, 2, null);
    expect(dem?.elev).toBe(elev);
    expect(dem?.size).toBe(SIZE);
    expect(mockLoadRelief).not.toHaveBeenCalled();
  });

  it('通常モードの外洋（404）はnull、通信エラーはundefined', async () => {
    mockGetDemTile.mockResolvedValueOnce(null);
    expect(await resolveTerrainDem(10, 1, 2, null)).toBeNull();
    mockGetDemTile.mockResolvedValueOnce(undefined);
    expect(await resolveTerrainDem(10, 1, 2, null)).toBeUndefined();
  });

  it('海底モードは0m以下をGEBCOで埋めて海面下を強調し、元の配列は書き換えない', async () => {
    const elev = new Float32Array(SIZE * SIZE);
    elev.fill(500, 0, SIZE * SIZE / 2); // 上半分は陸
    mockGetDemTile.mockResolvedValue(tileOf(elev));
    mockLoadRelief.mockResolvedValue(new Float32Array(256 * 256).fill(-100));
    const dem = await resolveTerrainDem(10, 1, 2, gebcoLayer);
    expect(dem?.elev[0]).toBe(500);
    expect(dem?.elev[SIZE * SIZE - 1]).toBe(-300); // -100m × 3
    expect(elev[SIZE * SIZE - 1]).toBe(0);
    // GEBCOはz9が上限なので、z10のタイルは1段上の祖先を引く
    expect(mockLoadRelief).toHaveBeenCalledWith(gebcoLayer, 9, 0, 1);
  });

  it('海底モードの外洋（404）は全面を海として埋める', async () => {
    mockGetDemTile.mockResolvedValue(null);
    mockLoadRelief.mockResolvedValue(new Float32Array(256 * 256).fill(-4000));
    const dem = await resolveTerrainDem(8, 1, 2, gebcoLayer);
    expect(dem?.elev[12345]).toBe(-12000);
    expect(mockLoadRelief).toHaveBeenCalledWith(gebcoLayer, 8, 1, 2);
  });

  it('海底モードでGEBCOが通信エラーならundefined（再試行させる）', async () => {
    mockGetDemTile.mockResolvedValue(tileOf(new Float32Array(SIZE * SIZE)));
    mockLoadRelief.mockResolvedValue(undefined);
    expect(await resolveTerrainDem(10, 1, 2, gebcoLayer)).toBeUndefined();
  });
});
