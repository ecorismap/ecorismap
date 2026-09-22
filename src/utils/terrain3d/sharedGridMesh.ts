/**
 * 全タイルで共有する地形グリッドメッシュ。
 *
 * 標高は頂点シェーダがDEMテクスチャから読むため（demTextureCache参照）、
 * 頂点バッファはタイルに依存しない「正規化グリッド座標」だけを持つ。
 * タイルごとの違いは行列とDEMの参照矩形（uniform）で与えるので、
 * バッファはアプリ起動時に1本作れば足りる（タイル毎に約248KB×最大128枚が不要になる）。
 *
 * GPU非依存の純関数（jestでテスト可能）。
 *
 * タイル外周には「スカート」（外周頂点を複製して下方へ落とした縁）を付け、
 * 隣接タイルとのズーム差・補間差によるクラック（隙間）を隠す。
 */

export interface SharedGridMeshData {
  /**
   * 頂点属性。1頂点3成分:
   *  [0]=u(0..1, 東方向) [1]=v(0..1, 南方向) [2]=スカートフラグ(0=本体, 1=垂下)
   */
  grid: Float32Array;
  /** 本体＋スカートの三角形インデックス（頂点数4485なのでUint16で足りる） */
  indices: Uint16Array;
}

/**
 * 格子1マスの中の標高を、GPUが描くのと同じ形で補間する。
 *
 * GPUは三角形を線形補間するので、クアッドをバイリニアで埋めると
 * ツイスト項のぶんだけ描かれている面から浮き沈みする（ドットが地形からずれる）。
 * buildSharedGridMeshの分割は共有辺が b–c ＝ **反対角線**なので、
 * 分割線は fu + fv = 1。どちらの三角形に入るかで重心座標を切り替える。
 *
 * 分割の向きを変えたらこの関数も必ず合わせること（同じファイルに置いているのはそのため）。
 *
 * @param h00 (i, j) の標高   @param h10 (i+1, j) の標高
 * @param h01 (i, j+1) の標高 @param h11 (i+1, j+1) の標高
 * @param fu マス内の東方向の位置(0..1)  @param fv 同じく南方向
 */
export const interpolateGridCell = (
  h00: number,
  h10: number,
  h01: number,
  h11: number,
  fu: number,
  fv: number
): number =>
  fu + fv <= 1
    ? h00 * (1 - fu - fv) + h10 * fu + h01 * fv
    : h11 * (fu + fv - 1) + h10 * (1 - fv) + h01 * (1 - fu);

/** 辺edge上のi番目の本体頂点の添字（0=上辺, 1=下辺, 2=左辺, 3=右辺） */
const edgeIndex = (side: number, edge: number, i: number): number => {
  if (edge === 0) return i; // 上辺 row=0
  if (edge === 1) return (side - 1) * side + i; // 下辺 row=segments
  if (edge === 2) return i * side; // 左辺 col=0
  return i * side + (side - 1); // 右辺 col=segments
};

/**
 * 共有グリッドメッシュを生成する。
 * 頂点・インデックスの並びと巻き方向は旧demMeshBuilderと同一（描画結果を変えない）。
 */
export const buildSharedGridMesh = (segments: number): SharedGridMeshData => {
  const side = segments + 1;
  const bodyCount = side * side;
  const skirtCount = side * 4;
  const grid = new Float32Array((bodyCount + skirtCount) * 3);

  for (let row = 0; row < side; row++) {
    for (let col = 0; col < side; col++) {
      const idx = row * side + col;
      grid[idx * 3 + 0] = col / segments;
      // texImage2Dへの生アップロードはUNPACK_FLIP_Yなしのため、画像の上端(北)がv=0に来る
      grid[idx * 3 + 1] = row / segments;
      grid[idx * 3 + 2] = 0;
    }
  }
  // スカート頂点: 外周と同じUV（＝同じ標高を読む）でフラグだけ立てる
  const skirtBase = bodyCount;
  for (let edge = 0; edge < 4; edge++) {
    for (let i = 0; i < side; i++) {
      const src = edgeIndex(side, edge, i);
      const dst = skirtBase + edge * side + i;
      grid[dst * 3 + 0] = grid[src * 3 + 0];
      grid[dst * 3 + 1] = grid[src * 3 + 1];
      grid[dst * 3 + 2] = 1;
    }
  }

  // 本体インデックス（表面が上向き=反時計回り）
  const bodyQuads = segments * segments;
  const skirtQuads = segments * 4;
  const indices = new Uint16Array((bodyQuads + skirtQuads) * 6);
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
      const top0 = edgeIndex(side, edge, i);
      const top1 = edgeIndex(side, edge, i + 1);
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

  return { grid, indices };
};
