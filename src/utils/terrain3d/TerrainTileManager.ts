/**
 * 可視タイル集合の管理（WebGPU版）。
 *
 * カメラ注視点を中心にheading方向へ偏らせたリング状のタイル集合を決め、
 * DEMテクスチャの確保→レイヤ毎のテクスチャ解決を非同期で行う。
 * ジオメトリは全タイル共有（sharedGridMesh）なのでタイル毎には作らない。
 * DEMが揃った時点でタイルを描画対象にし、レイヤテクスチャは到着次第差し込む
 * （テクスチャ待ちで地形の初表示を遅らせない）。
 * ズーム切替時は新ズームのタイルが揃うまで旧ズームのタイルを残して段差を隠す。
 */
import { DEM_RANGE_BLOCKS, DEM_TILE_SIZE } from '../demTileProvider';
import {
  MAX_PARENT_TILE_LEVELS,
  MAX_TERRAIN_LAYERS,
  MAX_TILES,
  MESH_SEGMENTS,
  NEAR_RING_FORWARD_BIAS,
  TILE_LOAD_CONCURRENCY,
  TILE_RETAIN_MS,
  TILE_RETAIN_RATIO,
} from './constants';
import {
  latToTileYFloat,
  lonLatToMercator,
  lonToTileXFloat,
  MERCATOR_CIRCUMFERENCE,
  MercatorPoint,
  tileSizeMeters,
  tileToMercator,
} from './coords';
import { clampDemZoom, sampleNearest } from './demProvider';
import { DemTextureCache, DemTextureEntry } from './demTextureCache';
import { createLayerTextureRef, LayerTextureRef, releaseLayerTexture, retainLayerTexture } from './layerTextureRef';
import { parentTileKey, parentTileUv } from './parentTile';
import { interpolateGridCell } from './sharedGridMesh';
import { loadTileAsRgba, loadTileImageBitmap, resolveTileTexture } from './tileTextureLoader';
import { TerrainRenderer, TileDrawPass } from './TerrainRenderer';
import { LayerSpec, TileKey } from './types';

interface TileEntry {
  key: TileKey;
  state: 'loading' | 'ready' | 'failed';
  /** DEMテクスチャの参照（disposeTileでreleaseする） */
  dem: DemTextureEntry | null;
  pass: TileDrawPass | null;
  /** 可視範囲から外れた時刻。範囲内はnull（猶予付き破棄の判定に使う） */
  staleSince: number | null;
}

const keyString = (t: TileKey): string => `${t.z}/${t.x}/${t.y}`;

/** 全レイヤ等倍（自前のタイル画像を等倍で引く）のUV矩形 */
const identityLayerUv = (): Float32Array => {
  const uv = new Float32Array(MAX_TERRAIN_LAYERS * 4);
  for (let i = 0; i < MAX_TERRAIN_LAYERS; i++) uv[i * 4 + 2] = 1;
  return uv;
};

/**
 * スカート（タイル外周の垂れ壁）の底の高さ[m]。
 *
 * 「このテクスチャタイルが占める範囲」の最低標高から、起伏に比例した量だけ落とした
 * 一定の高さに底を置く。DEM全体の範囲で決めるとオーバーズーム時に無関係な谷や山を
 * 拾って壁が極端に深くなり、地平線に縦縞として見えてしまう。
 *
 * @param dem DEMテクスチャ（4x4ブロックの標高範囲を持つ）
 * @param originPx タイルがDEM内で占める矩形の左上[画素]
 * @param spanPx 同じく一辺[画素]
 */
const tileElevRange = (
  dem: DemTextureEntry,
  originPx: number,
  originPy: number,
  spanPx: number
): { minElev: number; maxElev: number } => {
  const n = DEM_RANGE_BLOCKS;
  const blockPx = DEM_TILE_SIZE / n;
  const bx0 = Math.max(0, Math.min(n - 1, Math.floor(originPx / blockPx)));
  const by0 = Math.max(0, Math.min(n - 1, Math.floor(originPy / blockPx)));
  const bx1 = Math.max(bx0, Math.min(n - 1, Math.ceil((originPx + spanPx) / blockPx) - 1));
  const by1 = Math.max(by0, Math.min(n - 1, Math.ceil((originPy + spanPx) / blockPx) - 1));
  let minElev = Infinity;
  let maxElev = -Infinity;
  for (let by = by0; by <= by1; by++) {
    for (let bx = bx0; bx <= bx1; bx++) {
      const b = by * n + bx;
      if (dem.blockMin[b] < minElev) minElev = dem.blockMin[b];
      if (dem.blockMax[b] > maxElev) maxElev = dem.blockMax[b];
    }
  }
  return Number.isFinite(minElev) ? { minElev, maxElev } : { minElev: 0, maxElev: 0 };
};

