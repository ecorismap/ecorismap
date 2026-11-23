/**
 * 標高データのMapterhorn移行に伴う後始末（ネイティブ/Web共通部分。保存済みタイルの削除だけ差し込む）。
 *
 * 1. 旧・可視領域用DEM（dem_png＋terrarium）のオフライン保存は新方式では読まないので、
 *    保存済みフォルダとダウンロード領域の記録を消して容量を返す。
 * 2. 陰影起伏（hillshade://）と汎用の段彩（relief://）はterrarium形式（Mapterhorn）専用になったので、
 *    それ以外の標高タイルを指す地図のURLをMapterhornへ書き換える。キャッシュ・オフライン保存は
 *    旧形式（GSI形式）の標高なので、新形式として誤読しないよう削除する。
 *    共有プロジェクトの読み込み等で古いURLが後から入ってくることもあるため、storeの変化を見張って都度行う。
 *
 * どちらも対象が無ければ何もしない（冪等）。
 */
import { LEGACY_DEM_VIEWSHED_MAP_ID, MAPTERHORN_URL } from '../constants/DemSources';
import { setTileMapsAction } from '../modules/tileMaps';
import type { AppDispatch, RootState } from '../store';
import { TileMapType } from '../types';
import { dropTileRegions } from './tileSourceChange';
import { isTerrariumDemUrl, RELIEF_URL_PREFIX, SHADING_URL_PREFIX, toDemUrl } from './terrainShading';

export type StoreLike = { getState: () => RootState; dispatch: AppDispatch; subscribe?: (listener: () => void) => () => void };

/** 旧プリセット（産総研シームレス標高タイル）の出典表記。書き換え時に新しい出典へ差し替える */
const LEGACY_HILLSHADE_ATTRIBUTION = '産総研シームレス標高タイル';
const MAPTERHORN_ATTRIBUTION = '© Mapterhorn（日本域は国土地理院 基盤地図情報）';

/** Mapterhorn以外の標高タイルを指す陰影起伏・汎用段彩の地図か */
export const needsMapterhornUrl = (url: string | undefined): boolean =>
  isTerrariumDemUrl(url) && !toDemUrl(url!).startsWith(MAPTERHORN_URL.split('{z}')[0]);

/** 陰影起伏・汎用段彩のURLを、接頭辞とフラグメント（#style=…等）を保ったままMapterhornへ差し替える */
export const toMapterhornDemUrl = (url: string): string => {
  const prefix = url.startsWith(RELIEF_URL_PREFIX) ? RELIEF_URL_PREFIX : SHADING_URL_PREFIX;
  const hash = url.indexOf('#');
  return `${prefix}${MAPTERHORN_URL}${hash < 0 ? '' : url.slice(hash)}`;
};

/**
 * 保存済みタイルの操作（Webは保存を持たないので、印は常に無し・削除は何もしない）。
 * 旧タイルを捨てるのは地図ごとに一度だけにし、済んだ印を残す。印が無いと、プロジェクトを開き直すたびに
 * クラウドの旧URLが入って移行が再び走り、移行後にダウンロードしたMapterhorn形式のタイルまで消してしまう（設定監査 S-M3）
 */
export type DemMigrationIO = {
  /** 地図ID（または疑似地図ID）の保存済みタイルを削除する */
  removeTiles: (tileMapId: string) => Promise<void>;
  /** 旧タイルを捨て終えた印があるか */
  isMigrated: (tileMapId: string) => Promise<boolean>;
  /** 旧タイルを捨て終えた印を書く */
  markMigrated: (tileMapId: string) => Promise<void>;
};

// 同じ地図の後始末を並行させない（起動時と購読からの呼び出しが重なりうる）
let queue: Promise<unknown> = Promise.resolve();

/** 済んでいない地図だけ、保存範囲の記録とタイルを捨ててから印を書く。印は削除を待ってから書く（途中で落ちたら次回やり直す） */
const discardLegacyTilesOnce = (store: StoreLike, io: DemMigrationIO, tileMapIds: Iterable<string>): Promise<void> => {
  const ids = [...tileMapIds];
  const run = queue.then(async () => {
    for (const id of ids) {
      try {
        if (await io.isMigrated(id)) continue;
        dropTileRegions(store, [id]);
        await io.removeTiles(id);
        await io.markMigrated(id);
      } catch (e) {
        console.warn('discardLegacyDemTiles failed:', id, e);
      }
    }
  });
  queue = run.catch(() => undefined);
  return run;
};

/** テスト用: 進行中の後始末を待つ */
export const waitForDemSourceMigration = (): Promise<unknown> => queue;

/**
 * 地図一覧のうち旧形式の陰影起伏・汎用段彩のURLを、移行後のMapterhornのURLに置き換えた一覧を返す。
 * 取得元の変更判定（discardStaleTileSources）の前に通す。手元は移行済みでクラウドは旧URLのままのとき、
 * 「取得元が変わった」と誤判定してMapterhorn形式で取り直したタイルを消さないように（設定監査 S-M3）
 */
export const withMapterhornDemUrls = <T extends Pick<TileMapType, 'url'>>(maps: T[]): T[] =>
  maps.map((map) => (needsMapterhornUrl(map.url) ? { ...map, url: toMapterhornDemUrl(map.url) } : map));

const migrateTileMaps = (store: StoreLike, io: DemMigrationIO): void => {
  const tileMaps = store.getState().tileMaps;
  const targets = tileMaps.filter((map) => needsMapterhornUrl(map.url));
  if (targets.length === 0) return;
  const targetIds = new Set(targets.map((map) => map.id));
  const updated: TileMapType[] = tileMaps.map((map) =>
    targetIds.has(map.id)
      ? {
          ...map,
          url: toMapterhornDemUrl(map.url),
          attribution: map.attribution === LEGACY_HILLSHADE_ATTRIBUTION ? MAPTERHORN_ATTRIBUTION : map.attribution,
        }
      : map
  );
  // URLの書き換えは同期のまま（旧URLで描画・ダウンロードさせない）。タイルを捨てるかは印を見て後から決める
  store.dispatch(setTileMapsAction(updated));
  discardLegacyTilesOnce(store, io, targetIds).catch(() => undefined);
};

const removeLegacyViewshedDownloads = (store: StoreLike, io: DemMigrationIO): void => {
  dropTileRegions(store, [LEGACY_DEM_VIEWSHED_MAP_ID]);
  io.removeTiles(LEGACY_DEM_VIEWSHED_MAP_ID).catch(() => undefined);
};

let unsubscribe: (() => void) | null = null;

/** 起動時（永続化データの復元後）に呼ぶ。以後もtileMapsの変化を見張って書き換える */
export const runDemSourceMigrationWith = (store: StoreLike, io: DemMigrationIO): void => {
  removeLegacyViewshedDownloads(store, io);
  migrateTileMaps(store, io);
  if (unsubscribe !== null || store.subscribe === undefined) return;
  let lastTileMaps = store.getState().tileMaps;
  unsubscribe = store.subscribe(() => {
    const tileMaps = store.getState().tileMaps;
    if (tileMaps === lastTileMaps) return;
    lastTileMaps = tileMaps;
    migrateTileMaps(store, io);
    lastTileMaps = store.getState().tileMaps;
  });
};
