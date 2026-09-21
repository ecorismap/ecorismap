/**
 * 3D地形シーンの統括（素のWebGL版）。
 *
 * CameraController（カメラ状態）・TerrainTileManager（タイル）・TerrainRenderer（描画）を束ね、
 * HomeTerrain3Dコンポーネントから毎フレームframe()を呼んでもらう。
 * dirtyフラグによるオンデマンド描画で、静止時はGPU/CPUを使わない（電池対策）。
 */
import { ExpoWebGLRenderingContext } from 'expo-gl';
import { RegionType } from '../../types';
import { TERRAIN_EXAGGERATION } from '../../constants/DemSources';
import { CameraController } from './CameraController';
import {
  CAMERA_FOV_DEG,
  FOG_FAR_RATIO,
  FOG_NEAR_RATIO,
  MAX_TEX_ZOOM,
  MAX_TILES,
  MIN_TEX_ZOOM,
  SKY_COLOR,
  SUN_ALTITUDE_DEG,
  SUN_AZIMUTH_DEG,
  ZOOM_HYSTERESIS,
} from './constants';
import { elevationScale, lonLatToMercator, mercatorToLonLat, MercatorPoint, regionToCamera, tileSizeMeters, zoomToDistance } from './coords';
import { Mat4, mat4LookAt, mat4Multiply, mat4Perspective, orbitEye, orbitUp } from './matrices';
import { OverlayPass, TerrainRenderer, TileGpuResources } from './TerrainRenderer';
import { TerrainTileManager } from './TerrainTileManager';
import { buildPolygonFill, buildRibbon } from './overlayGeometry';
import { Rgba } from './colorUtils';
import { LayerSpec } from './types';
import { LocationType } from '../../types';

/** レイヤデータ（ライン・ポリゴン）のドレープ描画指定 */
export interface DataOverlaySpec {
  id: string;
  kind: 'line' | 'polygon';
  coords: LocationType[];
  holes?: { [key: string]: LocationType[] };
  color: Rgba;
  /** kind=lineのみ: リボン幅[メルカトルm] */
  widthMeters?: number;
}

/** 標高未取得の頂点があったオーバーレイを作り直す間隔[ms] */
const OVERLAY_RETRY_INTERVAL_MS = 2000;

/** タイル取得範囲の再計算間隔[ms]（カメラが動いている間） */
const TILE_UPDATE_INTERVAL_MS = 250;

const skyColorVec = (): [number, number, number] => [
  ((SKY_COLOR >> 16) & 0xff) / 255,
  ((SKY_COLOR >> 8) & 0xff) / 255,
  (SKY_COLOR & 0xff) / 255,
];

const normalize3 = (v: [number, number, number]): [number, number, number] => {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
};

const cross3 = (a: [number, number, number], b: [number, number, number]): [number, number, number] => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

const sunDirection = (): [number, number, number] => {
  const az = (SUN_AZIMUTH_DEG * Math.PI) / 180;
  const alt = (SUN_ALTITUDE_DEG * Math.PI) / 180;
  return [Math.sin(az) * Math.cos(alt), Math.sin(alt), -Math.cos(az) * Math.cos(alt)];
};

export class TerrainScene {
  readonly controller: CameraController;
  private gl: ExpoWebGLRenderingContext;
  private renderer: TerrainRenderer;
  private tileManager: TerrainTileManager;
  private origin: MercatorPoint;
  private elevScale: number;
  /** dp単位のビューポート（2Dズームとの整合はdpで取る） */
  private viewportHeightDp: number;
  private dirty = true;
  private disposed = false;
  private texZoom: number;
  private lastTileUpdateMs = 0;
  /** 注視点の標高キャッシュ（メートル） */
  private targetElevation = 0;
  // レイヤデータのドレープオーバーレイ
  private overlaySpecs: DataOverlaySpec[] = [];
  private overlayResources: OverlayPass[] = [];
  private overlayDirty = false;
  private overlayHadMissing = false;
  private lastOverlayBuildMs = 0;
  private builtOverlayZoom: number | null = null;
  /** 直近フレームのビュー射影行列（スクリーン投影用） */
  private lastViewProj: Mat4 | null = null;
  private frameListeners = new Set<() => void>();

