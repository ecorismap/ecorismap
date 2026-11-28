import sanitize from 'sanitize-filename';

/** RAW記録のファイル名と、ファイルを記録ごとにまとめる処理（ファイル操作を伴わない部分） */

const ROVER_EXTS = ['ubx', 'raw'] as const;
const CORRECTION_EXT = 'rtcm3';
const META_EXT = 'json';

export type RawLogMeta = {
  startedAt: number;
  endedAt: number | null;
  receiver: string | null;
  connection: 'usb' | 'ble' | 'spp' | null;
  antennaHeight: number;
  ntrip: { host: string; mountpoint: string } | null;
  roverBytes?: number;
  correctionBytes?: number;
  sawUbx?: boolean;
};

export type RawLogEntry = {
  baseName: string;
  files: { name: string; path: string; size: number }[];
  totalBytes: number;
  /** 一覧の並べ替え用（ファイルの更新時刻） */
  modifiedAt: number;
  meta: RawLogMeta | null;
};

const pad = (n: number) => String(n).padStart(2, '0');

/** 例: 20261128_093015_DROGGER-GPS。受信機名はファイル名に使えない文字を除く */
export const makeRawLogBaseName = (date: Date, receiverName: string | null): string => {
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(
    date.getMinutes()
  )}${pad(date.getSeconds())}`;
  const receiver = sanitize((receiverName ?? '').normalize('NFC'))
    .replace(/\s+/g, '-')
    .slice(0, 32);
  return receiver === '' ? stamp : `${stamp}_${receiver}`;
};

const splitName = (name: string): { base: string; ext: string } | null => {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return null;
  return { base: name.slice(0, dot), ext: name.slice(dot + 1).toLowerCase() };
};

const isRawLogExt = (ext: string) =>
  (ROVER_EXTS as readonly string[]).includes(ext) || ext === CORRECTION_EXT || ext === META_EXT;

/** ファイルを記録ごとにまとめる（新しい順） */
export const groupRawLogFiles = (
  items: { name: string; path: string; size: number; mtime: number }[]
): Omit<RawLogEntry, 'meta'>[] => {
  const groups = new Map<string, Omit<RawLogEntry, 'meta'>>();
  for (const item of items) {
    const parts = splitName(item.name);
    if (parts === null || !isRawLogExt(parts.ext)) continue;
    const group = groups.get(parts.base) ?? { baseName: parts.base, files: [], totalBytes: 0, modifiedAt: 0 };
    group.files.push({ name: item.name, path: item.path, size: item.size });
    group.totalBytes += item.size;
    group.modifiedAt = Math.max(group.modifiedAt, item.mtime);
    groups.set(parts.base, group);
  }
  // 情報（.json）だけが残った組は、記録の開始に失敗したもの
  return [...groups.values()]
    .filter((g) => g.files.some((f) => splitName(f.name)?.ext !== META_EXT))
    .sort((a, b) => b.modifiedAt - a.modifiedAt || b.baseName.localeCompare(a.baseName));
};

export const formatRawBytes = (bytes: number) =>
  bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)}KB` : `${(bytes / 1024 / 1024).toFixed(1)}MB`;

export const formatDuration = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};
