/**
 * Web はタイルをディスクに保存しないので、flipY のキャッシュ移行（flipYTileCacheMigration.ts）は不要。
 */
export const migrateFlipYTileCaches = (_store: unknown, _tileMaps: readonly unknown[]): Promise<void> =>
  Promise.resolve();

export const startFlipYTileCacheMigration = (_store: unknown): (() => void) => () => undefined;
