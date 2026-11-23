import { footDemStatus, footGroundElevation, isFootDemLoaded, requiredFootDemZoom, TerrainTileInternals } from '../webVistaGround';

// 富士山頂付近
const lat = 35.3606;
const lon = 138.7274;
const tileOf = (z: number) => {
  const scale = Math.pow(2, z);
  const x = Math.floor(((lon + 180) / 360) * scale);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale);
  return { z, x, y };
};
const internals = (tiles: { z: number; x: number; y: number; dem: boolean; state?: string }[]): TerrainTileInternals => ({
  deltaZoom: 1,
  tileManager: {
    _source: { maxzoom: 15 },
    getIds: () => tiles.map((_, i) => String(i)),
    getTileByID: (id: string) => {
      const t = tiles[Number(id)];
      return t === undefined ? undefined : { tileID: { canonical: { z: t.z, x: t.x, y: t.y } }, dem: t.dem ? {} : undefined, state: t.state };
    },
  },
});

describe('isFootDemLoaded（V-M9）', () => {
  it('DEMが1枚も無ければ未着（queryTerrainElevationの0を信じない）', () => {
    expect(isFootDemLoaded(internals([]), 13, lat, lon)).toBe(false);
  });

  it('足元を覆う十分細かいDEMがあれば読み込み済み', () => {
    expect(isFootDemLoaded(internals([{ ...tileOf(12), dem: true }]), 13, lat, lon)).toBe(true);
  });

  it('粗すぎる親タイルや別の場所のタイル、DEM未着のタイルは数えない', () => {
    const far = { ...tileOf(12), x: tileOf(12).x + 3, dem: true };
    expect(isFootDemLoaded(internals([{ ...tileOf(6), dem: true }, far, { ...tileOf(12), dem: false }]), 13, lat, lon)).toBe(
      false
    );
  });

  it('必要なズームはソースの最大ズームで頭打ち', () => {
    expect(requiredFootDemZoom(20.5, 1, 15)).toBe(15);
    expect(requiredFootDemZoom(13, 1, 15)).toBe(11);
    expect(requiredFootDemZoom(1, 1, 15)).toBe(0);
  });

  it('内部構造が読めないときは従来どおり（待たない）', () => {
    expect(isFootDemLoaded(undefined, 13, lat, lon)).toBe(true);
  });
});

describe('footDemStatus（細かいDEMが無い地域）', () => {
  it('必要なズームのタイルが404で、届いている親タイルがあれば待たずに確定する', () => {
    const tiles = [
      { ...tileOf(14), dem: false, state: 'errored' },
      { ...tileOf(13), dem: false, state: 'errored' },
      { ...tileOf(12), dem: true, state: 'loaded' },
    ];
    expect(footDemStatus(internals(tiles), 15, lat, lon)).toBe('loaded');
  });

  it('より細かい親を読み込み中なら待つ', () => {
    const tiles = [
      { ...tileOf(13), dem: false, state: 'errored' },
      { ...tileOf(12), dem: false, state: 'loading' },
      { ...tileOf(10), dem: true, state: 'loaded' },
    ];
    expect(footDemStatus(internals(tiles), 15, lat, lon)).toBe('pending');
  });

  it('足元のタイルが全て404（外洋）なら待たずにmissing', () => {
    const tiles = [
      { ...tileOf(13), dem: false, state: 'errored' },
      { ...tileOf(5), dem: false, state: 'errored' },
    ];
    expect(footDemStatus(internals(tiles), 15, lat, lon)).toBe('missing');
  });

  it('読み込み中だけならpending', () => {
    expect(footDemStatus(internals([{ ...tileOf(13), dem: false, state: 'loading' }]), 15, lat, lon)).toBe('pending');
  });
});

describe('footGroundElevation（V-L10）', () => {
  it('海底地形の負の標高では海面に立つ', () => {
    expect(footGroundElevation(-3000)).toBe(0);
    expect(footGroundElevation(1200)).toBe(1200);
  });
});
