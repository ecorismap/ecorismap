/**
 * 3D地形エンジン向けのDEM標高サンプリング（JS側）。
 *
 * 描画用の標高は頂点シェーダがDEMテクスチャから直接読むため、ここを通らない。
 * ここが担うのは「JS側で標高が要る処理」＝オーバーレイのドレープ・ポイントの
 * スクリーン投影・タップの逆投影・カメラの地面高で、標高はDEMテクスチャと同じ配列から引く
 * （TerrainTileManager.sampleElevationAtMercator）。
 */

/**
 * タイル内のDEM画素を最近傍で読む（エッジクランプ）。
 *
 * **頂点シェーダの decodeElev と同じ読み方にすること**。あちらは
 * `textureLoad(dem, vec2<i32>(px + 0.5), 0)` で最近傍なので、ここをバイリニアにすると
 * 描かれている地形と標高がずれる。特に尾根のような凸地形では、バイリニアが周囲を
 * 平均して低く出るぶん、ドットが地形にめり込んで見える
 */
export const sampleNearest = (elev: Float32Array, size: number, px: number, py: number): number => {
  const x = Math.max(0, Math.min(size - 1, Math.floor(px + 0.5)));
  const y = Math.max(0, Math.min(size - 1, Math.floor(py + 0.5)));
  return elev[y * size + x];
};
