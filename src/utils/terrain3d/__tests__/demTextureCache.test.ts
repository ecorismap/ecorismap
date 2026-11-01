import { DemTextureCache } from '../demTextureCache';
import { resolveTerrainDem } from '../terrainDem';
import { TerrainRenderer } from '../TerrainRenderer';

jest.mock('../terrainDem', () => ({
  DEM_RANGE_BLOCKS: 8,
  resolveTerrainDem: jest.fn(),
}));

const mockResolve = resolveTerrainDem as jest.Mock;

const demOf = () => ({
  size: 4,
  elev: new Float32Array(16),
  blockMin: new Float32Array(64),
  blockMax: new Float32Array(64),
});

const makeRenderer = () => {
  const deleted = new Set<object>();
  const renderer = {
    createDemTexture: jest.fn(() => ({})),
    deleteTexture: jest.fn((texture: object) => deleted.add(texture)),
  };
  return { renderer: renderer as unknown as TerrainRenderer, deleted };
};

describe('DemTextureCache', () => {
  beforeEach(() => {
    mockResolve.mockReset();
    mockResolve.mockImplementation(async () => demOf());
  });

  it('上限超過で他が全て参照中でも、読み込んだばかりのテクスチャを破棄して渡さない', async () => {
    const { renderer, deleted } = makeRenderer();
    const cache = new DemTextureCache(renderer, 1);
    const held = await cache.acquire(12, 0, 0);

    const fresh = await cache.acquire(12, 1, 0);

    expect(fresh.state).toBe('ready');
    expect(fresh.refs).toBe(1);
    expect(deleted.has(held.texture!)).toBe(false);
    expect(deleted.has(fresh.texture!)).toBe(false);
  });

  it('同じタイルを同時に要求した全員に、破棄されていないテクスチャを渡す', async () => {
    const { renderer, deleted } = makeRenderer();
    const cache = new DemTextureCache(renderer, 1);
    await cache.acquire(12, 0, 0);

    const [a, b] = await Promise.all([cache.acquire(12, 1, 0), cache.acquire(12, 1, 0)]);

    expect(a).toBe(b);
    expect(a.refs).toBe(2);
    expect(deleted.has(a.texture!)).toBe(false);
  });

  it('参照が全て返されたエントリは上限超過分として破棄される', async () => {
    const { renderer, deleted } = makeRenderer();
    const cache = new DemTextureCache(renderer, 1);
    const first = await cache.acquire(12, 0, 0);
    const second = await cache.acquire(12, 1, 0);

    cache.release(first);

    expect(deleted.has(first.texture!)).toBe(true);
    expect(deleted.has(second.texture!)).toBe(false);
  });
});
