/**
 * 標高グリッド→地形メッシュのジオメトリデータ生成。
 *
 * WebGL非依存の純関数（jestでテスト可能）。TerrainRendererがVBO/IBOへ流し込む。
 * 法線はハイトフィールドの中央差分で計算する（スカートは辺の法線を複製）。
 *
 * タイル外周には「スカート」（外周頂点を複製して下方へ落とした縁）を付け、
 * 隣接タイルとのズーム差・補間差によるクラック（隙間）を隠す。
 */
import { tileSizeMeters, tileToMercator } from './coords';
import { TileKey } from './types';

export interface TileGeometryData {
  /** ローカル座標(x=東,y=標高,z=南)。フラット配列 */
  positions: Float32Array;
  uvs: Float32Array;
  /** 頂点法線（中央差分によるハイトフィールド法線） */
  normals: Float32Array;
  indices: Uint32Array;
}

/**
 * @param grid fetchTileElevationGridの結果（(segments+1)^2点、NoData=NaN）
 * @param tile テクスチャタイル
 * @param origin シーン原点のメルカトル座標
 * @param elevScale 標高倍率（exaggeration×1/cos(lat0)）
 */
export const buildTileGeometry = (
  grid: Float32Array,
  tile: TileKey,
  origin: { mx: number; my: number },
  elevScale: number,
  segments: number
): TileGeometryData => {
  const side = segments + 1;
  if (grid.length !== side * side) throw new Error('grid size mismatch');
  const { mx: tileMx, my: tileMy } = tileToMercator(tile.z, tile.x, tile.y);
  const size = tileSizeMeters(tile.z);
  const step = size / segments;

  // NoDataの穴埋めとスカート垂下量のためにmin/maxを先に求める
  let minElev = Infinity;
  let maxElev = -Infinity;
  for (let i = 0; i < grid.length; i++) {
    const v = grid[i];
    if (Number.isNaN(v)) continue;
    if (v < minElev) minElev = v;
    if (v > maxElev) maxElev = v;
  }
  if (!Number.isFinite(minElev)) {
    minElev = 0;
    maxElev = 0;
  }
  const skirtDrop = Math.max(30, (maxElev - minElev) * 0.3);

  // 本体(side^2) + スカート(外周4辺 side*4)の頂点
  const bodyCount = side * side;
  const skirtCount = side * 4;
  const positions = new Float32Array((bodyCount + skirtCount) * 3);
  const uvs = new Float32Array((bodyCount + skirtCount) * 2);

  for (let row = 0; row < side; row++) {
    for (let col = 0; col < side; col++) {
      const idx = row * side + col;
      const h = grid[idx];
      // ローカル座標: x=東（メルカトルX差）、z=南（メルカトルY差の符号反転）
      positions[idx * 3 + 0] = tileMx + col * step - origin.mx;
      positions[idx * 3 + 1] = (Number.isNaN(h) ? minElev : h) * elevScale;
      positions[idx * 3 + 2] = origin.my - (tileMy - row * step);
      // texImage2Dへの生アップロードはUNPACK_FLIP_Yなしのため、画像の上端(北)がv=0に来る
      uvs[idx * 2 + 0] = col / segments;
      uvs[idx * 2 + 1] = row / segments;
    }
  }

  // スカート頂点: 外周と同位置・同UVで高さだけ下げる（縁の伸びたテクスチャは目立たない）
  // 順序: 上辺(col 0..side-1) → 下辺 → 左辺(row 0..side-1) → 右辺
  const skirtBase = bodyCount;
  const edgeIndex = (edge: number, i: number): number => {
    if (edge === 0) return i; // 上辺 row=0
    if (edge === 1) return (side - 1) * side + i; // 下辺 row=segments
    if (edge === 2) return i * side; // 左辺 col=0
    return i * side + (side - 1); // 右辺 col=segments
  };
  for (let edge = 0; edge < 4; edge++) {
    for (let i = 0; i < side; i++) {
      const src = edgeIndex(edge, i);
      const dst = skirtBase + edge * side + i;
      positions[dst * 3 + 0] = positions[src * 3 + 0];
      positions[dst * 3 + 1] = (minElev - skirtDrop) * elevScale;
      positions[dst * 3 + 2] = positions[src * 3 + 2];
      uvs[dst * 2 + 0] = uvs[src * 2 + 0];
      uvs[dst * 2 + 1] = uvs[src * 2 + 1];
    }
  }

  // 本体インデックス（表面が上向き=反時計回り）
  const bodyQuads = segments * segments;
  const skirtQuads = segments * 4;
  const indices = new Uint32Array((bodyQuads + skirtQuads) * 6);
  let ptr = 0;
  for (let row = 0; row < segments; row++) {
    for (let col = 0; col < segments; col++) {
      const a = row * side + col;
      const b = a + 1;
      const c = a + side;
      const d = c + 1;
      indices[ptr++] = a;
      indices[ptr++] = c;
      indices[ptr++] = b;
      indices[ptr++] = b;
      indices[ptr++] = c;
      indices[ptr++] = d;
    }
  }
  // スカートインデックス（外向きの面。両面描画にしないため辺ごとに巻き方向を合わせる）
  for (let edge = 0; edge < 4; edge++) {
    for (let i = 0; i < segments; i++) {
      const top0 = edgeIndex(edge, i);
      const top1 = edgeIndex(edge, i + 1);
      const bottom0 = skirtBase + edge * side + i;
      const bottom1 = bottom0 + 1;
      // 上辺・右辺はそのまま、下辺・左辺は反転で外向きにする
      const flip = edge === 1 || edge === 2;
      if (flip) {
        indices[ptr++] = top0;
        indices[ptr++] = top1;
        indices[ptr++] = bottom0;
        indices[ptr++] = top1;
        indices[ptr++] = bottom1;
        indices[ptr++] = bottom0;
      } else {
        indices[ptr++] = top0;
        indices[ptr++] = bottom0;
        indices[ptr++] = top1;
        indices[ptr++] = top1;
        indices[ptr++] = bottom0;
        indices[ptr++] = bottom1;
      }
    }
  }

  // 法線: ハイトフィールドの中央差分 n = normalize(-dh/dx, 1, -dh/dz)
  // 高さはスケール済みのpositionsから読む（exaggerationを反映した見た目に一致させる）
  const normals = new Float32Array((bodyCount + skirtCount) * 3);
  const heightAt = (row: number, col: number): number => {
    const r = Math.max(0, Math.min(segments, row));
    const c = Math.max(0, Math.min(segments, col));
    return positions[(r * side + c) * 3 + 1];
  };
  for (let row = 0; row < side; row++) {
    for (let col = 0; col < side; col++) {
      const idx = row * side + col;
      // 端はエッジクランプの片側差分になる（分母は実距離に合わせる）
      const spanX = (Math.min(segments, col + 1) - Math.max(0, col - 1)) * step;
      const spanZ = (Math.min(segments, row + 1) - Math.max(0, row - 1)) * step;
      const dhdx = (heightAt(row, col + 1) - heightAt(row, col - 1)) / spanX;
      const dhdz = (heightAt(row + 1, col) - heightAt(row - 1, col)) / spanZ;
      const nx = -dhdx;
      const ny = 1;
      const nz = -dhdz;
      const len = Math.hypot(nx, ny, nz);
      normals[idx * 3 + 0] = nx / len;
      normals[idx * 3 + 1] = ny / len;
      normals[idx * 3 + 2] = nz / len;
    }
  }
  // スカートは元頂点の法線を複製（陰影の連続性を保つ）
  for (let edge = 0; edge < 4; edge++) {
    for (let i = 0; i < side; i++) {
      const src2 = edgeIndex(edge, i);
      const dst = skirtBase + edge * side + i;
      normals[dst * 3 + 0] = normals[src2 * 3 + 0];
      normals[dst * 3 + 1] = normals[src2 * 3 + 1];
      normals[dst * 3 + 2] = normals[src2 * 3 + 2];
    }
  }

  return { positions, uvs, normals, indices };
};
