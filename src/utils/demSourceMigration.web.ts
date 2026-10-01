/**
 * 標高データのMapterhorn移行に伴う後始末（Web）。保存済みタイルを持たないので、地図URLの書き換えだけ行う
 * （demSourceMigrationCore.ts参照）。
 */
import { runDemSourceMigrationWith, StoreLike } from './demSourceMigrationCore';

export const runDemSourceMigration = (store: StoreLike): void => runDemSourceMigrationWith(store, () => {});
