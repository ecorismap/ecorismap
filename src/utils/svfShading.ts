/**
 * Sky-View Factor による全方向陰影（「影のみ」方式）の計算。
 *
 * 従来の陰影起伏図は勾配ベクトルと光源ベクトルの内積で求めるため光源方位に依存し、
 * 地図を180度回すと凹凸が反転して見える。SVFは各方位の最大仰角だけで決まり
 * 光源が式に現れないので、地図をどの向きに回しても見え方が変わらない。
 *
 * 出力は黒 + α=(1−SVF) のRGBA。平坦地はα=0で完全に透明になるため、
 * 下のベースマップの地名や道路の色を濁らせない。
 */

/** 標高タイルのNoData値（2^23） */
const NO_DATA_RAW = 8388608;
/** 符号反転の基準（2^24） */
const SIGNED_BASE = 16777216;

export type SvfOptions = {
  /** 方位数。2の冪から選ぶこと（8と16は32と方位を共有するが12・24は共有しない） */
  numDirections: number;
  /** 探索半径（画素）。地上距離ではなく画素固定なので1タイルあたりのコストがズームによらず一定 */
  searchRadius: number;
  /** αが1に飽和するSVF。これより開けた場所は透明寄りになる */
  svfMin: number;
};

export const DEFAULT_SVF_OPTIONS: SvfOptions = {
  numDirections: 8,
  searchRadius: 16,
  svfMin: 0.55,
};

/**
 * 国土地理院・産総研方式の標高タイルをデコードする。
 * x = 2^16·R + 2^8·G + B、NoDataは2^23、単位は0.01m。
 */
export function decodeElevation(r: number, g: number, b: number): number {
  const x = r * 65536 + g * 256 + b;
  if (x === NO_DATA_RAW) return NaN;
  return x < NO_DATA_RAW ? x / 100 : (x - SIGNED_BASE) / 100;
}

/** タイル中心緯度における1画素あたりのメートル数 */
export function metersPerPixel(zoom: number, tileY: number, tileSize = 256): number {
  const normalizedTileY = (tileY + 0.5) / Math.pow(2, zoom);
  const lat = 85.05112878 - 2.0 * 85.05112878 * normalizedTileY;
  return (40075017.0 * Math.cos((lat * Math.PI) / 180)) / (tileSize * Math.pow(2, zoom));
}

/**
 * レイキャストの標本点は全画素で同じ相対位置なので、
 * 添字の差分と距離の逆数を事前に計算しておく。内側ループからround/atanを追い出せる。
 */
type SampleTable = {
  /** 中心画素からの添字差分 */
  offsets: Int32Array;
  /** 1/(距離[m]) */
  invDistances: Float32Array;
  numDirections: number;
  searchRadius: number;
};

function buildSampleTable(
  bufferWidth: number,
  metersPerPx: number,
  numDirections: number,
  searchRadius: number
): SampleTable {
  const n = numDirections * searchRadius;
  const offsets = new Int32Array(n);
  const invDistances = new Float32Array(n);
  for (let d = 0; d < numDirections; d++) {
    const theta = (2 * Math.PI * d) / numDirections;
    const dx = Math.cos(theta);
    const dy = Math.sin(theta);
    for (let s = 1; s <= searchRadius; s++) {
      const k = d * searchRadius + (s - 1);
      offsets[k] = Math.round(dy * s) * bufferWidth + Math.round(dx * s);
      invDistances[k] = 1 / (s * metersPerPx);
    }
  }
  return { offsets, invDistances, numDirections, searchRadius };
}

// タイルごとにテーブルを作り直さないための簡易キャッシュ
let cachedTable: SampleTable | null = null;
let cachedKey = '';

function getSampleTable(
  bufferWidth: number,
  metersPerPx: number,
  numDirections: number,
  searchRadius: number
): SampleTable {
  const key = `${bufferWidth}/${metersPerPx}/${numDirections}/${searchRadius}`;
  if (cachedKey !== key || cachedTable === null) {
    cachedTable = buildSampleTable(bufferWidth, metersPerPx, numDirections, searchRadius);
    cachedKey = key;
  }
  return cachedTable;
}

/**
 * 袖付きの標高バッファから、中央 size×size 分の陰影RGBAを計算する。
 *
 * @param elevation 袖を含む標高配列（bufferWidth×bufferWidth、NoDataはNaN）
 * @param bufferWidth 標高配列の一辺
 * @param offset 中央領域の開始位置（＝袖の幅）
 * @param size 出力する一辺
 * @param metersPerPx 1画素あたりのメートル数
 */
export function computeSvfShading(
  elevation: Float32Array,
  bufferWidth: number,
  offset: number,
  size: number,
  metersPerPx: number,
  options: SvfOptions = DEFAULT_SVF_OPTIONS
): Uint8ClampedArray {
  const { numDirections, searchRadius, svfMin } = options;
  const { offsets, invDistances } = getSampleTable(bufferWidth, metersPerPx, numDirections, searchRadius);
  const alphaGain = 1 / (1 - svfMin);
  const out = new Uint8ClampedArray(size * size * 4);

  for (let y = 0; y < size; y++) {
    const rowBase = (offset + y) * bufferWidth + offset;
    for (let x = 0; x < size; x++) {
      const center = rowBase + x;
      const z0 = elevation[center];
      const p = (y * size + x) * 4;
      // NoDataは完全に透明にする。v !== v は NaN 判定の慣用句で、
      // 画素ごとに走るこのループでは関数呼び出しを避けたいためこの形にしている
      // eslint-disable-next-line no-self-compare
      if (z0 !== z0) {
        out[p + 3] = 0;
        continue;
      }

      // 各方位の最大仰角の正弦を平均する。1−SVF に等しい
      let sumSin = 0;
      for (let d = 0; d < numDirections; d++) {
        const base = d * searchRadius;
        let maxTan = 0; // 仰角が負（見下ろし）の方位は空が開けているので0でよい
        for (let s = 0; s < searchRadius; s++) {
          const k = base + s;
          const zp = elevation[center + offsets[k]];
          // eslint-disable-next-line no-self-compare
          if (zp !== zp) continue; // NaN（NoData）はスキップ
          const tan = (zp - z0) * invDistances[k];
          if (tan > maxTan) maxTan = tan;
        }
        // sin(atan(t)) = t / sqrt(1 + t²)。atanとsinを呼ばずに済む
        if (maxTan > 0) sumSin += maxTan / Math.sqrt(1 + maxTan * maxTan);
      }

      // 色は黒。RGBは0のままでよい
      const alpha = (sumSin / numDirections) * alphaGain;
      out[p + 3] = alpha >= 1 ? 255 : alpha * 255;
    }
  }
  return out;
}
