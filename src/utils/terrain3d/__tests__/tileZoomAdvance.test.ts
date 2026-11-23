import { advanceActiveZoom } from '../tileZoomAdvance';
import { shouldRetryOverlayBuild } from '../overlayGeometry';

describe('表示ズームの切り替えと世代（V-M4(B)）', () => {
  it('新しいズームのタイルが揃ったら表示ズームを進め、世代を進める', () => {
    expect(advanceActiveZoom(14, 15, true, 9)).toEqual({ activeZoom: 15, changed: true });
  });

  it('揃っていなければ旧ズームのまま', () => {
    expect(advanceActiveZoom(14, 15, false, 9)).toEqual({ activeZoom: 14, changed: false });
  });

  it('同じズームのままなら世代を進めない（作り直しを無駄に起こさない）', () => {
    expect(advanceActiveZoom(15, 15, true, 9)).toEqual({ activeZoom: 15, changed: false });
  });

  it('必要タイルが無ければ進めない', () => {
    expect(advanceActiveZoom(14, 15, true, 0)).toEqual({ activeZoom: 14, changed: false });
  });

  it('最後の新タイル到着直後に旧ズームの標高で作り直しても、表示ズームの切替で再度作り直される', () => {
    const interval = 2000;
    let readyGen = 10;
    let activeZoom: number | null = 14;
    // 最後のz15タイルが届く（readyGen++）→ 次のフレームで作り直し（まだactiveZoom=14なのでz14の標高・暫定）
    readyGen++;
    const lastReadyGen = readyGen;
    const lastBuildMs = 10000;
    // 250ms後のupdateVisibleTilesでactiveZoomが進む
    const advanced = advanceActiveZoom(activeZoom, 15, true, 9);
    activeZoom = advanced.activeZoom;
    if (advanced.changed) readyGen++;
    expect(activeZoom).toBe(15);
    // 間引き間隔が過ぎたら、ほかにタイルが届かなくても作り直す
    expect(
      shouldRetryOverlayBuild({
        hadMissing: false,
        hadProvisional: true,
        readyGen,
        lastReadyGen,
        nowMs: lastBuildMs + interval + 1,
        lastBuildMs,
        intervalMs: interval,
      })
    ).toBe(true);
  });
});
