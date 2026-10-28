/**
 * 3Dで描けないGoogleの基本地図（標準地図・衛星写真）を地理院タイルへ置き換える。
 *
 * モバイルのstandard/hybridはURLを持たず、Google Maps SDKのmapTypeで描かれる。
 * 3Dはタイルを自前で取得して地形に貼るので、そのままでは何も描けない。
 * SDKの画像は取り出せず、規約上もGoogle以外の地図に重ねて使えないため、
 * 同じ役割の地理院タイル（無料・出典表示のみで利用可）を重ね順の同じ位置に差し込む。
 * 2Dと同じく、上に不透明なレイヤがあれば隠れる。
 */
import { TileMapType } from '../../types';

const GSI_ATTRIBUTION = '国土地理院';

/** 置き換え先（id=置き換え元のtileMap.id）。範囲は地理院タイルの提供ズーム */
const SUBSTITUTES: Record<string, { id: string; url: string; minimumZ: number; maximumZ: number }> = {
  standard: {
    id: 'terrain3d_gsi_std',
    url: 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png',
    minimumZ: 0,
    maximumZ: 18,
  },
  hybrid: {
    id: 'terrain3d_gsi_seamlessphoto',
    url: 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg',
    minimumZ: 2,
    maximumZ: 18,
  },
};

/**
 * 表示中のGoogle基本地図を地理院タイルに置き換えたtileMapsを返す（並び順は保つ）。
 *
 * - 同じ地理院タイルを利用者が表示中なら、二重に貼らないよう置き換え元を外す
 * - 非表示でも同じURLのtileMapがあればそのidを使う（オフライン保存済みのタイルを使えるように）
 * - 透過度は置き換え元の設定を引き継ぐ
 */
export const substituteGoogleBasemaps = (tileMaps: TileMapType[]): TileMapType[] =>
  tileMaps.flatMap((tileMap) => {
    const substitute = SUBSTITUTES[tileMap.id];
    if (substitute === undefined || tileMap.url !== '' || !tileMap.visible) return [tileMap];
    const sameUrl = tileMaps.find((other) => other.url === substitute.url);
    if (sameUrl?.visible) return [];
    return [
      {
        ...tileMap,
        id: sameUrl?.id ?? substitute.id,
        url: substitute.url,
        attribution: GSI_ATTRIBUTION,
        maptype: 'none',
        isGroup: false,
        isVector: false,
        minimumZ: substitute.minimumZ,
        maximumZ: substitute.maximumZ,
        overzoomThreshold: substitute.maximumZ,
        flipY: false,
        styleURL: undefined,
      },
    ];
  });
