import { TileMapType } from '../types';

/**
 * 地図画面の出典表示の文字列。
 * 標高データ（Mapterhorn／地理院 基盤地図情報）は要出典なので、それを使って描くもの
 * （可視領域のプレビュー、ネイティブの3D地形・眺望）があるときは表示中の地図に関係なく併記する。
 */
export const buildMapAttribution = (
  shownTileMaps: TileMapType[],
  options: { viewshed: boolean; terrain: boolean; demAttribution: string; terrainAttribution?: string }
): string => {
  const sources = Array.from(
    new Set(
      shownTileMaps
        .filter((tileMap) => tileMap.visible && tileMap.url && tileMap.attribution)
        .map((tileMap) => tileMap.attribution)
    )
  );
  const { viewshed, terrain, demAttribution, terrainAttribution } = options;
  if (!demAttribution || sources.includes(demAttribution)) return sources.join(', ');
  // 可視領域は標高タイルの加工物なので「加工して作成」まで書いた出典を常に足す。
  // 3D・眺望は標高をそのまま使うだけなので、陰影起伏図など Mapterhorn の出典を持つ地図が出ていれば重ねない
  const demAlreadyCredited = sources.some((source) => source.includes('Mapterhorn'));
  if (viewshed) sources.push(demAttribution);
  // 3D・眺望では常に出るので、長い文言だと縦画面で2行に折り返し下部のボタン列の裏に隠れる。短い文言を使う
  else if (terrain && !demAlreadyCredited) {
    const short = terrainAttribution || demAttribution;
    if (!sources.includes(short)) sources.push(short);
  }
  return sources.join(', ');
};
