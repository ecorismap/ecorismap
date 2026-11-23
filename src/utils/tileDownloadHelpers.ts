import * as FileSystem from 'expo-file-system/legacy';
import { Buffer } from 'buffer';
import { TileMapType, TileRegionType } from '../types';
import { TILE_FOLDER } from '../constants/AppConstants';
import {
  DEM_DOWNLOAD_MAX_ZOOM,
  DEM_DOWNLOAD_MIN_ZOOM,
  DEM_FAR_MARGIN_KM_AT_MIN_ZOOM,
  DEM_FAR_MARGIN_MAX_ZOOM,
  DEM_MAPTERHORN_MAP_ID,
} from '../constants/DemSources';
import { getExt } from './General';
import { isPeaksUrl } from './peaks/peak2dLabels';
import { getPmtileMaximumNativeZ } from './pmtileProps';
import { isDemProtocolUrl, isTerrariumDemUrl, TERRARIUM_DEM_ZOOM_OFFSET } from './terrainShading';
import { lonToTileX, latToTileY, tilesForZoom } from './Tile';
import { buildTileUrl } from './pdfExport/tiles';

// hillshadeはrelief://（陰影段彩）も含む。どちらも生のDEMタイルを保存する点で同じ扱い。
// demは標高タイル（Mapterhorn）の疑似地図（demTileDownload.ts）
export type TileType = 'pbf' | 'pmtiles' | 'hillshade' | 'png' | 'dem';

/**
 * ダウンロード画面で扱う（選択肢に出す・「すべての地図」で取得/削除/容量集計する）地図か。
 * 画面と処理で条件がずれると、選択肢に出ていないPDF地図のタイルを上書き・削除してしまうため1か所にまとめる。
 * - standard/hybrid: Googleの地図はタイルを保存できない
 * - peaks://: 山名はアプリに同梱のデータでダウンロードするものがない
 * - .pdf / pdf:// / file:// / blob:: 取り込んだ地図で、フォルダ内のタイルは端末で生成した実体（取り直せない）
 */
export const isDownloadableTileMap = (tileMap: TileMapType): boolean => {
  if (tileMap.isGroup) return false;
  if (tileMap.id === 'standard' || tileMap.id === 'hybrid') return false;
  const { url } = tileMap;
  if (isPeaksUrl(url)) return false;
  if (url.endsWith('.pdf') || getUrlPathExt(url) === 'pdf' || url.startsWith('pdf://')) return false;
  if (url.includes('file://') || url.includes('blob:')) return false;
  return true;
};

/**
 * URL のパス部分の拡張子（小文字）。`…/{y}.pbf?key=…` のように末尾にクエリや # が付くと、
 * 最後の `.` 以降が `pbf?key=…` になって pbf と判定できず、ラスタとして拡張子なしに保存してしまう（M-L6）
 */
