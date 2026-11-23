import * as FileSystem from 'expo-file-system/legacy';
import { TILE_FOLDER } from '../constants/AppConstants';
import type { RootState } from '../store';
import { TileMapType } from '../types';
import { hasIrreplaceableTiles, removeTileCacheEntries } from './tileCacheCleanup';
import { removeTerrainTextureCacheForMap } from './terrain3d/textureDiskCache';
import { dropTileRegions, isPmtilesSourceUrl, TileRegionStore } from './tileSourceChange';

/**
 * flipY（TMS）の地図のタイルキャッシュを XYZ の y の規約へ移す（タイル監査 M-M2）。
 * 旧版は TMS の y のままキャッシュ（iOS の閲覧キャッシュ）や、反転していない URL で取った行（JS のダウンロード）を
 * XYZ のパスに置いていた。どの行が旧規約か見分けられないので、一度だけ取り直せるタイルを消し、保存範囲の記録も外す。
 * iOS のネイティブにも同じ移行があるが、そちらは保存範囲の記録を外せず、非表示のままダウンロードした新しいタイルを
 * 最初の表示で消してしまうので、JS で先に済ませてネイティブの印も置いておく。
 */

// ネイティブ（AIRGoogleMapUrlTileOverlay）が見る印。これがあればネイティブは消さない
export const NATIVE_XYZ_MARKER = '.xyz-tile-cache';
// JS の移行（保存範囲の記録も外す）を済ませた印。ネイティブが先に消した地図でも記録を外せるよう別に持つ
export const JS_XYZ_MARKER = '.xyz-tile-cache-js';

/** 旧規約のキャッシュがありうる地図か。PMTiles・pbf は y を反転しないので対象外 */
export const needsFlipYMigration = (tileMap: Pick<TileMapType, 'url' | 'flipY' | 'isGroup'>): boolean =>
  tileMap.flipY === true &&
  tileMap.isGroup !== true &&
  typeof tileMap.url === 'string' &&
  tileMap.url !== '' &&
  !hasIrreplaceableTiles(tileMap) &&
  !isPmtilesSourceUrl(tileMap.url);

/**
 * 1つの地図を移行する。済んでいれば何もしない。戻り値は今回タイルを消したか（保存範囲の記録を外すため）。
 * ダウンロードの前にも呼び、新しいタイルより先に印を置く（印の後のタイルは XYZ なので消されない）
 */
export const migrateFlipYTileCache = async (mapId: string): Promise<boolean> => {
  const folder = `${TILE_FOLDER}/${mapId}`;
  const jsMarker = await FileSystem.getInfoAsync(`${folder}/${JS_XYZ_MARKER}`);
  if (jsMarker.exists) return false;
  await removeTileCacheEntries(mapId);
  await removeTerrainTextureCacheForMap(mapId).catch(() => undefined);
  await FileSystem.makeDirectoryAsync(folder, { intermediates: true }).catch(() => undefined);
  await FileSystem.writeAsStringAsync(`${folder}/${NATIVE_XYZ_MARKER}`, '');
  await FileSystem.writeAsStringAsync(`${folder}/${JS_XYZ_MARKER}`, '');
  return true;
};

type MigrationStore = {
  getState: () => Pick<RootState, 'settings' | 'tileMaps'>;
  dispatch: TileRegionStore['dispatch'];
};

// 同じ地図を並行して移行しないよう直列にする（起動時の走査とダウンロード前の呼び出しが重なりうる）
let queue: Promise<unknown> = Promise.resolve();

/** 渡した地図のうち対象のものを移行し、タイルを消した地図の保存範囲の記録を外す */
export const migrateFlipYTileCaches = (
  store: MigrationStore,
  tileMaps: readonly Pick<TileMapType, 'id' | 'url' | 'flipY' | 'isGroup'>[]
): Promise<void> => {
  const targets = tileMaps.filter(needsFlipYMigration).map(({ id }) => id);
  if (targets.length === 0) return Promise.resolve();
  const run = queue.then(async () => {
    const migrated: string[] = [];
    for (const id of targets) {
      try {
        if (await migrateFlipYTileCache(id)) migrated.push(id);
      } catch (e) {
        // 移行できなくても表示・ダウンロードは止めない（次回の起動で再び試みる）
        console.warn('migrateFlipYTileCache failed:', id, e);
      }
    }
    dropTileRegions(store, migrated);
  });
  queue = run.catch(() => undefined);
  return run;
};

type SubscribableStore = MigrationStore & { subscribe: (listener: () => void) => () => void };

/**
 * 起動時に今の地図一覧を移行し、以後は一覧に現れた地図（プロジェクトの切り替え・設定の読み込み）も移行する。
 * 確かめた地図は起動中は覚えておき、一覧が変わるたびにファイルを見に行かない
 */
export const startFlipYTileCacheMigration = (store: SubscribableStore): (() => void) => {
  const checked = new Set<string>();
  let lastMaps: TileMapType[] | undefined;
  const check = () => {
    const { tileMaps } = store.getState();
    if (tileMaps === lastMaps || !Array.isArray(tileMaps)) return;
    lastMaps = tileMaps;
    const fresh = tileMaps.filter((map) => needsFlipYMigration(map) && !checked.has(map.id));
    if (fresh.length === 0) return;
    fresh.forEach(({ id }) => checked.add(id));
    migrateFlipYTileCaches(store, fresh).catch(() => undefined);
  };
  check();
  return store.subscribe(check);
};
