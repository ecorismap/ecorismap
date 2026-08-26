/**
 * 陰影段彩図（relief://）の色付けと等深線焼き込み。
 *
 * 標高から段彩色を引き、terrainShadingの陰影係数(1−s)(1−m)を緩和して乗算する。
 * 海域（標高<0）には等深線を焼き込む。**海岸はベース地図を優先**する:
 * 海陸統合DEMは海岸線付近で陸のデータが優先され、粗いズームでは近海が陸として
 * 塗られてしまうため、海に接する陸画素（境界の1画素）は透明にして下のベース地図の
 * 海岸線を見せる。ラベルは付けられないが、3プラットフォームで同一のラスタ計算だけで完結する。
 *
 * このファイルのテーブル（COLOR_RELIEF_RAMP / CONTOUR_INTERVALS / 各係数）が
 * 単一情報源で、Android(MapDEMTileProvider.java)・iOS(AIRGoogleMapDEMTileOverlay.m)
 * には同じ値をハードコードする。3実装の一致はcolorRelief.test.tsのパッチ整合テストで
 * 機械的に検証される。値を変えるときは必ず3箇所を揃えること。
 */
import { computeShadeField, DEFAULT_SHADING_OPTIONS, ShadingOptions } from './terrainShading';

/**
 * 段彩の折れ点テーブル [標高m, R, G, B]。区分線形補間、両端はクランプ。
 * 深海の青〜海岸の明るい水色〜陸の緑〜茶。深海が陰影・等深線と重なっても
 * 潰れないよう明るめに寄せてある。0mに意図的な不連続を置いて海岸を際立たせる
 * （標高分解能は0.01mなので-0.01と0の間の値は存在せず、補間が働くことはない）。
 */
export const COLOR_RELIEF_RAMP: ReadonlyArray<readonly [number, number, number, number]> = [
  [-8000, 30, 48, 110],
  [-6000, 38, 62, 128],
  [-4000, 48, 82, 148],
  [-2000, 60, 105, 168],
  [-1000, 74, 130, 185],
  [-500, 88, 155, 200],
  [-200, 104, 180, 212],
  [-100, 118, 198, 221],
  [-50, 132, 213, 228],
  [-20, 145, 226, 233],
  [-0.01, 160, 240, 238],
  [0, 140, 200, 120],
  [200, 150, 195, 108],
  [500, 168, 188, 98],
  [1000, 172, 160, 82],
  [1500, 166, 138, 70],
  [2000, 160, 122, 62],
  [3000, 155, 110, 55],
];

/**
 * GEBCO全球プリセット用の配色（#style=gebco）。
 * shiwaku/gebco-2025-grid-tile-on-maplibre デモの折れ点をそのまま移植したもので、
 * 深海の変化を強調する濃藍〜青〜青緑と、落ち着いた陸の緑〜茶。
 * デモは指数補間(0.8)だが折れ点が細かいため区分線形で近似する。
 */
export const GEBCO_RELIEF_RAMP: ReadonlyArray<readonly [number, number, number, number]> = [
  [-11000, 5, 5, 40],
  [-10000, 8, 8, 55],
  [-9000, 10, 12, 70],
  [-8000, 12, 18, 90],
  [-7000, 15, 25, 110],
  [-6000, 18, 35, 130],
  [-5000, 20, 48, 150],
  [-4000, 15, 65, 165],
  [-3000, 10, 82, 178],
  [-2000, 0, 100, 190],
  [-1000, 0, 125, 205],
  [-500, 0, 150, 215],
  [-200, 0, 175, 220],
  [-50, 30, 200, 225],
  [-10, 80, 220, 230],
  [0, 120, 240, 235],
  [10, 140, 200, 120],
  [100, 170, 200, 100],
  [200, 200, 200, 90],
  [500, 210, 185, 80],
  [1000, 205, 165, 70],
  [2000, 190, 145, 65],
  [3000, 170, 125, 60],
  [4000, 155, 110, 55],
];

/** 段彩の配色バリアント。URLのフラグメント（#style=gebco）で選択する */
export type ReliefStyle = 'default' | 'gebco';

