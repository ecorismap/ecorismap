/**
 * 3D地形のテクスチャタイル解決。
 *
 * 解決順:
 *  1. オフライン地図タイル（TILE_FOLDER/{tileMapId}/{z}/{x}/{y}、拡張子なし生バイト）
 *  2. オンラインダウンロード（cacheDirectory/terrain3d_tex、0バイト=404マーカー）
 * いずれもlocalUriとして返し、expo-glのtexImage2Dネイティブデコードに渡す。
 * 拡張子なしURIがデコードできない環境向けに、呼び出し側でpngLite経由の
 * RGBAフォールバック（loadTileAsRgba）を使える。
 *
 * URLテンプレートは署名付与済み（withTileSignature適用済み）を前提とする。
 */
import * as FileSystem from 'expo-file-system/legacy';
import { TILE_FOLDER } from '../../constants/AppConstants';
import { decodePngLite } from '../pngLite';
import { loadLocalDemTilePng } from '../demTileLoader';
import { renderPmtile } from './pmtileRasterizer';
import { LayerSpec, TileKey, TileTextureSource } from './types';

const CACHE_DIR = `${FileSystem.cacheDirectory}terrain3d_tex`;
let dirEnsured = false;

const ensureCacheDir = async (): Promise<void> => {
  if (dirEnsured) return;
  await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true }).catch(() => undefined);
  dirEnsured = true;
};

/** URLテンプレートから拡張子を推定（ネイティブデコーダのヒント用） */
const extensionForUrl = (urlTemplate: string): string => {
  const m = urlTemplate.match(/\.(png|jpg|jpeg|webp)(\?|$)/i);
  return m ? m[1].toLowerCase() : 'png';
};

const buildTileUrl = (layer: LayerSpec, tile: TileKey): string => {
  const y = layer.flipY ? Math.pow(2, tile.z) - 1 - tile.y : tile.y;
  return layer.urlTemplate
    .replace('{z}', String(tile.z))
    .replace('{x}', String(tile.x))
    .replace('{y}', String(y));
};

/** オフライン地図タイルのパス（ネイティブパッチ・ダウンロード処理と同一規約） */
const offlineTileUri = (layer: LayerSpec, tile: TileKey): string =>
  `${TILE_FOLDER}/${layer.id}/${tile.z}/${tile.x}/${tile.y}`;

const cacheTileUri = (layer: LayerSpec, tile: TileKey, ext: string): string =>
  `${CACHE_DIR}/${layer.id}_${tile.z}_${tile.x}_${tile.y}.${ext}`;

// ---- PMTiles（ベクタ/ラスタ）・pbf ----
// 2Dと同じネイティブラスタライザでPNG化する。ラベルやmatch式スタイル、
// オーバーズームまで2Dと同一の見た目になる
const resolvePmtilesTexture = async (layer: LayerSpec, tile: TileKey): Promise<TileTextureSource> => {
  await ensureCacheDir();
  const cacheUri = `${CACHE_DIR}/${layer.id}_${tile.z}_${tile.x}_${tile.y}.png`;
  const cached = await FileSystem.getInfoAsync(cacheUri).catch(() => null);
  if (cached?.exists) {
    if ((cached.size ?? 0) === 0) return { kind: 'missing' };
    const size = layer.isVector ? 512 : 256;
    return { kind: 'localUri', uri: cacheUri, width: size, height: size };
  }
  // 通信エラー等はthrow（呼び出し側で欠けたまま→タイル再構築時に再試行）
  const tileSize = await renderPmtile({
    urlTemplate: layer.urlTemplate,
    styleURL: layer.styleURL,
    tileCachePath: `${TILE_FOLDER}/${layer.id}`,
    z: tile.z,
    x: tile.x,
    y: tile.y,
    minimumZ: layer.minimumZ,
    maximumZ: layer.maximumZ,
    maximumNativeZ: layer.maximumNativeZ ?? 18,
    flipY: layer.flipY,
    offlineMode: layer.offlineMode ?? false,
    isVector: layer.isVector ?? false,
    outputPath: cacheUri,
  });
  if (tileSize === 0) {
    // タイルなし（範囲外）。0バイトマーカーで記憶して再取得を防ぐ
    await FileSystem.writeAsStringAsync(cacheUri, '').catch(() => undefined);
    return { kind: 'missing' };
  }
  return { kind: 'localUri', uri: cacheUri, width: tileSize, height: tileSize };
};

