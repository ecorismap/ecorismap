import { MapType, TileMapType } from '../types';

/**
 * 地図一覧の標準地図（standard）・衛星写真（hybrid）の表示状態から、背景の地図種別（settings.mapType）を決める。
 * mapType は一覧の切替時にしか更新されないため、一覧を丸ごと差し替える経路（プロジェクトを開く・閉じる・
 * 既定の設定を作る）で一覧と背景が食い違わないようにここから導き直す（M-M20）。
 * 一覧にどちらの項目も無いときは決められないので undefined を返す（呼び出し側で元の値を使う）
 */
export const mapTypeFromTileMaps = (tileMaps: readonly Pick<TileMapType, 'id' | 'visible'>[]): MapType | undefined => {
  const standard = tileMaps.find((m) => m.id === 'standard');
  const hybrid = tileMaps.find((m) => m.id === 'hybrid');
  if (standard === undefined && hybrid === undefined) return undefined;
  if (standard?.visible) return 'standard';
  if (hybrid?.visible) return 'hybrid';
  return 'none';
};