const skirtBottomElev = (minElev: number, maxElev: number): number =>
  minElev - Math.max(30, (maxElev - minElev) * 0.3);

export class TerrainTileManager {
  private tiles = new Map<string, TileEntry>();
  private layers: LayerSpec[] = [];
  private layerOpacity = new Float32Array(MAX_TERRAIN_LAYERS);
  private origin: MercatorPoint;
  /** 標高の表示倍率（exaggeration×1/cos(lat0)）。スカート底の算出に使う */
  private elevScale: number;
  private renderer: TerrainRenderer;
  private demCache: DemTextureCache;
  private onDirty: () => void;
  /**
   * 参照するDEMをタイルズームから何段粗くするか（遠景リング用）。
   *
   * 遠景はタイル一辺が2^Δ倍あるためDEM配信の上限(z14)を超えず、そのままだと
   * タイル1枚につきDEM1枚＝最大80枚をデコードすることになる。2段落とすと
   * 4^2=16タイルが1枚のDEMを共有でき、デコード枚数が桁で減る。
   * 地形の形は粗くなるが、遠景はフォグの中で画面上も小さいので差は見えにくい。
   */
  private demZoomOffset: number;
  /** タイル集合の中心を進行方向へずらす割合（遠景は0＝回転で集合が変わらない） */
  private forwardBias: number;
  /** このリングのメッシュ分割数。標高サンプリングを描画と一致させるために要る */
  private meshSegments: number;
  /** 現在表示中のズーム。切替時は新集合が揃うまで旧タイルを残す */
  private activeZoom: number | null = null;
  /** 直近のupdateVisibleTilesで要求されたズーム（標高サンプリングのキー計算に使う） */
  private lastTexZoom: number | null = null;
  private inFlight = 0;
  private queue: (() => Promise<void>)[] = [];
  private generation = 0;
  private disposed = false;
  /**
   * 描画パスのキャッシュ。タイル集合やready状態が変わったときだけ作り直す
   * （毎フレームの配列生成がそのままフレーム時間に乗るため）
   */
  private cachedPasses: TileDrawPass[] | null = null;
  /**
   * タイルがreadyになるたびに進む世代番号。
   * 「標高が取れずに作り直しを待っているオーバーレイ」を、実際に新しい標高が
   * 使えるようになった時だけ起こすために使う（時間でのポーリングをやめるため）。
   * 破棄では進めない（パンのたびに再構築が走ってしまう）
   */
  private readyGen = 0;
  /** 開発時の診断: 直近のsampleElevationがどのタイル・DEMから取ったか */
  lastSampleInfo = '';
  /** 開発時の診断: 親タイルを借りて描き始めたタイルの累計数 */
  borrowedCount = 0;
  /** 開発時の診断: 「今この瞬間に親を借りている枚数/自前の絵がある枚数/絵が無い枚数」＋累計 */
  get textureStats(): string {
    let borrowed = 0;
    let own = 0;
    let none = 0;
    for (const entry of this.tiles.values()) {
      const pass = entry.pass;
      if (pass === null) continue;
      if (!pass.hasTexture) none++;
      else if (pass.ownTextures) own++;
      else borrowed++;
    }
    return `${borrowed}/${own}/${none}+${this.borrowedCount}`;
  }
  /**
   * 親タイルのテクスチャを全リング横断で探す。
   *
   * 遠景リングはFAR_RING_DELTAS段粗いタイルを常時持っているので、
   * 近景タイルの親としてそのまま使える。TerrainSceneが全マネージャを束ねて渡す
   */
  findLayerTexture: (key: TileKey, layerIndex: number) => LayerTextureRef | null = (key, layerIndex) =>
    this.findOwnLayerTexture(key, layerIndex);

