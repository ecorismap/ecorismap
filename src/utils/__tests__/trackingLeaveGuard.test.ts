import { AlertAsync, ConfirmAsync } from '../../components/molecules/AlertAsync';
import {
  confirmTrackingLeave,
  finishTrackingBeforeLeave,
  isTrackingActive,
  leaveHomeWithTrackingGuard,
  leaveWithTrackingGuard,
  registerTrackingLeaveHandler,
  replaceDataWithTrackingGuard,
  stopAndSaveTrack,
  stopTrackingBeforeForcedLogout,
  TrackingLeaveHandler,
  TrackingLeaveResult,
  waitUntil,
} from '../trackingLeaveGuard';
import { trackLogMMKV } from '../mmkvStorage';
import { Platform } from 'react-native';

jest.mock('../../components/molecules/AlertAsync', () => ({
  AlertAsync: jest.fn(async () => true),
  ConfirmAsync: jest.fn(async () => true),
  waitForModalTransition: jest.fn(async () => undefined),
}));
jest.mock('../mmkvStorage', () => ({
  trackLogMMKV: { getTrackingState: jest.fn(() => 'off') },
}));
jest.mock('../../i18n/config', () => ({
  t: jest.fn((key: string, opts?: Record<string, string>) => (opts ? `${key}:${JSON.stringify(opts)}` : key)),
}));

const mockConfirm = ConfirmAsync as jest.MockedFunction<typeof ConfirmAsync>;
const mockAlert = AlertAsync as jest.MockedFunction<typeof AlertAsync>;
const mockGetTrackingState = trackLogMMKV.getTrackingState as jest.MockedFunction<
  typeof trackLogMMKV.getTrackingState
>;

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

const setPlatform = (os: string) => {
  (Platform as { OS: string }).OS = os;
};

