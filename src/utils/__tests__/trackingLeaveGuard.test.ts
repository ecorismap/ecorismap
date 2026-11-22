import { AlertAsync, ConfirmAsync } from '../../components/molecules/AlertAsync';
import {
  confirmTrackingLeave,
  finishTrackingBeforeLeave,
  isTrackingActive,
  leaveWithTrackingGuard,
  registerTrackingLeaveHandler,
  stopAndSaveTrack,
  stopTrackingBeforeForcedLogout,
  TrackingLeaveHandler,
  TrackingLeaveResult,
  waitUntil,
} from '../trackingLeaveGuard';

jest.mock('../../components/molecules/AlertAsync', () => ({
  AlertAsync: jest.fn(async () => true),
  ConfirmAsync: jest.fn(async () => true),
  waitForModalTransition: jest.fn(async () => undefined),
}));
jest.mock('../../i18n/config', () => ({
  t: jest.fn((key: string, opts?: Record<string, string>) => (opts ? `${key}:${JSON.stringify(opts)}` : key)),
}));

const mockConfirm = ConfirmAsync as jest.MockedFunction<typeof ConfirmAsync>;
const mockAlert = AlertAsync as jest.MockedFunction<typeof AlertAsync>;

type ResultFn = jest.Mock<Promise<TrackingLeaveResult>, []>;
const ok = (): ResultFn => jest.fn(async () => ({ isOK: true, message: '' }));

const makeHandler = (overrides: Partial<TrackingLeaveHandler> = {}) => {
  const stopAndSave = ok();
  const uploadTrack = ok();
  const handler: TrackingLeaveHandler = {
    isTracking: () => true,
    getContext: () => ({ projectName: 'P1', isRunningProject: true }),
    stopAndSave,
    uploadTrack,
    ...overrides,
  };
  return {
    handler,
    stopAndSave: (overrides.stopAndSave as ResultFn | undefined) ?? stopAndSave,
    uploadTrack: (overrides.uploadTrack as ResultFn | undefined) ?? uploadTrack,
  };
};

let unregister: (() => void) | null = null;
const register = (h: TrackingLeaveHandler) => {
  unregister = registerTrackingLeaveHandler(h);
};

beforeEach(() => {
  jest.clearAllMocks();
  mockConfirm.mockResolvedValue(true);
});
afterEach(() => {
  unregister?.();
  unregister = null;
});

