/**
 * 3D地形シーンの統括（WebGPU版）。
 *
 * CameraController（カメラ状態）・TerrainTileManager（タイル）・TerrainRenderer（描画）を束ね、
 * HomeTerrain3Dコンポーネントから毎フレームframe()を呼んでもらう。
 * dirtyフラグによるオンデマンド描画で、静止時はGPU/CPUを使わない（電池対策）。
 *
 * フレーム内でまとまった計算をしないための規律:
 *  - タイル範囲の再計算は間引く（TILE_UPDATE_INTERVAL_MS）
 *  - 描画パスの配列はTileManager側でキャッシュし、毎フレーム作り直さない
 *  - オーバーレイの構築は時間スライスしてフレーム外（setTimeout）で進める
 *  - 標高サンプリングはデコード済みDEMキャッシュからO(1)で引く（demProvider.peekElevationAt）
 */
import { RNCanvasContext } from 'react-native-webgpu';
import { setDemDecodeDeferPredicate, takeDemDecodeStats } from '../demTileProvider';
import { terrain3dPerfStore } from './perfStore';
import { RegionType } from '../../types';
import { TERRAIN_EXAGGERATION } from '../../constants/DemSources';
import { CameraController } from './CameraController';
import {
  CAMERA_FOV_DEG,
  FAR_RING_DELTAS,
  FAR_RING_DEM_ZOOM_OFFSET,
  FAR_RING_FORWARD_BIAS,
  FAR_RING_MESH_SEGMENTS,
  FOG_FAR_RATIO,
  FOG_NEAR_RATIO,
  MAX_FAR_TILES,
  MAX_TEX_ZOOM,
  MAX_TILES,
  MESH_SEGMENTS,
  MIN_TEX_ZOOM,
  NEAR_RING_DEM_ZOOM_OFFSET,
  SKY_COLOR,
  SUN_ALTITUDE_DEG,
  SUN_AZIMUTH_DEG,
  ZOOM_HYSTERESIS,
} from './constants';
import { elevationScale, lonLatToMercator, mercatorToLonLat, MercatorPoint, regionToCamera, tileSizeMeters, zoomToDistance } from './coords';
import { Mat4, mat4LookAt, mat4Multiply, mat4Perspective, orbitEye, orbitUp } from './matrices';
import { TerrainDepthMap, TerrainRenderer, TerrainRingDraw, TileGpuResources } from './TerrainRenderer';
import { TerrainTileManager } from './TerrainTileManager';
import { DemTextureCache } from './demTextureCache';
import { buildPolygonFill, buildRibbon, OverlayBatchBuilder } from './overlayGeometry';
import { Rgba } from './colorUtils';
import { LayerSpec, Terrain3DCameraState } from './types';
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

/** オーバーレイ構築を1回のスライスで進める時間の上限[ms] */
const OVERLAY_SLICE_BUDGET_MS = 4;

/** 時間スライスで進行中のオーバーレイ構築 */
interface OverlayBuildJob {
  specs: DataOverlaySpec[];
  index: number;
  batch: OverlayBatchBuilder;
  hadMissing: boolean;
}

/** タイル取得範囲の再計算間隔[ms]（カメラが動いている間） */
const TILE_UPDATE_INTERVAL_MS = 250;

/**
 * カメラが動いている間、タイル範囲の更新を先送りできる上限[ms]。
 * 回転・パンを続けている間も、これを超えたら移動先のタイルを取りに行く
 */
const TILE_UPDATE_MAX_DEFER_MS = 1200;

/**
 * 遠景リングのロード開始を遅らせる上限[ms]。
 * 起動直後は近景タイルへI/Oとデコードを集中させ、最初の地形が出るまでを短くする
 * （近景が1枚でも描けた時点で、この時間を待たずに遠景を開始する）
 */
const FAR_RING_START_DELAY_MS = 700;

/** 開発時の計測ログの出力間隔[ms] */
const PERF_LOG_INTERVAL_MS = 3000;

/**
 * 点をGPUが描いた地形へ載せ直す反復（placeOnDrawnTerrain）。
 * 急斜面でも数回で寄るが、視線とほぼ平行な面では寄り切らないので上限を設ける
 */
const TERRAIN_PLACE_ITERATIONS = 4;
const TERRAIN_PLACE_EPSILON_M = 0.5;

/**
 * ポイントの遮蔽判定（GPUが描いた地形までの距離との比較）。
 *
 * 距離バッファは表示の1/4解像度で撮る。ドット1個につき1画素しか見ないので
 * 細かくする意味が薄く、描画と読み戻しのコストだけが増える。
 * 許容差は、縮小解像度の1画素が代表する範囲の広さと、点が地表に乗っている
 * （＝地形と同じ距離になる）ことを踏まえた余裕。迷ったら表示する側に倒す
 */
const OCCLUSION_DEPTH_SCALE = 4;
const OCCLUSION_TOLERANCE_M = 20;
const OCCLUSION_TOLERANCE_RATIO = 0.01;

/**
 * 2つの行列が実質同じか（距離バッファが現在のカメラのものか判定する）。
 *
 * 厳密比較にすると、注視点標高が数mだけ揺れただけで不一致になり、
 * 非同期で撮る距離バッファが永久に「古い」ままになる。
 * 画面上の見え方が変わらない程度の差は同じとみなす
 */
const MAT4_EPSILON = 1e-6;