  constructor(gl: ExpoWebGLRenderingContext, initialRegion: RegionType, viewportHeightDp: number) {
    this.gl = gl;
    this.viewportHeightDp = viewportHeightDp;
    const cameraState = regionToCamera(initialRegion);
    this.controller = new CameraController(cameraState, viewportHeightDp);
    this.origin = lonLatToMercator(cameraState.longitude, cameraState.latitude);
    this.elevScale = elevationScale(cameraState.latitude, TERRAIN_EXAGGERATION);
    this.renderer = new TerrainRenderer(gl);
    this.tileManager = new TerrainTileManager(this.origin, this.elevScale, this.renderer, () => this.markDirty());
    this.texZoom = Math.min(MAX_TEX_ZOOM, Math.max(MIN_TEX_ZOOM, Math.round(cameraState.zoom)));
  }

  markDirty(): void {
    this.dirty = true;
  }

  setViewportHeight(dp: number): void {
    this.viewportHeightDp = dp;
    this.controller.setViewportHeight(dp);
    this.markDirty();
  }

  setLayers(layers: LayerSpec[]): void {
    this.tileManager.setLayers(layers);
    this.lastTileUpdateMs = 0;
    this.markDirty();
  }

  /** 指定地点の表示中標高[m]（同期・なければnull）。オーバーレイのドレープ用 */
  sampleElevation(latitude: number, longitude: number): number | null {
    return this.tileManager.sampleElevation(latitude, longitude);
  }

  /** レイヤデータ（ライン・ポリゴン）のドレープ指定を差し替える */
  setDataOverlays(specs: DataOverlaySpec[]): void {
    this.overlaySpecs = specs;
    this.overlayDirty = true;
    this.markDirty();
  }

  /** 描画フレーム毎に呼ばれるリスナー（ポイントのスクリーン投影更新用） */
  addFrameListener(listener: () => void): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  /**
   * スクリーン座標(dp)→地形上の緯度経度（レイマーチによる逆投影）。
   * 空をタップした場合や地形未ロードで交点が取れない場合はnull。
   * タップ→フィーチャ情報表示（2Dと同じ経路）に使う。
   */
  unprojectToLatLon(
    xDp: number,
    yDp: number,
    viewportWidthDp: number,
    viewportHeightDp: number
  ): { latitude: number; longitude: number } | null {
    const state = this.controller.getState();
    const distance = zoomToDistance(state.zoom, this.viewportHeightDp);
    const merc = lonLatToMercator(state.longitude, state.latitude);
    const target: [number, number, number] = [
      merc.mx - this.origin.mx,
      this.targetElevation * this.elevScale,
      this.origin.my - merc.my,
    ];
    const eye = orbitEye(target, distance, state.heading, state.pitch);
    const up = orbitUp(state.heading, state.pitch);
    // 視線基底（forward/right/upv）からタップ方向のレイを作る
    const forward = normalize3([target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]]);
    const right = normalize3(cross3(forward, up));
    const upv = cross3(right, forward);
    const aspect = viewportWidthDp / viewportHeightDp;
    const tanHalf = Math.tan((CAMERA_FOV_DEG * Math.PI) / 360);
    const ndcX = (xDp / viewportWidthDp) * 2 - 1;
    const ndcY = 1 - (yDp / viewportHeightDp) * 2;
    const dir = normalize3([
      forward[0] + tanHalf * (ndcX * aspect * right[0] + ndcY * upv[0]),
      forward[1] + tanHalf * (ndcX * aspect * right[1] + ndcY * upv[1]),
      forward[2] + tanHalf * (ndcX * aspect * right[2] + ndcY * upv[2]),
    ]);