// ---- GEBCOスタイル（デモ再現）のパラメータ。Webはmaplibreの実レイヤを使うため、
// ---- 以下はネイティブ（ラスタ焼き込み）近似専用。デモのレイヤ設定と同値にする ----
/** color-reliefの指数補間の底（デモのinterpolate exponential 0.8） */
export const GEBCO_EXP_BASE = 0.8;
/** color-relief-opacity。明るいベース地図に重ねた見えを白との混合で近似する */
export const GEBCO_BASE_MIX = 0.85;
/** hillshade-exaggeration */
export const GEBCO_HILLSHADE_EXAGGERATION = 0.6;
/** hillshade-illumination-direction[度] */
export const GEBCO_ILLUMINATION_DEG = 315;
/** hillshade-shadow-color rgba(0,0,0,0.22) のアルファ */
export const GEBCO_SHADOW_ALPHA = 0.22;
/** hillshade-highlight-color rgba(255,255,255,0.14) のアルファ */
export const GEBCO_HIGHLIGHT_ALPHA = 0.14;
/** hillshade-accent-color rgba(0,0,0,0.10) のアルファ */
export const GEBCO_ACCENT_ALPHA = 0.1;
/** maplibreのhillshade prepareシェーダのderivスケール定数（2^(28.2562-zoom)の指数部） */
export const GEBCO_DERIV_EXP = 28.2562;
/** 等深線: line-color rgba(0,0,0,50%) の太線をアルファ合成した係数 */
export const GEBCO_CONTOUR_MAJOR_FACTOR = 0.5;
/** 等深線: 細線(0.5px)を1px描画で近似するため薄める係数 */
export const GEBCO_CONTOUR_MINOR_FACTOR = 0.75;

/**
 * maplibreのexponential補間係数。区間[lower, upper]内の位置を0-1で返す。
 * base<1では区間の下端付近で急速に上端側の色へ寄る（デモの深海強調はこの性質を使っている）。
 */
export function exponentialInterpolationFactor(input: number, base: number, lower: number, upper: number): number {
  const difference = upper - lower;
  const progress = input - lower;
  if (difference === 0) return 0;
  if (base === 1) return progress / difference;
  return (Math.pow(base, progress) - 1) / (Math.pow(base, difference) - 1);
}

/** GEBCO配色をデモと同じ指数補間(0.8)で求める。戻り値は0-255のfloat */
export function gebcoReliefColor(elev: number): [number, number, number] {
  const ramp = GEBCO_RELIEF_RAMP;
  const first = ramp[0];
  if (elev <= first[0]) return [first[1], first[2], first[3]];
  const last = ramp[ramp.length - 1];
  if (elev >= last[0]) return [last[1], last[2], last[3]];
  for (let i = 1; i < ramp.length; i++) {
    if (elev <= ramp[i][0]) {
      const lo = ramp[i - 1];
      const hi = ramp[i];
      const t = exponentialInterpolationFactor(elev, GEBCO_EXP_BASE, lo[0], hi[0]);
      return [lo[1] + (hi[1] - lo[1]) * t, lo[2] + (hi[2] - lo[2]) * t, lo[3] + (hi[3] - lo[3]) * t];
    }
  }
  return [last[1], last[2], last[3]];
}

/** relief:// URLのフラグメントから配色バリアントを読み取る */
export function reliefStyleFromUrl(url: string): ReliefStyle {
  const hash = url.indexOf('#');
  if (hash < 0) return 'default';
  const fragment = url.slice(hash + 1);
  for (const pair of fragment.split('&')) {
    const [key, value] = pair.split('=');
    if (key === 'style' && value === 'gebco') return 'gebco';
  }
  return 'default';
}

/**
 * 等深線の間隔テーブル [ズーム, 細線間隔m, 太線間隔m]。
 * キーは「計算を実行したsourceZoom」（表示ズームではない）。オーバーズームや
 * ズーム降格の際も画素グリッドと線密度の整合が保たれる。
 * z4未満は画素間の標高差が間隔を超えて点描ノイズになるため等深線を引かない。
 * z9までがデモと同値。z10-11は日本近海・詳細プリセット（elev2統合DEM、内閣府地形データ）用。
 * テーブル超はz11の値にクランプ。
 */
export const CONTOUR_INTERVALS: ReadonlyArray<readonly [number, number, number]> = [
  [4, 500, 5000],
  [5, 200, 2000],
  [6, 200, 1000],
  [7, 100, 500],
  [8, 100, 200],
  [9, 50, 200],
  [10, 50, 200],
  [11, 20, 100],
];

