import * as RNFS from 'react-native-fs';
import { zip } from 'react-native-zip-archive';
import { exportFileFromUri } from '../../utils/File';
import { ExportResultType } from '../../types';
import { groupRawLogFiles, RawLogEntry, RawLogMeta } from './rawLogNames';

export { makeRawLogBaseName, groupRawLogFiles } from './rawLogNames';
export type { RawLogEntry, RawLogMeta } from './rawLogNames';

/**
 * 外部GNSS受信機のRAW記録（後処理（PPK）用）のファイル。
 * 1回の記録は同じ名前の組になる: 受信機の出力（.ubx か .raw）、補正（.rtcm3、NTRIPがONのとき）、記録の情報（.json）
 */

/** ネイティブに渡すので file:// なしの絶対パスにする */
export const RAW_LOG_DIR = `${RNFS.DocumentDirectoryPath}/gnss-raw`;

const META_EXT = 'json';

const metaPath = (baseName: string) => `${RAW_LOG_DIR}/${baseName}.${META_EXT}`;

export const writeRawLogMeta = async (baseName: string, meta: RawLogMeta): Promise<void> => {
  await RNFS.mkdir(RAW_LOG_DIR);
  await RNFS.writeFile(metaPath(baseName), JSON.stringify(meta, null, 2), 'utf8');
};

const readRawLogMeta = async (baseName: string): Promise<RawLogMeta | null> => {
  try {
    return JSON.parse(await RNFS.readFile(metaPath(baseName), 'utf8')) as RawLogMeta;
  } catch {
    return null;
  }
};

/** 記録の情報に、停止時の時刻とバイト数を足して書き直す */
export const finishRawLogMeta = async (
  baseName: string,
  result: { endedAt: number; roverBytes: number; correctionBytes: number; sawUbx: boolean }
): Promise<void> => {
  const meta = await readRawLogMeta(baseName);
  if (meta === null) return;
  await writeRawLogMeta(baseName, { ...meta, ...result });
};

export const listRawLogs = async (): Promise<RawLogEntry[]> => {
  if (!(await RNFS.exists(RAW_LOG_DIR))) return [];
  const items = await RNFS.readDir(RAW_LOG_DIR);
  const groups = groupRawLogFiles(
    items
      .filter((i) => i.isFile())
      .map((i) => ({ name: i.name, path: i.path, size: Number(i.size), mtime: i.mtime?.getTime() ?? 0 }))
  );
  return Promise.all(groups.map(async (g) => ({ ...g, meta: await readRawLogMeta(g.baseName) })));
};

export const deleteRawLog = async (entry: RawLogEntry): Promise<void> => {
  for (const file of entry.files) {
    if (await RNFS.exists(file.path)) await RNFS.unlink(file.path);
  }
};

/** 組のファイルをzipにまとめて共有・保存する（大きいのでJSのメモリを通さずネイティブでまとめる） */
export const shareRawLog = async (entry: RawLogEntry): Promise<ExportResultType> => {
  const zipDir = `${RNFS.CachesDirectoryPath}/gnss-raw-export`;
  const zipPath = `${zipDir}/${entry.baseName}.zip`;
  await RNFS.mkdir(zipDir);
  if (await RNFS.exists(zipPath)) await RNFS.unlink(zipPath);
  await zip(
    entry.files.map((f) => f.path),
    zipPath
  );
  try {
    return await exportFileFromUri(zipPath, `${entry.baseName}.zip`, { mimeType: 'application/zip' });
  } finally {
    await RNFS.unlink(zipPath).catch(() => undefined);
  }
};
