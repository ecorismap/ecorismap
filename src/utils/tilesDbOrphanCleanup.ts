import { db } from './db';
import { readTileMapIdsFromAliveTabs } from './reduxPersistWebStorage';

/** どのタブの地図一覧にも無い行だけを選ぶ純関数 */
export const selectOrphanTileRowIds = (rowIds: string[], referencedIds: Set<string>): string[] =>
  rowIds.filter((id) => !referencedIds.has(id));

/**
 * Web の tilesDB（全タブ共有）から、生きているどのタブの地図一覧にも無い PDF 地図・PMTiles の行だけを消す。
 * 共有 PC で閉じたタブの取り込み地図を残さない安全弁は保ちつつ、ほかのタブが使っている地図は消さない（永続化監査 S-H1）。
 * currentTileMapIds は自タブのメモリ上の一覧（保存はスロットルで最大1秒遅れるため、保存値だけでは取り込み直後を取りこぼす）。
 */
export const cleanupOrphanTileRows = async (currentTileMapIds: string[]): Promise<void> => {
  try {
    const referencedIds = await readTileMapIdsFromAliveTabs();
    if (referencedIds === undefined) return;
    currentTileMapIds.forEach((id) => referencedIds.add(id));
    const geotiffIds = (await db.geotiff.toCollection().primaryKeys()) as string[];
    const pmtilesIds = (await db.pmtiles.toCollection().primaryKeys()) as string[];
    const geotiffOrphans = selectOrphanTileRowIds(geotiffIds, referencedIds);
    const pmtilesOrphans = selectOrphanTileRowIds(pmtilesIds, referencedIds);
    if (geotiffOrphans.length > 0) await db.geotiff.bulkDelete(geotiffOrphans);
    if (pmtilesOrphans.length > 0) await db.pmtiles.bulkDelete(pmtilesOrphans);
  } catch (e) {
    console.log('[tilesDbOrphanCleanup] error:', e);
  }
};
