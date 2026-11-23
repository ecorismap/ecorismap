import { TileMapType } from '../../types';
import { buildMapAttribution } from '../mapAttribution';

const DEM = '© Mapterhorn（日本域は国土地理院 基盤地図情報。標高タイルを加工して作成）';

const map = (id: string, attribution: string, visible = true): TileMapType =>
  ({ id, name: id, url: `https://example.com/${id}/{z}/{x}/{y}.png`, attribution, visible } as unknown as TileMapType);

describe('buildMapAttribution', () => {
  const gsi = map('std', '地理院タイル');

  it('2D・可視領域なしなら表示中の地図の出典だけ', () => {
    expect(buildMapAttribution([gsi, map('hidden', 'X', false)], { viewshed: false, terrain: false, demAttribution: DEM })).toBe(
      '地理院タイル'
    );
  });

  it('ネイティブの3D・眺望では標高データの出典を足す', () => {
    expect(buildMapAttribution([gsi], { viewshed: false, terrain: true, demAttribution: DEM })).toBe(`地理院タイル, ${DEM}`);
  });

  it('3Dで Mapterhorn 由来の地図が既に出ていれば重ねない', () => {
    const hillshade = map('hillshade', '© Mapterhorn（日本域は国土地理院 基盤地図情報）');
    expect(buildMapAttribution([gsi, hillshade], { viewshed: false, terrain: true, demAttribution: DEM })).toBe(
      '地理院タイル, © Mapterhorn（日本域は国土地理院 基盤地図情報）'
    );
  });

  it('可視領域は加工物なので Mapterhorn の地図があっても足し、3Dと重なっても1回だけ', () => {
    const hillshade = map('hillshade', '© Mapterhorn（日本域は国土地理院 基盤地図情報）');
    const text = buildMapAttribution([hillshade], { viewshed: true, terrain: true, demAttribution: DEM });
    expect(text).toBe(`© Mapterhorn（日本域は国土地理院 基盤地図情報）, ${DEM}`);
  });

  it('3D・眺望では短い文言があればそれを使い、可視領域では加工の旨を含む文言を使う', () => {
    const SHORT = '© Mapterhorn（日本域は国土地理院）';
    const opts = { demAttribution: DEM, terrainAttribution: SHORT };
    expect(buildMapAttribution([gsi], { ...opts, viewshed: false, terrain: true })).toBe(`地理院タイル, ${SHORT}`);
    expect(buildMapAttribution([gsi], { ...opts, viewshed: true, terrain: true })).toBe(`地理院タイル, ${DEM}`);
    expect(buildMapAttribution([gsi], { ...opts, viewshed: false, terrain: false })).toBe('地理院タイル');
  });

  it('同じ文字列の出典は重複させない', () => {
    expect(buildMapAttribution([map('a', DEM)], { viewshed: true, terrain: true, demAttribution: DEM })).toBe(DEM);
  });
});
