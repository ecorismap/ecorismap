import { replayEyeDistanceM, stepReplayCamera } from '../replayCamera';
import { REPLAY_EYE_DISTANCE_MAX_M, REPLAY_EYE_DISTANCE_MIN_M } from '../constants';

const tau = { headingMs: 900, elevationMs: 250 };

describe('stepReplayCamera', () => {
  it('方位は0/360をまたいで最短方向へ進む', () => {
    const next = stepReplayCamera({ headingDeg: 350, elevationM: 0 }, { bearingDeg: 10, groundElevationM: 0 }, 100, tau);
    // 350→10は+20度方向。340度側へ戻らないこと
    expect(next.headingDeg).toBeGreaterThan(350);
    expect(next.headingDeg).toBeLessThan(360);
  });

  it('時定数ぶん進めると差の約63%まで寄る', () => {
    const next = stepReplayCamera(
      { headingDeg: 0, elevationM: 0 },
      { bearingDeg: 100, groundElevationM: 0 },
      tau.headingMs,
      tau
    );
    expect(next.headingDeg).toBeCloseTo(100 * (1 - Math.exp(-1)), 1);
  });

  it('標高は初回だけ平滑せず即代入する（地面から生えてくる動きにしない）', () => {
    const first = stepReplayCamera({ headingDeg: 0, elevationM: null }, { bearingDeg: 0, groundElevationM: 1500 }, 16, tau);
    expect(first.elevationM).toBe(1500);
  });

  it('2回目以降の標高は平滑される', () => {
    const next = stepReplayCamera(
      { headingDeg: 0, elevationM: 1000 },
      { bearingDeg: 0, groundElevationM: 2000 },
      tau.elevationMs,
      tau
    );
    expect(next.elevationM).toBeCloseTo(1000 + 1000 * (1 - Math.exp(-1)), 1);
  });

  it('標高が取れないフレームは前回値を保つ', () => {
    const next = stepReplayCamera({ headingDeg: 0, elevationM: 800 }, { bearingDeg: 0, groundElevationM: null }, 16, tau);
    expect(next.elevationM).toBe(800);
  });
});

describe('replayEyeDistanceM', () => {
  it('短い軌跡は下限、長い軌跡は上限で頭打ちになる', () => {
    expect(replayEyeDistanceM(0.5)).toBe(REPLAY_EYE_DISTANCE_MIN_M);
    expect(replayEyeDistanceM(500)).toBe(REPLAY_EYE_DISTANCE_MAX_M);
  });

  it('その間は総距離に比例する', () => {
    const d = replayEyeDistanceM(20);
    expect(d).toBeGreaterThan(REPLAY_EYE_DISTANCE_MIN_M);
    expect(d).toBeLessThan(REPLAY_EYE_DISTANCE_MAX_M);
    expect(replayEyeDistanceM(40)).toBeCloseTo(d * 2, 5);
  });
});
