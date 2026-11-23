/**
 * Web眺望の足元標高の取り方（maplibre-glの地形タイルの内部を読む）。
 *
 * maplibreのqueryTerrainElevationは、足元のDEMタイルが未着でも読み込み済みの親タイルの値か、
 * DEMが1枚も無ければ0を返す（nullを返すのは地形そのものが無いときだけ）。
 * これをそのまま足元にすると、2Dから入った直後は海抜0m（山の中）に目が置かれる。
 * そこで足元を覆うDEMタイルが「いまのズームで読むはずの細かさ」で届いているかを先に確かめる。
 */

interface DemTileLike {
  tileID: { canonical: { z: number; x: number; y: number } };
  dem?: unknown;
  /** maplibreのタイル状態（'loading' | 'loaded' | 'errored' など） */
  state?: string;
}

/** maplibre内部の地形タイル管理（型定義に出ていないので必要な分だけ書く） */
export interface TerrainTileInternals {
  deltaZoom: number;
  tileManager: {
    _source: { maxzoom: number };
    getIds: () => string[];
    getTileByID: (id: string) => DemTileLike | undefined;
  };
}

/** 足元の標高を確定させるのに要るDEMタイルの最小ズーム（読み込み中の粗い親タイルは使わない） */
export const requiredFootDemZoom = (mapZoom: number, deltaZoom: number, sourceMaxZoom: number): number =>
  Math.max(0, Math.min(sourceMaxZoom, Math.floor(mapZoom) - deltaZoom - 1));

const tileContains = (z: number, x: number, y: number, latitude: number, longitude: number): boolean => {
  const scale = Math.pow(2, z);
  const tx = ((longitude + 180) / 360) * scale;
  const latRad = (latitude * Math.PI) / 180;
  const ty = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale;
  return Math.floor(tx) === x && Math.floor(ty) === y;
};

/**
 * 足元のDEMの届き具合。
 * - loaded: 標高を確定してよい（必要な細かさで届いた／それより細かいタイルがソースに無いと確定した）
 * - pending: まだ待つ
 * - missing: 足元を覆うDEMが1枚も無いと確定した（外洋など。タイルを待っても来ない）
 */
export type FootDemStatus = 'loaded' | 'pending' | 'missing';

const isPendingState = (state: string | undefined): boolean =>
  state === 'loading' || state === 'reloading' || state === 'expired';

/**
 * 足元を覆うDEMタイルの届き具合を調べる。
 * 内部構造が読めない（maplibreの版が変わった等）ときはloaded（従来どおりqueryTerrainElevationを信じる）
 */
export const footDemStatus = (
  internals: TerrainTileInternals | undefined,
  mapZoom: number,
  latitude: number,
  longitude: number
): FootDemStatus => {
  const manager = internals?.tileManager;
  if (
    internals === undefined ||
    manager === undefined ||
    typeof manager.getIds !== 'function' ||
    typeof manager.getTileByID !== 'function' ||
    typeof manager._source?.maxzoom !== 'number' ||
    typeof internals.deltaZoom !== 'number'
  ) {
    return 'loaded';
  }
  const minZoom = requiredFootDemZoom(mapZoom, internals.deltaZoom, manager._source.maxzoom);
  let bestDemZoom = -1;
  let finestErroredZoom = -1;
  let finestPendingZoom = -1;
  for (const id of manager.getIds()) {
    const tile = manager.getTileByID(id);
    if (tile === undefined) continue;
    const { z, x, y } = tile.tileID.canonical;
    if (!tileContains(z, x, y, latitude, longitude)) continue;
    if (tile.dem) bestDemZoom = Math.max(bestDemZoom, z);
    else if (tile.state === 'errored') finestErroredZoom = Math.max(finestErroredZoom, z);
    else if (isPendingState(tile.state)) finestPendingZoom = Math.max(finestPendingZoom, z);
  }
  if (bestDemZoom >= minZoom) return 'loaded';
  // 細かいタイルが404で無いと確定している地域（国外の粗いDEM）では、maplibreは届いている
  // 親タイルで描く。それより細かいものを読み込み中でなければ、親の値で確定してよい
  // （待っても来ないタイルを待つと、眺望の開始や乗り換えが毎回打ち切りまで待たされる）
  const finerConfirmedMissing = finestErroredZoom > bestDemZoom && finestPendingZoom <= bestDemZoom;
  if (!finerConfirmedMissing) return 'pending';
  return bestDemZoom >= 0 ? 'loaded' : 'missing';
};

/** 足元を覆うDEMタイルが必要な細かさで読み込み済みか（footDemStatusがloaded） */
export const isFootDemLoaded = (
  internals: TerrainTileInternals | undefined,
  mapZoom: number,
  latitude: number,
  longitude: number
): boolean => footDemStatus(internals, mapZoom, latitude, longitude) === 'loaded';

/**
 * 目を置く地面の高さ。海底地形（GEBCO）表示中の海上は負の標高が返るので、海面に立たせる
 * （ネイティブのmoveToVistaと同じ）
 */
export const footGroundElevation = (elevation: number): number => Math.max(0, elevation);

/**
 * Web眺望の目の高さ[m]（誇張込み＝描画上の高さ）。
 * 足元の標高はmaplibreが誇張込みで返すので、地上の高さにも同じ誇張を掛けてそろえる。
 * ネイティブは素の標高＋高さに描画時の倍率をまとめて掛けるので、これで同じ実世界の地上高になる（V-L9）
 * @param groundDrawn 足元の標高（誇張込み）
 * @param heightM 地上からの目の高さ（実世界の値）
 */
export const webVistaEyeAltitude = (groundDrawn: number, heightM: number, exaggeration: number): number =>
  groundDrawn + heightM * exaggeration;