  constructor(
    origin: MercatorPoint,
    elevScale: number,
    renderer: TerrainRenderer,
    demCache: DemTextureCache,
    onDirty: () => void,
    demZoomOffset = 0,
    forwardBias = NEAR_RING_FORWARD_BIAS,
    meshSegments = MESH_SEGMENTS
  ) {
    this.origin = origin;
    this.elevScale = elevScale;
    this.renderer = renderer;
    this.demCache = demCache;
    this.onDirty = onDirty;
    this.demZoomOffset = demZoomOffset;
    this.forwardBias = forwardBias;
    this.meshSegments = meshSegments;
  }

  setLayers(layers: LayerSpec[]): void {
    this.layers = layers.slice(0, MAX_TERRAIN_LAYERS);
    this.layerOpacity.fill(0);
    this.layers.forEach((layer, i) => {
      this.layerOpacity[i] = layer.opacity;
    });
    // レイヤ構成が変わったら全タイルを作り直す
    this.generation++;
    this.disposeAllTiles();
    this.activeZoom = null;
  }

  /** レイヤスロット数（全タイル共通。シェーダの合成ループ長になる） */
  get layerCount(): number {
    return this.layers.length;
  }

  /** レイヤ毎の不透明度（長さMAX_TERRAIN_LAYERS） */
  get layerOpacities(): Float32Array {
    return this.layerOpacity;
  }

  /** タイルがreadyになるたびに進む世代番号（オーバーレイ再構築の要否判定に使う） */
  get readyGeneration(): number {
    return this.readyGen;
  }

  /** カメラ状態から必要タイルを判定し、取得をスケジュールする */
  updateVisibleTiles(
    latitude: number,
    longitude: number,
    headingDeg: number,
    texZoom: number,
    radiusMeters: number,
    maxTiles: number = MAX_TILES
  ): void {
    if (this.disposed) return;
    this.lastTexZoom = texZoom;
    const needed = computeTileRing(
      latitude,
      longitude,
      headingDeg,
      texZoom,
      radiusMeters,
      maxTiles,
      this.forwardBias
    );
    const neededKeys = new Set(needed.map(keyString));

    // 不要タイルの破棄。ズーム切替中は旧ズームのreadyタイルを残す。
    // failedは「待っても来ない」ので完了扱いにする。さもないと1枚の通信失敗で
    // 旧ズームが無期限に残り（下の分岐でstaleSinceも付かない）、activeZoomも進まなくなる
    const newZoomReady = needed.every((t) => {
      const state = this.tiles.get(keyString(t))?.state;
      return state === 'ready' || state === 'failed';
    });
    const now = Date.now();
    const retainLimit = Math.ceil(maxTiles * TILE_RETAIN_RATIO);
    // 同じズームで範囲から外れただけのタイルは猶予付きで持っておく（回転の往復で作り直さない）
    const retained: { key: string; since: number }[] = [];
    for (const [k, entry] of this.tiles) {
      if (neededKeys.has(k)) {
        entry.staleSince = null;
        continue;
      }
      const isOldZoom = this.activeZoom !== null && entry.key.z === this.activeZoom && entry.key.z !== texZoom;
      if (isOldZoom && !newZoomReady && entry.state === 'ready') continue;
      // ズームが違うタイルは溜めない（別ズームのタイルが積み上がるのを防ぐ）
      if (entry.key.z !== texZoom) {
        this.disposeTile(k);
        continue;
      }
      if (entry.staleSince === null) entry.staleSince = now;
      retained.push({ key: k, since: entry.staleSince });
    }
    // 猶予切れ、または枚数が上限を超えた分を古い順に捨てる
    retained.sort((a, b) => a.since - b.since);
    for (const { key, since } of retained) {
      if (now - since < TILE_RETAIN_MS && this.tiles.size <= retainLimit) continue;
      this.disposeTile(key);
    }
    if (newZoomReady && needed.length > 0) this.activeZoom = texZoom;

    // 新規タイルのロード（computeTileRingが中心に近い順で返す）
    for (const tile of needed) {
      const k = keyString(tile);
      if (this.tiles.has(k)) continue;
      const entry: TileEntry = { key: tile, state: 'loading', dem: null, pass: null, staleSince: null };
      this.tiles.set(k, entry);
      this.enqueue(() => this.loadTile(entry));
    }
  }

