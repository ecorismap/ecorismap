import { WMM_EPOCH, WMM_G, WMM_G_DOT, WMM_H, WMM_H_DOT, WMM_MAX_ORDER } from './wmm2025Coefficients';

// WMM2025（World Magnetic Model）による磁気偏角計算。
// NOAA技術レポートの球面調和展開（次数12）をTypeScriptに移植した純関数実装。
// npmのgeomagnetism等はfsで.COFを読むためReact Nativeでは動かず、自前実装とした。

// WGS84楕円体定数（km）
const WGS84_A = 6378.137;
const WGS84_B = 6356.7523142;
// 地磁気標準半径（km）
const GEOMAG_RE = 6371.2;

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

export interface MagneticField {
  declination: number; // 偏角（度、東偏が正）
  inclination: number; // 伏角（度、下向きが正）
  horizontalIntensity: number; // 水平分力H（nT）
  totalIntensity: number; // 全磁力F（nT）
  north: number; // X成分（nT）
  east: number; // Y成分（nT）
  down: number; // Z成分（nT）
}

const dateMsToDecimalYear = (dateMs: number): number => {
  const d = new Date(dateMs);
  const year = d.getUTCFullYear();
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  return year + (dateMs - start) / (end - start);
};

// Schmidt準正規化ルジャンドル陪関数P̄nm(sinφ)とdP̄nm/dφを一括計算
const computeLegendre = (sinPhi: number, cosPhi: number, maxOrder: number) => {
  const size = maxOrder + 1;
  const p: number[][] = Array.from({ length: size }, () => new Array(size).fill(0));
  const dp: number[][] = Array.from({ length: size }, () => new Array(size).fill(0));
  // 極（cosφ=0）での除算を避ける。極近傍のWMMはブラックアウトゾーンで元々精度保証外
  const safeCos = Math.max(cosPhi, 1e-8);

  p[0][0] = 1;
  for (let n = 1; n <= maxOrder; n++) {
    for (let m = 0; m <= n; m++) {
      if (m === n) {
        // 対角: P̄nn = cosφ·√((2n-1)/(2n))·P̄(n-1)(n-1)（n=1は係数1）
        const factor = n === 1 ? 1 : Math.sqrt((2 * n - 1) / (2 * n));
        p[n][m] = factor * cosPhi * p[n - 1][n - 1];
      } else if (n === m + 1) {
        p[n][m] = ((2 * n - 1) * sinPhi * p[n - 1][m]) / Math.sqrt(n * n - m * m);
      } else {
        p[n][m] =
          ((2 * n - 1) * sinPhi * p[n - 1][m] - Math.sqrt((n - 1) * (n - 1) - m * m) * p[n - 2][m]) /
          Math.sqrt(n * n - m * m);
      }
      // dP̄nm/dφ = (√(n²-m²)·P̄(n-1)m - n·sinφ·P̄nm) / cosφ
      const lower = m < n ? p[n - 1][m] : 0;
      dp[n][m] = (Math.sqrt(n * n - m * m) * lower - n * sinPhi * p[n][m]) / safeCos;
    }
  }
  return { p, dp };
};

// 指定地点・日時の地磁気成分を計算する。altitudeKmはWGS84楕円体高（km）
export const calcMagneticField = (
  latitude: number,
  longitude: number,
  dateMs: number,
  altitudeKm = 0
): MagneticField => {
  const decimalYear = dateMsToDecimalYear(dateMs);
  const dt = decimalYear - WMM_EPOCH;

  const phi = latitude * DEG2RAD;
  const lambda = longitude * DEG2RAD;
  const sinLat = Math.sin(phi);
  const cosLat = Math.cos(phi);

  // 測地座標→地心球座標
  const epsSq = 1 - (WGS84_B * WGS84_B) / (WGS84_A * WGS84_A);
  const rc = WGS84_A / Math.sqrt(1 - epsSq * sinLat * sinLat);
  const xp = (rc + altitudeKm) * cosLat;
  const zp = (rc * (1 - epsSq) + altitudeKm) * sinLat;
  const r = Math.sqrt(xp * xp + zp * zp);
  const phiGc = Math.asin(zp / r); // 地心緯度

  const sinPhiGc = Math.sin(phiGc);
  const cosPhiGc = Math.cos(phiGc);
  const { p, dp } = computeLegendre(sinPhiGc, cosPhiGc, WMM_MAX_ORDER);

  const cosMLambda: number[] = [];
  const sinMLambda: number[] = [];
  for (let m = 0; m <= WMM_MAX_ORDER; m++) {
    cosMLambda.push(Math.cos(m * lambda));
    sinMLambda.push(Math.sin(m * lambda));
  }

  // 地心座標系での磁場成分（X'=北, Y'=東, Z'=下、nT）
  let xGc = 0;
  let yGc = 0;
  let zGc = 0;
  const ratio = GEOMAG_RE / r;
  let radial = ratio * ratio; // (Re/r)^(n+2) をnループで逓倍
  const safeCosGc = Math.max(cosPhiGc, 1e-8);
  for (let n = 1; n <= WMM_MAX_ORDER; n++) {
    radial *= ratio;
    for (let m = 0; m <= n; m++) {
      const g = WMM_G[n][m] + dt * WMM_G_DOT[n][m];
      const h = WMM_H[n][m] + dt * WMM_H_DOT[n][m];
      const gcHs = g * cosMLambda[m] + h * sinMLambda[m];
      xGc -= radial * gcHs * dp[n][m];
      yGc += (radial * m * (g * sinMLambda[m] - h * cosMLambda[m]) * p[n][m]) / safeCosGc;
      zGc -= radial * (n + 1) * gcHs * p[n][m];
    }
  }

  // 地心座標系→測地座標系へ回転
  const psi = phiGc - phi;
  const sinPsi = Math.sin(psi);
  const cosPsi = Math.cos(psi);
  const north = xGc * cosPsi - zGc * sinPsi;
  const east = yGc;
  const down = xGc * sinPsi + zGc * cosPsi;

  const horizontalIntensity = Math.sqrt(north * north + east * east);
  const totalIntensity = Math.sqrt(horizontalIntensity * horizontalIntensity + down * down);
  const declination = Math.atan2(east, north) * RAD2DEG;
  const inclination = Math.atan2(down, horizontalIntensity) * RAD2DEG;

  return { declination, inclination, horizontalIntensity, totalIntensity, north, east, down };
};

// 磁気偏角（度、東偏が正）。写真の磁気方位→真方位変換に使う
export const magneticDeclination = (latitude: number, longitude: number, dateMs: number): number =>
  calcMagneticField(latitude, longitude, dateMs).declination;
