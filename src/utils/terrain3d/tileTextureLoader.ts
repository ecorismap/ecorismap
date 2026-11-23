/**
 * 3D地形のテクスチャタイル解決。
 *
 * 解決順:
 *  1. オフライン地図タイル（TILE_FOLDER/{tileMapId}/{z}/{x}/{y}、拡張子なし生バイト）
 *  2. オンラインダウンロード（cacheDirectory/terrain3d_tex、0バイト=タイルが無いことの印）
 * 印を書くのは URL の404と、オンラインでアーカイブに本当にタイルが無いときだけ。
 * 403・429・5xx・通信失敗・オフラインの未保存範囲は一時的とみなし、印を書かずに次の機会に取り直す。
 * いずれもlocalUriとして返し、loadTileImageBitmapでネイティブデコードしてテクスチャ化する。
 * デコードできなかった場合向けに、呼び出し側でpngLite経由の
 * RGBAフォールバック（loadTileAsRgba）を使える。
 *
 * URLテンプレートは署名付与済み（withTileSignature適用済み）を前提とする。
 */
import * as FileSystem from 'expo-file-system/legacy';
import { TILE_FOLDER } from '../../constants/AppConstants';
import { decodePngLite } from '../pngLite';
import { readLocalFileBytes } from '../demTileLoader';
import { renderPmtile } from './pmtileRasterizer';
import { resolveReliefTexture } from './reliefTexture';
import { LayerSpec, TileKey, TileTextureSource } from './types';
import {
  clearTerrainTextureCache as clearTextureDiskCache,
  ensureTerrainTextureCacheDir,
  TERRAIN_TEXTURE_CACHE_DIR,
} from './textureDiskCache';

const CACHE_DIR = TERRAIN_TEXTURE_CACHE_DIR;
const ensureCacheDir = ensureTerrainTextureCacheDir;

/** 一時的な失敗（再試行すべき）。呼び出し側は欠けたままにして、タイル再構築時に取り直す */
export class TransientTileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransientTileError';
  }
}

/** URLテンプレートから拡張子を推定（ネイティブデコーダのヒント用） */
const extensionForUrl = (urlTemplate: string): string => {
  const m = urlTemplate.match(/\.(png|jpg|jpeg|webp)(\?|$)/i);
  return m ? m[1].toLowerCase() : 'png';
};

const buildTileUrl = (layer: LayerSpec, tile: TileKey): string => {
  const y = layer.flipY ? Math.pow(2, tile.z) - 1 - tile.y : tile.y;
  return layer.urlTemplate.replace('{z}', String(tile.z)).replace('{x}', String(tile.x)).replace('{y}', String(y));
};

/** オフライン地図タイルのパス（ネイティブパッチ・ダウンロード処理と同一規約） */
const offlineTileUri = (layer: LayerSpec, tile: TileKey): string =>
  `${TILE_FOLDER}/${layer.id}/${tile.z}/${tile.x}/${tile.y}`;

const cacheTileUri = (layer: LayerSpec, tile: TileKey, ext: string): string =>
  `${CACHE_DIR}/${layer.id}_${tile.z}_${tile.x}_${tile.y}.${ext}`;

const existsWithData = async (uri: string): Promise<boolean> => {
  const info = await FileSystem.getInfoAsync(uri).catch(() => null);
  return info?.exists === true && !info.isDirectory && (info.size ?? 0) > 0;
};

/**
 * 2D のダウンロードで PMTiles のタイルが TILE_FOLDER に保存されているか。
 * 拡大表示のズームでは maximumNativeZ の親タイルから描くので、親の位置を見る。
 * ラスタは拡張子なしの生バイト、ベクタは .pbf（描画済み PNG は拡張子なし）
 */
const hasDownloadedPmtile = async (layer: LayerSpec, tile: TileKey): Promise<boolean> => {
  const nativeZ = Math.min(tile.z, layer.maximumNativeZ ?? 18);
  const factor = Math.pow(2, tile.z - nativeZ);
  const base = `${TILE_FOLDER}/${layer.id}/${nativeZ}/${Math.floor(tile.x / factor)}/${Math.floor(tile.y / factor)}`;
  if (await existsWithData(base)) return true;
  return existsWithData(`${base}.pbf`);
};

// ---- PMTiles（ベクタ/ラスタ）・pbf ----
// 2Dと同じネイティブラスタライザでPNG化する。ラベルやmatch式スタイル、
// オーバーズームまで2Dと同一の見た目になる
const resolvePmtilesTexture = async (layer: LayerSpec, tile: TileKey): Promise<TileTextureSource> => {
  await ensureCacheDir();
  const cacheUri = `${CACHE_DIR}/${layer.id}_${tile.z}_${tile.x}_${tile.y}.png`;
  const cached = await FileSystem.getInfoAsync(cacheUri).catch(() => null);
  if (cached?.exists) {
    if ((cached.size ?? 0) > 0) {
      const size = layer.isVector ? 512 : 256;
      return { kind: 'localUri', uri: cacheUri, width: size, height: size };
    }
    // 印を書いた後に範囲をダウンロードしていれば、保存済みタイルから描き直す
    if (!(await hasDownloadedPmtile(layer, tile))) return { kind: 'missing' };
    await FileSystem.deleteAsync(cacheUri, { idempotent: true }).catch(() => undefined);
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
    // オフラインの未保存範囲は、オンラインに戻れば取れるので印を書かない
    if (layer.offlineMode === true) return { kind: 'missing' };
    // オンラインでアーカイブに本当にタイルが無い。0バイトの印で記憶して再取得を防ぐ
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
  // relief://は標高タイルからJSで段彩を生成する（オフライン探索も内部で行う）
  if (layer.relief !== undefined) return resolveReliefTexture(layer, tile);

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
  let res: Awaited<ReturnType<typeof FileSystem.downloadAsync>>;
  try {
    res = await FileSystem.downloadAsync(url, fileUri);
  } catch (e) {
    // 途中まで書かれたファイルを画像として残さない
    await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => undefined);
    throw e;
  }
  if (res.status === 404) {
    // 本文（エラーメッセージ）が書かれているので、0バイトの印で上書きして再取得を防ぐ
    await FileSystem.writeAsStringAsync(fileUri, '').catch(() => undefined);
    return { kind: 'missing' };
  }
  if (res.status !== 200) {
    // 403（署名切れ）・429・5xx は一時的。エラー本文を画像として残さない
    await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => undefined);
    throw new TransientTileError(`tile fetch failed: ${res.status}`);
  }
  return { kind: 'localUri', uri: fileUri, width: 256, height: 256 };
};

/**
 * localUriの画像をネイティブデコードしてImageBitmapで返す。
 *
 * ファイル拡張子ではなくバイト列の中身で判定されるため、オフラインタイル
 * （拡張子なし）もJPEGも同じ経路で扱える。デコード不能ならnull（呼び出し側で
 * loadTileAsRgbaのpngLiteフォールバックへ）。
 */
export const loadTileImageBitmap = async (uri: string): Promise<ImageBitmap | null> => {
  const bytes = await readLocalFileBytes(uri);
  if (bytes === null) return null;
  return createImageBitmap(bytes).catch(() => null);
};

/**
 * localUriのPNGをJSデコードしてRGBAで返すフォールバック。
 * ネイティブデコードが失敗した場合に使う。
 * JPEGはデコードできないためmissingを返す。
 */
export const loadTileAsRgba = async (uri: string): Promise<TileTextureSource> => {
  const bytes = await readLocalFileBytes(uri);
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
export const clearTerrainTextureCache = clearTextureDiskCache;
