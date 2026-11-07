/**
 * 外部GNSS受信機が出すNMEA 0183文（GGA/RMC/GST）を読み、1エポック分の測位結果にまとめる。
 * トーカー（GP/GN/GL/GA/GB…）は区別しない。
 */

/** GGAの測位品質。0=無効, 1=単独, 2=DGPS/SBAS, 4=RTK Fix, 5=RTK Float, 6=推測航法 */
export type GnssFixQuality = number;

export const FIX_QUALITY = {
  INVALID: 0,
  SINGLE: 1,
  DGPS: 2,
  RTK_FIX: 4,
  RTK_FLOAT: 5,
  DEAD_RECKONING: 6,
} as const;

export type GnssFix = {
  /** GGAのUTC時刻（hhmmss.ss）。同じエポックのRMC/GSTの照合に使う */
  time: string;
  latitude: number;
  longitude: number;
  /** 標高（ジオイド面からの高さ）[m] */
  altitudeMsl: number | null;
  /** ジオイド高[m] */
  geoidSeparation: number | null;
  fixQuality: GnssFixQuality;
  satellites: number | null;
  hdop: number | null;
  /** 補正の経過時間[s] */
  diffAge: number | null;
  /** 対地速度[m/s]（RMC） */
  speed: number | null;
  /** 進行方向[度]（RMC） */
  course: number | null;
  /** 緯度・経度・高さの標準偏差[m]（GST。受信機が出していなければnull） */
  stdLat: number | null;
  stdLon: number | null;
  stdAlt: number | null;
  /** 端末がこの文を受け取った時刻（epoch ms） */
  receivedAt: number;
};

export type NmeaSentence = { talker: string; type: string; fields: string[] };

const KNOTS_TO_MPS = 0.514444;

/** チェックサム（'*'以降の16進）を検証して文を分解する。不正な文はnull */
export const parseNmeaSentence = (line: string): NmeaSentence | null => {
  const text = line.trim();
  if (!text.startsWith('$')) return null;
  const star = text.lastIndexOf('*');
  const body = star >= 0 ? text.slice(1, star) : text.slice(1);
  if (star >= 0) {
    const expected = parseInt(text.slice(star + 1, star + 3), 16);
    if (Number.isNaN(expected)) return null;
    let sum = 0;
    for (let i = 0; i < body.length; i++) sum ^= body.charCodeAt(i);
    if (sum !== expected) return null;
  }
  const fields = body.split(',');
  const address = fields[0];
  if (address.length < 5) return null;
  return { talker: address.slice(0, 2), type: address.slice(2), fields };
};

const toNumber = (value: string | undefined): number | null => {
  if (value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** ddmm.mmmm（経度はdddmm.mmmm）＋半球記号を十進度にする */
export const parseNmeaCoordinate = (value: string | undefined, hemisphere: string | undefined): number | null => {
  if (value === undefined || value === '' || hemisphere === undefined || hemisphere === '') return null;
  const dot = value.indexOf('.');
  const degreeDigits = (dot >= 0 ? dot : value.length) - 2;
  if (degreeDigits < 1) return null;
  const degrees = Number(value.slice(0, degreeDigits));
  const minutes = Number(value.slice(degreeDigits));
  if (!Number.isFinite(degrees) || !Number.isFinite(minutes)) return null;
  const decimal = degrees + minutes / 60;
  return hemisphere === 'S' || hemisphere === 'W' ? -decimal : decimal;
};

type RmcPart = { time: string; speed: number | null; course: number | null };
type GstPart = {
  time: string;
  stdLat: number | null;
  stdLon: number | null;
  stdAlt: number | null;
  receivedAt: number;
};

// GSTは受信機によってGGAの後に出るため、同じ時刻のものが無ければ直前のエポックの値を使う
const GST_REUSE_MS = 2000;

/**
 * NMEA文を順に受け取り、GGAが来るたびに1エポック分の GnssFix を返す。
 * RMC（速度・針路）とGST（標準偏差）は同じ時刻のものを組み合わせる。
 */
export class NmeaFixAssembler {
  private rmc: RmcPart | null = null;
  private gst: GstPart | null = null;

  feed(line: string, receivedAt: number): GnssFix | null {
    const sentence = parseNmeaSentence(line);
    if (sentence === null) return null;
    const f = sentence.fields;
    switch (sentence.type) {
      case 'RMC':
        this.rmc = {
          time: f[1] ?? '',
          speed: f[7] ? (toNumber(f[7]) ?? 0) * KNOTS_TO_MPS : null,
          course: toNumber(f[8]),
        };
        return null;
      case 'GST':
        this.gst = {
          time: f[1] ?? '',
          stdLat: toNumber(f[6]),
          stdLon: toNumber(f[7]),
          stdAlt: toNumber(f[8]),
          receivedAt,
        };
        return null;
      case 'GGA':
        return this.buildFix(f, receivedAt);
      default:
        return null;
    }
  }

  private buildFix(f: string[], receivedAt: number): GnssFix | null {
    const latitude = parseNmeaCoordinate(f[2], f[3]);
    const longitude = parseNmeaCoordinate(f[4], f[5]);
    const fixQuality = toNumber(f[6]) ?? 0;
    if (latitude === null || longitude === null) return null;
    const time = f[1] ?? '';
    const rmc = this.rmc !== null && this.rmc.time === time ? this.rmc : null;
    const gst =
      this.gst !== null && (this.gst.time === time || receivedAt - this.gst.receivedAt <= GST_REUSE_MS)
        ? this.gst
        : null;
    return {
      time,
      latitude,
      longitude,
      altitudeMsl: toNumber(f[9]),
      geoidSeparation: toNumber(f[11]),
      fixQuality,
      satellites: toNumber(f[7]),
      hdop: toNumber(f[8]),
      diffAge: toNumber(f[13]),
      speed: rmc?.speed ?? null,
      course: rmc?.course ?? null,
      stdLat: gst?.stdLat ?? null,
      stdLon: gst?.stdLon ?? null,
      stdAlt: gst?.stdAlt ?? null,
      receivedAt,
    };
  }
}
