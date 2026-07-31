/**
 * 標高タイルから全方向陰影を計算する。
 *
 * 従来の陰影起伏図は勾配ベクトルと光源ベクトルの内積で求めるため光源方位に依存し、
 * 地図を180度回すと凹凸が反転して見える。ここで扱う方式はいずれも式に光源が現れず、
 * 地図をどの向きに回しても見え方が変わらない。
 *
 * 出力はグレー + αのRGBA。平坦地はα=0で透明になるため、下のベースマップの
 * 地名や道路の色を濁らせない。
 */

/** 標高タイルのNoData値（2^23） */
const NO_DATA_RAW = 8388608;
/** 符号反転の基準（2^24） */
const SIGNED_BASE = 16777216;

/**
 * 陰影の計算方式。
 * - svf:            天空の見える割合。黒+α=(1−SVF)。窪地ほど暗い
 * - opendiff:       開度差を明度に、傾斜×凹凸をαに。凹凸のある斜面だけに乗る
 * - opendiff-slope: 開度差を明度に、傾斜をαに。一様な急斜面にもベールが乗る
 * - multiscale:     3つの空間スケールの開度差を合成。山容から微地形まで拾う
 * - mpi-rrim:       MPI赤色立体地図。傾斜を赤、MPI(保護指数)をシアンにして乗算
 * - mpi-blue:       同上の傾斜を黒にしたもの。他の情報を重ねるとき赤の煩雑さを避ける
 * - mpi-gray:       MPIを明度、傾斜をαに。色相を使わずに2つの量を分けて持つ
 * - mpi-mono:       mpi-rrimをそのまま脱色したもの。傾斜とMPIが同じ明度に畳まれる
 *
 * mpi-rrim / mpi-blue は Kaneda and Chiba (2019) の手法。
 * Kaneda, H., and T. Chiba (2019), Stereopaired morphometric protection index red relief
 * image maps (Stereo MPI-RRIMs), Bull. Seismol. Soc. Am., 109, 99-109.
 * https://doi.org/10.1785/0120180166
 * MPI(Morphometric Protection Index)は各方位の最大仰角の平均で、
 * 窪地ほど大きく尾根ほど小さい（負にもなる）。地上開度の余角にあたる。
 */
export type ShadingMethod =
  | 'svf'
  | 'opendiff'
  | 'opendiff-slope'
  | 'multiscale'
  | 'mpi-rrim'
  | 'mpi-blue'
  | 'mpi-gray'
  | 'mpi-mono';

export const SHADING_METHODS: ShadingMethod[] = [
  'svf',
  'opendiff',
  'opendiff-slope',
  'multiscale',
  'mpi-rrim',
  'mpi-blue',
  'mpi-gray',
  'mpi-mono',
];

export function isShadingMethod(value: string): value is ShadingMethod {
  return (SHADING_METHODS as string[]).includes(value);
}

export type ShadingOptions = {
  method: ShadingMethod;
  /** 方位数。2の冪から選ぶこと（8と16は32と方位を共有するが12・24は共有しない） */
  numDirections: number;
  /** 探索半径（画素）。地上距離ではなく画素固定なので1タイルあたりのコストがズームによらず一定 */
  searchRadius: number;
  /** SVFのαが1に飽和する値。これより開けた場所は透明寄りになる */
  svfMin: number;
  /** 開度差の明度カーブの傾き[度]。値域が地形依存（山岳±11°, 丘陵±5°）なのでtanhで写す */
  openK: number;
  /** αが1に飽和する傾斜[度] */
  slopeMaxDeg: number;
  /** MPI-RRIMで赤が飽和する傾斜[度] */
  rrimSlopeMaxDeg: number;
  /** MPI-RRIMでシアンが飽和するMPI[度] */
  mpiMaxDeg: number;
  /** MPIのガンマ。小さいほど谷底が濃くコントラストが強くなる */
  mpiGamma: number;
  /**
   * mpi-grayで白に振り切るMPIの負側の幅[度]。
   * MPIは実測でほぼ全域が正（p5でも0以上）で開度差のような零点を持たないため、
   * 対称なカーブでは中央値が暗側に寄って潰れる。負側だけ狭く取って尾根を明るく出す。
   */
  mpiRidgeDeg: number;
};