export const getUrlPathExt = (url: string): string => getExt(url.split(/[?#]/)[0]).toLowerCase();

export const getTileType = (tileMap: TileMapType): TileType =>
  tileMap.id === DEM_MAPTERHORN_MAP_ID
    ? 'dem'
    : getUrlPathExt(tileMap.url) === 'pbf'
    ? 'pbf'
    : getUrlPathExt(tileMap.url) === 'pmtiles' || tileMap.url.startsWith('pmtiles://')
    ? 'pmtiles'
    : isDemProtocolUrl(tileMap.url)
    ? 'hillshade'
    : 'png';

export type TileZoomRange = { minZoom: number; maxZoom: number };

/**
 * ダウンロードするズームの範囲。
 * pmtiles・pbf は表示中のズームに依らず z0（分かればアーカイブの minZoom）から取る。
 * ネイティブは粗い段を細かい段から作らないので、高ズームだけ保存するとオフラインで縮小したとき白紙になる。
 * 上限はオフライン時にオーバーズームを始めるズーム（getPmtileMaximumNativeZ）で、それより細かい段は描かれない。
 * archiveZoom はPMTilesのヘッダーの min/maxZoom。アーカイブの外を数えると、1枚も無い段で見積もりが膨らむ
 */
export const getZoomRange = (tileType: TileType, tileMap: TileMapType, archiveZoom?: TileZoomRange): TileZoomRange => {
  // 可視領域・3Dが参照するのはz7〜13（512px）のみなのでそれより粗い段は取らない
  if (tileType === 'dem') return { minZoom: DEM_DOWNLOAD_MIN_ZOOM, maxZoom: DEM_DOWNLOAD_MAX_ZOOM };
  if (tileType === 'pmtiles' || tileType === 'pbf') {
    // pbf は常にベクタとして描かれる
    const isVector = tileType === 'pbf' ? true : tileMap.isVector;
    const nativeMaxZoom = getPmtileMaximumNativeZ({ overzoomThreshold: tileMap.overzoomThreshold, isVector }, true);
    if (archiveZoom === undefined) return { minZoom: 0, maxZoom: Math.min(18, nativeMaxZoom) };
    return { minZoom: Math.max(0, archiveZoom.minZoom), maxZoom: Math.min(archiveZoom.maxZoom, nativeMaxZoom) };
  }
  const minZoom = 0;
  const maxZoom = Math.min(tileMap.overzoomThreshold, 16);
  // terrarium（512px）の陰影・段彩は1段粗いズームの標高タイルから描くので、最も細かい段は要らない
  if (tileType === 'hillshade' && isTerrariumDemUrl(tileMap.url)) {
    return { minZoom, maxZoom: Math.max(0, maxZoom - TERRARIUM_DEM_ZOOM_OFFSET) };
  }
  return { minZoom, maxZoom };
};

/** PMTiles のヘッダーからズームの範囲を読む。読めない・値が壊れているときは undefined（既定の範囲で取る） */
export const readPmtileZoomRange = async (pmtile: {
  getHeader: () => Promise<{ minZoom: number; maxZoom: number }>;
}): Promise<TileZoomRange | undefined> => {
  try {
    const { minZoom, maxZoom } = await pmtile.getHeader();
    if (!Number.isInteger(minZoom) || !Number.isInteger(maxZoom) || minZoom < 0 || minZoom > maxZoom) return undefined;
    return { minZoom, maxZoom };
  } catch (e) {
    return undefined;
  }
};

// ダウンロード可否の閾値。ズームレベルではなく推定タイル数で判定する
// （最大z9のGEBCOは広域でも少数、z16まで取るラスタは広域だと爆発するため）
export const DOWNLOAD_TILE_COUNT_CONFIRM = 3000; // これ以下は確認なしで即開始
export const DOWNLOAD_TILE_COUNT_LIMIT = 30000; // これ超はダウンロード不可
export const ESTIMATED_TILE_SIZE_MB = 0.03; // 概算サイズ表示用（約30KB/枚）

// tilesForZoomと同じ数え方（max側+1タイル余分）を、配列を実体化せず算術で数える。
// 広域指定ではz16で数十万枚になるためtileGridForRegionの流用は不可
export const countTilesForRegion = (
  bounds: { minLon: number; minLat: number; maxLon: number; maxLat: number },
  minZoom: number,
  maxZoom: number
): number => {
  let count = 0;
  for (let z = minZoom; z <= maxZoom; z++) {
    const xCount = lonToTileX(bounds.maxLon, z) - lonToTileX(bounds.minLon, z) + 2;
    const yCount = latToTileY(bounds.minLat, z) - latToTileY(bounds.maxLat, z) + 2;
    count += xCount * yCount;
  }
  return count;
};

type Bounds = { minLon: number; minLat: number; maxLon: number; maxLat: number };

const KM_PER_DEG_LAT = 111.32;
// Webメルカトルの有効範囲。lonToTileXは180度ちょうどで範囲外の番号を返すので手前で止める
const MAX_MERCATOR_LAT = 85;
const MAX_LON = 179.9999;

/**
 * ズームzで実際にダウンロードする範囲。demの粗いズームだけ3D遠景用の周辺幅を足す
 * （DEM_FAR_MARGIN_KM_AT_MIN_ZOOM参照）。それ以外は指定範囲そのまま
 */
export const downloadBoundsForZoom = (tileType: TileType, bounds: Bounds, z: number): Bounds => {
  if (tileType !== 'dem' || z > DEM_FAR_MARGIN_MAX_ZOOM) return bounds;
  const marginKm = DEM_FAR_MARGIN_KM_AT_MIN_ZOOM / Math.pow(2, z - DEM_DOWNLOAD_MIN_ZOOM);
  const dLat = marginKm / KM_PER_DEG_LAT;
  // 経度方向は範囲の赤道側の緯度で換算する（高緯度側で換算すると幅が過大になる）
  const lat = Math.min(Math.abs(bounds.minLat), Math.abs(bounds.maxLat));
  const dLon = marginKm / (KM_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
  return {
    minLon: Math.max(-180, bounds.minLon - dLon),
    maxLon: Math.min(MAX_LON, bounds.maxLon + dLon),
    minLat: Math.max(-MAX_MERCATOR_LAT, bounds.minLat - dLat),
    maxLat: Math.min(MAX_MERCATOR_LAT, bounds.maxLat + dLat),
  };
};

/** ダウンロードするタイル一覧（開始時と再開時で同じ集合になるよう必ずこれを使う） */
export const downloadTileGrid = (tileType: TileType, bounds: Bounds, minZoom: number, maxZoom: number) => {
  const tiles: { x: number; y: number; z: number }[] = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    tiles.push(...tilesForZoom(downloadBoundsForZoom(tileType, bounds, z), z));
  }
  return tiles;
};

/** downloadTileGridの枚数を配列を作らずに数える */
export const countDownloadTiles = (tileType: TileType, bounds: Bounds, minZoom: number, maxZoom: number): number => {
  let count = 0;
  for (let z = minZoom; z <= maxZoom; z++) {
    count += countTilesForRegion(downloadBoundsForZoom(tileType, bounds, z), z, z);
  }
  return count;
};

// 対象地図ごとに実際の取得ズーム範囲（getZoomRange）でタイル数を見積もり合算する。
// archiveZooms は PMTiles のヘッダーのズーム範囲（地図 ID ごと。まだ読めていない地図は既定の範囲で数える）。
// archiveIsVectors はヘッダーの種別。ダウンロード（useTiles）は resolvePmtileIsVector で isVector を
// ヘッダーに合わせてから上限を決めるので、見積もりも同じ判定で数えないと枚数の上限判定がずれる
export const estimateDownloadTileCount = (
  bounds: Bounds,
  maps: TileMapType[],
  archiveZooms: Record<string, TileZoomRange> = {},
  archiveIsVectors: Record<string, boolean> = {}
): number =>
  maps.reduce((total, tileMap) => {
    const tileType = getTileType(tileMap);
    const isVector = archiveIsVectors[tileMap.id] ?? tileMap.isVector;
    const { minZoom, maxZoom } = getZoomRange(tileType, { ...tileMap, isVector }, archiveZooms[tileMap.id]);
    return total + countDownloadTiles(tileType, bounds, minZoom, maxZoom);
  }, 0);

// 保存済みregionの4隅座標からダウンロード範囲を復元する（頂点順序に依存しない）
export const boundsFromCoords = (coords: TileRegionType['coords']) => {
  const lons = coords.map((c) => c.longitude);
  const lats = coords.map((c) => c.latitude);
  return {
    minLon: Math.min(...lons),
    minLat: Math.min(...lats),
    maxLon: Math.max(...lons),
    maxLat: Math.max(...lats),
  };
};

// 保存済みタイルを"z/x/y"キーのSetで返す。
// タイル毎のgetInfoAsyncではなくフォルダ毎のreadDirectoryAsyncで走査してコストを抑える。
// 失敗時は空Set（スキップされず再ダウンロードされるだけで安全側）。
export const listExistingTiles = async (tileMapId: string): Promise<Set<string>> => {
  const existing = new Set<string>();
  try {
    const zDirs = await FileSystem.readDirectoryAsync(`${TILE_FOLDER}/${tileMapId}`);
    for (const z of zDirs) {
      // metadata.json / style.json 等の非数値エントリを除外
      if (!/^\d+$/.test(z)) continue;
      const xDirs = await FileSystem.readDirectoryAsync(`${TILE_FOLDER}/${tileMapId}/${z}`);
      for (const x of xDirs) {
        if (!/^\d+$/.test(x)) continue;
        const files = await FileSystem.readDirectoryAsync(`${TILE_FOLDER}/${tileMapId}/${z}/${x}`);
        for (const file of files) {
          // {y}.pngは旧版がラスタPMTilesを誤った形式（Base64文字列）で書いたもので、ネイティブは読まない。
          // 保存済みとみなすと再開で取り直されないので数えない
          const y = file.replace(/\.(pbf|webp)$/, '');
          if (!/^\d+$/.test(y)) continue;
          existing.add(`${z}/${x}/${y}`);
        }
      }
    }
  } catch (e) {
    return new Set<string>();
  }
  return existing;
};

/**
 * ダウンロード画面の取得・削除の対象。個別選択があればその中のダウンロード対象だけ、
 * 無ければ（「すべての地図」）ダウンロード対象すべて。標高タイル（疑似地図）はRedux tileMapsに無いので合成して足す
 */
export const tileMapsForDownloadScreen = (
  tileMaps: TileMapType[],
  selectedTileMapIds: string[],
  demTileMap: TileMapType
): TileMapType[] => {
  if (selectedTileMapIds.length > 0) {
    const maps = tileMaps.filter((map) => selectedTileMapIds.includes(map.id) && isDownloadableTileMap(map));
    if (selectedTileMapIds.includes(demTileMap.id)) maps.push(demTileMap);
    return maps;
  }
  return [...tileMaps.filter(isDownloadableTileMap), demTileMap];
};

type TileXYZ = { x: number; y: number; z: number };

// pmtiles の TileType（0=Unknown, 1=Mvt, 2〜5=画像）。テストでモックされるため enum は読まない
const PMTILES_TILE_TYPE_UNKNOWN = 0;
const PMTILES_TILE_TYPE_MVT = 1;

/** PMTiles のヘッダーの種別がベクタか。種別が不明・ヘッダーが読めないときは undefined */
export const readPmtileHeaderIsVector = async (pmtile: {
  getHeader: () => Promise<{ tileType: number }>;
}): Promise<boolean | undefined> => {
  try {
    const { tileType } = await pmtile.getHeader();
    if (tileType === PMTILES_TILE_TYPE_UNKNOWN) return undefined;
    return tileType === PMTILES_TILE_TYPE_MVT;
  } catch (e) {
    return undefined;
  }
};

/**
 * PMTiles をベクタとして保存するか。ヘッダーの種別を優先し、取れなければ地図の isVector に従う。
 * ネイティブはヘッダーで種別を決めるので、isVector の付け忘れでもオンラインでは描けるが、
 * ラスタとして {y} に MVT を書くと画像として読まれてダウンロード範囲だけ空白になる。
 */
export const resolvePmtileIsVector = async (
  pmtile: { getHeader: () => Promise<{ tileType: number }> },
  fallback: boolean
): Promise<boolean> => (await readPmtileHeaderIsVector(pmtile)) ?? fallback;

/** ラスタPMTilesのタイルの保存先。ネイティブ（readTileImage/getTileFilename・iOS PMTileOverlay）は拡張子なしで読む */
export const rasterPmtileTilePath = (tileMapId: string, tile: TileXYZ) =>
  `${TILE_FOLDER}/${tileMapId}/${tile.z}/${tile.x}/${tile.y}`;

/** ラスタPMTilesのタイルを、ネイティブのオンライン時キャッシュと同じ生バイトで書く */
export const writeRasterPmtileTile = async (tileMapId: string, tile: TileXYZ, data: ArrayBuffer): Promise<void> => {
  const base64String = Buffer.from(data).toString('base64');
  await FileSystem.writeAsStringAsync(rasterPmtileTilePath(tileMapId, tile), base64String, {
    encoding: FileSystem.EncodingType.Base64,
  });
};

/**
 * 旧版がラスタPMTilesで書いた {z}/{x}/{y}.png（Base64文字列で、どのOSでも読まれない）を消す。
 * 変換はせず、消したタイルはダウンロードで取り直す。失敗しても取り直しには影響しないので握りつぶす。
 */
export const removeLegacyRasterPmtilePngs = async (tileMapId: string): Promise<void> => {
  const root = `${TILE_FOLDER}/${tileMapId}`;
  try {
    const zDirs = await FileSystem.readDirectoryAsync(root);
    for (const z of zDirs) {
      if (!/^\d+$/.test(z)) continue;
      const xDirs = await FileSystem.readDirectoryAsync(`${root}/${z}`);
      for (const x of xDirs) {
        if (!/^\d+$/.test(x)) continue;
        const files = await FileSystem.readDirectoryAsync(`${root}/${z}/${x}`);
        for (const file of files) {
          if (!/^\d+\.png$/.test(file)) continue;
          await FileSystem.deleteAsync(`${root}/${z}/${x}/${file}`, { idempotent: true }).catch(() => undefined);
        }
      }
    }
  } catch (e) {
    // フォルダが無い（未ダウンロード）など
  }
};

/** 1枚分の結果。missing は配信元に無いタイル（404・PMTiles の範囲外）で、失敗には数えない */
export type TileDownloadResult = 'saved' | 'missing' | 'failed';

let tempDownloadSeq = 0;

/**
 * URL を一時ファイルへ落とし、200 のときだけ保存先へ移す。
 * expo-file-system legacy の downloadAsync は応答コードに関係なく保存先を消してから本文を書くので、
 * 保存先へ直接落とすと一時的な 5xx・429・署名切れの 403 で保存済みの正常なタイルが消える
 */
export const downloadFileIfOk = async (url: string, path: string): Promise<TileDownloadResult> => {
  const temp = `${FileSystem.cacheDirectory ?? ''}tile-download-${Date.now()}-${tempDownloadSeq++}`;
  try {
    const { status } = await FileSystem.downloadAsync(url, temp);
    if (status !== 200) {
      await FileSystem.deleteAsync(temp, { idempotent: true }).catch(() => undefined);
      return status === 404 ? 'missing' : 'failed';
    }
    // iOS の移動は移動先があると失敗する
    await FileSystem.deleteAsync(path, { idempotent: true });
    await FileSystem.moveAsync({ from: temp, to: path });
    return 'saved';
  } catch (e) {
    await FileSystem.deleteAsync(temp, { idempotent: true }).catch(() => undefined);
    return 'failed';
  }
};

type PmtileTileSource = {
  getZxy: (z: number, x: number, y: number) => Promise<{ data: ArrayBuffer } | undefined>;
};

export type DownloadOneTileArgs = {
  tileType: Exclude<TileType, 'dem'>;
  tileMapId: string;
  /** 署名を付けたテンプレート URL。hillshade は元の DEM の URL（toDemUrl 済み） */
  urlTemplate: string;
  flipY: boolean;
  pmtile?: PmtileTileSource;
  pmtileIsVector: boolean;
  tile: TileXYZ;
};

/**
 * 地図タイル1枚をダウンロードして保存する。保存先のパスは常に XYZ の y で、
 * flipY（TMS）の地図は URL の {y} だけを反転する（表示側のキャッシュと同じ規約）
 */
export const downloadOneTile = async ({
  tileType,
  tileMapId,
  urlTemplate,
  flipY,
  pmtile,
  pmtileIsVector,
  tile,
}: DownloadOneTileArgs): Promise<TileDownloadResult> => {
  const basePath = `${TILE_FOLDER}/${tileMapId}/${tile.z}/${tile.x}/${tile.y}`;
  if (tileType === 'pmtiles') {
    if (pmtile === undefined) return 'failed';
    try {
      const resp = await pmtile.getZxy(tile.z, tile.x, tile.y);
      if (resp === undefined) return 'missing';
      if (pmtileIsVector) {
        await FileSystem.writeAsStringAsync(`${basePath}.pbf`, Buffer.from(resp.data).toString('base64'), {
          encoding: FileSystem.EncodingType.UTF8,
        });
      } else {
        await writeRasterPmtileTile(tileMapId, tile, resp.data);
      }
      return 'saved';
    } catch (e) {
      return 'failed';
    }
  }
  const url = buildTileUrl({ url: urlTemplate, flipY }, tile.z, tile.x, tile.y);
  if (tileType === 'pbf') {
    try {
      const response = await fetch(url);
      if (!response.ok) return response.status === 404 ? 'missing' : 'failed';
      const data = await response.arrayBuffer();
      await FileSystem.writeAsStringAsync(`${basePath}.pbf`, Buffer.from(data).toString('base64'), {
        encoding: FileSystem.EncodingType.UTF8,
      });
      return 'saved';
    } catch (e) {
      return 'failed';
    }
  }
  return downloadFileIfOk(url, basePath);
};

/** スタイル取得の結果。local は style:// で端末に置いたスタイルがあり、取得しなかった */
export type StyleDownloadResult = 'saved' | 'local' | 'failed';

/**
 * ベクタ地図の style.json を地図フォルダへ保存する。
 * style:// は取り込み・共有で端末に置いたスタイルを指し、RN の fetch はこのスキームを扱えないので取得しない
 * （取得すると必ず失敗して毎回エラーと表示される。M-L15）。その場合は置かれているかだけ確かめる。
 * エラー応答の本文（HTML）を style.json として保存すると既存の正しいスタイルを壊すので、200 系のときだけ書く
 */
export const downloadStyleJson = async (
  tileMapId: string,
  styleURL: string,
  fetchUrl: string
): Promise<StyleDownloadResult> => {
  const localLocation = `${TILE_FOLDER}/${tileMapId}/style.json`;
  if (styleURL.startsWith('style://')) {
    try {
      const info = await FileSystem.getInfoAsync(localLocation);
      return info.exists ? 'local' : 'failed';
    } catch (e) {
      return 'failed';
    }
  }
  try {
    const response = await fetch(fetchUrl);
    if (!response.ok) return 'failed';
    const data = await response.text();
    await FileSystem.writeAsStringAsync(localLocation, data, { encoding: FileSystem.EncodingType.UTF8 });
    return 'saved';
  } catch (e) {
    return 'failed';
  }
};

// ダウンロード完了したregionからstatus/zoomを取り除く（undefined残しではなくキー自体を除去）
export const toCompletedRegion = (region: TileRegionType): TileRegionType => ({
  id: region.id,
  tileMapId: region.tileMapId,
  coords: region.coords,
  centroid: region.centroid,
});

// idsに含まれる未完了（status付き）regionを'paused'にする
export const markRegionsPaused = (tileRegions: TileRegionType[], ids: string[]): TileRegionType[] =>
  tileRegions.map((r) => (ids.includes(r.id) && r.status !== undefined ? { ...r, status: 'paused' as const } : r));

// idsに含まれる未完了（status付き）regionを削除する（完了済みregionは保持）
export const removeIncompleteRegions = (tileRegions: TileRegionType[], ids: string[]): TileRegionType[] =>
  tileRegions.filter((r) => !(ids.includes(r.id) && r.status !== undefined));
