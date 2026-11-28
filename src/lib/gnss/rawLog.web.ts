import { ExportResultType } from '../../types';
import type { RawLogEntry, RawLogMeta } from './rawLogNames';

/** Webは外部受信機をつながないので、RAW記録のファイルもない */
export type { RawLogEntry, RawLogMeta } from './rawLogNames';

export const RAW_LOG_DIR = '';

export { makeRawLogBaseName, groupRawLogFiles } from './rawLogNames';

export const writeRawLogMeta = async (_baseName: string, _meta: RawLogMeta): Promise<void> => undefined;

export const finishRawLogMeta = async (): Promise<void> => undefined;

export const listRawLogs = async (): Promise<RawLogEntry[]> => [];

export const deleteRawLog = async (_entry: RawLogEntry): Promise<void> => undefined;

export const shareRawLog = async (_entry: RawLogEntry): Promise<ExportResultType> => 'error';
