import { TileMapType } from '../types';

/**
 * 2D の PMTile 要素の React key。
 * オンライン/オフラインで key を変えて作り直す。ネイティブのタイル描画は作られたときの
 * オフライン状態で読み込み方を決めるため、作り直さないと圏外→復帰で未保存範囲が読み込まれない。
 * iOS は url で key を変えるとタイルキャッシュがクリアされる（ダウンロードが無駄になる）が、
 * Android は url を key に入れていないので従来どおり id を使う。
 */
export const getPmtileKey = (
  tileMap: Pick<TileMapType, 'id' | 'url' | 'styleURL'>,
  isOffline: boolean,
  platformOS: string
) =>
  platformOS === 'ios'
    ? `${tileMap.url}-${isOffline}-${tileMap.styleURL}`
    : `${tileMap.id}-${isOffline}-${tileMap.styleURL}`;
