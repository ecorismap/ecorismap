/**
 * 眺望の山名表示に使う山頂データ（src/presets/data/gsi_peaks.json）の読み込みと近傍検索。
 *
 * データはscripts/build-peaks-data.mjsで地理院の最適化ベクトルタイル（山名・標高点）と
 * 「日本の主な山岳標高」から生成する。アプリに同梱するので山中のオフラインでも使える。
 * 初めて眺望に入ったときに読み込む（Webは初期バンドルを太らせないよう別チャンクにする）。
 */
import { loadPeakDataFile } from './peakDataSource';

export interface Peak {
  latitude: number;
  longitude: number;
  /** 山頂の標高[m] */
  ele: number;
  name: string;
  /** 重要度。1（3000m級の主要峰）〜5（小さな峰・丘）。小さいほど遠くまで表示する */
  rank: number;
}

export interface PeakDataFile {
  attribution: string;
  fields: string[];
  rows: [number, number, number, string, number][];
}

export interface PeakIndex {
  attribution: string;
  /** 中心から半径radiusM以内の山 */
  query: (latitude: number, longitude: number, radiusM: number) => Peak[];
}

const EARTH_RADIUS_M = 6371008.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** 2点間の大円距離[m] */
export const distanceM = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
};

/** 格子の一辺[度]。検索半径は最大150km程度なので、粗めにしてセル数を抑える */
const CELL_DEG = 0.1;

export const buildPeakIndex = (data: PeakDataFile): PeakIndex => {
  const cells = new Map<string, Peak[]>();
  for (const [lon, lat, ele, name, rank] of data.rows) {
    const key = `${Math.floor(lon / CELL_DEG)},${Math.floor(lat / CELL_DEG)}`;
    const peak: Peak = { latitude: lat, longitude: lon, ele, name, rank };
    const list = cells.get(key);
    if (list) list.push(peak);
    else cells.set(key, [peak]);
  }
  const query = (latitude: number, longitude: number, radiusM: number) => {
    const spanLat = Math.ceil(radiusM / 111000 / CELL_DEG);
    const spanLon = Math.ceil(radiusM / 111000 / Math.max(0.1, Math.cos(toRad(latitude))) / CELL_DEG);
    const cx = Math.floor(longitude / CELL_DEG);
    const cy = Math.floor(latitude / CELL_DEG);
    const result: Peak[] = [];
    for (let dx = -spanLon; dx <= spanLon; dx++) {
      for (let dy = -spanLat; dy <= spanLat; dy++) {
        const list = cells.get(`${cx + dx},${cy + dy}`);
        if (!list) continue;
        for (const peak of list) {
          if (distanceM(latitude, longitude, peak.latitude, peak.longitude) <= radiusM) result.push(peak);
        }
      }
    }
    return result;
  };
  return { attribution: data.attribution, query };
};

let indexPromise: Promise<PeakIndex> | null = null;

/** 山頂データを読み込む（初回だけ読み、以後は同じインデックスを返す） */
export const loadPeakIndex = (): Promise<PeakIndex> => {
  if (indexPromise === null) {
    indexPromise = loadPeakDataFile()
      .then(buildPeakIndex)
      .catch((e) => {
        // 失敗を覚えたままにしない（次の眺望で読み直せるように）
        indexPromise = null;
        throw e;
      });
  }
  return indexPromise;
};