describe('leaveWithTrackingGuard', () => {
  it('ホームが登録していなければ軌跡の確認を出さずに操作の確認だけを出す', async () => {
    expect(isTrackingActive()).toBe(false);
    const confirmLeave = jest.fn(async () => true);
    await expect(leaveWithTrackingGuard('closeProject', confirmLeave)).resolves.toBe(true);
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(confirmLeave).toHaveBeenCalledTimes(1);
  });

  it('記録していなければ確認も保存もせずに進める', async () => {
    const { handler, stopAndSave } = makeHandler({ isTracking: () => false });
    register(handler);
    await expect(leaveWithTrackingGuard('logout', async () => true)).resolves.toBe(true);
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(stopAndSave).not.toHaveBeenCalled();
  });

  it('軌跡の確認 → 操作の確認 → 停止・保存 → アップロード の順に進める', async () => {
    const order: string[] = [];
    mockConfirm.mockImplementation(async () => {
      order.push('confirmTracking');
      return true;
    });
    const stopAndSave = jest.fn(async () => {
      order.push('stopAndSave');
      return { isOK: true, message: '' };
    });
    const uploadTrack = jest.fn(async () => {
      order.push('uploadTrack');
      return { isOK: true, message: '' };
    });
    register(makeHandler({ stopAndSave, uploadTrack }).handler);
    const confirmLeave = jest.fn(async () => {
      order.push('confirmLeave');
      return true;
    });
    await expect(leaveWithTrackingGuard('openProject', confirmLeave)).resolves.toBe(true);
    expect(order).toEqual(['confirmTracking', 'confirmLeave', 'stopAndSave', 'uploadTrack']);
  });

  it('軌跡の確認でキャンセルしたら、操作の確認も停止もしない', async () => {
    mockConfirm.mockResolvedValue(false);
    const { handler, stopAndSave } = makeHandler();
    register(handler);
    const confirmLeave = jest.fn(async () => true);
    await expect(leaveWithTrackingGuard('closeProject', confirmLeave)).resolves.toBe(false);
    expect(confirmLeave).not.toHaveBeenCalled();
    expect(stopAndSave).not.toHaveBeenCalled();
  });

  it('続く操作の確認でキャンセルしたら、記録を止めない（記録を続けたままプロジェクトに留まれる）', async () => {
    const { handler, stopAndSave, uploadTrack } = makeHandler();
    register(handler);
    await expect(leaveWithTrackingGuard('closeProject', async () => false)).resolves.toBe(false);
    expect(stopAndSave).not.toHaveBeenCalled();
    expect(uploadTrack).not.toHaveBeenCalled();
  });

  it('アップロードできなかったら知らせて進めない（閉じると捨てるデータと一緒に軌跡が消えるため）', async () => {
    const uploadTrack = jest.fn(async () => ({ isOK: false, message: 'offline' }));
    register(makeHandler({ uploadTrack }).handler);
    await expect(leaveWithTrackingGuard('logout', async () => true)).resolves.toBe(false);
    const message = mockAlert.mock.calls[0][0];
    expect(message).toContain('Home.alert.stopTrackingUploadFailed');
    expect(message).toContain('offline');
  });

  it('アップロードが例外を投げても進めない', async () => {
    const uploadTrack = jest.fn(async (): Promise<TrackingLeaveResult> => {
      throw new Error('crash');
    });
    register(makeHandler({ uploadTrack }).handler);
    await expect(leaveWithTrackingGuard('closeProject', async () => true)).resolves.toBe(false);
    expect(mockAlert.mock.calls[0][0]).toContain('crash');
  });

  it('設定の編集中・端末内のデータでは保存だけしてアップロードしない', async () => {
    const setting = makeHandler({ getContext: () => ({ projectName: 'P1', isRunningProject: false }) });
    register(setting.handler);
    await expect(leaveWithTrackingGuard('closeProject', async () => true)).resolves.toBe(true);
    expect(setting.stopAndSave).toHaveBeenCalledTimes(1);
    expect(setting.uploadTrack).not.toHaveBeenCalled();

    const local = makeHandler({ getContext: () => ({ projectName: undefined, isRunningProject: true }) });
    register(local.handler);
    await expect(leaveWithTrackingGuard('logout', async () => true)).resolves.toBe(true);
    expect(local.uploadTrack).not.toHaveBeenCalled();
  });

  it('保存に失敗したら知らせて進めず、アップロードもしない', async () => {
    const stopAndSave = jest.fn(async () => ({ isOK: false, message: 'boom' }));
    const { handler, uploadTrack } = makeHandler({ stopAndSave });
    register(handler);
    await expect(leaveWithTrackingGuard('closeProject', async () => true)).resolves.toBe(false);
    expect(mockAlert.mock.calls[0][0]).toContain('Home.alert.stopTrackingSaveFailed');
    expect(mockAlert.mock.calls[0][0]).toContain('boom');
    expect(uploadTrack).not.toHaveBeenCalled();
  });

  it('保存処理が例外を投げても進めない', async () => {
    const stopAndSave = jest.fn(async (): Promise<TrackingLeaveResult> => {
      throw new Error('crash');
    });
    register(makeHandler({ stopAndSave }).handler);
    await expect(leaveWithTrackingGuard('openProject', async () => true)).resolves.toBe(false);
    expect(mockAlert.mock.calls[0][0]).toContain('crash');
  });

  it('保存できたが知らせがあれば表示してから進める', async () => {
    const stopAndSave = jest.fn(async () => ({ isOK: true, message: 'short track' }));
    register(makeHandler({ stopAndSave }).handler);
    await expect(leaveWithTrackingGuard('closeProject', async () => true)).resolves.toBe(true);
    expect(mockAlert).toHaveBeenCalledWith('short track');
  });

  it('登録を解除したら古いハンドラは使わない（後から登録したものは残す）', async () => {
    const first = makeHandler();
    const unregisterFirst = registerTrackingLeaveHandler(first.handler);
    const second = makeHandler();
    register(second.handler);
    unregisterFirst();
    expect(isTrackingActive()).toBe(true);
    await leaveWithTrackingGuard('closeProject', async () => true);
    expect(first.stopAndSave).not.toHaveBeenCalled();
    expect(second.stopAndSave).toHaveBeenCalledTimes(1);
  });
});

