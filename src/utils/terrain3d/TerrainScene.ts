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
import { elevationScale, lonLatToMercator, MercatorPoint, regionToCamera, tileSizeMeters, zoomToDistance } from './coords';
import { mat4LookAt, mat4Multiply, mat4Perspective, orbitEye, orbitUp } from './matrices';
import { TerrainRenderer } from './TerrainRenderer';
import { TerrainTileManager } from './TerrainTileManager';
import { LayerSpec } from './types';

/** タイル取得範囲の再計算間隔[ms]（カメラが動いている間） */
const TILE_UPDATE_INTERVAL_MS = 250;

const skyColorVec = (): [number, number, number] => [
  ((SKY_COLOR >> 16) & 0xff) / 255,
  ((SKY_COLOR >> 8) & 0xff) / 255,
  (SKY_COLOR & 0xff) / 255,
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

    this.renderer.drawFrame(this.tileManager.buildDrawPasses(), viewProj, {
      skyColor: skyColorVec(),
      fogNear,
      fogFar,
      lightDir: sunDirection(),
      // 環境光を上げて日向と日陰のコントラストを控えめにする（地図の可読性優先）
      ambient: 0.65,
    });
    return true;
  }

  dispose(): void {
    this.disposed = true;
    this.tileManager.dispose();
    this.renderer.dispose();
  }
}
