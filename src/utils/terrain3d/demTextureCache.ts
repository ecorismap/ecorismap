/**
 * DEMタイルのGPUテクスチャ管理（参照カウント付きLRU）。
 *
 * 標高はネイティブ（modules/dem-decoder）でFloat32まで復元済みのものを
 * r32floatテクスチャとして上げ、頂点シェーダがtextureLoadで読む（terrainDem参照）。
 *
 * テクスチャタイルは親のDEMタイルを共有するため、
 * 近景リング48枚でもDEMは数枚で足りる。近景・遠景リングの全TileManagerで
 * 1インスタンスを共有し、この重複をまとめて省く。
 */
import { MAX_DEM_TEXTURES } from './constants';
import { DEM_RANGE_BLOCKS, resolveTerrainDem } from './terrainDem';
import { TerrainRenderer } from './TerrainRenderer';
import { LayerSpec } from './types';

export interface DemTextureEntry {
  key: string;
  /** ready=標高あり / missing=データなし（海上・提供範囲外。0m扱い）/ error=通信エラー */
  state: 'ready' | 'missing' | 'error';
  /** state=readyのときのみ非null */
  texture: GPUTexture | null;
  /** DEMの一辺[px]（データなしは0） */
  size: number;
  /** DEMをDEM_RANGE_BLOCKS四方に区切ったブロック毎の標高範囲[m]。スカート底の算出に使う */
  blockMin: Float32Array;
  blockMax: Float32Array;
  /**
   * 標高[m]。GPUへ上げたのと同じ配列。
   *
   * テクスチャと同じ寿命で持つことで、「地形は描けているのにJSだけ標高を引けず
   * ドットが消える」状態が起きなくなる（別LRUに預けると寿命がずれる）
   */
  elev: Float32Array | null;
  /** このエントリを掴んでいるタイル数。0になったら破棄候補 */
  refs: number;
}

/** 標高が無いエントリ用の共有ブロック範囲（全て0m） */
const ZERO_BLOCKS = new Float32Array(DEM_RANGE_BLOCKS * DEM_RANGE_BLOCKS);

const ERROR_ENTRY = (key: string): DemTextureEntry => ({
  key,
  state: 'error',
  texture: null,
  size: 0,
  blockMin: ZERO_BLOCKS,
  blockMax: ZERO_BLOCKS,
  elev: null,
  refs: 0,
});

export class DemTextureCache {
  private renderer: TerrainRenderer;
  private maxEntries: number;
  /** 挿入順＝LRU順。参照中(refs>0)のエントリは追い出さない */
  private entries = new Map<string, DemTextureEntry>();
  private pending = new Map<string, Promise<DemTextureEntry>>();
  private disposed = false;
  /** 海底モード（GEBCO表示中）の海底値の取得元レイヤ。nullなら通常モード */
  private bathymetryLayer: LayerSpec | null = null;

  constructor(renderer: TerrainRenderer, maxEntries: number = MAX_DEM_TEXTURES) {
    this.renderer = renderer;
    this.maxEntries = maxEntries;
  }

  /**
   * 海底モードを切り替える。キーが別になるので、以後のacquireは別エントリを引く。
   * 既存タイルの作り直しは呼び出し側（レイヤ差し替えで全タイル再構築）に任せる
   */
  setBathymetry(layer: LayerSpec | null): void {
    this.bathymetryLayer = layer;
  }

  /**
   * DEMテクスチャを取得して参照を1つ掴む。
   * 解決済みのエントリを返す（loading状態は外に出さない）。
   * 使い終わったら必ずrelease()すること。
   */
  async acquire(z: number, x: number, y: number): Promise<DemTextureEntry> {
    const bathymetry = this.bathymetryLayer;
    const key = `${bathymetry === null ? '' : `bathy:${bathymetry.urlTemplate}|`}${z}/${x}/${y}`;
    const hit = this.entries.get(key);
    if (hit !== undefined) {
      // 参照したものを末尾へ移してLRUを維持する
      this.entries.delete(key);
      this.entries.set(key, hit);
      hit.refs++;
      return hit;
    }
    const inflight = this.pending.get(key);
    if (inflight !== undefined) {
      const entry = await inflight;
      if (entry.state !== 'error') entry.refs++;
      return entry;
    }
    const promise = this.load(key, z, x, y, bathymetry);
    this.pending.set(key, promise);
    try {
      const entry = await promise;
      if (entry.state !== 'error') entry.refs++;
      return entry;
    } finally {
      this.pending.delete(key);
    }
  }

  /** 参照を1つ返す。参照が0になったエントリは上限超過時に破棄される */
  release(entry: DemTextureEntry | null): void {
    if (entry === null || entry.state === 'error') return;
    entry.refs = Math.max(0, entry.refs - 1);
    this.evict();
  }

  dispose(): void {
    this.disposed = true;
    for (const entry of this.entries.values()) {
      if (entry.texture !== null) this.renderer.deleteTexture(entry.texture);
    }
    this.entries.clear();
    this.pending.clear();
  }

  private async load(
    key: string,
    z: number,
    x: number,
    y: number,
    bathymetry: LayerSpec | null
  ): Promise<DemTextureEntry> {
    let entry: DemTextureEntry;
    try {
      const dem = await resolveTerrainDem(z, x, y, bathymetry);
      if (dem === undefined) {
        entry = ERROR_ENTRY(key); // 通信エラー。記憶せず次回再取得させる
      } else if (dem === null) {
        entry = {
          key,
          state: 'missing',
          texture: null,
          size: 0,
          blockMin: ZERO_BLOCKS,
          blockMax: ZERO_BLOCKS,
          elev: null,
          refs: 0,
        };
      } else {
        const texture = this.renderer.createDemTexture(dem.elev, dem.size);
        entry = {
          key,
          state: 'ready',
          texture,
          size: dem.size,
          blockMin: dem.blockMin,
          blockMax: dem.blockMax,
          elev: dem.elev,
          refs: 0,
        };
      }
    } catch {
      entry = ERROR_ENTRY(key);
    }
    if (this.disposed) {
      if (entry.texture !== null) this.renderer.deleteTexture(entry.texture);
      return ERROR_ENTRY(key);
    }
    if (entry.state !== 'error') {
      this.entries.set(key, entry);
      this.evict();
    }
    return entry;
  }

  /** 上限を超えた分を、参照されていない古いものから破棄する */
  private evict(): void {
    if (this.entries.size <= this.maxEntries) return;
    for (const [key, entry] of this.entries) {
      if (this.entries.size <= this.maxEntries) return;
      if (entry.refs > 0) continue;
      if (entry.texture !== null) this.renderer.deleteTexture(entry.texture);
      this.entries.delete(key);
    }
  }
}