describe('confirmTrackingLeave', () => {
  it('通常利用中のプロジェクトでは保存先とアップロードの案内、キャンセル時の案内を出す。確認だけで何も止めない', async () => {
    const { handler, stopAndSave } = makeHandler();
    register(handler);
    await expect(confirmTrackingLeave('openProject')).resolves.toBe(true);
    const message = mockConfirm.mock.calls[0][0];
    expect(message).toContain('Home.confirm.stopTrackingBeforeOpenProject');
    expect(message).toContain('Home.label.trackSaveDestProject');
    expect(message).toContain('P1');
    expect(message).toContain('Home.confirm.stopTrackingUploadNote');
    expect(message).toContain('Home.confirm.stopTrackingCancelNote');
    expect(stopAndSave).not.toHaveBeenCalled();
  });

  it('プロジェクトを開いていなければ端末内のデータへ保存すると案内し、アップロードの案内は出さない', async () => {
    register(makeHandler({ getContext: () => ({ projectName: undefined, isRunningProject: true }) }).handler);
    await confirmTrackingLeave('logout');
    const message = mockConfirm.mock.calls[0][0];
    expect(message).toContain('Home.confirm.stopTrackingBeforeLogout');
    expect(message).toContain('Home.label.trackSaveDestLocal');
    expect(message).not.toContain('Home.confirm.stopTrackingUploadNote');
    expect(message).not.toContain('Home.confirm.stopTrackingSettingNote');
  });

  it('設定の編集中は、軌跡がアップロードされず破棄されると案内する', async () => {
    register(makeHandler({ getContext: () => ({ projectName: 'P1', isRunningProject: false }) }).handler);
    await confirmTrackingLeave('closeProject');
    const message = mockConfirm.mock.calls[0][0];
    expect(message).toContain('Home.confirm.stopTrackingSettingNote');
    expect(message).not.toContain('Home.confirm.stopTrackingUploadNote');
  });
});

describe('finishTrackingBeforeLeave / stopTrackingBeforeForcedLogout', () => {
  it('記録していなければ何もしない', async () => {
    const { handler, stopAndSave } = makeHandler({ isTracking: () => false });
    register(handler);
    await expect(finishTrackingBeforeLeave()).resolves.toBe(true);
    expect(stopAndSave).not.toHaveBeenCalled();
  });

  it('取りやめられないログアウトでは確認せず通知して止めて保存し、アップロードはせず、失敗しても進める', async () => {
    const stopAndSave = jest.fn(async () => ({ isOK: false, message: 'boom' }));
    const { handler, uploadTrack } = makeHandler({ stopAndSave });
    register(handler);
    await expect(stopTrackingBeforeForcedLogout()).resolves.toBe(true);
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockAlert.mock.calls[0][0]).toContain('Home.alert.stopTrackingForLogout');
    expect(stopAndSave).toHaveBeenCalledTimes(1);
    expect(uploadTrack).not.toHaveBeenCalled();
    expect(mockAlert.mock.calls[1][0]).toContain('Home.alert.stopTrackingSaveFailedForced');
  });
});

describe('stopAndSaveTrack', () => {
  it('記録を止め、GPSを切ってから保存し、保存した軌跡レイヤを知らせる', async () => {
    const order: string[] = [];
    const onSaved = jest.fn();
    const result = await stopAndSaveTrack({
      toggleTracking: async (state) => {
        order.push(`tracking:${state}`);
      },
      toggleGPS: async (state) => {
        order.push(`gps:${state}`);
      },
      saveTrackLog: async () => {
        order.push('save');
        return { isOK: true, message: 'note', layer: { id: 'track' } };
      },
      onSaved,
    });
    expect(order).toEqual(['tracking:off', 'gps:off', 'save']);
    expect(result).toEqual({ isOK: true, message: 'note' });
    expect(onSaved).toHaveBeenCalledWith('track');
  });

  it('点が足りず保存しなかった・保存に失敗したときは、アップロードの対象を残さない', async () => {
    const onSaved = jest.fn();
    await stopAndSaveTrack({
      toggleTracking: async () => undefined,
      toggleGPS: async () => undefined,
      saveTrackLog: async () => ({ isOK: true, message: 'insufficient', layer: undefined }),
      onSaved,
    });
    expect(onSaved).toHaveBeenLastCalledWith(undefined);
    await stopAndSaveTrack({
      toggleTracking: async () => undefined,
      toggleGPS: async () => undefined,
      saveTrackLog: async () => ({ isOK: false, message: 'fail', layer: { id: 'track' } }),
      onSaved,
    });
    expect(onSaved).toHaveBeenLastCalledWith(undefined);
  });
});

describe('waitUntil', () => {
  it('条件が満たされたら true、時間切れなら false', async () => {
    let n = 0;
    await expect(waitUntil(() => ++n >= 3, { timeoutMs: 1000, intervalMs: 1 })).resolves.toBe(true);
    await expect(waitUntil(() => false, { timeoutMs: 10, intervalMs: 1 })).resolves.toBe(false);
  });
});
