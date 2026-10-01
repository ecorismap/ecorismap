/**
 * 3D地形の「海底モード」用に、標高タイルの海域へ海底の深さを埋める純関数群。
 *
 * 陸の標高（Mapterhorn）は海が0m（外洋はタイル自体が無い）で深さを持たないため、
 * 海の画素を産総研GEBCOの海底値で埋める。ネイティブ（terrain3d/terrainDem.ts）と
 * Web（gebcoDemLayers.web.tsのbathyterrain://）で共用する。
 */

/**
 * 海面下の深さの強調倍率（地形全体のTERRAIN_EXAGGERATIONに上乗せ）。
 * 海底は陸より起伏がなだらかで、等倍では海溝も平板に見えるため海底モードだけ強調する。
 * 陸まで強調すると山が不自然に尖るので、0m未満にだけ掛ける
 */
export const BATHYMETRY_EXAGGERATION = 3;

/**
 * 標高タイルの海域画素を、祖先タイルの海底値で置き換える（elevを直接書き換える）。
 *
 * - 置き換え対象: NaN（NoData）と、seaAtOrBelowZero=trueなら0m以下の画素
 *   （Mapterhornは海が0mで入っているため）
 * - 値は祖先をバイリニア補間で引く。祖先の外周はクランプする（隣接タイルは見ない。
 *   海底は滑らかなので継ぎ目は目立たない）
 * - 祖先の画素数（ancestorSize）はタイルと違ってよい（Webは512pxの地形に256pxのGEBCOを埋める）
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
  seaAtOrBelowZero: boolean,
  ancestorSize: number = size
): number => {
  const scale = Math.pow(2, tile.z - ancestorTile.z);
  // タイル1画素が祖先の何画素に当たるか
  const step = ancestorSize / size / scale;
  const offsetX = (tile.x - ancestorTile.x * scale) * (ancestorSize / scale);
  const offsetY = (tile.y - ancestorTile.y * scale) * (ancestorSize / scale);
  const last = ancestorSize - 1;
  let filled = 0;
  for (let py = 0; py < size; py++) {
    // 画素中心を祖先タイルの画素座標へ写す
    const fy = offsetY + (py + 0.5) * step - 0.5;
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
    const row0 = y0 * ancestorSize;
    const row1 = y1 * ancestorSize;
    for (let px = 0; px < size; px++) {
      const i = py * size + px;
      const e = elev[i];
      // eslint-disable-next-line no-self-compare
      if (e === e && !(seaAtOrBelowZero && e <= 0)) continue;
      const fx = offsetX + (px + 0.5) * step - 0.5;
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