/** 細線・太線の画素色への乗算係数（小さいほど濃い） */
export const CONTOUR_MINOR_FACTOR = 0.8;
export const CONTOUR_MAJOR_FACTOR = 0.6;

/**
 * 陰影の下限。段彩に乗算する係数を RELIEF_SHADE_MIN + (1−RELIEF_SHADE_MIN)×shade に
 * 緩和し、急峻な深海が黒く潰れないようにする（hillshadeの無彩色陰影には影響しない）。
 */
export const RELIEF_SHADE_MIN = 0.35;

/** 段彩色を区分線形補間で求める。戻り値は0-255のfloat（丸めは呼び出し側で一度だけ行う） */
export function reliefColor(
  elev: number,
  ramp: ReadonlyArray<readonly [number, number, number, number]> = COLOR_RELIEF_RAMP
): [number, number, number] {
  const first = ramp[0];
  if (elev <= first[0]) return [first[1], first[2], first[3]];
  const last = ramp[ramp.length - 1];
  if (elev >= last[0]) return [last[1], last[2], last[3]];
  for (let i = 1; i < ramp.length; i++) {
    if (elev <= ramp[i][0]) {
      const lo = ramp[i - 1];
      const hi = ramp[i];
      const t = (elev - lo[0]) / (hi[0] - lo[0]);
      return [lo[1] + (hi[1] - lo[1]) * t, lo[2] + (hi[2] - lo[2]) * t, lo[3] + (hi[3] - lo[3]) * t];
    }
  }
  return [last[1], last[2], last[3]];
}

/** sourceZoomに応じた[細線, 太線]の間隔。z4未満は等深線なし(null) */
export function contourIntervalsForZoom(sourceZoom: number): [number, number] | null {
  const first = CONTOUR_INTERVALS[0];
  if (sourceZoom < first[0]) return null;
  const last = CONTOUR_INTERVALS[CONTOUR_INTERVALS.length - 1];
  if (sourceZoom >= last[0]) return [last[1], last[2]];
  for (let i = 0; i < CONTOUR_INTERVALS.length; i++) {
    if (CONTOUR_INTERVALS[i][0] === sourceZoom) {
      return [CONTOUR_INTERVALS[i][1], CONTOUR_INTERVALS[i][2]];
    }
  }
  return [last[1], last[2]];
}

/** 海（負の標高）か。NaN（NoData）はfalse */
function isSea(e: number): boolean {
  return e < 0;
}

/**
 * 等深線画素の判定。中央画素と右隣・下隣のfloor(e/interval)が異なれば線とする。
 * 海域のみ対象で、隣が陸（>=0）またはNoDataなら線を引かない
 * （0m等深線は引かず、海岸線は段彩の不連続に任せる）。
 * floorは負値でも床関数であること（-0.5/50 → -1）。3実装で統一。
 */
function isContourPixel(e0: number, eRight: number, eDown: number, interval: number): boolean {
  const level = Math.floor(e0 / interval);
  // eslint-disable-next-line no-self-compare
  if (eRight === eRight && eRight < 0 && Math.floor(eRight / interval) !== level) return true;
  // eslint-disable-next-line no-self-compare
  if (eDown === eDown && eDown < 0 && Math.floor(eDown / interval) !== level) return true;
  return false;
}

/**
 * 袖付きの標高バッファから、中央 size×size 分の陰影段彩RGBAを計算する。
 * 海に接する陸画素（海岸の境界1画素）とNoDataは透明。
 * バッファの前提はcomputeShadeField（terrainShading.ts）と同じ。
 *
 * @param sourceZoom 計算を実行したズーム（等深線間隔の選択キー）
 */
