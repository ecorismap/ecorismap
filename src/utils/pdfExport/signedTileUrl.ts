import { TileMapType } from '../../types';
import { TileSignaturesType, withTileSignature } from '../TileSignature';
import { buildTileUrl } from './tiles';

/**
 * PDF に貼る XYZ タイルの URL。署名付き配信の地図は署名が無いと 403 になり PDF から抜けるため、
 * 画面表示と同じく署名を付ける。署名の表は {z}/{x}/{y} を置き換える前のテンプレート URL で引く
 */
export const buildSignedTileUrl = (
  map: Pick<TileMapType, 'url' | 'flipY'>,
  z: number,
  x: number,
  y: number,
  signatures: TileSignaturesType
) => buildTileUrl({ ...map, url: withTileSignature(map.url, signatures) }, z, x, y);
