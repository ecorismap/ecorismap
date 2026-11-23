import { getPmtileKey } from '../pmtileKey';

describe('getPmtileKey', () => {
  const tileMap = { id: 'map1', url: 'https://example.com/a.pmtiles', styleURL: 'https://example.com/style.json' };

  it('Android はオンライン/オフラインで key が変わる（作り直してオンライン復帰で読み込ませる）', () => {
    expect(getPmtileKey(tileMap, true, 'android')).not.toBe(getPmtileKey(tileMap, false, 'android'));
  });

  it('Android は url が変わっても key を変えない（id 基準のまま）', () => {
    const changed = { ...tileMap, url: 'https://example.com/a.pmtiles?sig=xyz' };
    expect(getPmtileKey(changed, false, 'android')).toBe(getPmtileKey(tileMap, false, 'android'));
  });

  it('iOS は従来どおり url・isOffline・styleURL を含む', () => {
    expect(getPmtileKey(tileMap, true, 'ios')).toBe(
      'https://example.com/a.pmtiles-true-https://example.com/style.json'
    );
    expect(getPmtileKey(tileMap, false, 'ios')).not.toBe(getPmtileKey(tileMap, true, 'ios'));
  });

  it('Android でも styleURL の変更で key が変わる', () => {
    const changed = { ...tileMap, styleURL: 'https://example.com/style2.json' };
    expect(getPmtileKey(changed, false, 'android')).not.toBe(getPmtileKey(tileMap, false, 'android'));
  });
});