export function computeColorRelief(
  elevation: Float32Array,
  bufferWidth: number,
  offset: number,
  size: number,
  metersPerPx: number,
  sourceZoom: number,
  options: ShadingOptions = DEFAULT_SHADING_OPTIONS
): Uint8ClampedArray {
  const shade = computeShadeField(elevation, bufferWidth, offset, size, metersPerPx, options);
  const out = new Uint8ClampedArray(size * size * 4);
  const intervals = contourIntervalsForZoom(sourceZoom);

  for (let y = 0; y < size; y++) {
    const rowBase = (offset + y) * bufferWidth + offset;
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const v = shade[i];
      // NoData（傾斜が求まらない画素を含む）は透明。alphaは0のまま
      // eslint-disable-next-line no-self-compare
      if (v !== v) continue;

      const center = rowBase + x;
      const e0 = elevation[center];

      if (e0 >= 0) {
        // 海岸優先: 海に接する陸画素は透明にして下のベース地図の海岸線を見せる。
        // 海陸統合DEMは境界画素で陸のデータが優先され、近海を陸として塗ってしまうため
        if (
          isSea(elevation[center - 1]) ||
          isSea(elevation[center + 1]) ||
          isSea(elevation[center - bufferWidth]) ||
          isSea(elevation[center + bufferWidth]) ||
          isSea(elevation[center - bufferWidth - 1]) ||
          isSea(elevation[center - bufferWidth + 1]) ||
          isSea(elevation[center + bufferWidth - 1]) ||
          isSea(elevation[center + bufferWidth + 1])
        ) {
          continue;
        }
      }

      const color = reliefColor(e0);

      // 陰影は下限付きで緩和して乗算する（急峻な深海が黒く潰れないように）
      let factor = RELIEF_SHADE_MIN + (1 - RELIEF_SHADE_MIN) * v;
      if (intervals !== null && e0 < 0) {
        const eRight = elevation[center + 1];
        const eDown = elevation[center + bufferWidth];
        if (isContourPixel(e0, eRight, eDown, intervals[1])) {
          factor *= CONTOUR_MAJOR_FACTOR;
        } else if (isContourPixel(e0, eRight, eDown, intervals[0])) {
          factor *= CONTOUR_MINOR_FACTOR;
        }
      }

      const p = i * 4;
      out[p] = Math.round(color[0] * factor);
      out[p + 1] = Math.round(color[1] * factor);
      out[p + 2] = Math.round(color[2] * factor);
      out[p + 3] = 255;
    }
  }
  return out;
}

/** 等値線の横断判定（海陸を問わない。GEBCOスタイル用）。NaN隣接は線にしない */
function crossesInterval(e0: number, eRight: number, eDown: number, interval: number): boolean {
  const level = Math.floor(e0 / interval);
  // eslint-disable-next-line no-self-compare
  if (eRight === eRight && Math.floor(eRight / interval) !== level) return true;
  // eslint-disable-next-line no-self-compare
  if (eDown === eDown && Math.floor(eDown / interval) !== level) return true;
  return false;
}

/**
 * GEBCOスタイル（デモ再現）のラスタ近似。ネイティブ（iOS/Android）用の参照実装。
 * Webはmaplibreの実レイヤ（color-relief + hillshade + maplibre-contour）を使うため呼ばれない。
 *
 * - 段彩: GEBCO配色を指数補間(0.8)で引き、白と0.85:0.15で混合
 *   （デモのcolor-relief-opacity 0.85で明るいベース地図に重ねた見えの近似）
 * - 陰影: maplibreのhillshadeシェーダ（standard法・prepareのderivスケール込み）を
 *   そのまま移植して上に合成（光源315°・exaggeration 0.6）
 * - 等値線: 海陸を問わず焼き込み（mlcontourと同様）。数値ラベルはネイティブ側で描画する
 *
 * Java/ObjC実装と計算式・定数を一致させること。
 */