    const heightAt = (px: number, pz: number): number => {
      const ll = mercatorToLonLat(this.origin.mx + px, this.origin.my - pz);
      const elev = this.tileManager.sampleElevation(ll.latitude, ll.longitude);
      return (elev ?? 0) * this.elevScale;
    };
    // レイマーチ: 地表を下回った区間を二分法で詰める
    const maxT = distance * 8;
    const steps = 200;
    let prevT = 0;
    let prevAbove = eye[1] - heightAt(eye[0], eye[2]) > 0;
    for (let i = 1; i <= steps; i++) {
      const t = (i / steps) * maxT;
      const px = eye[0] + dir[0] * t;
      const py = eye[1] + dir[1] * t;
      const pz = eye[2] + dir[2] * t;
      const above = py - heightAt(px, pz) > 0;
      if (prevAbove && !above) {
        let lo = prevT;
        let hi = t;
        for (let k = 0; k < 20; k++) {
          const mid = (lo + hi) / 2;
          const mx = eye[0] + dir[0] * mid;
          const my = eye[1] + dir[1] * mid;
          const mz = eye[2] + dir[2] * mid;
          if (my - heightAt(mx, mz) > 0) lo = mid;
          else hi = mid;
        }
        const hx = eye[0] + dir[0] * hi;
        const hz = eye[2] + dir[2] * hi;
        return mercatorToLonLat(this.origin.mx + hx, this.origin.my - hz);
      }
      prevAbove = above;
      prevT = t;
    }
    return null;
  }

  /**
   * 緯度経度→スクリーン座標(dp)。カメラの後ろや画面外はnull。
   * 直近の描画フレームの行列を使う（未描画ならnull）。
   */
  projectToScreen(
    latitude: number,
    longitude: number,
    viewportWidthDp: number,
    viewportHeightDp: number
  ): { x: number; y: number } | null {
    const m = this.lastViewProj;
    if (m === null) return null;
    const merc = lonLatToMercator(longitude, latitude);
    const elev = this.tileManager.sampleElevation(latitude, longitude) ?? 0;
    const x = merc.mx - this.origin.mx;
    const y = elev * this.elevScale;
    const z = this.origin.my - merc.my;
    const clipW = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (clipW <= 0) return null;
    const clipX = (m[0] * x + m[4] * y + m[8] * z + m[12]) / clipW;
    const clipY = (m[1] * x + m[5] * y + m[9] * z + m[13]) / clipW;
    if (clipX < -1.1 || clipX > 1.1 || clipY < -1.1 || clipY > 1.1) return null;
    return {
      x: (clipX * 0.5 + 0.5) * viewportWidthDp,
      y: (1 - (clipY * 0.5 + 0.5)) * viewportHeightDp,
    };
  }

  /** オーバーレイのGLリソースを（必要なら）作り直す */
  private maybeRebuildOverlays(nowMs: number): void {
    const zoomChanged = this.builtOverlayZoom !== this.texZoom;
    const retry = this.overlayHadMissing && nowMs - this.lastOverlayBuildMs > OVERLAY_RETRY_INTERVAL_MS;
    if (!this.overlayDirty && !zoomChanged && !retry) return;
    this.overlayDirty = false;
    this.builtOverlayZoom = this.texZoom;
    this.lastOverlayBuildMs = nowMs;
    this.overlayHadMissing = false;
    this.overlayResources.forEach((pass) => this.renderer.deleteTileResources(pass.resources));
    this.overlayResources = [];
    const sampler = (lat: number, lon: number): number | null => {
      const v = this.tileManager.sampleElevation(lat, lon);
      if (v === null) this.overlayHadMissing = true;
      return v;
    };
    for (const spec of this.overlaySpecs) {
      const geometry =
        spec.kind === 'line'
          ? buildRibbon(spec.coords, spec.widthMeters ?? 5, this.origin, this.elevScale, sampler)
          : buildPolygonFill(spec.coords, spec.holes, this.origin, this.elevScale, sampler);
      if (geometry === null) continue;
      let resources: TileGpuResources;
      try {
        resources = this.renderer.createOverlayResources(geometry);
      } catch {
        continue;
      }
      this.overlayResources.push({ resources, color: spec.color });
    }
    this.dirty = true;
  }

  /**
   * 毎フレーム呼ばれる。カメラ更新→（必要なら）タイル更新→（dirtyなら）描画。
   * @returns 描画したかどうか
   */
  frame(nowMs: number): boolean {
    if (this.disposed) return false;
    const cameraActive = this.controller.update(nowMs);
    if (cameraActive) this.dirty = true;

    const state = this.controller.getState();

    // ズーム切替（ヒステリシス付き）
    const desired = Math.min(MAX_TEX_ZOOM, Math.max(MIN_TEX_ZOOM, Math.round(state.zoom)));
    if (desired !== this.texZoom && Math.abs(state.zoom - this.texZoom) > 0.5 + ZOOM_HYSTERESIS / 2) {
      this.texZoom = desired;
      this.lastTileUpdateMs = 0;
    }

    const distance = zoomToDistance(state.zoom, this.viewportHeightDp);
    // フォグはカメラからの視深度に対して掛かるため、注視点までの距離を底上げした上で
    // タイルリング半径に連動させる（リング端のタイル欠けがフォグに隠れるように）
    const ringRadius = Math.sqrt(MAX_TILES / Math.PI) * tileSizeMeters(this.texZoom);
    const fogNear = distance + ringRadius * FOG_NEAR_RATIO;
    const fogFar = distance + ringRadius * FOG_FAR_RATIO;

    // タイル範囲の更新（間引き）
    if (nowMs - this.lastTileUpdateMs > TILE_UPDATE_INTERVAL_MS) {
      this.lastTileUpdateMs = nowMs;
      this.tileManager.updateVisibleTiles(state.latitude, state.longitude, state.heading, this.texZoom, ringRadius);
      const sampled = this.tileManager.sampleElevation(state.latitude, state.longitude);
      if (sampled !== null && Math.abs(sampled - this.targetElevation) > 1) {
        this.targetElevation = sampled;
        this.dirty = true;
      }
    }

    this.maybeRebuildOverlays(nowMs);

    if (!this.dirty) return false;
    this.dirty = false;

    // カメラ行列
    const merc = lonLatToMercator(state.longitude, state.latitude);
    const target: [number, number, number] = [
      merc.mx - this.origin.mx,
      this.targetElevation * this.elevScale,
      this.origin.my - merc.my,
    ];
    const eye = orbitEye(target, distance, state.heading, state.pitch);
    const up = orbitUp(state.heading, state.pitch);
    const aspect = this.gl.drawingBufferWidth / this.gl.drawingBufferHeight;
    const far = Math.max(fogFar * 1.5, distance * 3);
    const proj = mat4Perspective((CAMERA_FOV_DEG * Math.PI) / 180, aspect, Math.max(1, distance * 0.02), far);
    const view = mat4LookAt(eye, target, up);
    const viewProj = mat4Multiply(proj, view);

    this.lastViewProj = viewProj;
    this.renderer.drawFrame(
      this.tileManager.buildDrawPasses(),
      viewProj,
      {
        skyColor: skyColorVec(),
        fogNear,
        fogFar,
        lightDir: sunDirection(),
        // 環境光を上げて日向と日陰のコントラストを控えめにする（地図の可読性優先）
        ambient: 0.65,
      },
      this.overlayResources
    );
    this.frameListeners.forEach((listener) => listener());
    return true;
  }

  dispose(): void {
    this.disposed = true;
    this.frameListeners.clear();
    this.overlayResources.forEach((pass) => this.renderer.deleteTileResources(pass.resources));
    this.overlayResources = [];
    this.tileManager.dispose();
    this.renderer.dispose();
  }
}
