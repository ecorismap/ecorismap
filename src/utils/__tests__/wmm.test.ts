import { calcMagneticField, magneticDeclination } from '../geomag/wmm';

// NOAA公式のWMM2025_TestValues.txt（WMM2025COF.zip同梱）の値と照合する。
// Field: 1=decimal year, 2=altitude(km), 3=lat, 4=lon, 5=declination(deg), 6=inclination(deg), 11=F(nT)

// wmm.tsのdateMsToDecimalYearと同じ定義でdecimal year→dateMsへ逆変換する
const decimalYearToMs = (decimalYear: number): number => {
  const year = Math.floor(decimalYear);
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  return start + (decimalYear - year) * (end - start);
};

describe('calcMagneticField (WMM2025)', () => {
  const officialCases: {
    year: number;
    altKm: number;
    lat: number;
    lon: number;
    declination: number;
    inclination: number;
    totalIntensity: number;
  }[] = [
    // 高緯度（ブラックアウトゾーン近傍、偏角が大きい）
    { year: 2025.0, altKm: 28, lat: 89, lon: -121, declination: -99.77, inclination: 88.47, totalIntensity: 56214.419888 },
    // 中緯度アジア
    { year: 2025.0, altKm: 65, lat: 43, lon: 93, declination: 0.5, inclination: 64.1, totalIntensity: 55626.621348 },
    // 南半球
    { year: 2025.0, altKm: 51, lat: -33, lon: 109, declination: -5.49, inclination: -67.5, totalIntensity: 57054.752538 },
    // 赤道
    { year: 2025.0, altKm: 18, lat: 0, lon: 21, declination: 1.29, inclination: -26.06, totalIntensity: 32594.761714 },
    // 日付依存（永年変化）の確認
    { year: 2027.5, altKm: 8, lat: 62, lon: 53, declination: 19.39, inclination: 76.67, totalIntensity: 56368.814385 },
    { year: 2029.5, altKm: 26, lat: -65, lon: 55, declination: -63.48, inclination: -65.71, totalIntensity: 45454.397791 },
  ];

  it.each(officialCases)(
    'NOAA公式テスト値と一致する (year=$year lat=$lat lon=$lon)',
    ({ year, altKm, lat, lon, declination, inclination, totalIntensity }) => {
      const field = calcMagneticField(lat, lon, decimalYearToMs(year), altKm);
      expect(Math.abs(field.declination - declination)).toBeLessThan(0.01);
      expect(Math.abs(field.inclination - inclination)).toBeLessThan(0.01);
      expect(Math.abs(field.totalIntensity - totalIntensity)).toBeLessThan(0.5);
    }
  );

  it('日本付近の偏角は西偏（負）でおよそ7〜10度', () => {
    const declination = magneticDeclination(35.68, 139.77, Date.UTC(2026, 7, 1)); // 東京
    expect(declination).toBeLessThan(-6);
    expect(declination).toBeGreaterThan(-10);
  });

  it('高度省略時は高度0kmとして計算される', () => {
    const dateMs = Date.UTC(2026, 0, 1);
    const withDefault = calcMagneticField(35, 135, dateMs);
    const withZero = calcMagneticField(35, 135, dateMs, 0);
    expect(withDefault.declination).toBe(withZero.declination);
  });
});
