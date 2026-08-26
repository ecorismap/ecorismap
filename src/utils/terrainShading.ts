/**
 * 標高タイルから全方向陰影を計算する。
 *
 * 従来の陰影起伏図は勾配ベクトルと光源ベクトルの内積で求めるため光源方位に依存し、
 * 地図を180度回すと凹凸が反転して見える。また光源と平行な走向の谷は明暗差を持たず
 * 構造的に見落とされる。
 *
 * ここでは MPI赤色立体地図（Kaneda and Chiba 2019）を無彩色化した方式を使う。
 * 傾斜とMPIという2つの「暗さ」を掛け合わせたもので、式に光源が現れないため
 * 地図をどの向きに回しても見え方が変わらない。
 *
 *   MPI  = 各方位の最大仰角の平均[度]。周囲の地形にどれだけ囲まれているかを表す
 *          （谷底は周りが高いので大きく、尾根や平坦地はほぼ0か負になる）
 *   傾斜 = 中央差分による勾配の大きさ[度]
 *
 *   s = clamp(傾斜 / slopeMaxDeg)
 *   m = clamp(MPI  / mpiMaxDeg) ^ mpiGamma
 *   明度 = 255 × (1 − s) × (1 − m)
 *
 * 急峻な谷が最も暗く、平坦な尾根・台地は白になる。乗算で重ねる前提の図なので、
 * ベースマップに重ねるより単体（transparency: 0）で背景として使う方が本来の姿。
 *
 * 参考: Kaneda, H., and T. Chiba (2019), Stereopaired morphometric protection index
 * red relief image maps (Stereo MPI-RRIMs), Bull. Seismol. Soc. Am., 109, 99-109.
 * https://doi.org/10.1785/0120180166
 * 手法は同論文に基づく独自実装で、QGISプラグイン(GPLv3)のコードは使用していない。
 */

/** 標高タイルのNoData値（2^23） */
const NO_DATA_RAW = 8388608;
/** 符号反転の基準（2^24） */
const SIGNED_BASE = 16777216;

export type ShadingOptions = {
  /** 方位数。2の冪から選ぶこと（8と16は32と方位を共有するが12・24は共有しない） */
  numDirections: number;
  /** 探索半径（画素）。地上距離ではなく画素固定なので1タイルあたりのコストがズームによらず一定 */
  searchRadius: number;
  /** 暗さが飽和する傾斜[度] */
  slopeMaxDeg: number;
  /** 暗さが飽和するMPI[度] */
  mpiMaxDeg: number;
  /** MPIのガンマ。小さいほど谷底が濃くコントラストが強くなる */
  mpiGamma: number;
};

export const DEFAULT_SHADING_OPTIONS: ShadingOptions = {
  numDirections: 8,
  // 探索半径は画素固定。z=14(約9m/px)で約145mとなり、
  // MPI-RRIMで推奨される実距離150mとほぼ一致する
  searchRadius: 16,
  slopeMaxDeg: 55,
  mpiMaxDeg: 25,
  mpiGamma: 1,
};

/** 計算に必要な袖の幅（画素）。傾斜の中央差分に1画素余分に要る */
export function requiredHalo(options: ShadingOptions = DEFAULT_SHADING_OPTIONS): number {
  return options.searchRadius + 1;
}

/**
 * 地図URLのプレフィックス。これが付いていると標高タイルとして扱い、陰影を計算する。
 *
 * 計算内容は光源を使わない立体図に変わったが、プレフィックスは `hillshade://` のまま
 * 据え置いている。ユーザーが追加した地図・エクスポート済みの地図JSON・共有プロジェクトの
 * 設定に既に埋め込まれており、変えると認識されず標高タイルの生の色が表示されるため。
 */
export const SHADING_URL_PREFIX = 'hillshade://';

/**
 * 陰影段彩図（段彩×陰影＋等深線焼き込み）のプレフィックス。
 * デコード・袖組み立て・ズーム降格はhillshadeと共通で、色付けだけが異なる。
 */
export const RELIEF_URL_PREFIX = 'relief://';

/** 陰影を計算する地図か判定する */
export function isShadingUrl(url: string | undefined): boolean {
  return !!url && url.startsWith(SHADING_URL_PREFIX);
}

/** 陰影段彩を計算する地図か判定する */
export function isReliefUrl(url: string | undefined): boolean {
  return !!url && url.startsWith(RELIEF_URL_PREFIX);
}

/** 標高タイルをDEMとして処理する地図（hillshade/relief）か判定する */
export function isDemProtocolUrl(url: string | undefined): boolean {
  return isShadingUrl(url) || isReliefUrl(url);
}

/**
 * 地図URLから標高タイルのURLテンプレートを取り出す。
 * プレフィックスと、動作確認時に付けた方式指定などのフラグメントを落とす。
 */