export function computeGebcoRelief(
  elevation: Float32Array,
  bufferWidth: number,
  offset: number,
  size: number,
  sourceZoom: number
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * size * 4);
  const intervals = contourIntervalsForZoom(sourceZoom);

  // maplibre hillshade prepareシェーダのズーム依存derivスケール
  const zoomFactor = sourceZoom < 2 ? 0.4 : sourceZoom < 4.5 ? 0.35 : 0.3;
  const exaggerationZ = sourceZoom < 15 ? (sourceZoom - 15) * zoomFactor : 0;
  const derivScale = 256 / Math.pow(2, exaggerationZ + GEBCO_DERIV_EXP - sourceZoom);

  // standard_hillshadeの定数
  const azimuth = (GEBCO_ILLUMINATION_DEG * Math.PI) / 180 + Math.PI;
  const intensity: number = GEBCO_HILLSHADE_EXAGGERATION;
  const hillshadeBase = 1.875 - intensity * 1.75;
  const maxValue = 0.5 * Math.PI;
  const intensityClamp = Math.min(1, Math.max(0, intensity * 2));

  for (let y = 0; y < size; y++) {
    const rowBase = (offset + y) * bufferWidth + offset;
    for (let x = 0; x < size; x++) {
      const center = rowBase + x;
      const e0 = elevation[center];
      const p = (y * size + x) * 4;
      // eslint-disable-next-line no-self-compare
      if (e0 !== e0) continue; // NoDataは透明

      // --- 段彩（指数補間＋白との混合） ---
      const color = gebcoReliefColor(e0);
      let r = GEBCO_BASE_MIX * color[0] + (1 - GEBCO_BASE_MIX) * 255;
      let g = GEBCO_BASE_MIX * color[1] + (1 - GEBCO_BASE_MIX) * 255;
      let b = GEBCO_BASE_MIX * color[2] + (1 - GEBCO_BASE_MIX) * 255;

      // --- maplibre hillshade（standard法）の合成 ---
      const a9 = elevation[center - bufferWidth - 1];
      const b9 = elevation[center - bufferWidth];
      const c9 = elevation[center - bufferWidth + 1];
      const d9 = elevation[center - 1];
      const f9 = elevation[center + 1];
      const g9 = elevation[center + bufferWidth - 1];
      const h9 = elevation[center + bufferWidth];
      const i9 = elevation[center + bufferWidth + 1];
      const window9 = a9 + b9 + c9 + d9 + f9 + g9 + h9 + i9;
      // eslint-disable-next-line no-self-compare
      if (window9 === window9) {
        // prepareシェーダ: Sobel風の3×3差分×スケール
        const derivX = (c9 + f9 + f9 + i9 - (a9 + d9 + d9 + g9)) * derivScale;
        const derivY = (g9 + h9 + h9 + i9 - (a9 + b9 + b9 + c9)) * derivScale;
        const slope = Math.atan(0.625 * Math.sqrt(derivX * derivX + derivY * derivY));
        const aspect = derivX !== 0 ? Math.atan2(derivY, -derivX) : (Math.PI / 2) * (derivY > 0 ? 1 : -1);
        const scaledSlope =
          intensity !== 0.5
            ? ((Math.pow(hillshadeBase, slope) - 1) / (Math.pow(hillshadeBase, maxValue) - 1)) * maxValue
            : slope;
        const accentAmount = (1 - Math.cos(scaledSlope)) * intensityClamp;
        // accent_color（黒・premultiplied）: rgbは0なのでアルファのみ効く
        const accentA = GEBCO_ACCENT_ALPHA * accentAmount;
        const shade = Math.abs((((aspect + azimuth) / Math.PI + 0.5) % 2) - 1);
        const sinSlope = Math.sin(scaledSlope) * intensityClamp;
        // mix(shadow, highlight, shade)（premultiplied）→ ×sin(scaledSlope)
        const shadeR = 255 * GEBCO_HIGHLIGHT_ALPHA * shade * sinSlope;
        const shadeA = (GEBCO_SHADOW_ALPHA * (1 - shade) + GEBCO_HIGHLIGHT_ALPHA * shade) * sinSlope;
        // frag = accent×(1−shade.a) + shade（premultiplied）→ 下地に通常合成
        const fragR = shadeR; // accentのrgbは0
        const fragA = accentA * (1 - shadeA) + shadeA;
        r = fragR + r * (1 - fragA);
        g = fragR + g * (1 - fragA);
        b = fragR + b * (1 - fragA);
      }

      // --- 等値線（海陸を問わず。デモのmlcontourと同様） ---
      if (intervals !== null) {
        const eRight = elevation[center + 1];
        const eDown = elevation[center + bufferWidth];
        if (crossesInterval(e0, eRight, eDown, intervals[1])) {
          r *= GEBCO_CONTOUR_MAJOR_FACTOR;
          g *= GEBCO_CONTOUR_MAJOR_FACTOR;
          b *= GEBCO_CONTOUR_MAJOR_FACTOR;
        } else if (crossesInterval(e0, eRight, eDown, intervals[0])) {
          r *= GEBCO_CONTOUR_MINOR_FACTOR;
          g *= GEBCO_CONTOUR_MINOR_FACTOR;
          b *= GEBCO_CONTOUR_MINOR_FACTOR;
        }
      }

      out[p] = Math.round(Math.min(255, Math.max(0, r)));
      out[p + 1] = Math.round(Math.min(255, Math.max(0, g)));
      out[p + 2] = Math.round(Math.min(255, Math.max(0, b)));
      out[p + 3] = 255;
    }
  }
  return out;
}
