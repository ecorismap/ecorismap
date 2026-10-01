/**
 * 標高タイル基盤（demSource）のネイティブ/Web共通部分。
 */

/** Mapterhornのタイル寸法[px]。256pxのz(N+1)とzNが同じ画素密度になる */
export const DEM_SOURCE_TILE_SIZE = 512;

export type DemTile = {
  z: number;
  x: number;
  y: number;
  size: number;
  /** 標高[m]（行優先、size×size）。terrariumの負値はクランプしない */
  elev: Float32Array;
  min: number;
  max: number;
};

/** タイル / null=データなし（404） / undefined=通信エラー等（一時的） */
export type DemTileResult = DemTile | null | undefined;

export const demTileKey = (z: number, x: number, y: number): string => `${z}/${x}/${y}`;

export const isValidTile = (z: number, x: number, y: number): boolean => {
  const max = Math.pow(2, z);
  return Number.isInteger(z) && z >= 0 && x >= 0 && y >= 0 && x < max && y < max;
};

/**
 * デコード済み標高の1MB/枚なので枚数を絞る（24枚≒24MB）。
 * 可視領域のグリッド（最大3000画素四方≒7×7枚）は取得中だけ使い、LRUに全部残る必要はない
 */
export const DEM_TILE_CACHE_MAX_ENTRIES = 24;

/**
 * 挿入順LRU＋取得中の重複排除。
 * undefined（一時的な失敗）は記憶せず、次回は取り直す。null（404）は記憶する。
 */
export const createDemTileCache = (maxEntries = DEM_TILE_CACHE_MAX_ENTRIES) => {
  const entries = new Map<string, DemTile | null>();
  const inflight = new Map<string, Promise<DemTileResult>>();

  const peek = (key: string): DemTile | null | undefined => {
    if (!entries.has(key)) return undefined;
    const value = entries.get(key)!;
    entries.delete(key);
    entries.set(key, value);
    return value;
  };

  const set = (key: string, value: DemTile | null): void => {
    entries.set(key, value);
    while (entries.size > maxEntries) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) break;
      entries.delete(oldest);
    }
  };

  const getOrLoad = (key: string, load: () => Promise<DemTileResult>): Promise<DemTileResult> => {
    const hit = peek(key);
    if (hit !== undefined) return Promise.resolve(hit);
    const pending = inflight.get(key);
    if (pending !== undefined) return pending;
    const promise = load()
      .catch((): DemTileResult => undefined)
      .then((result) => {
        if (result !== undefined) set(key, result);
        return result;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, promise);
    return promise;
  };

  const clear = (): void => {
    entries.clear();
  };

  return { peek, getOrLoad, clear };
};

/** 指定タイルを覆う祖先タイル（dz=0なら自身）。データ源が細かいズームを持たない地域で使う */
export type CoveringDemTile = { tile: DemTile; dz: number };

/**
 * 指定タイルを覆う最も細かいタイルを探す。404なら親へ、最大maxDepth段まで降りる
 * （Mapterhornは日本域z16だが、国外の多くはz12前後まで、外洋は全段404）。
 * 指定段が404のときは残りの段をまとめて並列に取りに行く。外洋で1段ずつ待つと
 * 404の往復が段数分積み重なり、長押しの標高表示に数秒かかるため。
 * @returns 見つかったタイルと段差 / null=どの段にも無い / undefined=通信エラー
 */
export const findCoveringDemTile = async (
  getTile: (z: number, x: number, y: number) => Promise<DemTileResult>,
  z: number,
  x: number,
  y: number,
  maxDepth: number
): Promise<CoveringDemTile | null | undefined> => {
  const first = await getTile(z, x, y);
  if (first === undefined) return undefined;
  if (first !== null) return { tile: first, dz: 0 };
  const depths: number[] = [];
  for (let dz = 1; dz <= maxDepth && z - dz >= 0; dz++) depths.push(dz);
  const parents = await Promise.all(depths.map((dz) => getTile(z - dz, x >> dz, y >> dz)));
  // 細かい段から順に見る。より細かい段の通信エラーは、粗い段で静かに置き換えず失敗にする
  for (let i = 0; i < parents.length; i++) {
    const tile = parents[i];
    if (tile === undefined) return undefined;
    if (tile !== null) return { tile, dz: depths[i] };
  }
  return null;
};

/**
 * 祖先タイルから、子タイル(x, y)の範囲を子の寸法へバイリニアで引き伸ばす。
 * dz=0ならそのまま返す。
 */
export const resampleFromAncestor = (covering: CoveringDemTile, x: number, y: number): Float32Array => {
  const { tile, dz } = covering;
  if (dz === 0) return tile.elev;
  const size = tile.size;
  const scale = 1 << dz;
  const span = size / scale;
  const originX = (x - ((x >> dz) << dz)) * span;
  const originY = (y - ((y >> dz) << dz)) * span;
  const out = new Float32Array(size * size);
  const src = tile.elev;
  for (let row = 0; row < size; row++) {
    // 画素中心どうしを対応させる
    const fy = Math.min(Math.max(originY + (row + 0.5) / scale - 0.5, 0), size - 1);
    const y0 = Math.floor(fy);
    const y1 = Math.min(y0 + 1, size - 1);
    const ty = fy - y0;
    for (let col = 0; col < size; col++) {
      const fx = Math.min(Math.max(originX + (col + 0.5) / scale - 0.5, 0), size - 1);
      const x0 = Math.floor(fx);
      const x1 = Math.min(x0 + 1, size - 1);
      const tx = fx - x0;
      const top = src[y0 * size + x0] * (1 - tx) + src[y0 * size + x1] * tx;
      const bottom = src[y1 * size + x0] * (1 - tx) + src[y1 * size + x1] * tx;
      out[row * size + col] = top * (1 - ty) + bottom * ty;
    }
  }
  return out;
};