/**
 * タイル画像をlocalUriへ解決する。
 * @returns localUri（存在保証あり）/ missing（恒久404・範囲外） / throw（通信エラー）
 */
export const resolveTileTexture = async (layer: LayerSpec, tile: TileKey): Promise<TileTextureSource> => {
  if (tile.z < layer.minimumZ || tile.z > layer.maximumZ) return { kind: 'missing' };
  if (layer.isPmtiles) return resolvePmtilesTexture(layer, tile);

  // 1. オフラインダウンロード済みタイル
  const offline = await FileSystem.getInfoAsync(offlineTileUri(layer, tile)).catch(() => null);
  if (offline?.exists && !offline.isDirectory) {
    if ((offline.size ?? 0) === 0) return { kind: 'missing' };
    return { kind: 'localUri', uri: offlineTileUri(layer, tile), width: 256, height: 256 };
  }

  // 2. オンライン（ディスクキャッシュ付き）
  await ensureCacheDir();
  const ext = extensionForUrl(layer.urlTemplate);
  const fileUri = cacheTileUri(layer, tile, ext);
  const cached = await FileSystem.getInfoAsync(fileUri).catch(() => null);
  if (cached?.exists) {
    if ((cached.size ?? 0) === 0) return { kind: 'missing' };
    return { kind: 'localUri', uri: fileUri, width: 256, height: 256 };
  }
  const url = buildTileUrl(layer, tile);
  // ネットワークエラーはthrow（呼び出し側でリトライ判断）
  const res = await FileSystem.downloadAsync(url, fileUri);
  if (res.status !== 200) {
    // 404等は0バイトマーカーで記憶して再取得を防ぐ
    await FileSystem.writeAsStringAsync(fileUri, '').catch(() => undefined);
    return { kind: 'missing' };
  }
  return { kind: 'localUri', uri: fileUri, width: 256, height: 256 };
};

/**
 * localUriのPNGをJSデコードしてRGBAで返すフォールバック。
 * expo-glのネイティブデコードが使えない場合（拡張子なしファイル等）に使う。
 * JPEGはデコードできないためmissingを返す。
 */
export const loadTileAsRgba = async (uri: string): Promise<TileTextureSource> => {
  const bytes = await loadLocalDemTilePng(uri);
  if (bytes === null) return { kind: 'missing' };
  const decoded = decodePngLite(bytes);
  if (decoded === null) return { kind: 'missing' };
  const { width, height, data, channels, palette } = decoded;
  const rgba = new Uint8Array(width * height * 4);
  if (palette !== undefined && channels === 1) {
    for (let i = 0; i < width * height; i++) {
      const p = data[i] * 3;
      rgba[i * 4] = palette[p];
      rgba[i * 4 + 1] = palette[p + 1];
      rgba[i * 4 + 2] = palette[p + 2];
      rgba[i * 4 + 3] = 255;
    }
  } else if (channels === 3) {
    for (let i = 0; i < width * height; i++) {
      rgba[i * 4] = data[i * 3];
      rgba[i * 4 + 1] = data[i * 3 + 1];
      rgba[i * 4 + 2] = data[i * 3 + 2];
      rgba[i * 4 + 3] = 255;
    }
  } else if (channels === 4) {
    rgba.set(data.subarray(0, width * height * 4));
  } else {
    return { kind: 'missing' };
  }
  return { kind: 'rgba', data: rgba, width, height };
};

/** キャッシュディレクトリを全消去（設定画面等から呼ぶ想定） */
export const clearTerrainTextureCache = async (): Promise<void> => {
  dirEnsured = false;
  await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true }).catch(() => undefined);
};
