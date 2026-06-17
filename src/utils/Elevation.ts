// 国土地理院(GSI)の標高API
// https://maps.gsi.go.jp/development/elevation_s.html
// 注意: 日本国内のみ対応。範囲外（海上や国外）は標高に "-----" を返す。
const GSI_ELEVATION_URL = 'https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php';

interface GsiElevationResponse {
  elevation: number | string; // 範囲外は "-----"
  hsrc: string;
}

/**
 * 指定座標の標高(m)を国土地理院APIから取得する。
 * 取得できない場合（範囲外・通信エラー等）は null を返す。
 */
export const getGsiElevation = async (latitude: number, longitude: number): Promise<number | null> => {
  try {
    const url = `${GSI_ELEVATION_URL}?lon=${longitude}&lat=${latitude}&outtype=JSON`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data: GsiElevationResponse = await response.json();
    if (typeof data.elevation !== 'number') return null; // "-----" 等は範囲外
    return data.elevation;
  } catch (e) {
    return null;
  }
};
