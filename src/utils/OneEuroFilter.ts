import { Position } from 'geojson';

/**
 * 1€フィルタ（Casiez et al. 2012, https://gery.casiez.net/1euro/）による手ぶれ補正。
 * 低速時はカットオフを下げて強く平滑化しジッタを抑え、
 * 高速時は速度に応じてカットオフを上げて追従遅延を抑える。
 * 手描き入力に適した特性で、依存パッケージなしの軽量実装。
 */

//低速時の基本カットオフ周波数(Hz)。小さいほど強く平滑化される
const DEFAULT_MIN_CUTOFF = 1.0;
//速度に応じたカットオフ増加係数。大きいほど速筆時の遅延が減る
const DEFAULT_BETA = 0.007;
//微分信号のカットオフ周波数(Hz)
const DEFAULT_D_CUTOFF = 1.0;
//タイムスタンプが取れない・進まない場合のフォールバックdt(秒)
const FALLBACK_DT = 1 / 60;

class LowPassFilter {
  private y: number | undefined = undefined;

  filter(value: number, alpha: number): number {
    if (this.y === undefined) {
      this.y = value;
    } else {
      this.y = alpha * value + (1 - alpha) * this.y;
    }
    return this.y;
  }

  reset() {
    this.y = undefined;
  }
}

export class OneEuroFilter {
  private readonly minCutoff: number;
  private readonly beta: number;
  private readonly dCutoff: number;
  private xFilter = new LowPassFilter();
  private dxFilter = new LowPassFilter();
  private lastTimeMs: number | undefined = undefined;
  private lastValue: number | undefined = undefined;

  constructor(minCutoff = DEFAULT_MIN_CUTOFF, beta = DEFAULT_BETA, dCutoff = DEFAULT_D_CUTOFF) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  private static alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(value: number, timestampMs: number): number {
    let dt = FALLBACK_DT;
    if (this.lastTimeMs !== undefined && timestampMs > this.lastTimeMs) {
      dt = (timestampMs - this.lastTimeMs) / 1000;
    }
    this.lastTimeMs = timestampMs;

    const dx = this.lastValue === undefined ? 0 : (value - this.lastValue) / dt;
    this.lastValue = value;
    const dxFiltered = this.dxFilter.filter(dx, OneEuroFilter.alpha(this.dCutoff, dt));

    const cutoff = this.minCutoff + this.beta * Math.abs(dxFiltered);
    return this.xFilter.filter(value, OneEuroFilter.alpha(cutoff, dt));
  }

  reset() {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.lastTimeMs = undefined;
    this.lastValue = undefined;
  }
}

/**
 * スクリーン座標(x, y)用の1€フィルタ。ペンの手ぶれ補正に使う。
 */
export class PositionFilter {
  private fx: OneEuroFilter;
  private fy: OneEuroFilter;

  constructor(minCutoff = DEFAULT_MIN_CUTOFF, beta = DEFAULT_BETA, dCutoff = DEFAULT_D_CUTOFF) {
    this.fx = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.fy = new OneEuroFilter(minCutoff, beta, dCutoff);
  }

  filter(xy: Position, timestampMs: number): Position {
    return [this.fx.filter(xy[0], timestampMs), this.fy.filter(xy[1], timestampMs)];
  }

  reset() {
    this.fx.reset();
    this.fy.reset();
  }
}