export const DEFAULT_SHADING_OPTIONS: ShadingOptions = {
  method: 'svf',
  numDirections: 8,
  // 探索半径は画素固定。z=14(約9m/px)で約145mとなり、
  // MPI-RRIMの推奨値である実距離150mとほぼ一致する
  searchRadius: 16,
  svfMin: 0.55,
  openK: 5,
  slopeMaxDeg: 25,
  rrimSlopeMaxDeg: 55,
  mpiMaxDeg: 25,
  mpiGamma: 1,
  mpiRidgeDeg: 5,
};

/** マルチスケール開度差の各層。粗い層ほどKを大きくしないと飽和して白黒二値になる */
const MULTISCALE_LAYERS = [
  { factor: 1, radius: 8, k: 5, weight: 0.34 },
  { factor: 4, radius: 8, k: 7, weight: 0.33 },
  { factor: 4, radius: 32, k: 12, weight: 0.33 },
];

/**
 * 地図URLから計算方式を切り出す。方式はフラグメントで指定する:
 *   hillshade://https://example/{z}/{x}/{y}.png#opendiff
 * 未知の指定は既定方式にフォールバックし、URLは削らない（誤って一部を落とさないため）。
 *
 * @param url `hillshade://` を除いた標高タイルURL
 */
export function parseShadingMethod(url: string): { demUrl: string; method: ShadingMethod } {
  const hash = url.lastIndexOf('#');
  if (hash < 0) return { demUrl: url, method: DEFAULT_SHADING_OPTIONS.method };
  const suffix = url.slice(hash + 1);
  if (!isShadingMethod(suffix)) return { demUrl: url, method: DEFAULT_SHADING_OPTIONS.method };
  return { demUrl: url.slice(0, hash), method: suffix };
}

/** 方式ごとに必要な袖の幅（画素）を返す */
export function requiredHalo(options: ShadingOptions): number {
  if (options.method === 'multiscale') {
    return Math.max(...MULTISCALE_LAYERS.map((l) => l.factor * l.radius));
  }
  // 傾斜の中央差分に1画素余分に要る
  return options.searchRadius + 1;
}

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
 * 添字の差分と距離の逆数を事前に計算しておく。内側ループからround等を追い出せる。
 */
type SampleTable = { offsets: Int32Array; invDistances: Float32Array };

const tableCache = new Map<string, SampleTable>();

function getSampleTable(
  bufferWidth: number,
  metersPerPx: number,
  numDirections: number,
  searchRadius: number
): SampleTable {
  const key = `${bufferWidth}/${metersPerPx}/${numDirections}/${searchRadius}`;
  const cached = tableCache.get(key);
  if (cached) return cached;

  const n = numDirections * searchRadius;
  const offsets = new Int32Array(n);
  const invDistances = new Float32Array(n);
  for (let d = 0; d < numDirections; d++) {
    const theta = (2 * Math.PI * d) / numDirections;
    const dx = Math.cos(theta);
    const dy = Math.sin(theta);
    for (let s = 1; s <= searchRadius; s++) {
      const i = d * searchRadius + (s - 1);
      offsets[i] = Math.round(dy * s) * bufferWidth + Math.round(dx * s);
      invDistances[i] = 1 / (s * metersPerPx);
    }
  }
  const table = { offsets, invDistances };
  // ズームとバッファ幅の組み合わせは限られるので上限は小さくてよい
  if (tableCache.size > 16) tableCache.clear();
  tableCache.set(key, table);
  return table;
}

/**
 * 各方位の最大仰角・最大俯角から、SVF・開度差・MPIをまとめて求める。
 *   svf    = 1 − mean(sin(max(仰角, 0)))
 *   開度差 = (mean(俯角) − mean(仰角)) / 2 [度]。凸で正、凹で負、平坦で0
 *   MPI    = mean(仰角) [度]。窪地で正、尾根で負、平坦で0
 */
