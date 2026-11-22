import { getTrackSaveNotice, runIfIdle, runTrackingPress, TrackingPressDeps } from '../trackingPress';

// trackingPress → trackingLeaveGuard（stopAndSaveTrack）が読み込むモジュール
jest.mock('../../components/molecules/AlertAsync', () => ({
  AlertAsync: jest.fn(async () => true),
  ConfirmAsync: jest.fn(async () => true),
  waitForModalTransition: jest.fn(async () => undefined),
}));
jest.mock('../mmkvStorage', () => ({
  trackLogMMKV: { getTrackingState: jest.fn(() => 'off') },
}));
jest.mock('../../i18n/config', () => ({
  t: jest.fn((key: string) => key),
}));

describe('runIfIdle（軌跡ボタンの再入防止、軌跡監査 T-M2）', () => {
  it('処理中の押し直しは実行せず false を返し、終わったら再び実行できる', async () => {
    const busy = { current: false };
    let release!: () => void;
    const first = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    const second = jest.fn(async () => {});

    const firstRun = runIfIdle(busy, first);
    expect(busy.current).toBe(true);
    await expect(runIfIdle(busy, second)).resolves.toBe(false);
    expect(second).not.toHaveBeenCalled();

    release();
    await expect(firstRun).resolves.toBe(true);
    expect(busy.current).toBe(false);

    await expect(runIfIdle(busy, second)).resolves.toBe(true);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('処理が失敗してもフラグを戻し、例外は呼び出し元へ伝える', async () => {
    const busy = { current: false };
    await expect(
      runIfIdle(busy, async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    expect(busy.current).toBe(false);
  });
});

describe('getTrackSaveNotice（停止時の知らせ、軌跡監査 T-L1）', () => {
  it('保存に失敗したら文言を返す', () => {
    expect(getTrackSaveNotice({ isOK: false, message: '保存できません' })).toBe('保存できません');
  });

  it('点が足りず保存しなかったとき（isOK:true・文言あり）も文言を返す', () => {
    expect(getTrackSaveNotice({ isOK: true, message: '有効な軌跡データが不足しています' })).toBe(
      '有効な軌跡データが不足しています'
    );
  });

  it('問題なく保存できたら何も返さない', () => {
    expect(getTrackSaveNotice({ isOK: true, message: '' })).toBeUndefined();
  });
});

type Layer = { id: string };
type Rec = { id: string; userId: string };

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

const makeDeps = (
  calls: string[],
  overrides: Partial<TrackingPressDeps<Layer, Rec>> = {}
): TrackingPressDeps<Layer, Rec> => ({
  trackingState: 'off',
  flags: { starting: { current: false }, stopping: { current: false } },
  messages: { confirmStart: 'confirmStart', confirmStop: 'confirmStop', busy: 'busy' },
  checkUnsavedTrackLog: jest.fn(async () => ({ isOK: true, message: '' })),
  confirm: jest.fn(async (m: string) => {
    calls.push(`confirm:${m}`);
    return true;
  }),
  alert: jest.fn(async (m: string) => {
    calls.push(`alert:${m}`);
  }),
  waitForModalTransition: jest.fn(async () => {
    calls.push('waitForModalTransition');
  }),
  confirmLocationPermission: jest.fn(async () => 'granted' as const),
  confirmLocationAccuracy: jest.fn(async () => true),
  toggleGPS: jest.fn(async (s: string) => {
    calls.push(`toggleGPS:${s}`);
  }),
  toggleTracking: jest.fn(async (s: string) => {
    calls.push(`toggleTracking:${s}`);
  }),
  saveTrackLog: jest.fn(async () => {
    calls.push('saveTrackLog');
    return { isOK: true, message: '', layer: { id: 'L1' }, record: { id: 'R1', userId: 'U1' } };
  }),
  onStarted: jest.fn(() => {
    calls.push('onStarted');
  }),
  onSaved: jest.fn((layer: Layer, record: Rec) => {
    calls.push(`onSaved:${layer.id}:${record.id}`);
  }),
  ...overrides,
});

describe('runTrackingPress（Home の軌跡ボタン）', () => {
  it('開始: 確認・権限のあと GPS → 記録の順に始める', async () => {
    const calls: string[] = [];
    const deps = makeDeps(calls);
    await runTrackingPress(deps);
    expect(calls).toEqual(['confirm:confirmStart', 'toggleGPS:follow', 'toggleTracking:on', 'onStarted']);
    expect(deps.flags.starting.current).toBe(false);
  });

  it('プロジェクト設定の編集中は開始せず、案内だけ出す（T-M9）', async () => {
    const calls: string[] = [];
    const deps = makeDeps(calls, { startBlockedMessage: 'blocked' });
    await runTrackingPress(deps);
    expect(calls).toEqual(['alert:blocked']);
    expect(deps.checkUnsavedTrackLog).not.toHaveBeenCalled();
    expect(deps.flags.starting.current).toBe(false);
  });

  it('開始を止める案内があっても、記録中なら停止はできる（T-M9）', async () => {
    const calls: string[] = [];
    const deps = makeDeps(calls, { trackingState: 'on', startBlockedMessage: 'blocked' });
    await runTrackingPress(deps);
    expect(calls).toEqual(['confirm:confirmStop', 'toggleTracking:off', 'toggleGPS:off', 'saveTrackLog', 'onSaved:L1:R1']);
  });

  it('精度の確認で設定を開いたら（false）記録を始めない（T-M5）', async () => {
    const calls: string[] = [];
    const deps = makeDeps(calls, { confirmLocationAccuracy: jest.fn(async () => false) });
    await runTrackingPress(deps);
    expect(calls).toEqual(['confirm:confirmStart']);
    expect(deps.confirmLocationAccuracy).toHaveBeenCalledTimes(1);
  });

  it('開始の処理中に開始側へ入った押し直しは、二重に始めず処理中であることを知らせる（T-M2）', async () => {
    const calls: string[] = [];
    const gps = deferred();
    const flags = { starting: { current: false }, stopping: { current: false } };
    const first = makeDeps(calls, {
      flags,
      toggleGPS: jest.fn(async (s: string) => {
        calls.push(`toggleGPS:${s}`);
        await gps.promise;
      }),
    });
    const firstRun = runTrackingPress(first);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(flags.starting.current).toBe(true);

    const second = makeDeps(calls, { flags });
    await runTrackingPress(second);
    expect(second.confirm).not.toHaveBeenCalled();
    expect(second.toggleTracking).not.toHaveBeenCalled();
    expect(second.alert).toHaveBeenCalledWith('busy');

    gps.resolve();
    await firstRun;
    expect(first.toggleTracking).toHaveBeenCalledTimes(1);
    expect(flags.starting.current).toBe(false);
  });

  it('開始の処理中（記録中の表示になったあと）でも、停止は確認して止めて保存できる', async () => {
    const calls: string[] = [];
    const tracking = deferred();
    const flags = { starting: { current: false }, stopping: { current: false } };
    const start = makeDeps(calls, {
      flags,
      toggleTracking: jest.fn(async (s: string) => {
        calls.push(`toggleTracking:${s}`);
        // startTracking・位置の取得待ちが続いている
        await tracking.promise;
      }),
    });
    const startRun = runTrackingPress(start);
    for (let i = 0; i < 10 && !(start.toggleTracking as jest.Mock).mock.calls.length; i++) await Promise.resolve();
    expect(flags.starting.current).toBe(true);

    const stop = makeDeps(calls, { flags, trackingState: 'on' });
    await runTrackingPress(stop);
    expect(stop.confirm).toHaveBeenCalledWith('confirmStop');
    expect(stop.alert).not.toHaveBeenCalled();
    expect(stop.toggleTracking).toHaveBeenCalledWith('off');
    expect(stop.saveTrackLog).toHaveBeenCalledTimes(1);
    expect(stop.onSaved).toHaveBeenCalledTimes(1);

    tracking.resolve();
    await startRun;
  });

  it('停止: 先に記録と GPS を止めてから保存し、サマリーを開く（T-L2）', async () => {
    const calls: string[] = [];
    await runTrackingPress(makeDeps(calls, { trackingState: 'on' }));
    expect(calls).toEqual([
      'confirm:confirmStop',
      'toggleTracking:off',
      'toggleGPS:off',
      'saveTrackLog',
      'onSaved:L1:R1',
    ]);
  });

  it('停止の確認をキャンセルしたら何もしない', async () => {
    const calls: string[] = [];
    const deps = makeDeps(calls, { trackingState: 'on', confirm: jest.fn(async () => false) });
    await runTrackingPress(deps);
    expect(deps.toggleTracking).not.toHaveBeenCalled();
    expect(deps.saveTrackLog).not.toHaveBeenCalled();
    expect(deps.flags.stopping.current).toBe(false);
  });

  it('保存の知らせがあれば、サマリーを開く前にアラートを出す（T-L1）', async () => {
    const calls: string[] = [];
    const deps = makeDeps(calls, {
      trackingState: 'on',
      saveTrackLog: jest.fn(async () => {
        calls.push('saveTrackLog');
        return { isOK: true, message: '無効な点を除外しました', layer: { id: 'L1' }, record: { id: 'R1', userId: 'U1' } };
      }),
    });
    await runTrackingPress(deps);
    expect(calls.slice(-3)).toEqual(['waitForModalTransition', 'alert:無効な点を除外しました', 'onSaved:L1:R1']);
  });

  it('点が足りず保存しなかったときは知らせだけ出し、サマリーは開かない（T-L1）', async () => {
    const calls: string[] = [];
    const deps = makeDeps(calls, {
      trackingState: 'on',
      saveTrackLog: jest.fn(async () => ({ isOK: true, message: '有効な軌跡データが不足しています' })),
    });
    await runTrackingPress(deps);
    expect(deps.alert).toHaveBeenCalledWith('有効な軌跡データが不足しています');
    expect(deps.onSaved).not.toHaveBeenCalled();
  });

  it('停止・保存の処理中に開始側へ入った押し直しは、始めずに知らせる', async () => {
    const calls: string[] = [];
    const save = deferred();
    const flags = { starting: { current: false }, stopping: { current: false } };
    const stop = makeDeps(calls, {
      flags,
      trackingState: 'on',
      saveTrackLog: jest.fn(async () => {
        await save.promise;
        return { isOK: true, message: '', layer: { id: 'L1' }, record: { id: 'R1', userId: 'U1' } };
      }),
    });
    const stopRun = runTrackingPress(stop);
    for (let i = 0; i < 20 && !(stop.saveTrackLog as jest.Mock).mock.calls.length; i++) await Promise.resolve();
    expect(flags.stopping.current).toBe(true);

    // toggleTracking('off') で記録の状態は先に 'off' になっている
    const again = makeDeps(calls, { flags, trackingState: 'off' });
    await runTrackingPress(again);
    expect(again.alert).toHaveBeenCalledWith('busy');
    expect(again.checkUnsavedTrackLog).not.toHaveBeenCalled();
    expect(again.toggleTracking).not.toHaveBeenCalled();

    // 停止の二重実行も防ぐ
    const stopAgain = makeDeps(calls, { flags, trackingState: 'on' });
    await runTrackingPress(stopAgain);
    expect(stopAgain.confirm).not.toHaveBeenCalled();

    save.resolve();
    await stopRun;
    expect(flags.stopping.current).toBe(false);
  });
});
