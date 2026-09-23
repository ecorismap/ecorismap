/**
 * 軌跡リプレイの追従カメラの状態を進める純関数（jestでテスト可能）。
 *
 * 進行方位をそのままカメラに入れると、折り返しや急カーブでカメラが振り回されて
 * 何が起きたか分からなくなる。方位も注視点の標高も指数平滑で追わせる。
 */
import { stepAngleToward } from '../angle';
import { REPLAY_EYE_DISTANCE_MAX_M, REPLAY_EYE_DISTANCE_MIN_M } from './constants';

export interface ReplayCameraState {
  headingDeg: number;
  /** 注視点の地表標高[m]。まだ標高が取れていなければnull */
  elevationM: number | null;
}

/**
 * 1フレーム分進める。
 *
 * @param dtMs 前フレームからの経過[ms]
 */
export const stepReplayCamera = (
  prev: ReplayCameraState,
  target: { bearingDeg: number; groundElevationM: number | null },
  dtMs: number,
  tau: { headingMs: number; elevationMs: number }
): ReplayCameraState => {
  const headingDeg = stepAngleToward(prev.headingDeg, target.bearingDeg, dtMs, tau.headingMs);
  let elevationM = prev.elevationM;
  if (target.groundElevationM !== null) {
    // 初回は平滑せず即代入する（0mから目的の標高まで数秒かけて上がると、
    // 開始直後にカメラが地面から生えてくるように見える）
    elevationM =
      prev.elevationM === null
        ? target.groundElevationM
        : prev.elevationM + (target.groundElevationM - prev.elevationM) * (1 - Math.exp(-dtMs / tau.elevationMs));
  }
  return { headingDeg, elevationM };
};

/**
 * 軌跡の総距離[km]から追従カメラの視点距離[m]を決める。
 * 1kmの散歩から100kmの移動まで、画面上の流れ方がだいたい揃うように総距離に比例させる
 */
export const replayEyeDistanceM = (totalKm: number): number =>
  Math.min(REPLAY_EYE_DISTANCE_MAX_M, Math.max(REPLAY_EYE_DISTANCE_MIN_M, (totalKm * 1000) / 14));
