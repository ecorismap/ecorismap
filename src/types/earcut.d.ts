declare module 'earcut' {
  /**
   * ポリゴンを三角形分割する。
   * @param vertices フラットな頂点配列 [x0,y0, x1,y1, ...]
   * @param holes 各穴の開始頂点インデックス
   * @param dimensions 頂点の次元数（既定2）
   * @returns 三角形の頂点インデックス列
   */
  export default function earcut(vertices: number[], holes?: number[], dimensions?: number): number[];
}
