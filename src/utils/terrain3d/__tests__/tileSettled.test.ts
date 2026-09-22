/**
 * ズーム切替中に地形とドットが食い違わないための規律のテスト。
 *
 * 新ズームのタイルが出揃うまで旧ズームを描き続けるため、その間は
 * 「描いているズーム」が一意に決まらない。isSettledはその状態を検出する。
 */
import { TerrainTileManager } from '../TerrainTileManager';

jest.mock('../../demTileProvider', () => ({
  DEM_RANGE_BLOCKS: 4,
  DEM_TILE_SIZE: 256,
  fetchDemTile: jest.fn(async () => null),
  peekDecodedDemTileFor: jest.fn(() => undefined),
}));
jest.mock('../tileTextureLoader', () => ({
  resolveTileTexture: jest.fn(async () => ({ kind: 'missing' })),
  loadTileImageBitmap: jest.fn(async () => null),
  loadTileAsRgba: jest.fn(async () => null),
}));

/** タイルの中身は見ないので、readyなタイルを直接差し込んで状態だけを作る */
const makeManager = (): TerrainTileManager => {
  const renderer = { deleteTexture: jest.fn() } as never;
  const demCache = { acquire: jest.fn(), release: jest.fn() } as never;
  return new TerrainTileManager({ mx: 0, my: 0 }, 1, renderer, demCache, jest.fn());
};

type Internals = {
  lastTexZoom: number | null;
  activeZoom: number | null;
  settledCache: boolean | null;
  tiles: Map<string, { key: { z: number; x: number; y: number }; state: string }>;
};

const internals = (m: TerrainTileManager): Internals => m as unknown as Internals;

const putReadyTile = (m: TerrainTileManager, z: number, x: number, y: number): void => {
  internals(m).tiles.set(`${z}/${x}/${y}`, { key: { z, x, y }, state: 'ready' });
  internals(m).settledCache = null;
};

describe('isSettled（切り替わり途中の検出）', () => {
  it('まだ一度もズームを要求していなければ未確定', () => {
    expect(makeManager().isSettled).toBe(false);
  });

  it('要求ズームだけを描いていれば確定', () => {
    const m = makeManager();
    internals(m).lastTexZoom = 16;
    putReadyTile(m, 16, 1, 1);
    putReadyTile(m, 16, 1, 2);
    expect(m.isSettled).toBe(true);
  });

  it('旧ズームのタイルを描き続けている間は未確定', () => {
    const m = makeManager();
    internals(m).lastTexZoom = 16;
    putReadyTile(m, 16, 1, 1);
    putReadyTile(m, 15, 0, 0); // 切替前のタイルが残っている
    expect(m.isSettled).toBe(false);
  });

  it('1枚も揃っていなくても、別ズームを描いていなければ確定とみなす（取得失敗で固まらない）', () => {
    const m = makeManager();
    internals(m).lastTexZoom = 16;
    internals(m).tiles.set('16/1/1', { key: { z: 16, x: 1, y: 1 }, state: 'failed' });
    internals(m).tiles.set('16/1/2', { key: { z: 16, x: 1, y: 2 }, state: 'loading' });
    internals(m).settledCache = null;
    expect(m.isSettled).toBe(true);
  });

  it('要求ズームが変わったらキャッシュを捨てて再判定する', () => {
    const m = makeManager();
    internals(m).lastTexZoom = 16;
    // 表示中のズーム。これがあるとz15への切替中もz16のタイルは残される
    internals(m).activeZoom = 16;
    putReadyTile(m, 16, 1, 1);
    expect(m.isSettled).toBe(true);
    // z15を要求した瞬間、描いているz16は「別ズーム」になる
    m.updateVisibleTiles(35, 139, 0, 15, 1, 1);
    expect(m.isSettled).toBe(false);
  });
});
