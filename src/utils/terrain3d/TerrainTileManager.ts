/**
 * 可視タイル集合の管理（素のWebGL版）。
 *
 * カメラ注視点を中心にheading方向へ偏らせたリング状のタイル集合を決め、
 * 標高グリッド取得→ジオメトリ生成→レイヤ毎のテクスチャ解決を非同期で行い、
 * GPUリソース（VAO/テクスチャ）としてTerrainRendererに登録する。
 * ズーム切替時は新ズームのタイルが揃うまで旧ズームのタイルを残して段差を隠す。
 */
import { MAX_TILES, MESH_SEGMENTS, TILE_LOAD_CONCURRENCY } from './constants';
import { latToTileYFloat, lonToTileXFloat, MercatorPoint, tileSizeMeters } from './coords';
import { clampDemZoom, fetchTileElevationGrid } from './demProvider';
import { buildTileGeometry } from './demMeshBuilder';
import { loadTileAsRgba, resolveTileTexture } from './tileTextureLoader';
import { DrawPass, TerrainRenderer, TileGpuResources } from './TerrainRenderer';
import { LayerSpec, TileKey } from './types';

interface TileLayerTexture {
  texture: WebGLTexture | null;
  opacity: number;
}

interface TileEntry {
  key: TileKey;
  resources: TileGpuResources | null;
  layerTextures: TileLayerTexture[];
  state: 'loading' | 'ready' | 'failed';
  /** 標高グリッド（(MESH_SEGMENTS+1)^2）。標高サンプリングに使う */
  grid: Float32Array | null;
}

const keyString = (t: TileKey): string => `${t.z}/${t.x}/${t.y}`;

export class TerrainTileManager {
  private tiles = new Map<string, TileEntry>();
  private layers: LayerSpec[] = [];
  private origin: MercatorPoint;
  private elevScale: number;
  private renderer: TerrainRenderer;
  private onDirty: () => void;
  /** 現在表示中のズーム。切替時は新集合が揃うまで旧タイルを残す */
  private activeZoom: number | null = null;
  private inFlight = 0;
  private queue: (() => Promise<void>)[] = [];
  private generation = 0;
  private disposed = false;

  constructor(origin: MercatorPoint, elevScale: number, renderer: TerrainRenderer, onDirty: () => void) {
    this.origin = origin;
    this.elevScale = elevScale;
    this.renderer = renderer;
    this.onDirty = onDirty;
  }

  setLayers(layers: LayerSpec[]): void {
    this.layers = layers;
    // レイヤ構成が変わったら全タイルを作り直す
    this.generation++;
    this.disposeAllTiles();
    this.activeZoom = null;
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
    const needed = computeTileRing(latitude, longitude, headingDeg, texZoom, radiusMeters, maxTiles);
    const neededKeys = new Set(needed.map(keyString));

    // 不要タイルの破棄。ズーム切替中は旧ズームのreadyタイルを残す
    const newZoomReady = needed.every((t) => this.tiles.get(keyString(t))?.state === 'ready');
    for (const [k, entry] of this.tiles) {
      if (neededKeys.has(k)) continue;
      const isOldZoom = this.activeZoom !== null && entry.key.z === this.activeZoom && entry.key.z !== texZoom;
      if (isOldZoom && !newZoomReady && entry.state === 'ready') continue;
      this.disposeTile(k);
    }
    if (newZoomReady && needed.length > 0) this.activeZoom = texZoom;

    // 新規タイルのロード（computeTileRingが中心に近い順で返す）
    for (const tile of needed) {
      const k = keyString(tile);
      if (this.tiles.has(k)) continue;
      const entry: TileEntry = { key: tile, resources: null, layerTextures: [], state: 'loading', grid: null };
      this.tiles.set(k, entry);
      this.enqueue(() => this.loadTile(entry));
    }
  }

  /** 描画パス一覧（タイル×レイヤ、レイヤ昇順） */
  buildDrawPasses(): DrawPass[] {
    const passes: DrawPass[] = [];
    for (const entry of this.tiles.values()) {
      if (entry.state !== 'ready' || entry.resources === null) continue;
      if (entry.layerTextures.length === 0) {
        passes.push({ resources: entry.resources, texture: null, opacity: 1, layerIndex: 0 });
        continue;
      }
      entry.layerTextures.forEach((layerTexture, i) => {
        passes.push({
          resources: entry.resources!,
          texture: layerTexture.texture,
          opacity: layerTexture.opacity,
          layerIndex: i,
        });
      });
    }
    // レイヤ0を全タイル描いてからレイヤ1…の順（透過の重なりを正しくする）
    passes.sort((a, b) => a.layerIndex - b.layerIndex);
    return passes;
  }

