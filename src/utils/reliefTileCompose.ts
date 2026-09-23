/**
 * 標高タイルから陰影・段彩ラスタを作るときの共通処理（プラットフォーム非依存の純関数）。
 *
 * - assembleWithHalo: 中央タイル＋周囲8タイルから袖付きの標高バッファを組む
 * - cropAndScale: 粗いズームで作ったラスタから子タイルの範囲を切り出して拡大する
 *
 * Webの陰影プロトコル（shadingTileProtocol.web.ts）とネイティブ3Dの段彩テクスチャ
 * （terrain3d/reliefTexture.ts）が共用する。
 */

/**
 * 中央タイルと周囲8タイルから、袖付きの標高バッファを組み立てる。
 * 袖はhalo画素分だけあればよいので、隣接タイルは必要な帯だけコピーする。
 *
 * @param tiles 行優先の3x3（[4]が中央）。欠けたタイルはnull（NaNのまま）
 */
export function assembleWithHalo(tiles: (Float32Array | null)[], halo: number, tileSize = 256): Float32Array {
  const bufferSize = tileSize + 2 * halo;
  const buffer = new Float32Array(bufferSize * bufferSize).fill(NaN);

  for (let ty = -1; ty <= 1; ty++) {
    for (let tx = -1; tx <= 1; tx++) {
      const tile = tiles[(ty + 1) * 3 + (tx + 1)];
      if (!tile) continue;

      // このタイルのうちバッファに入る範囲を、タイル内座標で求める
      const srcX0 = tx === -1 ? tileSize - halo : 0;
      const srcX1 = tx === 1 ? halo : tileSize;
      const srcY0 = ty === -1 ? tileSize - halo : 0;
      const srcY1 = ty === 1 ? halo : tileSize;
      // バッファ上での左上位置
      const dstX = halo + tx * tileSize + srcX0;
      const dstY = halo + ty * tileSize + srcY0;

      for (let y = srcY0; y < srcY1; y++) {
        const src = y * tileSize + srcX0;
        const dst = (dstY + (y - srcY0)) * bufferSize + dstX;
        buffer.set(tile.subarray(src, src + (srcX1 - srcX0)), dst);
      }
    }
  }
  return buffer;
}

/**
 * 粗いズームで計算した陰影から該当部分を切り出して拡大する。
 * shift はズーム差、offsetX/Y は親タイル内の位置（0 〜 2^shift-1）。
 * 拡大はニアレストネイバー。陰影は連続的なので線形補間でなくても目立たない。
 */
export function cropAndScale(
  rgba: Uint8ClampedArray,
  shift: number,
  offsetX: number,
  offsetY: number,
  tileSize = 256
): Uint8ClampedArray {
  const scale = 1 << shift;
  const cropSize = tileSize / scale;
  const originX = offsetX * cropSize;
  const originY = offsetY * cropSize;
  const out = new Uint8ClampedArray(tileSize * tileSize * 4);
  for (let y = 0; y < tileSize; y++) {
    const srcY = originY + ((y / scale) | 0);
    for (let x = 0; x < tileSize; x++) {
      const srcX = originX + ((x / scale) | 0);
      const src = (srcY * tileSize + srcX) * 4;
      const dst = (y * tileSize + x) * 4;
      out[dst] = rgba[src];
      out[dst + 1] = rgba[src + 1];
      out[dst + 2] = rgba[src + 2];
      out[dst + 3] = rgba[src + 3];
    }
  }
  return out;
}

/**
 * 袖付き標高バッファを、子タイル（shift段細かいズーム）の袖付きバッファへバイリニアで引き伸ばす。
 *
 * 段彩・等値線を描いた後のラスタを拡大すると画素が階段状に見えるため、
 * 3Dのオーバーズームでは標高の段階で補間してから子ズームで描き直す。
 * 補間する4画素にNaN（NoData）が混じるときは最寄りの画素を使う（海岸線を滲ませない）。
 *
 * @param src 袖srcHalo付きの標高（一辺tileSize+2*srcHalo）
 * @param offsetX 親タイル内での子の位置（0 〜 2^shift-1）
 * @param dstHalo 子バッファの袖（子の画素単位）。dstHalo/2^shift ≤ srcHalo-1 であること
 */
export function upsampleHaloBuffer(
  src: Float32Array,
  srcHalo: number,
  shift: number,
  offsetX: number,
  offsetY: number,
  dstHalo: number,
  tileSize = 256
): Float32Array {
  const scale = 1 << shift;
  const srcWidth = tileSize + 2 * srcHalo;
  const dstWidth = tileSize + 2 * dstHalo;
  const out = new Float32Array(dstWidth * dstWidth);
  const originX = (offsetX * tileSize) / scale;
  const originY = (offsetY * tileSize) / scale;
  const maxIndex = srcWidth - 1;
  for (let dy = 0; dy < dstWidth; dy++) {
    // 子の画素中心 → 親タイル内の画素座標 → 袖付きバッファの添字
    const fy = originY + (dy - dstHalo + 0.5) / scale - 0.5 + srcHalo;
    let y0 = Math.floor(fy);
    let ty = fy - y0;
    if (y0 < 0) {
      y0 = 0;
      ty = 0;
    } else if (y0 >= maxIndex) {
      y0 = maxIndex;
      ty = 0;
    }
    const y1 = y0 < maxIndex ? y0 + 1 : maxIndex;
    for (let dx = 0; dx < dstWidth; dx++) {
      const fx = originX + (dx - dstHalo + 0.5) / scale - 0.5 + srcHalo;
      let x0 = Math.floor(fx);
      let tx = fx - x0;
      if (x0 < 0) {
        x0 = 0;
        tx = 0;
      } else if (x0 >= maxIndex) {
        x0 = maxIndex;
        tx = 0;
      }
      const x1 = x0 < maxIndex ? x0 + 1 : maxIndex;
      const a = src[y0 * srcWidth + x0];
      const b = src[y0 * srcWidth + x1];
      const c = src[y1 * srcWidth + x0];
      const d = src[y1 * srcWidth + x1];
      let v = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
      // eslint-disable-next-line no-self-compare
      if (v !== v) {
        // NaNが混じった → 最寄りの画素（それもNaNならNoDataのまま）
        v = ty < 0.5 ? (tx < 0.5 ? a : b) : tx < 0.5 ? c : d;
      }
      out[dy * dstWidth + dx] = v;
    }
  }
  return out;
}
