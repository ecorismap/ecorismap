/**
 * 3D地形の「海底モード」用に、標高タイルの海域へ海底の深さを埋める純関数群。
 *
 * GSI dem_pngは海域がNoData、AWS Terrarium（terrarium）は海域にETOPO/GEBCO由来の
 * 海底地形を持つが、実測では**z10までしか値が無く、z11以上の海は0m**になる
 * （2026-09実測: 日本海溝沖・相模湾はz11で全画素0、z10は全画素負値）。
 * そこで海底の値は常にz10以下の祖先タイルからバイリニアで引き伸ばして使う。
 */

/** 海底の深さを取るTerrariumの最大ズーム（これより細かいズームは海が0mになる） */
export const BATHYMETRY_MAX_ZOOM = 10;

/**
 * 海面下の深さの強調倍率（地形全体のTERRAIN_EXAGGERATIONに上乗せ）。
 * 海底は陸より起伏がなだらかで、等倍では海溝も平板に見えるため海底モードだけ強調する。
 * 陸まで強調すると山が不自然に尖るので、0m未満にだけ掛ける
 */
export const BATHYMETRY_EXAGGERATION = 3;

const NO_DATA_RAW = 8388608; // 2^23
const SIGNED_BASE = 16777216; // 2^24

/**
 * 標高[m]をGSI方式のRGBへ書き込む（0.01m単位・24bitの2の補数。NaNはNoData）。
 * decodeElevation（terrainShading.ts）の逆変換。
 */
export const encodeGsiElevation = (elev: number, out: Uint8Array, offset: number): void => {
  let x: number;
  if (Number.isNaN(elev)) {
    x = NO_DATA_RAW;
  } else {
    const v = Math.round(elev * 100);
    // 表現範囲（±83886.07m）外は実データでは起きないが、NoDataと衝突しないよう丸める
    const clamped = Math.max(-(NO_DATA_RAW - 1), Math.min(NO_DATA_RAW - 1, v));
    x = clamped < 0 ? clamped + SIGNED_BASE : clamped;
  }
  out[offset] = (x >> 16) & 0xff;
  out[offset + 1] = (x >> 8) & 0xff;
  out[offset + 2] = x & 0xff;
};

/**
 * 標高配列をGSI方式のRGBA（アルファ255）へまとめて書き込む。
 * 1画素ずつencodeGsiElevationを呼ぶと、JITの無いHermesでは呼び出しコストが効くため展開して回す
 */
export const encodeGsiRgba = (elev: Float32Array, out: Uint8Array): void => {
  for (let i = 0, p = 0; i < elev.length; i++, p += 4) {
    const e = elev[i];
    let x: number;
    // eslint-disable-next-line no-self-compare
    if (e !== e) {
      x = NO_DATA_RAW;
    } else {
      let v = Math.round(e * 100);
      if (v > NO_DATA_RAW - 1) v = NO_DATA_RAW - 1;
      else if (v < 1 - NO_DATA_RAW) v = 1 - NO_DATA_RAW;
      x = v < 0 ? v + SIGNED_BASE : v;
    }
    out[p] = (x >> 16) & 0xff;
    out[p + 1] = (x >> 8) & 0xff;
    out[p + 2] = x & 0xff;
    out[p + 3] = 255;
  }
};

/** 海底値を取る祖先タイル（z ≤ BATHYMETRY_MAX_ZOOM）の座標 */
export const bathymetryAncestor = (z: number, x: number, y: number): { z: number; x: number; y: number } => {
  const bz = Math.min(z, BATHYMETRY_MAX_ZOOM);
  const shift = z - bz;
  return { z: bz, x: x >> shift, y: y >> shift };
};

/**
 * 標高タイルの海域画素を、祖先タイルの海底値で置き換える（elevを直接書き換える）。
 *
 * - 置き換え対象: NaN（GSIの海域NoData）と、seaAtOrBelowZero=trueなら0m以下の画素
 *   （Terrariumのz11以上は海が0mで入っているため）
 * - 値は祖先をバイリニア補間で引く。祖先の外周はクランプする（隣接タイルは見ない。
 *   海底は滑らかなので継ぎ目は目立たない）
 * - 埋める値は0m以下に丸める（祖先は粗いので海岸付近で正値を拾い、海面に凸ができるため）
 *
 * 1タイル65536画素を回すので、画素ごとの関数呼び出しは避けて展開している（HermesはJITが無い）
 *
 * @returns 置き換えた画素数
 */
export const fillSeaWithBathymetry = (
  elev: Float32Array,
  size: number,
  tile: { z: number; x: number; y: number },
  ancestor: Float32Array,
  ancestorTile: { z: number; x: number; y: number },
  seaAtOrBelowZero: boolean
): number => {
  const scale = Math.pow(2, tile.z - ancestorTile.z);
  const offsetX = (tile.x - ancestorTile.x * scale) * (size / scale);
  const offsetY = (tile.y - ancestorTile.y * scale) * (size / scale);
  const last = size - 1;
  let filled = 0;
  for (let py = 0; py < size; py++) {
    // 画素中心を祖先タイルの画素座標へ写す
    const fy = offsetY + (py + 0.5) / scale - 0.5;
    let y0 = Math.floor(fy);
    let ty = fy - y0;
    if (y0 < 0) {
      y0 = 0;
      ty = 0;
    } else if (y0 >= last) {
      y0 = last;
      ty = 0;
    }
    const y1 = y0 < last ? y0 + 1 : last;
    const row0 = y0 * size;
    const row1 = y1 * size;
    for (let px = 0; px < size; px++) {
      const i = py * size + px;
      const e = elev[i];
      // eslint-disable-next-line no-self-compare
      if (e === e && !(seaAtOrBelowZero && e <= 0)) continue;
      const fx = offsetX + (px + 0.5) / scale - 0.5;
      let x0 = Math.floor(fx);
      let tx = fx - x0;
      if (x0 < 0) {
        x0 = 0;
        tx = 0;
      } else if (x0 >= last) {
        x0 = last;
        tx = 0;
      }
      const x1 = x0 < last ? x0 + 1 : last;
      const top = ancestor[row0 + x0] * (1 - tx) + ancestor[row0 + x1] * tx;
      const bottom = ancestor[row1 + x0] * (1 - tx) + ancestor[row1 + x1] * tx;
      const v = top * (1 - ty) + bottom * ty;
      // eslint-disable-next-line no-self-compare
      if (v !== v) continue;
      elev[i] = v < 0 ? v : 0;
      filled++;
    }
  }
  return filled;
};

/** 0m未満の標高にfactorを掛ける（elevを直接書き換える。NaNはそのまま） */
export const exaggerateDepths = (elev: Float32Array, factor: number): void => {
  if (factor === 1) return;
  for (let i = 0; i < elev.length; i++) {
    const e = elev[i];
    if (e < 0) elev[i] = e * factor;
  }
};