function scanHorizon(
  elevation: Float32Array,
  bufferWidth: number,
  offset: number,
  size: number,
  metersPerPx: number,
  numDirections: number,
  searchRadius: number,
  wantOpenness: boolean
): { svf: Float32Array; openDiff: Float32Array | null; mpi: Float32Array | null } {
  const { offsets, invDistances } = getSampleTable(bufferWidth, metersPerPx, numDirections, searchRadius);
  const svf = new Float32Array(size * size);
  const openDiff = wantOpenness ? new Float32Array(size * size) : null;
  const mpi = wantOpenness ? new Float32Array(size * size) : null;
  const toDeg = 180 / Math.PI;

  for (let y = 0; y < size; y++) {
    const rowBase = (offset + y) * bufferWidth + offset;
    for (let x = 0; x < size; x++) {
      const center = rowBase + x;
      const z0 = elevation[center];
      const o = y * size + x;
      // NoDataは透明にする。v !== v は NaN 判定の慣用句で、
      // 画素ごとに走るこのループでは関数呼び出しを避けたいためこの形にしている
      // eslint-disable-next-line no-self-compare
      if (z0 !== z0) {
        svf[o] = NaN;
        if (openDiff) openDiff[o] = NaN;
        if (mpi) mpi[o] = NaN;
        continue;
      }

      let sumSin = 0;
      let sumUp = 0;
      let sumDown = 0;
      for (let d = 0; d < numDirections; d++) {
        const base = d * searchRadius;
        let maxUp = -Infinity;
        let maxDown = -Infinity;
        for (let s = 0; s < searchRadius; s++) {
          const k = base + s;
          const zp = elevation[center + offsets[k]];
          // eslint-disable-next-line no-self-compare
          if (zp !== zp) continue; // NaN（NoData）はスキップ
          const t = (zp - z0) * invDistances[k];
          if (t > maxUp) maxUp = t;
          if (-t > maxDown) maxDown = -t;
        }
        const up = maxUp === -Infinity ? 0 : maxUp;
        // sin(atan(t)) = t / sqrt(1 + t²)。atanとsinを呼ばずに済む
        if (up > 0) sumSin += up / Math.sqrt(1 + up * up);
        if (openDiff) {
          sumUp += Math.atan(up);
          sumDown += Math.atan(maxDown === -Infinity ? 0 : maxDown);
        }
      }
      svf[o] = 1 - sumSin / numDirections;
      if (openDiff) openDiff[o] = (((sumDown - sumUp) / numDirections) * toDeg) / 2;
      if (mpi) mpi[o] = (sumUp / numDirections) * toDeg;
    }
  }
  return { svf, openDiff, mpi };
}

/** 傾斜角[度]。中央差分 */
function computeSlope(
  elevation: Float32Array,
  bufferWidth: number,
  offset: number,
  size: number,
  metersPerPx: number
): Float32Array {
  const out = new Float32Array(size * size);
  const inv = 1 / (2 * metersPerPx);
  const toDeg = 180 / Math.PI;
  for (let y = 0; y < size; y++) {
    const rowBase = (offset + y) * bufferWidth + offset;
    for (let x = 0; x < size; x++) {
      const i = rowBase + x;
      const gx = (elevation[i + 1] - elevation[i - 1]) * inv;
      const gy = (elevation[i + bufferWidth] - elevation[i - bufferWidth]) * inv;
      out[y * size + x] = Math.atan(Math.sqrt(gx * gx + gy * gy)) * toDeg;
    }
  }
  return out;
}

/** 標高配列をfactor分の1に縮小する（NaNを除いたボックス平均） */
function downsample(elevation: Float32Array, bufferWidth: number, factor: number) {
  const w = Math.floor(bufferWidth / factor);
  const out = new Float32Array(w * w);
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let n = 0;
      for (let j = 0; j < factor; j++) {
        for (let i = 0; i < factor; i++) {
          const v = elevation[(y * factor + j) * bufferWidth + (x * factor + i)];
          // eslint-disable-next-line no-self-compare
          if (v === v) {
            sum += v;
            n++;
          }
        }
      }
      out[y * w + x] = n ? sum / n : NaN;
    }
  }
  return { data: out, width: w };
}