  /** 描画パス一覧（1タイル1パス） */
  buildDrawPasses(): TileDrawPass[] {
    if (this.cachedPasses !== null) return this.cachedPasses;
    const passes: TileDrawPass[] = [];
    for (const entry of this.tiles.values()) {
      if (entry.state !== 'ready' || entry.pass === null) continue;
      passes.push(entry.pass);
    }
    this.cachedPasses = passes;
    return passes;
  }

  /** 描画可能なタイルを1枚でも持っているか（遠景リングのロード開始判定用） */
  hasReadyTiles(): boolean {
    for (const entry of this.tiles.values()) {
      if (entry.state === 'ready') return true;
    }
    return false;
  }

  /**
   * 表示中タイルが覆う地点の標高を同期サンプリングする（覆っていなければnull）。
   *
   * **描画されている地形と同じ高さを返すことが肝心**。頂点シェーダは
   * メッシュ格子の頂点でDEMを最近傍サンプリングし、三角形の内側はその頂点値を
   * 補間して面にしている。ここでDEMを直接引くと、格子で均された地形とは
   * 別の高さになり、ドットが地形から浮いたり沈んだりして見える。
   * そこで同じ手順（格子頂点で最近傍 → 格子内を補間）を踏む
   */
  sampleElevation(latitude: number, longitude: number): number | null {
    const merc = lonLatToMercator(longitude, latitude);
    return this.sampleElevationAtMercator(merc.mx, merc.my);
  }

  /**
   * メルカトル座標で直接引く版（遮蔽判定のレイマーチ用）。
   *
   * タイル座標はメルカトルから四則演算だけで出る（対数・逆正接を通らない）。
   * 視線1本につき最大96点を見るので、1サンプルあたりの三角関数往復が効いてくる
   */
  sampleElevationAtMercator(mx: number, my: number): number | null {
    const z = this.coveredZoomAtMercator(mx, my);
    if (z === null) return null;
    const scale = Math.pow(2, z);
    const txf = (mx / MERCATOR_CIRCUMFERENCE + 0.5) * scale;
    const tyf = (0.5 - my / MERCATOR_CIRCUMFERENCE) * scale;
    const tileX = Math.floor(txf);
    const tileY = Math.floor(tyf);
    const entry = this.tiles.get(`${z}/${tileX}/${tileY}`);
    const pass = entry?.pass;
    if (pass === null || pass === undefined || entry === undefined) return null;
    const originPx = pass.demParams[0];
    const originPy = pass.demParams[1];
    const spanPx = pass.demParams[2];
    // DEMなしのタイル（demParamsが全0）は平らな0m
    if (spanPx === 0) return 0;
    // 描画に使っているテクスチャと同じエントリから標高を引く。
    // 別のLRUに預けると寿命がずれ、地形は描けているのにドットだけ消える。
    // ソース（GSI/terrarium）の取り違えも構造的に起きない
    const elev = entry.dem?.elev;
    if (elev === undefined || elev === null) return null;

    if (__DEV__) {
      const demZoom = clampDemZoom(z - this.demZoomOffset);
      this.lastSampleInfo = `z${z} dem${demZoom} seg${this.meshSegments} span${spanPx.toFixed(0)}`;
    }
    const seg = this.meshSegments;
    const gu = (txf - tileX) * seg;
    const gv = (tyf - tileY) * seg;
    const i = Math.max(0, Math.min(seg - 1, Math.floor(gu)));
    const j = Math.max(0, Math.min(seg - 1, Math.floor(gv)));
    const fu = gu - i;
    const fv = gv - j;
    const vertexElev = (gi: number, gj: number): number => {
      const v = sampleNearest(elev, originPx + (gi / seg) * spanPx, originPy + (gj / seg) * spanPx);
      // NoDataはシェーダと同じくタイル最低標高へ丸める（decodeElevの x == 8388608u と同じ扱い）。
      // ここを0mにすると、内陸の欠測を含む山地タイルで標高が丸ごと落ち、
      // ドットだけが数百m沈んで別の場所に見える
      return Number.isNaN(v) ? pass.noDataElev : v;
    };
    return interpolateGridCell(
      vertexElev(i, j),
      vertexElev(i + 1, j),
      vertexElev(i, j + 1),
      vertexElev(i + 1, j + 1),
      fu,
      fv
    );
  }

