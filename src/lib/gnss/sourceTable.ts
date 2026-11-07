export type NtripMountpoint = {
  mountpoint: string;
  identifier: string;
  format: string;
  navSystem: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  /** 1ならキャスターへGGA（概略位置）を送る必要がある（VRS等） */
  requiresGga: boolean;
};

const toNumber = (value: string | undefined): number | null => {
  if (value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** NTRIPソーステーブルのSTR行（マウントポイント）を読む */
export const parseSourceTable = (text: string): NtripMountpoint[] =>
  text
    .split(/\r?\n/)
    .filter((line) => line.startsWith('STR;'))
    .map((line) => line.split(';'))
    .filter((f) => f[1] !== undefined && f[1] !== '')
    .map((f) => ({
      mountpoint: f[1],
      identifier: f[2] ?? '',
      format: f[3] ?? '',
      navSystem: f[6] ?? '',
      country: f[8] ?? '',
      latitude: toNumber(f[9]),
      longitude: toNumber(f[10]),
      requiresGga: f[11] === '1',
    }));