  /** 表示中タイルの標高グリッドから同期サンプリング（なければnull） */
  sampleElevation(latitude: number, longitude: number): number | null {
    for (const entry of this.tiles.values()) {
      if (entry.state !== 'ready' || entry.grid === null) continue;
      const { z, x, y } = entry.key;
      const fx = lonToTileXFloat(longitude, z) - x;
      const fy = latToTileYFloat(latitude, z) - y;
      if (fx < 0 || fx >= 1 || fy < 0 || fy >= 1) continue;
      const side = MESH_SEGMENTS + 1;
      const col = Math.min(MESH_SEGMENTS, Math.round(fx * MESH_SEGMENTS));
      const row = Math.min(MESH_SEGMENTS, Math.round(fy * MESH_SEGMENTS));
      const v = entry.grid[row * side + col];
      return Number.isNaN(v) ? 0 : v;
    }
    return null;
  }

  dispose(): void {
    this.disposed = true;
    this.generation++;
    this.queue = [];
    this.disposeAllTiles();
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
    try {
      const demZoom = clampDemZoom(entry.key.z);
      const grid = await fetchTileElevationGrid(entry.key, demZoom, MESH_SEGMENTS);
      if (gen !== this.generation || !this.tiles.has(k)) return;
      if (grid === null) {
        entry.state = 'failed';
        return;
      }

      // テクスチャを先に非同期で解決してから、GLリソースをまとめて作る
      const layerTextures: TileLayerTexture[] = [];
      for (const layer of this.layers) {
        const texture = await this.resolveTexture(layer, entry.key);
        if (gen !== this.generation || !this.tiles.has(k)) {
          layerTextures.forEach((t) => t.texture && this.renderer.deleteTexture(t.texture));
          return;
        }
        if (texture !== null) layerTextures.push({ texture, opacity: layer.opacity });
      }

      const data = buildTileGeometry(grid, entry.key, this.origin, this.elevScale, MESH_SEGMENTS);
      entry.resources = this.renderer.createTileResources(data);
      entry.layerTextures = layerTextures;
      entry.grid = grid;
      entry.state = 'ready';
      this.onDirty();
    } catch {
      entry.state = 'failed';
    }
  }

  private async resolveTexture(layer: LayerSpec, tile: TileKey): Promise<WebGLTexture | null> {
    try {
      const source = await resolveTileTexture(layer, tile);
      if (source.kind === 'localUri') {
        try {
          return this.renderer.createTextureFromLocalUri(source.uri, source.width, source.height);
        } catch {
          // ネイティブデコード不可 → JSデコードへフォールバック（PNGのみ）
          const rgba = await loadTileAsRgba(source.uri);
          if (rgba.kind === 'rgba') return this.renderer.createTextureFromRgba(rgba.data, rgba.width, rgba.height);
          return null;
        }
      }
      if (source.kind === 'rgba') return this.renderer.createTextureFromRgba(source.data, source.width, source.height);
      return null;
    } catch {
      return null; // 通信エラー。v1では欠けたまま（タイル再構築時に再試行）
    }
  }

  private disposeTile(k: string): void {
    const entry = this.tiles.get(k);
    if (!entry) return;
    this.tiles.delete(k);
    if (entry.resources) this.renderer.deleteTileResources(entry.resources);
    entry.layerTextures.forEach((t) => t.texture && this.renderer.deleteTexture(t.texture));
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
  maxTiles: number = MAX_TILES
): TileKey[] => {
  const size = tileSizeMeters(texZoom);
  const h = (headingDeg * Math.PI) / 180;
  // 前方（北=タイルY負方向が基準。headingで回転）へリング中心をずらす
  const forwardTilesX = (Math.sin(h) * radiusMeters * 0.3) / size;
  const forwardTilesY = -(Math.cos(h) * radiusMeters * 0.3) / size;
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