  /**
   * その地点を覆っている「描画中の」タイルのズーム（覆っていなければnull）。
   * 表示中のズームを優先し、要求だけ新しいズームは後回しにする
   */
  private coveredZoomAtMercator(mx: number, my: number): number | null {
    const zooms = this.activeZoom === null ? [] : [this.activeZoom];
    if (this.lastTexZoom !== null && this.lastTexZoom !== this.activeZoom) zooms.push(this.lastTexZoom);
    for (const z of zooms) {
      const scale = Math.pow(2, z);
      const x = Math.floor((mx / MERCATOR_CIRCUMFERENCE + 0.5) * scale);
      const y = Math.floor((0.5 - my / MERCATOR_CIRCUMFERENCE) * scale);
      if (this.tiles.get(`${z}/${x}/${y}`)?.state === 'ready') return z;
    }
    return null;
  }

  dispose(): void {
    this.disposed = true;
    this.generation++;
    this.queue = [];
    this.disposeAllTiles();
  }

  /** 描画パスのキャッシュを破棄する（タイル集合・ready状態の変化時） */
  private invalidatePasses(): void {
    this.cachedPasses = null;
  }

  private enqueue(job: () => Promise<void>): void {
    this.queue.push(job);
    this.pump();
  }

  private pump(): void {
    while (this.inFlight < TILE_LOAD_CONCURRENCY && this.queue.length > 0) {
      const job = this.queue.shift()!;
      this.inFlight++;
      job()
        .catch(() => undefined)
        .finally(() => {
          this.inFlight--;
          this.pump();
        });
    }
  }

  private async loadTile(entry: TileEntry): Promise<void> {
    const gen = this.generation;
    const k = keyString(entry.key);
    const stale = () => gen !== this.generation || this.tiles.get(k) !== entry;
    try {
      // キュー待ちの間に破棄・世代交代されたジョブは、DEMを取りに行く前に捨てる。
      // ここを通してしまうと、もう描かないタイルの展開が直列デコードレーンを占有する
      if (stale()) return;
      // 1) DEM: テクスチャが確保できた時点で地形を描き始める（レイヤテクスチャは待たない）
      const demZoom = clampDemZoom(entry.key.z - this.demZoomOffset);
      const dz = entry.key.z - demZoom;
      const demX = entry.key.x >> dz;
      const demY = entry.key.y >> dz;
      const dem = await this.demCache.acquire(demZoom, demX, demY);
      if (stale()) {
        this.demCache.release(dem);
        return;
      }
      if (dem.state === 'error') {
        entry.state = 'failed';
        return;
      }
      entry.dem = dem;
      entry.pass = this.buildPass(entry.key, dem, demX, demY, dz);
      // タイル画像の通信を待たずに、親タイルを引き伸ばして先に絵を出す
      this.borrowParentTextures(entry);
      entry.state = 'ready';
      this.readyGen++;
      this.invalidatePasses();
      this.onDirty();
      // 標高はdem.elevとしてテクスチャと一緒に届いているので、
      // ここで別途デコードを温める必要はない（readyになった時点で必ず引ける）

      // 2) レイヤテクスチャ: 直列に待つと1タイルの完成がレイヤ数分の往復になるため並列で解決する
      if (this.layers.length === 0) return;
      const layers = this.layers;
      const resolved = await Promise.all(layers.map((layer) => this.resolveTexture(layer, entry.key)));
      if (stale()) {
        resolved.forEach((t) => t !== null && this.renderer.deleteTexture(t));
        return;
      }
      // 借りていた親タイルを返し、自前のテクスチャへ等倍で差し替える
      this.releaseLayerTextures(entry.pass);
      entry.pass.layerTextures = resolved.map((t) => (t === null ? null : createLayerTextureRef(t)));
      entry.pass.layerUv = identityLayerUv();
      entry.pass.ownTextures = true;
      entry.pass.hasTexture = resolved.some((t) => t !== null);
      // テクスチャが差し替わったのでレンダラーが作ったバインドグループを捨てさせる
      entry.pass.bindGroup = undefined;
      this.onDirty();
    } catch {
      if (!stale()) entry.state = 'failed';
    }
  }

