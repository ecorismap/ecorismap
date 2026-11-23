import { editSettingsAction } from '../modules/settings';
import type { RootState } from '../store';
import { TileMapType } from '../types';
import { hasIrreplaceableTiles } from './tileCacheCleanup';
import type { PmtilesSaveCleanup } from './pmtilesLocalStore';

/**
 * 地図の取得内容（どこから何を取るか）が変わったかを判定する。
 * ネイティブのタイルキャッシュは地図 ID だけで引くので、同じ ID のまま取得元を差し替えると
 * 旧ソースのタイルが新しい地図として表示され続ける（タイル監査 M-H6）。
 */

// 署名付き配信の署名（withTileSignature が描画直前に足す）。署名の付け外しは取得内容の変更ではない
const SIGNATURE_PARAMS = new Set(['expires', 'sig']);

export const stripTileSignature = (url: string): string => {
  const hash = url.indexOf('#');
  const base = hash < 0 ? url : url.slice(0, hash);
  const fragment = hash < 0 ? '' : url.slice(hash);
  const q = base.indexOf('?');
  if (q < 0) return url;
  const params = base
    .slice(q + 1)
    .split('&')
    .filter((param) => param !== '' && !SIGNATURE_PARAMS.has(param.split('=')[0]));
  return base.slice(0, q) + (params.length > 0 ? `?${params.join('&')}` : '') + fragment;
};

// ネイティブ・Web とも、この形の URL は PMTile（ベクタ/ラスタ）として描かれ、スタイルを使う
export const isPmtilesSourceUrl = (url: string): boolean =>
  url.startsWith('pmtiles://') || url.includes('.pmtiles') || url.includes('.pbf');

// Web で取り込んだ PMTiles の blob URL は起動のたびに作り直されるので、どの blob でも同じ取得元とみなす
const sourceUrlOf = (url: string): string => (url.includes('blob:') ? 'blob:' : stripTileSignature(url));

type SourceFields = Pick<TileMapType, 'url' | 'flipY' | 'tileSize' | 'styleURL' | 'isGroup'>;

const NO_CLEANUP: PmtilesSaveCleanup = { source: false, renderedTiles: false, style: false };

const isBlank = (value: string | undefined) => value === undefined || value === '';

/**
 * 同じ地図 ID の前後で、端末内の何を捨てるか。
 * - 取得元（署名を除いた URL・flipY・tileSize）が変わった: タイルと保存範囲を捨てる
 * - PMTiles のスタイルだけ変わった: 描画済み画像だけを捨てる（ダウンロードした .pbf はスタイルに依らないので残す）
 * PDF 由来の地図はタイルが唯一の実体で、取り込み直しで新しいタイルが先に置かれるので触らない。
 */
export const getTileSourceCleanup = (previous: SourceFields | undefined, next: SourceFields): PmtilesSaveCleanup => {
  if (previous === undefined || previous.isGroup || next.isGroup) return NO_CLEANUP;
  if (!previous.url || !next.url) return NO_CLEANUP;
  const nextIsPmtiles = isPmtilesSourceUrl(next.url);
  const irreplaceable = (map: SourceFields) => hasIrreplaceableTiles(map) && !isPmtilesSourceUrl(map.url);
  if (irreplaceable(previous) || irreplaceable(next)) return NO_CLEANUP;

  const source =
    sourceUrlOf(previous.url) !== sourceUrlOf(next.url) ||
    (previous.flipY ?? false) !== (next.flipY ?? false) ||
    (previous.tileSize ?? 256) !== (next.tileSize ?? 256);
  // スタイルを使うのは PMTiles だけ。ほかの地図の styleURL は描画に関わらない
  const styleChanged =
    nextIsPmtiles && stripTileSignature(previous.styleURL ?? '') !== stripTileSignature(next.styleURL ?? '');
  return {
    source,
    renderedTiles: source || styleChanged,
    style: styleChanged && !isBlank(previous.styleURL) && isBlank(next.styleURL),
  };
};

export type TileSourceChange = { id: string; cleanup: PmtilesSaveCleanup };

/** 差し替え前後の地図一覧から、端末内の片付けが要る地図を拾う（新規・削除された地図は対象外） */
export const findTileSourceChanges = (previousMaps: TileMapType[], nextMaps: TileMapType[]): TileSourceChange[] => {
  const previousById = new Map(previousMaps.map((map) => [map.id, map]));
  return nextMaps
    .map((map) => ({ id: map.id, cleanup: getTileSourceCleanup(previousById.get(map.id), map) }))
    .filter(({ cleanup }) => cleanup.source || cleanup.renderedTiles || cleanup.style);
};

export type TileRegionStore = {
  getState: () => Pick<RootState, 'settings'>;
  dispatch: (action: ReturnType<typeof editSettingsAction>) => unknown;
};

/** 地図の保存範囲の記録を外す。タイルを捨てた地図の範囲が「保存済み」と表示され続けないように */
export const dropTileRegions = (store: TileRegionStore, tileMapIds: Iterable<string>): void => {
  const ids = new Set(tileMapIds);
  if (ids.size === 0) return;
  const { tileRegions } = store.getState().settings;
  if (!tileRegions.some(({ tileMapId }) => ids.has(tileMapId))) return;
  store.dispatch(editSettingsAction({ tileRegions: tileRegions.filter(({ tileMapId }) => !ids.has(tileMapId)) }));
};
