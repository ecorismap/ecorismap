import { demTileCacheFileName } from '../demTileLoader';

jest.mock('expo-file-system/legacy', () => ({ cacheDirectory: 'file:///cache/' }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('../../../modules/dem-decoder/src', () => ({ decodeDemFile: jest.fn() }));

describe('demTileCacheFileName', () => {
  const key = (z: number, x: number, y: number) =>
    `gebco|https://tiles.gsj.jp/tiles/elev/gebco/{z}/{y}/{x}.png|${z}/${x}/${y}`;

  it('ファイルのURIで特別な意味を持つ文字（% / : | { } など）を含まない', () => {
    // Androidは %2F を / に戻して解釈するので、%で始まる符号化も残さない
    expect(demTileCacheFileName(key(9, 455, 197))).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  it('タイル番号が違えば別の名前になる', () => {
    const names = [key(9, 455, 197), key(9, 45, 5197), key(9, 4, 55197), key(10, 455, 197)].map(demTileCacheFileName);
    expect(new Set(names).size).toBe(names.length);
  });

  it('URLが違えば別の名前になる', () => {
    expect(demTileCacheFileName('gebco|https://a.example/{z}/{x}/{y}.png|1/2/3')).not.toBe(
      demTileCacheFileName('gebco|https://b.example/{z}/{x}/{y}.png|1/2/3')
    );
  });
});