  /** タイルの描画パラメータ（uniform値）を前計算する */
  private buildPass(
    key: TileKey,
    dem: DemTextureEntry,
    demX: number,
    demY: number,
    dz: number
  ): TileDrawPass {
    const { mx: tileMx, my: tileMy } = tileToMercator(key.z, key.x, key.y);
    const size = tileSizeMeters(key.z);
    // オーバーズーム時は親DEMの部分矩形を参照する（z15はDEMの1/2、z16は1/4）
    const scale = Math.pow(2, dz);
    const span = DEM_TILE_SIZE / scale;
    const originPx = (key.x - demX * scale) * span;
    const originPy = (key.y - demY * scale) * span;
    // ローカル座標: x=東（メルカトルX差）、z=南（メルカトルY差の符号反転）。
    // 原点差し引きはfloat32のジッタを避けるためここ（double）で行う
    const { minElev, maxElev } = tileElevRange(dem, originPx, originPy, span);
    const skirtBottom = skirtBottomElev(minElev, maxElev);
    const tileParams = new Float32Array([
      tileMx - this.origin.mx,
      this.origin.my - tileMy,
      size,
      skirtBottom * this.elevScale,
    ]);
    const demParams =
      dem.state === 'ready'
        ? new Float32Array([
            originPx,
            originPy,
            span,
            dem.encoding === 'terrarium' ? 1 : 0,
          ])
        : // データなし（海上・提供範囲外）は1x1のゼロテクスチャを幅0で参照して標高0mの平面にする
          new Float32Array([0, 0, 0, 0]);
    return {
      tileParams,
      demParams,
      // NoData画素はタイル範囲の最低標高へ丸める（旧実装と同じ。0mにすると内陸の欠測が
      // 深い縦穴になり、遠景で壁のテクスチャが縦縞として見える）
      noDataElev: minElev,
      demTexture: dem.texture ?? this.renderer.zeroDem,
      layerTextures: new Array<LayerTextureRef | null>(this.layers.length).fill(null),
      layerUv: identityLayerUv(),
      ownTextures: false,
      hasTexture: false,
    };
  }

  /**
   * このタイルのレイヤテクスチャを、自分の座標で保持しているタイルから探す。
   * 親を借りた「又貸し」は返さない（孫のUV計算が親のズーム前提で狂うため）
   */
  findOwnLayerTexture(key: TileKey, layerIndex: number): LayerTextureRef | null {
    const entry = this.tiles.get(keyString(key));
    const pass = entry?.pass;
    if (pass === undefined || pass === null || !pass.ownTextures) return null;
    return pass.layerTextures[layerIndex] ?? null;
  }

  /**
   * タイル画像が届くまでの仮表示として、親タイル（粗ズーム）のテクスチャを借りる。
   *
   * DEMが取れた直後に同期で走るので、タイル画像の通信を待たずに絵が出る。
   * 親は近景リングに残っている1段上のタイルか、遠景リング（FAR_RING_DELTAS）のタイル。
   * 見つからなければ従来どおり灰色（fillBase）になる
   */
  private borrowParentTextures(entry: TileEntry): void {
    const pass = entry.pass;
    if (pass === null || this.layers.length === 0 || MAX_PARENT_TILE_LEVELS <= 0) return;
    for (let i = 0; i < this.layers.length; i++) {
      for (let dz = 1; dz <= MAX_PARENT_TILE_LEVELS; dz++) {
        const parentZ = entry.key.z - dz;
        if (parentZ < 0) break;
        const pk = parentTileKey(entry.key.z, entry.key.x, entry.key.y, parentZ);
        const uv = parentTileUv(entry.key.z, entry.key.x, entry.key.y, parentZ);
        if (pk === null || uv === null) break;
        const ref = this.findLayerTexture({ z: parentZ, x: pk.x, y: pk.y }, i);
        if (ref === null) continue;
        pass.layerTextures[i] = retainLayerTexture(ref);
        pass.layerUv[i * 4] = uv.offsetU;
        pass.layerUv[i * 4 + 1] = uv.offsetV;
        pass.layerUv[i * 4 + 2] = uv.scale;
        if (!pass.hasTexture) this.borrowedCount++;
        pass.hasTexture = true;
        break;
      }
    }
  }

