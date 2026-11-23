import { Platform } from 'react-native';
import type { RootState } from '../store';
import { TileMapType } from '../types';
import { withMapterhornDemUrls } from './demSourceMigrationCore';
import { cleanupPmtilesOnSave } from './pmtilesLocalStore';
import { removeTerrainTextureCacheForMap } from './terrain3d/textureDiskCache';
import { dropTileRegions, findTileSourceChanges, TileRegionStore, TileSourceChange } from './tileSourceChange';

/**
 * 地図の取得内容が変わったときに、その地図の古いタイルを確認なしで捨てる（タイル監査 M-H6）。
 * 対象は「キャッシュをクリア」と同じく取り直せるタイルだけ（style.json・取り込んだ実体は残す）。
 * 新しい地図一覧を store に入れる「前」に呼ぶ。後にすると、作り直された地図部品が
 * 消す前の旧タイルをディスクから先に読んでしまう。
 */
type TileMapsStore = {
  getState: () => Pick<RootState, 'settings' | 'tileMaps'>;
  dispatch: TileRegionStore['dispatch'];
};

export const discardStaleTileSources = async (
  store: TileMapsStore,
  nextMaps: TileMapType[]
): Promise<TileSourceChange[]> => {
  // 旧形式の陰影起伏・段彩のURLは入った直後に標高移行がMapterhornへ書き換えるので、書き換え後の姿で比べる。
  // 手元の移行済みURLとの差を取得元の変更とみなすと、取り直したタイルを毎回消してしまう（設定監査 S-M3）
  const changes = findTileSourceChanges(store.getState().tileMaps, withMapterhornDemUrls(nextMaps));
  if (changes.length === 0) return changes;
  // スタイルだけの変更ではダウンロードした .pbf が残るので、保存範囲の記録も残す
  dropTileRegions(
    store,
    changes.filter(({ cleanup }) => cleanup.source).map(({ id }) => id)
  );
  for (const { id, cleanup } of changes) {
    // 片付けに失敗しても地図の保存は止めない（古いタイルが残るだけで、保存できないよりよい）
    await cleanupPmtilesOnSave(id, cleanup).catch(() => undefined);
    if (Platform.OS !== 'web') await removeTerrainTextureCacheForMap(id);
  }
  return changes;
};
