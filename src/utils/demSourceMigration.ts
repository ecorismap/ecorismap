/**
 * 標高データのMapterhorn移行に伴う後始末（ネイティブ）。内容はdemSourceMigrationCore.ts参照。
 */
import * as FileSystem from 'expo-file-system/legacy';
import { TILE_FOLDER } from '../constants/AppConstants';
import { DemMigrationIO, runDemSourceMigrationWith, StoreLike } from './demSourceMigrationCore';

/** 旧方式（dem_png・WebP→PNG変換）のディスクキャッシュ。新方式は読まないので容量だけ返す */
const LEGACY_DEM_CACHE_DIR = `${FileSystem.cacheDirectory}dem_png`;

/** 陰影起伏・段彩の旧形式タイルを捨て終えた印（地図フォルダ内）。flipY移行の印と同じ置き方 */
export const MAPTERHORN_DEM_MARKER = '.mapterhorn-dem';

const nativeIO: DemMigrationIO = {
  removeTiles: async (tileMapId) => {
    await FileSystem.deleteAsync(`${TILE_FOLDER}/${tileMapId}`, { idempotent: true });
  },
  isMigrated: async (tileMapId) =>
    (await FileSystem.getInfoAsync(`${TILE_FOLDER}/${tileMapId}/${MAPTERHORN_DEM_MARKER}`)).exists,
  markMigrated: async (tileMapId) => {
    const folder = `${TILE_FOLDER}/${tileMapId}`;
    await FileSystem.makeDirectoryAsync(folder, { intermediates: true }).catch(() => undefined);
    await FileSystem.writeAsStringAsync(`${folder}/${MAPTERHORN_DEM_MARKER}`, '');
  },
};

export const runDemSourceMigration = (store: StoreLike): void => {
  FileSystem.deleteAsync(LEGACY_DEM_CACHE_DIR, { idempotent: true }).catch(() => {});
  runDemSourceMigrationWith(store, nativeIO);
};