  private async resolveTexture(layer: LayerSpec, tile: TileKey): Promise<GPUTexture | null> {
    try {
      const source = await resolveTileTexture(layer, tile);
      if (source.kind === 'localUri') {
        const bitmap = await loadTileImageBitmap(source.uri);
        if (bitmap !== null) return this.renderer.createTextureFromImageBitmap(bitmap);
        // ネイティブデコード不可 → JSデコードへフォールバック（PNGのみ）
        const rgba = await loadTileAsRgba(source.uri);
        if (rgba.kind === 'rgba') return this.renderer.createTextureFromRgba(rgba.data, rgba.width, rgba.height);
        return null;
      }
      if (source.kind === 'rgba') return this.renderer.createTextureFromRgba(source.data, source.width, source.height);
      return null;
    } catch {
      return null; // 通信エラー。欠けたまま（タイル再構築時に再試行）
    }
  }

  private disposeTile(k: string): void {
    const entry = this.tiles.get(k);
    if (!entry) return;
    this.tiles.delete(k);
    this.invalidatePasses();
    // 描く中身が変わったので再描画を要求する。
    // ズーム切替の完了（旧ズームの破棄）でもここを通るため、
    // 描き直しと同時にポイントの再投影も走り、古い標高のまま取り残されない
    this.onDirty();
    this.demCache.release(entry.dem);
    // 子タイルが親として借りている間は破棄されない（参照が0になったときだけ実際に消える）
    this.releaseLayerTextures(entry.pass);
  }

  private releaseLayerTextures(pass: TileDrawPass | null): void {
    if (pass === null) return;
    pass.layerTextures.forEach((ref) => releaseLayerTexture(ref, (t) => this.renderer.deleteTexture(t)));
    pass.layerTextures.fill(null);
  }

  private disposeAllTiles(): void {
    for (const k of [...this.tiles.keys()]) this.disposeTile(k);
  }
}

/**
 * 注視点を中心にheading方向（画面奥）へ30%偏らせた円内のタイルを近い順に返す（上限MAX_TILES）。
 * 純関数としてexport（ユニットテスト用）。
 */
export const computeTileRing = (
  latitude: number,
  longitude: number,
  headingDeg: number,
  texZoom: number,
  radiusMeters: number,
  maxTiles: number = MAX_TILES,
  forwardBias: number = NEAR_RING_FORWARD_BIAS
): TileKey[] => {
  const size = tileSizeMeters(texZoom);
  const h = (headingDeg * Math.PI) / 180;
  // 前方（北=タイルY負方向が基準。headingで回転）へリング中心をずらす。
  // biasが0なら中心対称＝回転しても同じ集合になる
  const forwardTilesX = (Math.sin(h) * radiusMeters * forwardBias) / size;
  const forwardTilesY = -(Math.cos(h) * radiusMeters * forwardBias) / size;
  const centerTileX = lonToTileXFloat(longitude, texZoom) + forwardTilesX;
  const centerTileY = latToTileYFloat(latitude, texZoom) + forwardTilesY;
  const radiusTiles = radiusMeters / size;
  const max = Math.pow(2, texZoom);

  const candidates: { key: TileKey; dist: number }[] = [];
  const range = Math.ceil(radiusTiles) + 1;
  const baseX = Math.floor(centerTileX);
  const baseY = Math.floor(centerTileY);
  for (let dy = -range; dy <= range; dy++) {
    for (let dx = -range; dx <= range; dx++) {
      const x = baseX + dx;
      const y = baseY + dy;
      if (x < 0 || y < 0 || x >= max || y >= max) continue;
      const dist = Math.hypot(x + 0.5 - centerTileX, y + 0.5 - centerTileY);
      if (dist > radiusTiles + 0.5) continue;
      candidates.push({ key: { z: texZoom, x, y }, dist });
    }
  }
  candidates.sort((a, b) => a.dist - b.dist);
  return candidates.slice(0, maxTiles).map((c) => c.key);
};
