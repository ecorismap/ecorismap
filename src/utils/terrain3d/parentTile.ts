/**
 * 子タイルを親タイル（粗ズーム）の部分矩形へ写すためのUV計算。
 *
 * 目的ズームのタイル画像が届くまで、親タイルを引き伸ばして仮表示するために使う
 * （maplibreのfindLoadedParentと同じ考え方）。これが無いと未着のタイルが
 * 単色で描かれ、ズームのたびに画面が明滅する。
 *
 * 規約はDEMの部分矩形参照（TerrainTileManager.buildPassのdemParams）と同一。
 * どちらかだけ式を変えると地形とタイル画像がずれるので、必ず両方を揃えること。
 */

/** 親タイル内での子タイルの位置。uv = offset + gridUv * scale で引く */
export interface ParentTileUv {
  /** 親タイル内のUVオフセット（0..1） */
  offsetU: number;
  offsetV: number;
  /** 親タイル内で子タイルが占める割合（1/2^dz） */
  scale: number;
}

/** 親タイルそのものを使う場合（等倍） */
export const IDENTITY_TILE_UV: ParentTileUv = { offsetU: 0, offsetV: 0, scale: 1 };

/**
 * 子タイル(z,x,y)が親タイル(parentZ)のどの部分矩形にあたるかを返す。
 * parentZ > z（親の方が細かい）は不正なのでnullを返す
 */
export const parentTileUv = (z: number, x: number, y: number, parentZ: number): ParentTileUv | null => {
  const dz = z - parentZ;
  if (dz < 0 || !Number.isInteger(dz)) return null;
  if (dz === 0) return IDENTITY_TILE_UV;
  const span = 2 ** dz;
  return {
    offsetU: (x - (x >> dz) * span) / span,
    offsetV: (y - (y >> dz) * span) / span,
    scale: 1 / span,
  };
};

/** 子タイル(z,x,y)を覆う親タイルの座標 */
export const parentTileKey = (z: number, x: number, y: number, parentZ: number): { x: number; y: number } | null => {
  const dz = z - parentZ;
  if (dz < 0 || !Number.isInteger(dz)) return null;
  return { x: x >> dz, y: y >> dz };
};