/** size四方のスカラー場をバイリニアでfactor倍に拡大する */
function upsample(field: Float32Array, size: number, factor: number): Float32Array {
  const dst = size * factor;
  const out = new Float32Array(dst * dst);
  for (let y = 0; y < dst; y++) {
    const sy = Math.max(0, Math.min(size - 1.001, (y + 0.5) / factor - 0.5));
    const y0 = Math.floor(sy);
    const fy = sy - y0;
    for (let x = 0; x < dst; x++) {
      const sx = Math.max(0, Math.min(size - 1.001, (x + 0.5) / factor - 0.5));
      const x0 = Math.floor(sx);
      const fx = sx - x0;
      out[y * dst + x] =
        field[y0 * size + x0] * (1 - fx) * (1 - fy) +
        field[y0 * size + x0 + 1] * fx * (1 - fy) +
        field[(y0 + 1) * size + x0] * (1 - fx) * fy +
        field[(y0 + 1) * size + x0 + 1] * fx * fy;
    }
  }
  return out;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * 袖付きの標高バッファから、中央 size×size 分の陰影RGBAを計算する。
 *
 * @param elevation 袖を含む標高配列（bufferWidth×bufferWidth、NoDataはNaN）
 * @param bufferWidth 標高配列の一辺
 * @param offset 中央領域の開始位置（＝袖の幅。requiredHalo以上であること）
 * @param size 出力する一辺
 * @param metersPerPx 1画素あたりのメートル数
 */
export function computeShading(
  elevation: Float32Array,
  bufferWidth: number,
  offset: number,
  size: number,
  metersPerPx: number,
  options: ShadingOptions = DEFAULT_SHADING_OPTIONS
): Uint8ClampedArray {
  const { method, numDirections, searchRadius, svfMin, openK, slopeMaxDeg } = options;
  const out = new Uint8ClampedArray(size * size * 4);

  if (method === 'mpi-gray') {
    // 明度=MPI、不透明度=傾斜。色相を使わずに2つの量を別チャンネルに分ける。
    // MPIは尾根で負・窪地で正なので、明度は尾根で明るく谷で暗くなり平坦地は中間になる。
    // SVFと違い仰角の負側を丸めないため、尾根と平坦地が区別できる。
    const { mpi } = scanHorizon(
      elevation, bufferWidth, offset, size, metersPerPx, numDirections, searchRadius, true
    );
    const slope = computeSlope(elevation, bufferWidth, offset, size, metersPerPx);
    for (let i = 0; i < slope.length; i++) {
      const p = i * 4;
      const sl = slope[i];
      const mp = mpi![i];
      // eslint-disable-next-line no-self-compare
      if (sl !== sl || mp !== mp) {
        out[p + 3] = 0;
        continue;
      }
      // カラー版のシアン層と同じ写像を全成分に使う。窪地ほど暗く、尾根は白に寄る
      const t = clamp01((mp + options.mpiRidgeDeg) / (options.mpiMaxDeg + options.mpiRidgeDeg));
      const gray = (1 - Math.pow(t, options.mpiGamma)) * 255;
      out[p] = gray;
      out[p + 1] = gray;
      out[p + 2] = gray;
      out[p + 3] = clamp01(Math.sqrt(Math.min(sl / slopeMaxDeg, 1))) * 255;
    }
    return out;
  }

  if (method === 'mpi-rrim' || method === 'mpi-blue' || method === 'mpi-mono') {
    // Kaneda and Chiba (2019)。傾斜の層とMPIの層を乗算する。
    //   傾斜の層: 白 → 赤（mpi-rrim）/ 白 → 黒（mpi-blue）
    //   MPIの層 : 白 → シアン
    // 尾根は赤(または明るいまま)、谷はシアン、急峻な谷は暗くなる。
    const { mpi } = scanHorizon(
      elevation, bufferWidth, offset, size, metersPerPx, numDirections, searchRadius, true
    );
    const slope = computeSlope(elevation, bufferWidth, offset, size, metersPerPx);
    const redMode = method === 'mpi-rrim';

    for (let i = 0; i < slope.length; i++) {
      const p = i * 4;
      const sl = slope[i];
      const mp = mpi![i];
      // eslint-disable-next-line no-self-compare
      if (sl !== sl || mp !== mp) {
        out[p + 3] = 0;
        continue;
      }
      const s = clamp01(sl / options.rrimSlopeMaxDeg);
      // MPIは尾根で負になる。シアンは窪んだ側だけに乗せる
      const m = Math.pow(clamp01(mp / options.mpiMaxDeg), options.mpiGamma);

      // 傾斜の層（乗算の係数）。mpi-rrimは赤なのでRを落とさない
      const slopeR = redMode ? 1 : 1 - s;
      const slopeGB = 1 - s;
      // MPIの層（乗算の係数）。シアンなのでRだけ落とす。mpi-monoは無彩色なので全成分
      const mpiR = 1 - m;
      const mpiGB = method === 'mpi-mono' ? 1 - m : 1;

      out[p] = 255 * slopeR * mpiR;
      out[p + 1] = 255 * slopeGB * mpiGB;
      out[p + 2] = 255 * slopeGB * mpiGB;
      out[p + 3] = 255;
    }
    return out;
  }

  if (method === 'svf') {
    // 黒 + α=(1−SVF)。RGBは0のままでよい
    const { svf } = scanHorizon(
      elevation, bufferWidth, offset, size, metersPerPx, numDirections, searchRadius, false
    );
    const gain = 1 / (1 - svfMin);
    for (let i = 0; i < svf.length; i++) {
      // eslint-disable-next-line no-self-compare
      out[i * 4 + 3] = svf[i] !== svf[i] ? 0 : clamp01((1 - svf[i]) * gain) * 255;
    }
    return out;
  }

  // 以降は開度差を明度、傾斜（と凹凸）をαに使う方式
  const slope = computeSlope(elevation, bufferWidth, offset, size, metersPerPx);
  const signal = new Float32Array(size * size);

  if (method === 'multiscale') {
    for (const layer of MULTISCALE_LAYERS) {
      let field: Float32Array;
      if (layer.factor === 1) {
        field = scanHorizon(
          elevation, bufferWidth, offset, size, metersPerPx, numDirections, layer.radius, true
        ).openDiff!;
      } else {
        // 粗い層は縮小格子で計算する。計算量はfactor²分の1になる
        const { data, width } = downsample(elevation, bufferWidth, layer.factor);
        const coarse = scanHorizon(
          data, width, offset / layer.factor, size / layer.factor,
          metersPerPx * layer.factor, numDirections, layer.radius, true
        ).openDiff!;
        field = upsample(coarse, size / layer.factor, layer.factor);
      }
      for (let i = 0; i < signal.length; i++) signal[i] += layer.weight * Math.tanh(field[i] / layer.k);
    }
  } else {
    const { openDiff } = scanHorizon(
      elevation, bufferWidth, offset, size, metersPerPx, numDirections, searchRadius, true
    );
    for (let i = 0; i < signal.length; i++) signal[i] = Math.tanh(openDiff![i] / openK);
  }

  for (let i = 0; i < signal.length; i++) {
    const p = i * 4;
    const s = signal[i];
    const sl = slope[i];
    // eslint-disable-next-line no-self-compare
    if (s !== s || sl !== sl) {
      out[p + 3] = 0;
      continue;
    }
    const gray = clamp01(0.5 + 0.5 * Math.max(-1, Math.min(1, s))) * 255;
    out[p] = gray;
    out[p + 1] = gray;
    out[p + 2] = gray;
    // 平坦地で透明。緩傾斜も拾えるよう平方根で立ち上げる
    let alpha = Math.sqrt(Math.min(sl / slopeMaxDeg, 1));
    // opendiffは凹凸の強さも掛けるので、一様な斜面には乗らない
    if (method === 'opendiff') alpha *= Math.abs(s);
    out[p + 3] = clamp01(alpha) * 255;
  }
  return out;
}
