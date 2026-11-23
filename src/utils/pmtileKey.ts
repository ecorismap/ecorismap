import { TileMapType } from '../types';

/**
 * 2D のタイル部品（PMTile・UrlTile）の React key。
 * ネイティブの setUrlTemplate は新しい URL を反映しない（Android は取得処理を作り直さず、iOS は新しい
 * レイヤを地図に載せない）。そこで「実際に渡す URL（署名込み）」を key に入れ、変わったら作り直させる
 * （タイル監査 M-H6）。署名を取得した直後・ログアウトで署名が外れたとき・地図の編集で URL を変えたときに効く。
 * 作り直してもディスクのタイルキャッシュ（TILE_FOLDER/{id}）は消えないので、ダウンロードは無駄にならない。
 */

/**
 * PMTile の key。オンライン/オフラインでも作り直す。ネイティブは作られたときのオフライン状態で
 * 読み込み方を決めるため、作り直さないと圏外→復帰で未保存範囲が読み込まれない（M-H7）。
 */
export const getPmtileKey = (
  tileMap: Pick<TileMapType, 'id'>,
  urlTemplate: string,
  styleURL: string | undefined,
  isOffline: boolean
) => `${tileMap.id}-${urlTemplate}-${isOffline}-${styleURL}`;

/**
 * UrlTile の key。flipY・tileSize も取得するタイルを変えるので含める。
 * iOS はオンライン/オフラインでも作り直す（キャッシュの読み方が作られたときで決まる）。
 */
export const getUrlTileKey = (
  tileMap: Pick<TileMapType, 'id' | 'flipY' | 'tileSize' | 'redraw'>,
  urlTemplate: string,
  isOffline: boolean,
  platformOS: string
) => {
  const base = `${tileMap.id}-${urlTemplate}-${tileMap.flipY}-${tileMap.tileSize ?? 256}`;
  return platformOS === 'ios' ? `${base}-${isOffline}-${tileMap.redraw}` : base;
};
