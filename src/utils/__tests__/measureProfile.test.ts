import { getMeasureProfile, selectProfileZoom, surfaceDistanceFromElevations } from '../measureProfile';
import { getDemTile } from '../demSource';

jest.mock('../demSource', () => ({
  DEM_SOURCE_TILE_SIZE: 512,
  getDemTile: jest.fn(),
}));

const mockGetDemTile = getDemTile as jest.Mock;

const LAT = 35;
const metersPerPx = (z: number) => (40075017 * Math.cos((LAT * Math.PI) / 180)) / (512 * Math.pow(2, z));

/** 東へ行くほど一定の勾配(slope)で高くなる地形のタイル。どのズームでも同じ地形を表す */
const eastSlopeTile = (slope: number) => (z: number, x: number, y: number) => {
  const elev = new Float32Array(512 * 512);
  const mpp = metersPerPx(z);
  for (let row = 0; row < 512; row++) {
    for (let col = 0; col < 512; col++) {
      elev[row * 512 + col] = (x * 512 + col + 0.5) * mpp * slope;
    }
  }
  return Promise.resolve({ z, x, y, size: 512, elev, min: 0, max: 0 });
};

beforeEach(() => {
  mockGetDemTile.mockReset();
});

describe('surfaceDistanceFromElevations', () => {
  it('平坦なら水平距離と同じ', () => {
    expect(surfaceDistanceFromElevations([10, 10, 10], 1000)).toBeCloseTo(1000);
  });
  it('区間ごとの斜距離を足す', () => {
    // 2区間（各300m）でそれぞれ400m上る→各500m
    expect(surfaceDistanceFromElevations([0, 400, 800], 600)).toBeCloseTo(1000);
  });
  it('上って下る起伏も距離に加わる（標高差は0でも沿面距離は伸びる）', () => {
    expect(surfaceDistanceFromElevations([0, 400, 0], 600)).toBeCloseTo(1000);
  });
  it('欠けた標高（NaN）の区間は水平距離のまま数える', () => {
    expect(surfaceDistanceFromElevations([0, NaN, 0], 600)).toBeCloseTo(600);
  });
});

describe('selectProfileZoom', () => {
  it('短い線は最も細かい段(z15)を使う', () => {
    expect(selectProfileZoom(LAT, 500)).toBe(15);
  });
  it('長い線ほど粗い段を使い、採取間隔が画素程度になる', () => {
    const z = selectProfileZoom(LAT, 100_000);
    expect(z).toBeLessThan(15);
    const spacing = 100_000 / 512;
    expect(metersPerPx(z)).toBeGreaterThanOrEqual(spacing);
    expect(metersPerPx(z + 1)).toBeLessThan(spacing);
  });
});

describe('getMeasureProfile', () => {
  it('一定勾配の斜面を東西に測ると、沿面距離=水平×√(1+勾配²)、標高差=水平×勾配', async () => {
    mockGetDemTile.mockImplementation(eastSlopeTile(0.5));
    const a = { latitude: LAT, longitude: 138.5 };
    const b = { latitude: LAT, longitude: 138.51 };
    const profile = await getMeasureProfile(a, b);
    expect(profile).not.toBeNull();
    const h = profile!.horizontalM;
    expect(profile!.surfaceM).toBeCloseTo(h * Math.sqrt(1 + 0.25), -1);
    // 端点は最近傍画素で読むので1画素分（z15で約4m×勾配）の誤差を許す
    expect(Math.abs(profile!.elevationDiffM! - h * 0.5)).toBeLessThan(5);
  });

  it('西へ測ると標高差は負になる', async () => {
    mockGetDemTile.mockImplementation(eastSlopeTile(0.2));
    const profile = await getMeasureProfile({ latitude: LAT, longitude: 138.51 }, { latitude: LAT, longitude: 138.5 });
    expect(profile!.elevationDiffM!).toBeLessThan(0);
  });

  it('標高タイルが通信エラーならnull', async () => {
    mockGetDemTile.mockResolvedValue(undefined);
    const profile = await getMeasureProfile({ latitude: LAT, longitude: 138.5 }, { latitude: LAT, longitude: 138.51 });
    expect(profile).toBeNull();
  });

  it('どの段にもタイルが無い外洋は海面0mの平坦として扱う', async () => {
    mockGetDemTile.mockResolvedValue(null);
    const profile = await getMeasureProfile({ latitude: 30, longitude: 150 }, { latitude: 30, longitude: 150.01 });
    expect(profile!.surfaceM).toBeCloseTo(profile!.horizontalM);
    expect(profile!.elevationDiffM).toBe(0);
  });
});