beforeEach(() => {
  jest.clearAllMocks();
  setPlatform('android');
  mockConfirm.mockResolvedValue(true);
  mockGetTrackingState.mockReturnValue('off');
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
    // 保存の結果をそのまま返す（ボタン側はサマリーを開くのに layer と record を使う）
    expect(result).toEqual({ isOK: true, message: 'note', layer: { id: 'track' } });
    expect(onSaved).toHaveBeenCalledWith('track');
  });

  it('軌跡ボタンからは onSaved なしで使え、保存より先に止める（停止の途中に届いた点を消さない。T-L2）', async () => {
    const order: string[] = [];
    const record = { id: 'r1', userId: 'u1' };
    const result = await stopAndSaveTrack({
      toggleTracking: async (state) => {
        order.push(`tracking:${state}`);
      },
      toggleGPS: async (state) => {
        order.push(`gps:${state}`);
      },
      saveTrackLog: async () => {
        order.push('save');
        return { isOK: true, message: '', layer: { id: 'track' }, record };
      },
    });
    expect(order).toEqual(['tracking:off', 'gps:off', 'save']);
    expect(result.record).toBe(record);
    expect(result.layer).toEqual({ id: 'track' });
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

describe('leaveHomeWithTrackingGuard（ホームから別の画面へ移る、軌跡監査 T-H1）', () => {
  it('記録していなければ（GPS だけ ON を含む）確認なしに1回だけ移る', async () => {
    const { handler, stopAndSave } = makeHandler({ isTracking: () => false });
    register(handler);
    const navigate = jest.fn();
    await expect(leaveHomeWithTrackingGuard(navigate)).resolves.toBe(true);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockAlert).not.toHaveBeenCalled();
    expect(stopAndSave).not.toHaveBeenCalled();
  });

  it('記録中は画面を移る確認を出し、了承したら止めて保存し、通常利用中のプロジェクトではアップロードし終えてから移る', async () => {
    const order: string[] = [];
    const { handler, stopAndSave, uploadTrack } = makeHandler({
      stopAndSave: jest.fn(async () => {
        order.push('stopAndSave');
        return { isOK: true, message: '' };
      }),
      uploadTrack: jest.fn(async () => {
        order.push('upload');
        return { isOK: true, message: '' };
      }),
    });
    register(handler);
    const navigate = jest.fn(() => {
      order.push('navigate');
    });
    await expect(leaveHomeWithTrackingGuard(navigate)).resolves.toBe(true);
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockConfirm.mock.calls[0][0]).toContain('Home.confirm.stopTrackingBeforeLeaveHome');
    expect(mockConfirm.mock.calls[0][0]).toContain('Home.confirm.stopTrackingUploadNote');
    expect(stopAndSave).toHaveBeenCalledTimes(1);
    expect(uploadTrack).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['stopAndSave', 'upload', 'navigate']);
  });

  it('キャンセルしたら記録を続けたまま移らない', async () => {
    const { handler, stopAndSave } = makeHandler();
    register(handler);
    mockConfirm.mockResolvedValueOnce(false);
    const navigate = jest.fn();
    await expect(leaveHomeWithTrackingGuard(navigate)).resolves.toBe(false);
    expect(stopAndSave).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('アップロードできなければ移らない（軌跡は端末内に保存済み）', async () => {
    const { handler, stopAndSave } = makeHandler({
      uploadTrack: jest.fn(async () => ({ isOK: false, message: 'offline' })),
    });
    register(handler);
    const navigate = jest.fn();
    await expect(leaveHomeWithTrackingGuard(navigate)).resolves.toBe(false);
    expect(stopAndSave).toHaveBeenCalledTimes(1);
    expect(mockAlert.mock.calls[0][0]).toContain('Home.alert.stopTrackingUploadFailed');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('保存できなければ移らない', async () => {
    const { handler } = makeHandler({
      stopAndSave: jest.fn(async () => ({ isOK: false, message: 'disk' })),
    });
    register(handler);
    const navigate = jest.fn();
    await expect(leaveHomeWithTrackingGuard(navigate)).resolves.toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('設定の編集中は保存だけしてアップロードせずに移る', async () => {
    const { handler, stopAndSave, uploadTrack } = makeHandler({
      getContext: () => ({ projectName: 'P1', isRunningProject: false }),
    });
    register(handler);
    const navigate = jest.fn();
    await expect(leaveHomeWithTrackingGuard(navigate)).resolves.toBe(true);
    expect(stopAndSave).toHaveBeenCalledTimes(1);
    expect(uploadTrack).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});

describe('記録ガードの二重実行の防止', () => {
  it('保存・アップロードの途中で2回目が来ても、記録が off に見えることで素通りせず、移らない', async () => {
    let tracking = true;
    let releaseUpload: () => void = () => undefined;
    const uploadGate = new Promise<void>((resolve) => {
      releaseUpload = resolve;
    });
    const { handler, stopAndSave, uploadTrack } = makeHandler({
      isTracking: () => tracking,
      stopAndSave: jest.fn(async () => {
        // toggleTracking('off') が先に記録の状態を off にする
        tracking = false;
        return { isOK: true, message: '' };
      }),
      uploadTrack: jest.fn(async () => {
        await uploadGate;
        return { isOK: true, message: '' };
      }),
    });
    register(handler);
    const first = jest.fn();
    const second = jest.fn();
    const firstCall = leaveHomeWithTrackingGuard(first);
    // アップロード待ちに入るまで進める
    await waitUntil(() => uploadTrack.mock.calls.length > 0, { timeoutMs: 1000, intervalMs: 1 });
    await expect(leaveHomeWithTrackingGuard(second)).resolves.toBe(false);
    const closeConfirm = jest.fn(async () => true);
    await expect(leaveWithTrackingGuard('closeProject', closeConfirm)).resolves.toBe(false);
    expect(second).not.toHaveBeenCalled();
    expect(closeConfirm).not.toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();

    releaseUpload();
    await expect(firstCall).resolves.toBe(true);
    expect(first).toHaveBeenCalledTimes(1);
    expect(stopAndSave).toHaveBeenCalledTimes(1);
  });

  it('終わったあと（キャンセル・失敗・例外を含む）は、次の呼び出しを受け付ける', async () => {
    const { handler } = makeHandler();
    register(handler);
    mockConfirm.mockResolvedValueOnce(false);
    await expect(leaveHomeWithTrackingGuard(jest.fn())).resolves.toBe(false);
    await expect(
      leaveWithTrackingGuard('closeProject', async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    const navigate = jest.fn();
    await expect(leaveHomeWithTrackingGuard(navigate)).resolves.toBe(true);
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});

describe('ホームがいない（handler が無い）のに記録の意図が残っているときの防御', () => {
  it('handler が無く記録の意図も off なら、従来どおり記録していないとみなす', async () => {
    const confirmLeave = jest.fn(async () => true);
    await expect(leaveWithTrackingGuard('openProject', confirmLeave)).resolves.toBe(true);
    await expect(stopTrackingBeforeForcedLogout()).resolves.toBe(true);
    expect(confirmLeave).toHaveBeenCalledTimes(1);
    expect(mockAlert).not.toHaveBeenCalled();
  });

  it('記録の意図が on なら、プロジェクトを開く前に案内を出して進めない（操作の確認も出さない）', async () => {
    mockGetTrackingState.mockReturnValue('on');
    const confirmLeave = jest.fn(async () => true);
    await expect(leaveWithTrackingGuard('openProject', confirmLeave)).resolves.toBe(false);
    expect(confirmLeave).not.toHaveBeenCalled();
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockAlert).toHaveBeenCalledWith('Home.alert.stopTrackingFromHome');
  });

  it('取りやめられないログアウトでは通知だけ出して進める', async () => {
    mockGetTrackingState.mockReturnValue('on');
    await expect(stopTrackingBeforeForcedLogout()).resolves.toBe(true);
    expect(mockAlert).toHaveBeenCalledWith('Home.alert.trackingContinuesAfterForcedLogout');
  });

  it('handler があるときは MMKV ではなく handler の状態で判断する', async () => {
    mockGetTrackingState.mockReturnValue('on');
    const { handler } = makeHandler({ isTracking: () => false });
    register(handler);
    await expect(leaveHomeWithTrackingGuard(jest.fn())).resolves.toBe(true);
    expect(mockAlert).not.toHaveBeenCalled();
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('iOS ではホームに戻ると記録が止まり保存を尋ねられるので、その確認に従うよう案内する', async () => {
    setPlatform('ios');
    mockGetTrackingState.mockReturnValue('on');
    await expect(leaveWithTrackingGuard('openProject', jest.fn(async () => true))).resolves.toBe(false);
    expect(mockAlert).toHaveBeenCalledWith('Home.alert.stopTrackingFromHomeIos');
    mockAlert.mockClear();
    await expect(stopTrackingBeforeForcedLogout()).resolves.toBe(true);
    expect(mockAlert).toHaveBeenCalledWith('Home.alert.trackingContinuesAfterForcedLogoutIos');
  });

  it('Web は記録しないので、記録の意図が残っていても素通りする', async () => {
    setPlatform('web');
    mockGetTrackingState.mockReturnValue('on');
    const confirmLeave = jest.fn(async () => true);
    await expect(leaveWithTrackingGuard('openProject', confirmLeave)).resolves.toBe(true);
    expect(confirmLeave).toHaveBeenCalledTimes(1);
    expect(mockAlert).not.toHaveBeenCalled();
  });
});

describe('replaceDataWithTrackingGuard（設定画面の復元・新規・ファイルを開く・Drive から開く、軌跡監査 T-M8）', () => {
  it('記録していなければ軌跡の確認なしに選択・置き換えだけを行う', async () => {
    const { handler, stopAndSave } = makeHandler({ isTracking: () => false });
    register(handler);
    const replace = jest.fn(async (_uri: string) => undefined);
    await expect(replaceDataWithTrackingGuard('openFile', async () => 'file://a.zip', replace)).resolves.toBe(true);
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(stopAndSave).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith('file://a.zip');
  });

  it('記録中は 軌跡の確認 → 選択 → 停止・保存 → アップロード → 置き換え の順に進め、選んだものを渡す', async () => {
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
    const replace = jest.fn(async (selected: string) => {
      order.push(`replace:${selected}`);
    });
    const select = jest.fn(async () => {
      order.push('select');
      return 'backup-1';
    });
    await expect(replaceDataWithTrackingGuard('restoreBackup', select, replace)).resolves.toBe(true);
    expect(order).toEqual(['confirmTracking', 'select', 'stopAndSave', 'uploadTrack', 'replace:backup-1']);
  });

  it('ファイルの選択を取りやめたら（undefined）記録を止めず置き換えもしない', async () => {
    const { handler, stopAndSave } = makeHandler();
    register(handler);
    const replace = jest.fn(async (_uri: string) => undefined);
    await expect(replaceDataWithTrackingGuard<string>('openFile', async () => undefined, replace)).resolves.toBe(
      false
    );
    expect(stopAndSave).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('軌跡の確認でキャンセルしたら、選択も停止も置き換えもしない', async () => {
    mockConfirm.mockResolvedValue(false);
    const { handler, stopAndSave } = makeHandler();
    register(handler);
    const select = jest.fn(async () => true as const);
    const replace = jest.fn(async () => undefined);
    await expect(replaceDataWithTrackingGuard('clearData', select, replace)).resolves.toBe(false);
    expect(select).not.toHaveBeenCalled();
    expect(stopAndSave).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('通常利用中のプロジェクトで新規にするときは、アップロードできなければクリアしない', async () => {
    const uploadTrack = jest.fn(async () => ({ isOK: false, message: 'offline' }));
    register(makeHandler({ uploadTrack }).handler);
    const replace = jest.fn(async () => undefined);
    await expect(replaceDataWithTrackingGuard('clearData', async () => true as const, replace)).resolves.toBe(false);
    expect(replace).not.toHaveBeenCalled();
    expect(mockAlert.mock.calls[0][0]).toContain('Home.alert.stopTrackingUploadFailed');
  });

  it('保存に失敗したら置き換えない', async () => {
    const stopAndSave = jest.fn(async () => ({ isOK: false, message: 'disk' }));
    register(makeHandler({ stopAndSave }).handler);
    const replace = jest.fn(async () => undefined);
    await expect(replaceDataWithTrackingGuard('restoreBackup', async () => true as const, replace)).resolves.toBe(
      false
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it('端末内のデータ・設定の編集中は保存だけしてアップロードせず、軌跡が置き換え前の自動バックアップに残ると案内する', async () => {
    const { handler, uploadTrack } = makeHandler({
      getContext: () => ({ projectName: undefined, isRunningProject: false }),
    });
    register(handler);
    const replace = jest.fn(async () => undefined);
    await expect(replaceDataWithTrackingGuard('openFile', async () => true as const, replace)).resolves.toBe(true);
    expect(uploadTrack).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledTimes(1);
    const message = mockConfirm.mock.calls[0][0];
    expect(message).toContain('Home.confirm.stopTrackingBeforeOpenFile');
    // バックアップは作れないこともあるので、作れなかったときを除くと断った文言を使う（設定監査 S-L2）
    expect(message).toContain('Home.confirm.stopTrackingBackupNoteUnlessFailed');
    expect(message).not.toContain('Home.confirm.stopTrackingUploadNote');
    expect(message).not.toContain('Home.confirm.stopTrackingSettingNote');
  });

  it('自動バックアップの案内文は、作れなかった場合を断っている（ja/en）', () => {
    const ja = jest.requireActual('../../i18n/ja/translation.json') as { Home: { confirm: Record<string, string> } };
    const en = jest.requireActual('../../i18n/en/translation.json') as { Home: { confirm: Record<string, string> } };
    expect(ja.Home.confirm.stopTrackingBackupNoteUnlessFailed).toMatch(/作れなかった/);
    expect(en.Home.confirm.stopTrackingBackupNoteUnlessFailed).toMatch(/could not be created/);
  });

  it('操作ごとの文言を出し、通常利用中のプロジェクトではアップロードの案内を出す', async () => {
    register(makeHandler().handler);
    await replaceDataWithTrackingGuard('restoreBackup', async () => undefined, async () => undefined);
    await replaceDataWithTrackingGuard('clearData', async () => undefined, async () => undefined);
    const [restoreMessage, clearMessage] = mockConfirm.mock.calls.map((c) => c[0]);
    expect(restoreMessage).toContain('Home.confirm.stopTrackingBeforeRestoreBackup');
    expect(restoreMessage).toContain('Home.confirm.stopTrackingUploadNote');
    expect(clearMessage).toContain('Home.confirm.stopTrackingBeforeClearData');
  });

  it('ホームがいない画面で記録の意図だけが残っていたら、案内を出して選択も置き換えもしない', async () => {
    mockGetTrackingState.mockReturnValue('on');
    const select = jest.fn(async () => true as const);
    const replace = jest.fn(async () => undefined);
    await expect(replaceDataWithTrackingGuard('openFile', select, replace)).resolves.toBe(false);
    expect(select).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(mockAlert).toHaveBeenCalledWith('Home.alert.stopTrackingFromHome');
  });
});