export function toDemUrl(url: string): string {
  const rest = url.startsWith(SHADING_URL_PREFIX)
    ? url.slice(SHADING_URL_PREFIX.length)
    : url.startsWith(RELIEF_URL_PREFIX)
    ? url.slice(RELIEF_URL_PREFIX.length)
    : url;
  const hash = rest.indexOf('#');
  return hash < 0 ? rest : rest.slice(0, hash);
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

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * 袖付きの標高バッファから、中央 size×size 分の陰影係数 (1−s)(1−m) を計算する。
 * 値域は0〜1、NoData（周辺欠損で傾斜が求まらない画素を含む）はNaN。
 * 無彩色の陰影（computeShading）と段彩（computeColorRelief）が共有する。
 *
 * @param elevation 袖を含む標高配列（bufferWidth×bufferWidth、NoDataはNaN）
 * @param bufferWidth 標高配列の一辺
 * @param offset 中央領域の開始位置（＝袖の幅。requiredHalo以上であること）
 * @param size 出力する一辺
 * @param metersPerPx 1画素あたりのメートル数
 */
export function computeShadeField(
  elevation: Float32Array,
  bufferWidth: number,
  offset: number,
  size: number,
  metersPerPx: number,
  options: ShadingOptions = DEFAULT_SHADING_OPTIONS
): Float64Array {
  const { numDirections, searchRadius, slopeMaxDeg, mpiMaxDeg, mpiGamma } = options;
  const { offsets, invDistances } = getSampleTable(bufferWidth, metersPerPx, numDirections, searchRadius);
  const out = new Float64Array(size * size);
  const toDeg = 180 / Math.PI;
  const slopeInv = 1 / (2 * metersPerPx);

  for (let y = 0; y < size; y++) {
    const rowBase = (offset + y) * bufferWidth + offset;
    for (let x = 0; x < size; x++) {
      const center = rowBase + x;
      const z0 = elevation[center];
      const p = y * size + x;

      // NoDataはNaNのまま返す。v !== v は NaN 判定の慣用句で、
      // 画素ごとに走るこのループでは関数呼び出しを避けたいためこの形にしている
      // eslint-disable-next-line no-self-compare
      if (z0 !== z0) {
        out[p] = NaN;
        continue;
      }

      // --- MPI: 各方位の最大仰角の平均 ---
      let sumUp = 0;
      for (let d = 0; d < numDirections; d++) {
        const base = d * searchRadius;
        let maxTan = -Infinity;
        for (let s = 0; s < searchRadius; s++) {
          const k = base + s;
          const zp = elevation[center + offsets[k]];
          // eslint-disable-next-line no-self-compare
          if (zp !== zp) continue; // NaN（NoData）はスキップ
          const t = (zp - z0) * invDistances[k];
          if (t > maxTan) maxTan = t;
        }
        // 有効な標本がなければ水平とみなす。尾根では負になるので丸めない
        sumUp += maxTan === -Infinity ? 0 : Math.atan(maxTan);
      }
      const mpi = (sumUp / numDirections) * toDeg;

      // --- 傾斜: 中央差分 ---
      const gx = (elevation[center + 1] - elevation[center - 1]) * slopeInv;
      const gy = (elevation[center + bufferWidth] - elevation[center - bufferWidth]) * slopeInv;
      const slope = Math.atan(Math.sqrt(gx * gx + gy * gy)) * toDeg;
      // eslint-disable-next-line no-self-compare
      if (slope !== slope) {
        out[p] = NaN;
        continue;
      }

      // --- 2つの暗さを乗算する ---
      const s = clamp01(slope / slopeMaxDeg);
      const m = Math.pow(clamp01(mpi / mpiMaxDeg), mpiGamma);
      out[p] = (1 - s) * (1 - m);
    }
  }
  return out;
}

/**
 * 袖付きの標高バッファから、中央 size×size 分の陰影RGBAを計算する。
 * 引数はcomputeShadeField参照。
 */
export function computeShading(
  elevation: Float32Array,
  bufferWidth: number,
  offset: number,
  size: number,
  metersPerPx: number,
  options: ShadingOptions = DEFAULT_SHADING_OPTIONS
): Uint8ClampedArray {
  const shade = computeShadeField(elevation, bufferWidth, offset, size, metersPerPx, options);
  const out = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const v = shade[i];
    // eslint-disable-next-line no-self-compare
    if (v !== v) continue; // NoDataは透明（alphaは0のまま）
    const p = i * 4;
    const gray = 255 * v;
    out[p] = gray;
    out[p + 1] = gray;
    out[p + 2] = gray;
    out[p + 3] = 255;
  }
  return out;
}
