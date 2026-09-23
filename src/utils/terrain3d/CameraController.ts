/**
 * 3DビューのorbitカメラコントローラCameraController（three.js非依存の純TS）。
 *
 * 状態は{注視点latlon, zoom, heading, pitch}。ジェスチャ入力・慣性・
 * animateCamera互換のアニメーションを担い、TerrainSceneが毎フレーム
 * update()を呼んで現在値を取り出す。
 */
import { MAX_PITCH_DEG, MIN_PITCH_DEG } from './constants';
import { clampZoom, lonLatToMercator, mercatorToLonLat, MERCATOR_CIRCUMFERENCE } from './coords';
import { Terrain3DCameraState } from './types';

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

interface Tween {
  from: number;
  to: number;
  startMs: number;
  durationMs: number;
}

/** 角度差を-180〜180に正規化（最短方向へ回すため） */
export const normalizeAngleDelta = (deltaDeg: number): number => {
  let d = deltaDeg % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
};

const normalizeHeading = (deg: number): number => ((deg % 360) + 360) % 360;

export class CameraController {
  private state: Terrain3DCameraState;
  private viewportHeightPx: number;
  /** ピクセル→メルカトルm換算に使うズーム値のキャッシュ */
  private tweens: Partial<Record<'latMerc' | 'lonMerc' | 'zoom' | 'heading' | 'pitch', Tween>> = {};
  /** 慣性パンの速度[メルカトルm/ms] */
  private inertiaVE = 0;
  private inertiaVN = 0;
  private lastUpdateMs = 0;

  constructor(initial: Terrain3DCameraState, viewportHeightPx: number) {
    this.state = { ...initial, zoom: clampZoom(initial.zoom), heading: normalizeHeading(initial.heading) };
    this.viewportHeightPx = viewportHeightPx;
  }

  getState(): Terrain3DCameraState {
    return { ...this.state };
  }

  setViewportHeight(px: number): void {
    this.viewportHeightPx = px;
  }

  /** 画面1pxあたりのメルカトルm（現在ズーム基準） */
  mercPerPx(): number {
    return MERCATOR_CIRCUMFERENCE / (256 * Math.pow(2, this.state.zoom));
  }

  /**
   * 1本指パン。ドラッグした向きに地図が追従する（=注視点は逆方向へ動く）。
   * 簡略化のためピッチによる距離補正は行わない（前方ドラッグがやや控えめに動く程度）。
   */
  panByScreenDelta(dxPx: number, dyPx: number): void {
    this.cancelTweens();
    const mpp = this.mercPerPx();
    const h = (this.state.heading * Math.PI) / 180;
    // 画面右方向・上方向のワールド(東,北)成分
    const rightE = Math.cos(h);
    const rightN = -Math.sin(h);
    const upE = Math.sin(h);
    const upN = Math.cos(h);
    const deltaE = -(dxPx * rightE + -dyPx * upE) * mpp;
    const deltaN = -(dxPx * rightN + -dyPx * upN) * mpp;
    this.translateMercator(deltaE, deltaN);
  }

  /** 慣性パンの初速を与える（速度は画面px/ms） */
  startPanInertia(vxPxPerMs: number, vyPxPerMs: number): void {
    const mpp = this.mercPerPx();
    const h = (this.state.heading * Math.PI) / 180;
    const rightE = Math.cos(h);
    const rightN = -Math.sin(h);
    const upE = Math.sin(h);
    const upN = Math.cos(h);
    this.inertiaVE = -(vxPxPerMs * rightE + -vyPxPerMs * upE) * mpp;
    this.inertiaVN = -(vxPxPerMs * rightN + -vyPxPerMs * upN) * mpp;
  }

  stopInertia(): void {
    this.inertiaVE = 0;
    this.inertiaVN = 0;
  }

  /** ピンチズーム。scaleは累積でなく前フレームからの倍率 */
  zoomByScale(scale: number): void {
    if (scale <= 0) return;
    this.cancelTweens();
    this.state.zoom = clampZoom(this.state.zoom + Math.log2(scale));
  }

  /**
   * 注視点を外部の計算結果で置き換える（眺望モードで毎フレーム呼ばれる）。
   *
   * tweenは止めない。方位・俯角の補間中も注視点はそこから導出し直すため、
   * ここでキャンセルすると補間が1フレームで終わってしまう
   */
  setDerivedCenter(latitude: number, longitude: number): void {
    this.state.latitude = latitude;
    this.state.longitude = longitude;
  }

  rotateBy(deltaDeg: number): void {
    this.cancelTweens();
    this.state.heading = normalizeHeading(this.state.heading + deltaDeg);
  }

  /**
   * 進行中のアニメーションの最終方位（アニメーションしていなければ現在方位）。
   *
   * ボタン連打の基準をここから取る。補間の途中値を基準にすると、
   * 押すたびに「まだ回り切っていない位置＋30度」になって回転量が目減りする
   */
  get targetHeading(): number {
    const tween = this.tweens.heading;
    return tween === undefined ? this.state.heading : normalizeHeading(tween.to);
  }

  /** 進行中のアニメーションの最終ピッチ（同上） */
  get targetPitch(): number {
    const tween = this.tweens.pitch;
    return tween === undefined ? this.state.pitch : tween.to;
  }

  /** 進行中のアニメーションの最終ズーム（同上） */
  get targetZoom(): number {
    const tween = this.tweens.zoom;
    return tween === undefined ? this.state.zoom : tween.to;
  }

