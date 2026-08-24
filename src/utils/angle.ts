// 表示角度を目標角度へ1フレーム分近づける指数平滑ステップ（角度ラップ考慮）。
// 係数を k = 1 - exp(-dt/τ) とすることで、フレーム落ちや更新間引きがあっても
// 実時間ベースの収束速度が一定になる。
export const stepAngleToward = (current: number, target: number, dtMs: number, tauMs: number): number => {
  // 差を-180..180に正規化（359→1は+2として扱う）
  const delta = ((target - current + 540) % 360) - 180;
  const k = 1 - Math.exp(-dtMs / tauMs);
  const next = current + delta * k;
  return ((next % 360) + 360) % 360;
};

// 補間の時定数（小さいほど機敏、大きいほど滑らか）
export const SMOOTHING_TAU_MS = 180;
// 目標との差がこの角度未満になったら補間ループを停止（静止時のCPU消費を抑える）
export const SNAP_EPSILON_DEG = 0.2;
// ネイティブ更新頻度の上限（Fabric負荷緩和のため実質30fps）
export const MIN_FRAME_INTERVAL_MS = 33;
