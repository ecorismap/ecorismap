import { substituteGoogleBasemaps } from '../googleBasemapSubstitute';
import { TileMapType } from '../../../types';

const tileMap = (overrides: Partial<TileMapType>): TileMapType => ({
  id: 'x',
  name: 'x',
  url: '',
  attribution: 'Google',
  maptype: 'none',
  visible: true,
  transparency: 0,
  overzoomThreshold: 22,
  highResolutionEnabled: false,
  minimumZ: 0,
  maximumZ: 22,
  flipY: false,
  ...overrides,
});

const SEAMLESS = 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg';
const STD = 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png';

describe('substituteGoogleBasemaps', () => {
  it('衛星写真・標準地図を地理院タイルに置き換え、並び順と透過度を保つ', () => {
    const maps = [
      tileMap({ id: 'top', url: 'https://example.com/{z}/{x}/{y}.png', attribution: 'A' }),
      tileMap({ id: 'hybrid', maptype: 'hybrid', transparency: 0.3 }),
      tileMap({ id: 'standard', maptype: 'standard' }),
    ];
    const result = substituteGoogleBasemaps(maps);
    expect(result.map((m) => m.id)).toEqual(['top', 'terrain3d_gsi_seamlessphoto', 'terrain3d_gsi_std']);
    expect(result[1]).toMatchObject({ url: SEAMLESS, attribution: '国土地理院', transparency: 0.3, maximumZ: 18 });
    expect(result[2]).toMatchObject({ url: STD, attribution: '国土地理院' });
  });

  it('非表示の基本地図はそのまま（3Dでは描かれない）', () => {
    const maps = [tileMap({ id: 'hybrid', maptype: 'hybrid', visible: false })];
    expect(substituteGoogleBasemaps(maps)).toEqual(maps);
  });

  it('同じ地理院タイルを表示中なら二重に貼らない', () => {
    const maps = [
      tileMap({ id: 'std', url: STD, attribution: '国土地理院' }),
      tileMap({ id: 'standard', maptype: 'standard' }),
    ];
    expect(substituteGoogleBasemaps(maps).map((m) => m.id)).toEqual(['std']);
  });

  it('同じURLのtileMapが非表示であればそのidを使う（オフライン保存済みタイルを使うため）', () => {
    const maps = [
      tileMap({ id: 'photo', url: SEAMLESS, visible: false }),
      tileMap({ id: 'hybrid', maptype: 'hybrid' }),
    ];
    const result = substituteGoogleBasemaps(maps);
    expect(result[1]).toMatchObject({ id: 'photo', url: SEAMLESS, visible: true });
  });
});
