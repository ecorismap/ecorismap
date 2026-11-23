/**
 * 標高データのMapterhorn移行に伴う後始末（Web）。保存済みタイルを持たないので、地図URLの書き換えだけ行う
 * （demSourceMigrationCore.ts参照）。
 */
import { DemMigrationIO, runDemSourceMigrationWith, StoreLike } from './demSourceMigrationCore';

const webIO: DemMigrationIO = {
  removeTiles: () => Promise.resolve(),
  isMigrated: () => Promise.resolve(false),
  markMigrated: () => Promise.resolve(),
};

export const runDemSourceMigration = (store: StoreLike): void => runDemSourceMigrationWith(store, webIO);
