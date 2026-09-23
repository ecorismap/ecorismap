/**
 * relief://（標高タイルの段彩）レイヤの3D用テクスチャを作る。
 *
 * 2Dネイティブはreact-native-mapsパッチ（Java/ObjC）で段彩を描くが、3Dからは呼べないため、
 * 同じ計算式のJS参照実装（colorRelief.tsのcomputeGebcoRelief/computeColorRelief）で
 * RGBAを作り、TerrainTileManagerの{kind:'rgba'}経路でテクスチャ化する。
 *
 * 取得規約はWebの陰影プロトコル（shadingTileProtocol.web.ts）と同じ:
 * 中央＋周囲8タイルで袖付きバッファを組み、提供上限（maximumNativeZ）より細かいズームや
 * 中央タイルが無いズームは粗いズームのタイルを使う。ただしWebと違い、段彩ラスタを
 * 拡大するのではなく標高をバイリニアで子ズームへ引き伸ばしてから描く
 * （3Dは寄って見るので、ラスタ拡大だと等値線が階段状に見える）。
 */
import { TILE_FOLDER } from '../../constants/AppConstants';
import { computeColorRelief, computeGebcoRelief } from '../colorRelief';
import { loadDemTileAsPngBytes, loadLocalDemTileAsPngBytes } from '../demTileLoader';
import { runInDecodeLane } from '../demTileProvider';
import { decodePngLite } from '../pngLite';
import { assembleWithHalo, upsampleHaloBuffer } from '../reliefTileCompose';
import { decodeElevation, DEFAULT_SHADING_OPTIONS, metersPerPixel, requiredHalo } from '../terrainShading';
import { LayerSpec, TileKey, TileTextureSource } from './types';

const TILE_SIZE = 256;
/** 中央タイルが無いとき何段まで粗いズームへ降りるか（Webの陰影プロトコルと同じ） */
const MAX_ZOOM_FALLBACK = 5;
/** 生成済みRGBAのキャッシュ枚数（1枚256KB）。PNGエンコーダが無いのでディスクには残さない */
const MAX_CACHED_TEXTURES = 64;
/** デコード済み標高のキャッシュ枚数（1枚256KB）。隣接タイルは袖として何度も引かれる */
const MAX_CACHED_ELEVATIONS = 48;

type Rgba = { data: Uint8Array; width: number; height: number };

const textureCache = new Map<string, Rgba | null>();
const elevationCache = new Map<string, Float32Array | null>();
const elevationInflight = new Map<string, Promise<Float32Array | null | undefined>>();

const lruGet = <T>(map: Map<string, T>, key: string): T | undefined => {
  if (!map.has(key)) return undefined;
  const value = map.get(key)!;
  map.delete(key);
  map.set(key, value);
  return value;
};

const lruSet = <T>(map: Map<string, T>, key: string, value: T, max: number): void => {
  map.set(key, value);
  while (map.size > max) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
};

/** PNGを256x256の標高配列へ（elev2の512pxは1画素おきに間引く）。読めなければnull */
const decodeElevationTile = (png: ArrayBuffer): Float32Array | null => {
  const decoded = decodePngLite(png);
  if (decoded === null) return null;
  const { width, height, data, channels, palette } = decoded;
  if (width !== height || width % TILE_SIZE !== 0) return null;
  const step = width / TILE_SIZE;
  const elev = new Float32Array(TILE_SIZE * TILE_SIZE);
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const i = y * step * width + x * step;
      let r: number;
      let g: number;
      let b: number;
      if (palette !== undefined && channels === 1) {
        const p = data[i] * 3;
        r = palette[p];
        g = palette[p + 1];
        b = palette[p + 2];
      } else if (channels >= 3) {
        const p = i * channels;
        r = data[p];
        g = data[p + 1];
        b = data[p + 2];
      } else {
        return null;
      }
      elev[y * TILE_SIZE + x] = decodeElevation(r, g, b);
    }
  }
  return elev;
};

const buildUrl = (layer: LayerSpec, z: number, x: number, y: number): string => {
  const ty = layer.flipY ? Math.pow(2, z) - 1 - y : y;
  return layer.urlTemplate.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(ty));
};

/**
 * 標高タイル1枚を取得・デコードする。
 * @returns 標高 / null=データなし（記憶する）/ undefined=通信エラー（記憶しない）
 */
