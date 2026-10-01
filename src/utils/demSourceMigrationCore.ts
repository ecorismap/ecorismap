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
import { editSettingsAction } from '../modules/settings';
import { setTileMapsAction } from '../modules/tileMaps';
import type { AppDispatch, RootState } from '../store';
import { TileMapType } from '../types';
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

/** 地図ID（または疑似地図ID）の保存済みタイルを削除する。Webは保存を持たないので何もしない */
type RemoveTiles = (tileMapId: string) => void;

const migrateTileMaps = (store: StoreLike, removeTiles: RemoveTiles): void => {
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
  store.dispatch(setTileMapsAction(updated));
  const tileRegions = store.getState().settings.tileRegions;
  if (tileRegions.some((region) => targetIds.has(region.tileMapId))) {
    store.dispatch(
      editSettingsAction({ tileRegions: tileRegions.filter((region) => !targetIds.has(region.tileMapId)) })
    );
  }
  targetIds.forEach(removeTiles);
};

const removeLegacyViewshedDownloads = (store: StoreLike, removeTiles: RemoveTiles): void => {
  const tileRegions = store.getState().settings.tileRegions;
  if (tileRegions.some((region) => region.tileMapId === LEGACY_DEM_VIEWSHED_MAP_ID)) {
    store.dispatch(
      editSettingsAction({
        tileRegions: tileRegions.filter((region) => region.tileMapId !== LEGACY_DEM_VIEWSHED_MAP_ID),
      })
    );
  }
  removeTiles(LEGACY_DEM_VIEWSHED_MAP_ID);
};

let unsubscribe: (() => void) | null = null;

/** 起動時（永続化データの復元後）に呼ぶ。以後もtileMapsの変化を見張って書き換える */
export const runDemSourceMigrationWith = (store: StoreLike, removeTiles: RemoveTiles): void => {
  removeLegacyViewshedDownloads(store, removeTiles);
  migrateTileMaps(store, removeTiles);
  if (unsubscribe !== null || store.subscribe === undefined) return;
  let lastTileMaps = store.getState().tileMaps;
  unsubscribe = store.subscribe(() => {
    const tileMaps = store.getState().tileMaps;
    if (tileMaps === lastTileMaps) return;
    lastTileMaps = tileMaps;
    migrateTileMaps(store, removeTiles);
    lastTileMaps = store.getState().tileMaps;
  });
};