const sameMat4 = (a: Mat4, b: Mat4): boolean => {
  for (let i = 0; i < 16; i++) {
    const scale = Math.max(1, Math.abs(a[i]), Math.abs(b[i]));
    if (Math.abs(a[i] - b[i]) > MAT4_EPSILON * scale) return false;
  }
  return true;
};

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
  private context: RNCanvasContext;
  private renderer: TerrainRenderer;
  private demCache: DemTextureCache;
  private tileManager: TerrainTileManager;
  /** FAR_RING_DELTASと同じ並び（内側→外側） */
  private farTileManagers: TerrainTileManager[];
  private origin: MercatorPoint;
  private elevScale: number;
  /** dp単位のビューポート（2Dズームとの整合はdpで取る） */
  private viewportHeightDp: number;
  /** dp単位のビューポート幅。0のうちは投影しない（レイアウト確定前） */
  private viewportWidthDp = 0;
  private dirty = true;
  private disposed = false;
  private texZoom: number;
  private lastTileUpdateMs = 0;
  /** 最初のframe()のタイムスタンプ（遠景リングの開始判定の起点） */
  private firstFrameMs: number | null = null;
  private farRingsStarted = false;
  /** collectRings用の使い回しバッファ */
  private ringDraws: TerrainRingDraw[] = [];
  /** 開発時の計測（__DEV__のみ。GLへの同期問い合わせは行わない） */
  private perf = {
    createdAtMs: Date.now(),
    firstDrawLogged: false,
    frames: 0,
    jsMs: 0,
    presentMs: 0,
    draws: 0,
    dropped: 0,
    lastLogMs: 0,
    lastFrameMs: 0,
  };
  /** 注視点の標高キャッシュ（メートル） */
  private targetElevation = 0;
  // レイヤデータのドレープオーバーレイ
  private overlaySpecs: DataOverlaySpec[] = [];
  /** 全地物を連結した1本のGPUバッファ（1ドローコール） */
  private overlayResources: TileGpuResources | null = null;
  /** 進行中の構築ジョブ（完成するまで古いoverlayResourcesを描き続ける） */
  private overlayJob: OverlayBuildJob | null = null;
  private overlayTimer: ReturnType<typeof setTimeout> | null = null;
  private overlayDirty = false;
  private overlayHadMissing = false;
  private lastOverlayBuildMs = 0;
  /** 前回オーバーレイを組んだ時点のタイル世代（新しい標高が来たかの判定用） */
  private lastOverlayReadyGen = -1;
  private builtOverlayZoom: number | null = null;
  /** 直近フレームのビュー射影行列（スクリーン投影用） */
  private lastViewProj: Mat4 | null = null;
  /** 遮蔽判定用に読み戻した地形までの距離と、それを描いたときの行列 */
  private depthMap: TerrainDepthMap | null = null;
  private depthViewProj: Mat4 | null = null;
  /** 距離バッファを撮った時点のタイル世代（地形が変わったら撮り直す） */
  private depthGen = -1;
  private frameListeners = new Set<() => void>();
  /** 進行中のジェスチャ数（0でなければ操作中） */
  private interactionCount = 0;
  /** 直近フレームでカメラが動いていたか（アニメーション・慣性を含む） */
  private cameraActive = false;
  /** 開発時の診断: 直近の集計区間で最初に投影した点の標高情報 */
  private projDiag = '';
  private projDiagTaken = false;
  /** 開発時の診断: 集計区間でいちばん地形から離れていた点の距離差[m] */
  private projWorstSurf = 0;
  /** 開発時の診断: 先頭数点の標高と画面Y */
  private projSamples: string[] = [];
  /** 開発時の診断: ドレープが焼き込んだ標高（緯度経度→m） */
  private overlaySampleLog = new Map<string, number>();

  constructor(
    deps: { device: GPUDevice; context: RNCanvasContext; presentationFormat: GPUTextureFormat },
    initialRegion: RegionType,
    viewportHeightDp: number
  ) {
    this.context = deps.context;
    this.viewportHeightDp = viewportHeightDp;
    const cameraState = regionToCamera(initialRegion);
    this.controller = new CameraController(cameraState, viewportHeightDp);
    this.origin = lonLatToMercator(cameraState.longitude, cameraState.latitude);
    this.elevScale = elevationScale(cameraState.latitude, TERRAIN_EXAGGERATION);
    this.renderer = new TerrainRenderer(deps.device, deps.context, deps.presentationFormat);
    // DEMテクスチャは全リングで共有する（z15/16の多数のタイルが同じz14 DEMを参照する）
    this.demCache = new DemTextureCache(this.renderer);
    this.tileManager = new TerrainTileManager(
      this.origin,
      this.elevScale,
      this.renderer,
      this.demCache,
      () => this.markDirty(),
      NEAR_RING_DEM_ZOOM_OFFSET
    );
    // 遠景リング（粗ズーム）のLODチェーン。近景タイルを上に重ね描きして遠方の山まで見せる。
    // DEMは2段粗いものを共有させる（等倍だとタイル数ぶんデコードが走る）
    this.farTileManagers = FAR_RING_DELTAS.map(
      (_, i) =>
        new TerrainTileManager(
          this.origin,
          this.elevScale,
          this.renderer,
          this.demCache,
          () => this.markDirty(),
          FAR_RING_DEM_ZOOM_OFFSET,
          FAR_RING_FORWARD_BIAS,
          FAR_RING_MESH_SEGMENTS[i] ?? MESH_SEGMENTS
        )
    );
    this.texZoom = Math.min(MAX_TEX_ZOOM, Math.max(MIN_TEX_ZOOM, Math.round(cameraState.zoom)));
    // 操作中はDEMの展開を始めない（1枚数十msの同期処理で、始めると指が止まる）
    setDemDecodeDeferPredicate(() => this.interacting);
  }

  markDirty(): void {
    this.dirty = true;
  }

  /**
   * ジェスチャ中かどうか（ポイントのスクリーン投影など、指を離すまで
   * 止めておける処理の抑制に使う）。同時に複数のジェスチャが走るためカウンタで持つ
   */
  get interacting(): boolean {
    return this.interactionCount > 0;
  }

  /**
   * カメラが止まっているか（ジェスチャ・アニメーション・慣性のいずれも無い）。
   *
   * 止まっているときに描画が走るのは、タイルや標高が新しくなったときだけ。
   * その瞬間はポイントを間引かずに投影し直さないと、古い標高のままの位置で
   * ドットが取り残される
   */
  get cameraSettled(): boolean {
    return !this.cameraActive && this.interactionCount === 0;
  }

  beginInteraction(): void {
    this.interactionCount++;
  }

  endInteraction(): void {
    this.interactionCount = Math.max(0, this.interactionCount - 1);
    // 抑制していた処理に最終状態を反映させるため、必ず1フレーム描く
    if (this.interactionCount === 0) this.markDirty();
  }

  /**
   * 描画領域の大きさ（dp）を伝える。
   *
   * 画面全体のサイズではなく、実際にキャンバスが占める領域を渡すこと。
   * スクリーン投影（ポイントの重ね描き）と逆投影（タップ）はこの値を基準にするので、
   * 描画に使うアスペクトと食い違うとドットの位置がずれる
   */
  setViewportSize(widthDp: number, heightDp: number): void {
    this.viewportWidthDp = widthDp;
    this.setViewportHeight(heightDp);
  }

  setViewportHeight(dp: number): void {
    this.viewportHeightDp = dp;
    this.controller.setViewportHeight(dp);
    this.markDirty();
  }

  setLayers(layers: LayerSpec[]): void {
    this.tileManager.setLayers(layers);
    this.farTileManagers.forEach((manager) => manager.setLayers(layers));
    this.lastTileUpdateMs = 0;
    this.markDirty();
  }

  /** 指定地点の表示中標高[m]（同期・なければnull）。近景→遠景（内側→外側）の順に参照する */
  sampleElevation(latitude: number, longitude: number): number | null {
    const merc = lonLatToMercator(longitude, latitude);
    return this.sampleElevationAtMercator(merc.mx, merc.my);
  }

  /** メルカトル座標で引く版（遮蔽判定のレイマーチ用）。近景→遠景の順に探す */
  private sampleElevationAtMercator(mx: number, my: number): number | null {
    const near = this.tileManager.sampleElevationAtMercator(mx, my);
    if (near !== null) return near;
    for (const manager of this.farTileManagers) {
      const elev = manager.sampleElevationAtMercator(mx, my);
      if (elev !== null) return elev;
    }
    return null;
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
  /**
   * スクリーン座標(dp)→そこへ向かう視線（カメラ位置と単位方向）。
   * タップの逆投影と、距離バッファから地表点を求める処理で共有する
   */
  private screenRay(xDp: number, yDp: number): { eye: [number, number, number]; dir: [number, number, number] } | null {
    const viewportWidthDp = this.viewportWidthDp;
    const viewportHeightDp = this.viewportHeightDp;
    if (viewportWidthDp <= 0 || viewportHeightDp <= 0) return null;
    const state = this.controller.getState();
    const distance = zoomToDistance(state.zoom, viewportHeightDp);
    const merc = lonLatToMercator(state.longitude, state.latitude);
    const target: [number, number, number] = [
      merc.mx - this.origin.mx,
      this.targetElevation * this.elevScale,
      this.origin.my - merc.my,
    ];
    const eye = orbitEye(target, distance, state.heading, state.pitch);
    const up = orbitUp(state.heading, state.pitch);
    // 視線基底（forward/right/upv）から画面位置方向のレイを作る
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
    return { eye, dir };
  }

  unprojectToLatLon(xDp: number, yDp: number): { latitude: number; longitude: number } | null {
    const ray = this.screenRay(xDp, yDp);
    if (ray === null) return null;
    const { eye, dir } = ray;
    const state = this.controller.getState();
    const distance = zoomToDistance(state.zoom, this.viewportHeightDp);

    const heightAt = (px: number, pz: number): number => {
      const ll = mercatorToLonLat(this.origin.mx + px, this.origin.my - pz);
      return (this.sampleElevation(ll.latitude, ll.longitude) ?? 0) * this.elevScale;
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
   * カメラ行列を組み直し、投影用の状態（行列・視点・条件）を更新する。
   *
   * 描画とポイント投影で必ず同じ式を通すために一本化している。
   * ここが二重定義になると、地形とドットが別々の見え方をして位置がずれる
   */
  private updateCameraMatrix(
    state: Terrain3DCameraState,
    distance: number,
    fogFar: number
  ): { viewProj: Mat4; eye: [number, number, number] } {
    const merc = lonLatToMercator(state.longitude, state.latitude);
    const target: [number, number, number] = [
      merc.mx - this.origin.mx,
      this.targetElevation * this.elevScale,
      this.origin.my - merc.my,
    ];
    const eye = orbitEye(target, distance, state.heading, state.pitch);
    const up = orbitUp(state.heading, state.pitch);
     
    const canvas = this.context.canvas as any;
    const aspect = canvas.width / canvas.height;
    const far = Math.max(fogFar * 1.5, distance * 3);
    const proj = mat4Perspective((CAMERA_FOV_DEG * Math.PI) / 180, aspect, Math.max(1, distance * 0.02), far);
    const viewProj = mat4Multiply(proj, mat4LookAt(eye, target, up));
    this.lastViewProj = viewProj;
    return { viewProj, eye };
  }

  /**
   * 点を「GPUが実際に描いた地形」の上へ載せる（ローカルYを返す）。
   *
   * JS側の標高サンプリングは、どう揃えてもシェーダと完全一致させきれなかった
   * （近景/遠景・取得時点・DEMの解像度差など）。そこで高さの正解を
   * 距離バッファ（GPUが描いた地形までの視線距離）側に置く。
   *
   * 手順: 現在の高さで投影 → その画素の地形までの距離を引く → その距離まで
   * 視線を伸ばした点の高さを新しい推定値にする、を数回繰り返す。
   * 斜面では1回で寄り切らないので反復するが、数回で収束する。
   *
   * 距離バッファが現在のカメラのものでないときは初期値のまま返す
   * （ずらすより、JSの推定のままの方が害が小さい）。
   */
  private placeOnDrawnTerrain(x: number, z: number, initialY: number): { y: number } {
    const map = this.depthMap;
    const m = this.lastViewProj;
    if (
      map === null ||
      m === null ||
      this.depthViewProj === null ||
      !sameMat4(this.depthViewProj, m) ||
      this.viewportWidthDp <= 0
    ) {
      return { y: initialY };
    }
    let y = initialY;
    for (let i = 0; i < TERRAIN_PLACE_ITERATIONS; i++) {
      const w = m[3] * x + m[7] * y + m[11] * z + m[15];
      if (w <= 0) break;
      const sx = ((m[0] * x + m[4] * y + m[8] * z + m[12]) / w) * 0.5 + 0.5;
      const sy = 1 - (((m[1] * x + m[5] * y + m[9] * z + m[13]) / w) * 0.5 + 0.5);
      const px = Math.round(sx * map.width);
      const py = Math.round(sy * map.height);
      if (px < 0 || py < 0 || px >= map.width || py >= map.height) break;
      const dist = map.distances[py * map.width + px];
      if (!Number.isFinite(dist)) break; // 空。地形が無いので動かしようがない
      const ray = this.screenRay(sx * this.viewportWidthDp, sy * this.viewportHeightDp);
      if (ray === null) break;
      // その画素で見えている地形の高さ。これを次の推定値にする
      const nextY = ray.eye[1] + ray.dir[1] * dist;
      if (Math.abs(nextY - y) < TERRAIN_PLACE_EPSILON_M * this.elevScale) {
        y = nextY;
        break;
      }
      y = nextY;
    }
    return { y };
  }

  /**
   * ドットを地形に載せられる状態か。
   *
   * ズーム切替中は新旧のタイルが混在し、標高がどちらから返るかで
   * 画面の地形と食い違う。3Dへ切り替えた直後もここを通るので、
   * 確定するまでは投影せず「出さない」に倒す（ずれた位置に出すより良い）
   */
  private get terrainSettled(): boolean {
    return this.tileManager.isSettled;
  }

  /**
   * 緯度経度→スクリーン座標(dp)。カメラの後ろや画面外はnull。
   * 直近の描画フレームの行列を使う（未描画ならnull）。
   */
  projectToScreen(latitude: number, longitude: number): { x: number; y: number } | null {
    const m = this.lastViewProj;
    const viewportWidthDp = this.viewportWidthDp;
    const viewportHeightDp = this.viewportHeightDp;
    if (m === null || viewportWidthDp <= 0 || viewportHeightDp <= 0) return null;
    if (!this.terrainSettled) return null;
    const merc = lonLatToMercator(longitude, latitude);
    // 標高はドレープ（ライン・ポリゴンを地形に貼る処理）とまったく同じ関数で引く。
    // ここだけ近景リング限定にすると、同じ緯度経度なのにドットとドレープが
    // 別の高さに置かれ、両者がずれて見える（実測で最大90px）
    const elev = this.sampleElevationAtMercator(merc.mx, merc.my);
    if (elev === null) return null;
    const x = merc.mx - this.origin.mx;
    const z = this.origin.my - merc.my;
    // JSの標高は「初期値」でしかない。最終的な高さはGPUが描いた地形に合わせる
    const placed = this.placeOnDrawnTerrain(x, z, elev * this.elevScale);
    const y = placed.y;
    // 開発時の診断: JSが返した標高と、GPUが描いた地形の高さを並べる。
    // 両者が食い違う量がそのままドットのズレになる
    if (__DEV__ && this.projSamples.length < 3) {
      const gpu = placed.y / this.elevScale;
      this.projSamples.push(`js${elev.toFixed(0)}/gpu${gpu.toFixed(0)}`);
    }
    const clipW = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (clipW <= 0) return null;
    const clipX = (m[0] * x + m[4] * y + m[8] * z + m[12]) / clipW;
    const clipY = (m[1] * x + m[5] * y + m[9] * z + m[13]) / clipW;
    if (clipX < -1.1 || clipX > 1.1 || clipY < -1.1 || clipY > 1.1) return null;
    const screen = {
      x: (clipX * 0.5 + 0.5) * viewportWidthDp,
      y: (1 - (clipY * 0.5 + 0.5)) * viewportHeightDp,
    };
    // ドットはキャンバスの外側（Reactのビュー）に重ねるので深度テストが効かない。
    // GPUが描いた地形までの距離と、この点までの距離を比べて自前で判定する
    if (this.isOccluded(screen.x, screen.y, clipW)) return null;
    // 開発時の診断: 「地形からいちばん浮いている（沈んでいる）点」を追う。
    // 1点目だけ見ても、ずれているのが別の点なら気づけない
    if (__DEV__) {
      const map0 = this.depthMap;
      if (map0 !== null) {
        const px0 = Math.round((screen.x / viewportWidthDp) * map0.width);
        const py0 = Math.round((screen.y / viewportHeightDp) * map0.height);
        if (px0 >= 0 && py0 >= 0 && px0 < map0.width && py0 < map0.height) {
          const t0 = map0.distances[py0 * map0.width + px0];
          if (Number.isFinite(t0) && Math.abs(clipW - t0) > Math.abs(this.projWorstSurf)) {
            this.projWorstSurf = clipW - t0;
          }
        }
      }
    }
    // 開発時の診断: 先頭数点の「標高と画面位置」を並べる。
    // 1点目だけでは、ずれているのが別の点のときに気づけない
    if (__DEV__ && !this.projDiagTaken) {
      this.projDiagTaken = true;
      const map = this.depthMap;
      const fresh = map !== null && this.depthViewProj !== null && sameMat4(this.depthViewProj, m);
      const fill = `${(this.renderer.lastDepthFillRatio * 100).toFixed(0)}% n${this.renderer.depthCaptureCount} t${this.renderer.lastDepthTileCount} ${this.renderer.lastDepthError}`;
      const depthInfo = `${map === null ? 'depth:none' : `depth:${map.width}x${map.height}${fresh ? '' : '(old)'}`} fill=${fill}`;
      // ドットが「描かれている地形の上」に乗っているか。
      // 点までの距離と、同じ画素の地形までの距離が一致していなければ浮いている/沈んでいる
      // 診断では多少古い距離バッファでも値を出す（カメラの微動で常に?になるのを避ける）
      let surf = 'surf:?';
      if (map !== null) {
        const px = Math.round((screen.x / viewportWidthDp) * map.width);
        const py = Math.round((screen.y / viewportHeightDp) * map.height);
        if (px >= 0 && py >= 0 && px < map.width && py < map.height) {
          const t = map.distances[py * map.width + px];
          surf = Number.isFinite(t) ? `surf:${(clipW - t).toFixed(0)}m` : 'surf:sky';
        }
      }
      // 近景リングと遠景リングで標高が食い違っていないか（ドットとドレープのズレの原因追跡）
      const near = this.tileManager.sampleElevationAtMercator(merc.mx, merc.my);
      let far: number | null = null;
      for (const manager of this.farTileManagers) {
        far = manager.sampleElevationAtMercator(merc.mx, merc.my);
        if (far !== null) break;
      }
      const rings = `n:${near === null ? '-' : near.toFixed(0)} f:${far === null ? '-' : far.toFixed(0)}`;
      this.projDiag =
        `p:${elev.toFixed(0)}m@${screen.x.toFixed(0)},${screen.y.toFixed(0)} ${rings} ` +
        `${this.tileManager.lastSampleInfo} ${depthInfo} ${surf}`;
    }
    return screen;
  }

  /**
   * その画面位置で、点が地形の裏に隠れているか。
   *
   * GPUが描いた「カメラから地形までの距離」を読み戻したものと比べる。
   * JS側に地形の複製を持たないので、判定が描画と食い違いようがない。
   *
   * 距離バッファが現在のカメラのものでなければ判定しない（＝表示する）。
   * 見えるはずの点が消える方が困るので、迷ったら出す側に倒す。
   *
   * @param screenX 画面位置[dp]  @param screenY 同上  @param distance カメラからの視線距離
   */
  private isOccluded(screenX: number, screenY: number, distance: number): boolean {
    const map = this.depthMap;
    if (map === null || this.depthViewProj === null || this.lastViewProj === null) return false;
    if (!sameMat4(this.depthViewProj, this.lastViewProj)) return false;
    const px = Math.round((screenX / this.viewportWidthDp) * map.width);
    const py = Math.round((screenY / this.viewportHeightDp) * map.height);
    if (px < 0 || py < 0 || px >= map.width || py >= map.height) return false;
    const terrain = map.distances[py * map.width + px];
    if (!Number.isFinite(terrain)) return false;
    // 許容差は距離に比例させる。縮小解像度の1画素が遠方ほど広い範囲を代表するため
    const tolerance = OCCLUSION_TOLERANCE_M * this.elevScale + distance * OCCLUSION_TOLERANCE_RATIO;
    return distance - terrain > tolerance;
  }

  /**
   * 描画リングを外側（粗ズーム）→内側→近景の順に集める。
   * 毎フレーム呼ばれるため配列を使い回す（各リングのパス配列自体はTileManager側でキャッシュ済み）。
   * 最背面のリングだけfillBase=trueにして、テクスチャの透明部をベース色で埋めて不透明にする
   * （手前のリングは透過させ、NODATA部分から奥のリングを見せる）。
   * テクスチャ未着のタイルは奥のリングの有無に関わらず不透明に描く（TerrainRenderer側で判定）
   */
  private collectRings(farRings: { manager: TerrainTileManager; index: number }[]): TerrainRingDraw[] {
    this.ringDraws.length = 0;
    const push = (manager: TerrainTileManager, segments: number) => {
      this.ringDraws.push({
        tiles: manager.buildDrawPasses(),
        segments,
        // 最背面のリング、および重ねるレイヤが無い（灰色地形だけの）ときは不透明で描く
        fillBase: this.ringDraws.length === 0 || manager.layerCount === 0,
        layerCount: manager.layerCount,
        layerOpacity: manager.layerOpacities,
      });
    };
    // 遠景ほど粗いメッシュにする（DEMも粗いので形は変わらず、頂点数だけ減る）
    for (let i = farRings.length - 1; i >= 0; i--) {
      push(farRings[i].manager, FAR_RING_MESH_SEGMENTS[farRings[i].index] ?? MESH_SEGMENTS);
    }
    push(this.tileManager, MESH_SEGMENTS);
    return this.ringDraws;
  }

  /**
   * オーバーレイの作り直しが必要なら、フレーム外で進む構築ジョブを起票する。
   *
   * 標高が取れなかった頂点がある場合の再試行は、実際に新しいタイルがreadyに
   * なったときだけ行う。時間だけで再試行すると、近景リングの外にある地物は
   * 永久に標高が取れないため、2秒ごとに全地物の再構築が回り続けてしまう
   */
  private maybeRebuildOverlays(nowMs: number): void {
    const zoomChanged = this.builtOverlayZoom !== this.texZoom;
    const readyGen = this.tileManager.readyGeneration;
    const retry =
      this.overlayHadMissing &&
      readyGen !== this.lastOverlayReadyGen &&
      nowMs - this.lastOverlayBuildMs > OVERLAY_RETRY_INTERVAL_MS;
    if (!this.overlayDirty && !zoomChanged && !retry) return;
    this.overlayDirty = false;
    this.builtOverlayZoom = this.texZoom;
    this.lastOverlayBuildMs = nowMs;
    this.lastOverlayReadyGen = readyGen;
    this.startOverlayJob();
  }

  /**
   * オーバーレイ構築ジョブを開始する。
   * 最大200地物のリボン化・earcut・GPUバッファ生成を1フレームでまとめて行うと
   * そのフレームが丸ごと伸びるため、時間スライスして描画フレームの外で進める。
   * 完成するまでは古いリソースを描き続け、完成時に差し替える（描画の中断がない）。
   */
  private startOverlayJob(): void {
    this.cancelOverlayJob();
    const job: OverlayBuildJob = {
      specs: this.overlaySpecs,
      index: 0,
      batch: new OverlayBatchBuilder(),
      hadMissing: false,
    };
    this.overlayJob = job;
    this.scheduleOverlaySlice(job);
  }

  private scheduleOverlaySlice(job: OverlayBuildJob): void {
    this.overlayTimer = setTimeout(() => {
      this.overlayTimer = null;
      this.runOverlaySlice(job);
    }, 0);
  }

  private runOverlaySlice(job: OverlayBuildJob): void {
    if (this.disposed || this.overlayJob !== job) return;
    const deadline = performance.now() + OVERLAY_SLICE_BUDGET_MS;
    const sampler = (lat: number, lon: number): number | null => {
      const v = this.sampleElevation(lat, lon);
      if (v === null) job.hadMissing = true;
      // 開発時の診断: 焼き込んだ標高を残し、あとで「その場で取った値」と突き合わせる
      if (__DEV__ && v !== null) {
        this.overlaySampleLog.set(`${lat.toFixed(5)},${lon.toFixed(5)}`, v);
        if (this.overlaySampleLog.size > 512) {
          const first = this.overlaySampleLog.keys().next().value;
          if (first !== undefined) this.overlaySampleLog.delete(first);
        }
      }
      return v;
    };
    // 1件は必ず進める（1件が予算を超える場合でも停滞させない）
    while (job.index < job.specs.length) {
      const spec = job.specs[job.index++];
      const geometry =
        spec.kind === 'line'
          ? buildRibbon(spec.coords, spec.widthMeters ?? 5, this.origin, this.elevScale, sampler)
          : buildPolygonFill(spec.coords, spec.holes, this.origin, this.elevScale, sampler);
      if (geometry !== null) job.batch.add(geometry, spec.color);
      if (performance.now() >= deadline) break;
    }

    if (job.index < job.specs.length) {
      this.scheduleOverlaySlice(job);
      return;
    }
    // 全地物を1本のバッファにまとめてGPUへ送る（1ドローコール）
    const data = job.batch.build();
    let resources: TileGpuResources | null = null;
    if (data !== null) {
      try {
        resources = this.renderer.createOverlayResources(data);
      } catch {
        resources = null;
      }
    }
    if (this.overlayResources !== null) this.renderer.deleteTileResources(this.overlayResources);
    this.overlayResources = resources;
    this.overlayHadMissing = job.hadMissing;
    this.overlayJob = null;
    this.markDirty();
  }

  /** 進行中の構築ジョブを破棄する */
  private cancelOverlayJob(): void {
    if (this.overlayTimer !== null) {
      clearTimeout(this.overlayTimer);
      this.overlayTimer = null;
    }
    this.overlayJob = null;
  }

  /**
   * 毎フレーム呼ばれる。カメラ更新→（必要なら）タイル更新→（dirtyなら）描画。
   * @param force dirtyフラグに関係なく描画する（ハートビート再描画用。
   *   フラグ状態の固着やプレゼント取りこぼしがあっても定期的に自己回復させる）
   * @returns 描画したかどうか
   */
  frame(nowMs: number, force = false): boolean {
    if (this.disposed) return false;
    if (__DEV__) {
      // rAFの間隔が開いた＝JSスレッドが何かでブロックされたフレーム（60Hz基準で1.5倍）
      const prev = this.perf.lastFrameMs;
      if (prev !== 0 && nowMs - prev > 25) this.perf.dropped++;
      this.perf.lastFrameMs = nowMs;
    }
    if (this.firstFrameMs === null) this.firstFrameMs = nowMs;
    if (force) this.dirty = true;
    const cameraActive = this.controller.update(nowMs);
    // 動き終わった最初のフレームは必ず描く。ここを描かないと「停止したとき」に
    // 走らせたい処理（タイル更新・距離バッファの撮り直し・ドットの再投影）が
    // 次に何かが起きるまで実行されない
    if (this.cameraActive && !cameraActive) this.dirty = true;
    this.cameraActive = cameraActive;
    if (cameraActive) this.dirty = true;

    const state = this.controller.getState();

    // ズーム切替（ヒステリシス付き）
    const desired = Math.min(MAX_TEX_ZOOM, Math.max(MIN_TEX_ZOOM, Math.round(state.zoom)));
    if (desired !== this.texZoom && Math.abs(state.zoom - this.texZoom) > 0.5 + ZOOM_HYSTERESIS / 2) {
      this.texZoom = desired;
      this.lastTileUpdateMs = 0;
    }

    const distance = zoomToDistance(state.zoom, this.viewportHeightDp);
    const ringRadius = Math.sqrt(MAX_TILES / Math.PI) * tileSizeMeters(this.texZoom);
    // 遠景リング（粗ズーム）のLODチェーン。タイル一辺が2^Δ倍なので少ない枚数で大きく覆える。
    // ズームが下限に張り付いて近景/前のリングと同じになったリングは省く
    const farRings: {
      manager: TerrainTileManager;
      index: number;
      zoom: number;
      radius: number;
      maxTiles: number;
    }[] = [];
    let prevZoom = this.texZoom;
    for (let i = 0; i < this.farTileManagers.length; i++) {
      const zoom = Math.max(MIN_TEX_ZOOM, this.texZoom - FAR_RING_DELTAS[i]);
      if (zoom >= prevZoom) break;
      const maxTiles = MAX_FAR_TILES[i] ?? MAX_FAR_TILES[MAX_FAR_TILES.length - 1];
      farRings.push({
        manager: this.farTileManagers[i],
        index: i,
        zoom,
        radius: Math.sqrt(maxTiles / Math.PI) * tileSizeMeters(zoom),
        maxTiles,
      });
      prevZoom = zoom;
    }
    const hasFar = farRings.length > 0;
    const outerRadius = hasFar ? farRings[farRings.length - 1].radius : ringRadius;
    // フォグはカメラからの視深度に対して掛かるため、注視点までの距離を底上げした上で
    // 視界（最外リング）の半径に連動させる（リング端のタイル欠けがフォグに隠れるように）
    const fogNear = distance + outerRadius * FOG_NEAR_RATIO;
    const fogFar = distance + outerRadius * FOG_FAR_RATIO;

    // タイル範囲の更新（間引き）。
    // カメラが動いている間（ジェスチャ・回転アニメーション・慣性）は更新しない。
    // 更新が入るとタイルの取得とDEM展開が走ってJSスレッドが埋まり、そのぶん
    // アニメーションが進まなくなる（回転ボタンが引っかかる原因だった）。
    // ただし動かし続けているときも移動先の地形は要るので、一定時間で打ち切る
    const cameraSettled = !cameraActive && !this.interacting;
    const deferredTooLong = nowMs - this.lastTileUpdateMs > TILE_UPDATE_MAX_DEFER_MS;
    if ((cameraSettled || deferredTooLong) && nowMs - this.lastTileUpdateMs > TILE_UPDATE_INTERVAL_MS) {
      this.lastTileUpdateMs = nowMs;
      this.tileManager.updateVisibleTiles(state.latitude, state.longitude, state.heading, this.texZoom, ringRadius);
      // 起動直後は近景を優先し、近景が1枚描けるか一定時間経ってから遠景の取得を始める
      if (!this.farRingsStarted) {
        const elapsed = this.firstFrameMs === null ? 0 : nowMs - this.firstFrameMs;
        if (this.tileManager.hasReadyTiles() || elapsed > FAR_RING_START_DELAY_MS) this.farRingsStarted = true;
      }
      if (this.farRingsStarted) {
        for (const ring of farRings) {
          ring.manager.updateVisibleTiles(
            state.latitude,
            state.longitude,
            state.heading,
            ring.zoom,
            ring.radius,
            ring.maxTiles
          );
        }
      }
      const sampled = this.tileManager.sampleElevation(state.latitude, state.longitude);
      if (sampled !== null && Math.abs(sampled - this.targetElevation) > 1) {
        this.targetElevation = sampled;
        this.dirty = true;
      }
    }

    this.maybeRebuildOverlays(nowMs);

    if (!this.dirty) return false;
    this.dirty = false;
    const perfStartMs = __DEV__ ? performance.now() : 0;

    const { viewProj } = this.updateCameraMatrix(state, distance, fogFar);
    // 遠景（粗ズーム）を外側のリングから描き、リング毎にデプスをクリアして内側→近景を重ねる
    const rings = this.collectRings(farRings);
    // 距離バッファは表示描画より先に撮る。
    // present()のあとに別のパスを投げると、環境によっては描画結果が入らない
    this.maybeCaptureDepth(rings, viewProj, fogNear, fogFar, distance);
    this.renderer.drawFrame(
      rings,
      viewProj,
      {
        skyColor: skyColorVec(),
        fogNear,
        fogFar,
        lightDir: sunDirection(),
        // 環境光を上げて日向と日陰のコントラストを控えめにする（地図の可読性優先）
        ambient: 0.65,
        elevScale: this.elevScale,
      },
      this.overlayResources
    );
    if (__DEV__) this.logPerf(perfStartMs);
    this.frameListeners.forEach((listener) => listener());
    return true;
  }

  /**
   * ポイントの遮蔽判定に使う距離バッファを、必要なときだけ描き直す。
   *
   * カメラが止まっていて、かつ前回描いたときから見え方が変わった（カメラが動いた／
   * タイルが増えた）ときに限る。動いている間は撮っても次のフレームで古くなるうえ、
   * ドットの更新自体を止めているので要らない（maplibreのmaybeDrawDepthと同じ考え方）
   */
  private maybeCaptureDepth(
    rings: TerrainRingDraw[],
    viewProj: Mat4,
    fogNear: number,
    fogFar: number,
    distance: number
  ): void {
    if (!this.cameraSettled) return;
    const gen = this.tileManager.readyGeneration;
    if (this.depthGen === gen && this.depthViewProj !== null && sameMat4(this.depthViewProj, viewProj)) return;
    const captured = viewProj.slice() as Mat4;
    const range = Math.max(1, fogFar * 1.5, distance * 3);
    this.renderer
      .captureDepth(
        rings,
        viewProj,
        {
          skyColor: skyColorVec(),
          fogNear,
          fogFar,
          lightDir: sunDirection(),
          ambient: 0.65,
          elevScale: this.elevScale,
        },
        range,
        OCCLUSION_DEPTH_SCALE
      )
      .then((map) => {
        // 失敗（読み戻し中の再入など）は世代を進めない。次のフレームで撮り直す
        if (map === null || this.disposed) return;
        this.depthMap = map;
        this.depthViewProj = captured;
        this.depthGen = gen;
        // 読み戻しは非同期なので、届いた時点でドットを判定し直させる
        this.markDirty();
      })
      .catch(() => undefined);
  }

  /**
   * 開発時の診断: 描画バッファ(px)と、ドットを置くdp座標系の対応。
   *
   * 地形はバッファへ描いてビューへ引き伸ばして表示し、ドットはdpで重ねる。
   * 縦横の倍率が食い違うと、ドットだけが中心から離れるほどずれる
   */
  private describeViewport(): string {
     
    const canvas = this.context.canvas as any;
    const cw = Number(canvas.width) || 0;
    const ch = Number(canvas.height) || 0;
    const w = this.viewportWidthDp;
    const h = this.viewportHeightDp;
    if (w <= 0 || h <= 0 || cw <= 0 || ch <= 0) return 'vp:未確定';
    const sx = cw / w;
    const sy = ch / h;
    const skew = sx / sy - 1;
    return `vp:${w.toFixed(0)}x${h.toFixed(0)} cv:${cw}x${ch} s=${sx.toFixed(3)}/${sy.toFixed(3)} skew=${(skew * 100).toFixed(2)}%`;
  }

  /**
   * 開発時のみ: 初回地形描画までの時間と、フレームの内訳を定期出力する。
   *
   * jsとsubmit+presentを分けて出すのは、submit/presentがJSスレッドを同期で
   * ブロックする（GPU待ち）ため、合算するとJS計算が重いのかGPUが重いのか判別できないため。
   */
  private logPerf(startMs: number): void {
    const draws = this.renderer.lastTileDrawCount + (this.overlayResources === null ? 0 : 1);
    const p = this.perf;
    if (!p.firstDrawLogged && draws > 0) {
      p.firstDrawLogged = true;
      // eslint-disable-next-line no-console
      console.log(`[terrain3d] 初回地形描画まで ${Date.now() - p.createdAtMs}ms`);
    }
    const now = performance.now();
    const presentMs = this.renderer.lastPresentMs;
    p.frames++;
    p.jsMs += now - startMs - presentMs;
    p.presentMs += presentMs;
    p.draws += draws;
    if (p.lastLogMs === 0) p.lastLogMs = now;
    if (now - p.lastLogMs < PERF_LOG_INTERVAL_MS) return;
    const dem = takeDemDecodeStats();
    const summary =
      `${(p.frames / ((now - p.lastLogMs) / 1000)).toFixed(1)}fps ` +
      `js=${(p.jsMs / p.frames).toFixed(1)} present=${(p.presentMs / p.frames).toFixed(1)}ms/f\n` +
      `dropped=${p.dropped} draws=${Math.round(p.draws / p.frames)} ` +
      `tiles=${this.ringDraws.map((r) => r.tiles.length).join('/')} z=${this.texZoom}\n` +
      `heading=${this.controller.getState().heading.toFixed(1)} ` +
      `pitch=${this.controller.getState().pitch.toFixed(0)} elev=${this.targetElevation.toFixed(0)}m\n` +
      `${this.projDiag}\n` +
      `worst:${this.projWorstSurf.toFixed(0)}m pts:${this.projSamples.join(' ')} log:${this.overlaySampleLog.size}\n` +
      `${this.describeViewport()}\n` +
      `dem decode ${dem.count}枚 ${dem.totalMs.toFixed(0)}ms`;
    // 実機ではコンソールを見られないことが多いので画面にも出す
    terrain3dPerfStore.set(summary);
    // eslint-disable-next-line no-console
    console.log(`[terrain3d] ${summary.replace(/\n/g, ' ')}`);
    p.frames = 0;
    p.jsMs = 0;
    p.presentMs = 0;
    p.draws = 0;
    p.dropped = 0;
    p.lastLogMs = now;
    this.projDiagTaken = false;
    this.projWorstSurf = 0;
    this.projSamples.length = 0;
  }

  dispose(): void {
    this.disposed = true;
    setDemDecodeDeferPredicate(null);
    this.frameListeners.clear();
    this.cancelOverlayJob();
    if (this.overlayResources !== null) this.renderer.deleteTileResources(this.overlayResources);
    this.overlayResources = null;
    this.tileManager.dispose();
    this.farTileManagers.forEach((manager) => manager.dispose());
    this.demCache.dispose();
    this.renderer.dispose();
  }
}