const loadElevation = (layer: LayerSpec, z: number, x: number, y: number): Promise<Float32Array | null | undefined> => {
  const key = `${layer.urlTemplate}|${z}/${x}/${y}`;
  const cached = lruGet(elevationCache, key);
  if (cached !== undefined) return Promise.resolve(cached);
  const pending = elevationInflight.get(key);
  if (pending !== undefined) return pending;

  const task = (async (): Promise<Float32Array | null | undefined> => {
    // オフラインダウンロード済みの生DEMタイル（TILE_FOLDER/{地図id}/z/x/y）を優先する
    let png = await loadLocalDemTileAsPngBytes(`${TILE_FOLDER}/${layer.id}/${z}/${x}/${y}`);
    if (png === null) {
      if (layer.offlineMode === true) return null;
      try {
        // ディスクキャッシュのキーはcontourLabelsと揃え、2Dのラベル用に取ったタイルを共用する
        png = await loadDemTileAsPngBytes(buildUrl(layer, z, x, y), `gebco|${layer.urlTemplate}|${z}/${x}/${y}`);
      } catch {
        return undefined;
      }
    }
    const bytes = png;
    const elev = bytes === null ? null : await runInDecodeLane(() => decodeElevationTile(bytes));
    lruSet(elevationCache, key, elev, MAX_CACHED_ELEVATIONS);
    return elev;
  })();
  elevationInflight.set(key, task);
  return task.finally(() => elevationInflight.delete(key));
};

/**
 * relief://レイヤの1タイル分のテクスチャを作る。
 * @returns rgba / missing（範囲外・データなし）/ throw（通信エラー。呼び出し側で欠けたまま再試行）
 */
export const resolveReliefTexture = async (layer: LayerSpec, tile: TileKey): Promise<TileTextureSource> => {
  const style = layer.relief?.style ?? 'default';
  const cacheKey = `${layer.id}|${layer.urlTemplate}|${style}|${tile.z}/${tile.x}/${tile.y}`;
  const hit = lruGet(textureCache, cacheKey);
  if (hit !== undefined) {
    return hit === null ? { kind: 'missing' } : { kind: 'rgba', data: hit.data, width: hit.width, height: hit.height };
  }

  const nativeMaxZ = Math.min(layer.maximumNativeZ ?? layer.maximumZ, layer.maximumZ);
  const startZ = Math.min(tile.z, nativeMaxZ);
  const halo = Math.min(requiredHalo(DEFAULT_SHADING_OPTIONS), TILE_SIZE);

  for (let sourceZ = startZ; sourceZ >= Math.max(layer.minimumZ, startZ - MAX_ZOOM_FALLBACK, 0); sourceZ--) {
    const shift = tile.z - sourceZ;
    const sx = tile.x >> shift;
    const sy = tile.y >> shift;
    const max = Math.pow(2, sourceZ);
    const tiles = await Promise.all(
      [-1, 0, 1].flatMap((dy) =>
        [-1, 0, 1].map((dx) => {
          const nx = (((sx + dx) % max) + max) % max; // 経度方向は巻き戻す
          const ny = sy + dy;
          if (ny < 0 || ny >= max) return Promise.resolve(null);
          return loadElevation(layer, sourceZ, nx, ny);
        })
      )
    );
    // 中央の通信エラーは確定させない（粗いズームへ落とすと解像度が下がったまま残る）
    if (tiles[4] === undefined) throw new Error('relief dem fetch failed');
    if (tiles[4] === null) continue;

    const rgba = await runInDecodeLane(() => {
      const srcBuffer = assembleWithHalo(
        tiles.map((t) => t ?? null),
        halo,
        TILE_SIZE
      );
      // オーバーズームは標高を子ズームへ引き伸ばしてから描く（段彩ラスタの拡大は階段状になる）
      const buffer =
        shift === 0
          ? srcBuffer
          : upsampleHaloBuffer(srcBuffer, halo, shift, tile.x - (sx << shift), tile.y - (sy << shift), halo, TILE_SIZE);
      const bufferWidth = TILE_SIZE + 2 * halo;
      return style === 'gebco'
        ? computeGebcoRelief(buffer, bufferWidth, halo, TILE_SIZE, tile.z)
        : computeColorRelief(buffer, bufferWidth, halo, TILE_SIZE, metersPerPixel(tile.z, tile.y), tile.z);
    });
    // NoData（陸域・範囲外）はalpha=0のまま残り、下のレイヤが透ける
    const data = new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength);
    lruSet(textureCache, cacheKey, { data, width: TILE_SIZE, height: TILE_SIZE }, MAX_CACHED_TEXTURES);
    return { kind: 'rgba', data, width: TILE_SIZE, height: TILE_SIZE };
  }
  lruSet(textureCache, cacheKey, null, MAX_CACHED_TEXTURES);
  return { kind: 'missing' };
};
