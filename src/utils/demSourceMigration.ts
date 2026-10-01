/**
 * 標高データのMapterhorn移行に伴う後始末（ネイティブ）。内容はdemSourceMigrationCore.ts参照。
 */
import * as FileSystem from 'expo-file-system/legacy';
import { TILE_FOLDER } from '../constants/AppConstants';
import { runDemSourceMigrationWith, StoreLike } from './demSourceMigrationCore';

/** 旧方式（dem_png・WebP→PNG変換）のディスクキャッシュ。新方式は読まないので容量だけ返す */
const LEGACY_DEM_CACHE_DIR = `${FileSystem.cacheDirectory}dem_png`;

export const runDemSourceMigration = (store: StoreLike): void => {
  FileSystem.deleteAsync(LEGACY_DEM_CACHE_DIR, { idempotent: true }).catch(() => {});
  runDemSourceMigrationWith(store, (tileMapId) => {
    FileSystem.deleteAsync(`${TILE_FOLDER}/${tileMapId}`, { idempotent: true }).catch(() => {});
  });
};