  /**
   * @param maxPitchDeg ピッチの上限。眺望（水平より上も向ける）だけ広げて渡す
   */
  pitchBy(deltaDeg: number, maxPitchDeg: number = MAX_PITCH_DEG): void {
    this.cancelTweens();
    this.state.pitch = Math.min(maxPitchDeg, Math.max(MIN_PITCH_DEG, this.state.pitch + deltaDeg));
  }

  /**
   * animateCamera互換のアニメーション。headingは最短方向へ回す。
   * duration 0以下は即時反映。
   *
   * @param maxPitchDeg ピッチの上限。眺望（水平に見る＝90度）のように、
   *   通常の操作上限MAX_PITCH_DEGを超えて倒す必要がある呼び出しだけ指定する
   */
  animateTo(
    target: { center?: { latitude: number; longitude: number }; heading?: number; zoom?: number; pitch?: number },
    durationMs: number,
    nowMs: number,
    maxPitchDeg: number = MAX_PITCH_DEG
  ): void {
    this.stopInertia();
    const clampPitch = (deg: number): number => Math.min(maxPitchDeg, Math.max(MIN_PITCH_DEG, deg));
    if (durationMs <= 0) {
      if (target.center) {
        this.state.latitude = target.center.latitude;
        this.state.longitude = target.center.longitude;
      }
      if (target.heading !== undefined) this.state.heading = normalizeHeading(target.heading);
      if (target.zoom !== undefined) this.state.zoom = clampZoom(target.zoom);
      if (target.pitch !== undefined) this.state.pitch = clampPitch(target.pitch);
      return;
    }
    if (target.center) {
      const from = lonLatToMercator(this.state.longitude, this.state.latitude);
      const to = lonLatToMercator(target.center.longitude, target.center.latitude);
      this.tweens.lonMerc = { from: from.mx, to: to.mx, startMs: nowMs, durationMs };
      this.tweens.latMerc = { from: from.my, to: to.my, startMs: nowMs, durationMs };
    }
    if (target.heading !== undefined) {
      const delta = normalizeAngleDelta(target.heading - this.state.heading);
      this.tweens.heading = { from: this.state.heading, to: this.state.heading + delta, startMs: nowMs, durationMs };
    }
    if (target.zoom !== undefined) {
      this.tweens.zoom = { from: this.state.zoom, to: clampZoom(target.zoom), startMs: nowMs, durationMs };
    }
    if (target.pitch !== undefined) {
      this.tweens.pitch = { from: this.state.pitch, to: clampPitch(target.pitch), startMs: nowMs, durationMs };
    }
  }

  /**
   * 毎フレーム呼ぶ。アニメーション・慣性を進める。
   * @returns まだ動きがあり再描画が必要ならtrue
   */
  update(nowMs: number): boolean {
    let active = false;
    const dt = this.lastUpdateMs === 0 ? 16 : Math.min(100, nowMs - this.lastUpdateMs);
    this.lastUpdateMs = nowMs;

    // 慣性（時定数~320msの指数減衰）
    if (this.inertiaVE !== 0 || this.inertiaVN !== 0) {
      this.translateMercator(this.inertiaVE * dt, this.inertiaVN * dt);
      const decay = Math.exp(-dt / 320);
      this.inertiaVE *= decay;
      this.inertiaVN *= decay;
      const speed = Math.hypot(this.inertiaVE, this.inertiaVN) / this.mercPerPx(); // px/ms
      if (speed < 0.02) this.stopInertia();
      else active = true;
    }

    // tween
    const mercTweenX = this.tweens.lonMerc;
    const mercTweenY = this.tweens.latMerc;
    if (mercTweenX && mercTweenY) {
      const t = Math.min(1, (nowMs - mercTweenX.startMs) / mercTweenX.durationMs);
      const e = easeOutCubic(t);
      const mx = mercTweenX.from + (mercTweenX.to - mercTweenX.from) * e;
      const my = mercTweenY.from + (mercTweenY.to - mercTweenY.from) * e;
      const ll = mercatorToLonLat(mx, my);
      this.state.longitude = ll.longitude;
      this.state.latitude = ll.latitude;
      if (t >= 1) {
        delete this.tweens.lonMerc;
        delete this.tweens.latMerc;
      } else active = true;
    }
    for (const key of ['zoom', 'heading', 'pitch'] as const) {
      const tw = this.tweens[key];
      if (!tw) continue;
      const t = Math.min(1, (nowMs - tw.startMs) / tw.durationMs);
      const value = tw.from + (tw.to - tw.from) * easeOutCubic(t);
      if (key === 'heading') this.state.heading = normalizeHeading(value);
      else if (key === 'zoom') this.state.zoom = value;
      else this.state.pitch = value;
      if (t >= 1) delete this.tweens[key];
      else active = true;
    }
    return active;
  }

  private cancelTweens(): void {
    this.tweens = {};
  }

  private translateMercator(deltaE: number, deltaN: number): void {
    const cur = lonLatToMercator(this.state.longitude, this.state.latitude);
    const ll = mercatorToLonLat(cur.mx + deltaE, cur.my + deltaN);
    // メルカトルの定義域内にクランプ（極端な高緯度への逸脱を防ぐ）
    this.state.longitude = Math.max(-179.9, Math.min(179.9, ll.longitude));
    this.state.latitude = Math.max(-85, Math.min(85, ll.latitude));
  }
}
