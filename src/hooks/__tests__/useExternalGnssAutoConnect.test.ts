import { act, renderHook } from '@testing-library/react-hooks';
import { AppState, AppStateStatus } from 'react-native';
import type { GnssReceiverStatus } from '../../../modules/gnss-receiver/src';
import { ExternalGnssSettingsType } from '../../types';

const CONNECTED: GnssReceiverStatus = {
  link: 'connected',
  linkName: 'rx',
  linkError: null,
  ntrip: 'off',
  ntripError: null,
  rtcmBytes: 0,
  lastCorrectionAt: 0,
};
const DISCONNECTED: GnssReceiverStatus = { ...CONNECTED, link: 'disconnected', linkName: null };
const LOST: GnssReceiverStatus = { ...DISCONNECTED, linkError: 'BLE disconnected' };

let mockStatusListener: ((status: GnssReceiverStatus) => void) | null = null;
const mockConnectBle = jest.fn();
const mockConnectUsb = jest.fn();
const mockConnectSpp = jest.fn();
const mockDisconnect = jest.fn();
const mockStopNtrip = jest.fn();
const mockStartNtrip = jest.fn();

jest.mock('../../../modules/gnss-receiver/src', () => ({
  isGnssReceiverAvailable: () => true,
  getStatus: () => ({
    link: 'disconnected',
    linkName: null,
    linkError: null,
    ntrip: 'off',
    ntripError: null,
    rtcmBytes: 0,
    lastCorrectionAt: 0,
  }),
  addNmeaListener: () => ({ remove: jest.fn() }),
  addStatusListener: (listener: (status: GnssReceiverStatus) => void) => {
    mockStatusListener = listener;
    return { remove: jest.fn() };
  },
  addUsbAttachedListener: () => ({ remove: jest.fn() }),
  listUsbDevices: () => [],
  connectBle: (...args: unknown[]) => mockConnectBle(...args),
  connectUsb: (...args: unknown[]) => mockConnectUsb(...args),
  connectSpp: (...args: unknown[]) => mockConnectSpp(...args),
  disconnect: () => mockDisconnect(),
  stopNtrip: () => mockStopNtrip(),
  startNtrip: (...args: unknown[]) => mockStartNtrip(...args),
}));

// SPPはAndroidだけ。テストの既定（iOS）ではfalseになるので、Androidとして扱う
jest.mock('../../lib/gnss/connection', () => ({
  ...jest.requireActual('../../lib/gnss/connection'),
  isSppSupported: true,
}));

jest.mock('../../lib/gnss/blePermissions', () => ({ hasBlePermissions: async () => true }));
jest.mock('react-native-keychain', () => ({ getGenericPassword: async () => false }));

let mockSettings: ExternalGnssSettingsType;
jest.mock('react-redux', () => ({
  useSelector: (selector: (state: { settings: { externalGnss: ExternalGnssSettingsType } }) => unknown) =>
    selector({ settings: { externalGnss: mockSettings } }),
}));

import { useExternalGnssAutoConnect } from '../useExternalGnssAutoConnect';
import { DEFAULT_EXTERNAL_GNSS_SETTINGS } from '../../lib/gnss/settings';
import { resetExternalGnssForTest, subscribeExternalGnss } from '../../lib/gnss/externalGnssStore';

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

const emitStatus = (status: GnssReceiverStatus) => {
  act(() => {
    mockStatusListener?.(status);
  });
};

// 再接続は前の試行が終わってから次を予約するので、1秒ずつ進めて非同期の続きを流す
const advance = async (ms: number) => {
  let rest = ms;
  while (rest > 0) {
    const step = Math.min(rest, 1_000);
    rest -= step;
    await act(async () => {
      jest.advanceTimersByTime(step);
      await flush();
    });
  }
};

let appStateHandler: ((state: AppStateStatus) => void) | undefined;
const setAppState = async (state: AppStateStatus) => {
  (AppState as unknown as { currentState: AppStateStatus }).currentState = state;
  await act(async () => {
    appStateHandler?.(state);
    await flush();
  });
};

// 接続に成功したらネイティブと同じく状態を通知する
const connectSucceeds = () => {
  mockConnectBle.mockImplementation(async () => {
    mockStatusListener?.(CONNECTED);
    return CONNECTED;
  });
};
const connectFails = () => {
  mockConnectBle.mockImplementation(async () => {
    mockStatusListener?.({ ...DISCONNECTED, linkError: 'BLE connection timed out' });
    throw new Error('BLE connection timed out');
  });
};

describe('useExternalGnssAutoConnect', () => {
  let addEventListenerSpy: jest.SpyInstance;

  beforeAll(() => {
    // ストアのネイティブ購読を張っておく（プロセスで1回だけ）
    subscribeExternalGnss(() => undefined)();
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockSettings = {
      ...DEFAULT_EXTERNAL_GNSS_SETTINGS,
      lastDevice: { type: 'ble', address: 'AA:BB', name: 'rx' },
      autoConnect: true,
    };
    resetExternalGnssForTest(CONNECTED);
    (AppState as unknown as { currentState: AppStateStatus }).currentState = 'active';
    connectSucceeds();
    mockDisconnect.mockImplementation(async () => mockStatusListener?.(DISCONNECTED));
    mockStopNtrip.mockResolvedValue(undefined);
    appStateHandler = undefined;
    addEventListenerSpy = jest.spyOn(AppState, 'addEventListener').mockImplementation((type, handler) => {
      if (type === 'change') appStateHandler = handler as (state: AppStateStatus) => void;
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
  });

  afterEach(() => {
    addEventListenerSpy.mockRestore();
    jest.useRealTimers();
    (AppState as unknown as { currentState: AppStateStatus }).currentState = 'active';
  });

  const render = async (inUse: boolean) => {
    const hook = renderHook(({ value }) => useExternalGnssAutoConnect(value), { initialProps: { value: inUse } });
    await act(async () => {
      await flush();
    });
    return hook;
  };

  describe('T-L7 エラーで切れたときの再接続', () => {
    it('GPS ON 中に切れたら、5秒・10秒…と間隔を伸ばして再接続し、つながったらやめる', async () => {
      await render(true);
      connectFails();
      emitStatus(LOST);

      await advance(4_999);
      expect(mockConnectBle).not.toHaveBeenCalled();
      await advance(1);
      expect(mockConnectBle).toHaveBeenCalledTimes(1);

      // 2回目は10秒後
      connectSucceeds();
      await advance(9_999);
      expect(mockConnectBle).toHaveBeenCalledTimes(1);
      await advance(1);
      expect(mockConnectBle).toHaveBeenCalledTimes(2);

      // つながったのでもう試さない
      await advance(10 * 60_000);
      expect(mockConnectBle).toHaveBeenCalledTimes(2);
    });

    it('バックグラウンドでも GPS ON 中なら再接続する（AppState を条件にしない）', async () => {
      await render(true);
      (AppState as unknown as { currentState: AppStateStatus }).currentState = 'background';
      emitStatus(LOST);
      await advance(5_000);
      expect(mockConnectBle).toHaveBeenCalledTimes(1);
      expect(mockDisconnect).not.toHaveBeenCalled();
    });

    it('GPS OFF で記録もしていないなら再接続せず、GPS を ON にしたら試し始める', async () => {
      const hook = await render(false);
      emitStatus(LOST);
      await advance(10 * 60_000);
      expect(mockConnectBle).not.toHaveBeenCalled();

      hook.rerender({ value: true });
      await advance(5_000);
      expect(mockConnectBle).toHaveBeenCalledTimes(1);
    });

    it('再接続の途中で GPS を OFF にしたらやめる', async () => {
      const hook = await render(true);
      connectFails();
      emitStatus(LOST);
      await advance(5_000);
      expect(mockConnectBle).toHaveBeenCalledTimes(1);
      hook.rerender({ value: false });
      await advance(10 * 60_000);
      expect(mockConnectBle).toHaveBeenCalledTimes(1);
    });

    it('「切断」ボタン（linkError なし）では再接続しない', async () => {
      await render(true);
      emitStatus(DISCONNECTED);
      await advance(10 * 60_000);
      expect(mockConnectBle).not.toHaveBeenCalled();
    });

    it('自動接続が OFF なら再接続しない', async () => {
      mockSettings = { ...mockSettings, autoConnect: false };
      await render(true);
      emitStatus(LOST);
      await advance(10 * 60_000);
      expect(mockConnectBle).not.toHaveBeenCalled();
    });

    it('切れてから30分つながらなければやめる', async () => {
      await render(true);
      connectFails();
      emitStatus(LOST);
      await advance(29 * 60_000);
      // 5・10・20・40秒のあとは60秒おき
      expect(mockConnectBle.mock.calls.length).toBeGreaterThan(25);
      // 30分を過ぎて予約済みの1回が終わったら、それ以上は試さない
      await advance(2 * 60_000);
      const settled = mockConnectBle.mock.calls.length;
      await advance(60 * 60_000);
      expect(mockConnectBle.mock.calls.length).toBe(settled);
    });
  });

  describe('T-L7 つながってはすぐ切れるリンク', () => {
    // つながって holdMs 後にまたエラーで切れる受信機
    const connectThenDrop = (holdMs: number, ntrip: GnssReceiverStatus['ntrip'] = 'off') => {
      mockConnectBle.mockImplementation(async () => {
        mockStatusListener?.({ ...CONNECTED, ntrip });
        setTimeout(() => mockStatusListener?.({ ...LOST, ntrip }), holdMs);
        return CONNECTED;
      });
    };
    const callTimes: number[] = [];
    beforeEach(() => {
      callTimes.length = 0;
    });
    const recordCalls = () => {
      const impl = mockConnectBle.getMockImplementation();
      mockConnectBle.mockImplementation(async (...args: unknown[]) => {
        callTimes.push(Date.now());
        return impl?.(...args);
      });
    };

    it('短い接続を挟んでも待ち時間を伸ばし続け、最初に切れてから30分でやめる', async () => {
      await render(true);
      connectThenDrop(2_000);
      recordCalls();
      const lostAt = Date.now();
      emitStatus(LOST);

      await advance(40 * 60_000);
      const gaps = callTimes.map((at, i) => at - (i === 0 ? lostAt : callTimes[i - 1] + 2_000));
      // 5・10・20・40秒のあとは60秒で頭打ち（短い接続でやり直しにならない）
      expect(gaps.slice(0, 6)).toEqual([5_000, 10_000, 20_000, 40_000, 60_000, 60_000]);
      // 30分を過ぎたら試さない
      expect(callTimes[callTimes.length - 1] - lostAt).toBeLessThan(31 * 60_000);
      const settled = mockConnectBle.mock.calls.length;
      await advance(60 * 60_000);
      expect(mockConnectBle.mock.calls.length).toBe(settled);
    });

    it('60秒つながり続けたら、次に切れたときは5秒からやり直す', async () => {
      await render(true);
      connectThenDrop(2_000);
      recordCalls();
      emitStatus(LOST);
      await advance(5_000); // 1回目（5秒）でつながり、2秒で切れる
      await advance(2_000);
      expect(callTimes).toHaveLength(1);

      // 2回目は10秒後。今度は安定してつながる
      connectSucceeds();
      recordCalls();
      await advance(10_000);
      expect(callTimes).toHaveLength(2);
      await advance(60_000);

      // 安定した後の切断は新しいエピソード（5秒後）
      const lostAt = Date.now();
      emitStatus(LOST);
      await advance(5_000);
      expect(callTimes).toHaveLength(3);
      expect(callTimes[2] - lostAt).toBe(5_000);
    });

    it('NTRIP が動いていれば、再接続のたびに張り直さない', async () => {
      mockSettings = {
        ...mockSettings,
        ntrip: { ...mockSettings.ntrip, enabled: true, host: 'caster.example', mountpoint: 'MP' },
      };
      resetExternalGnssForTest({ ...CONNECTED, ntrip: 'connected' });
      await render(true);
      connectThenDrop(2_000, 'connected');
      emitStatus({ ...LOST, ntrip: 'connected' });
      await advance(5 * 60_000);
      expect(mockConnectBle.mock.calls.length).toBeGreaterThan(3);
      expect(mockStartNtrip).not.toHaveBeenCalled();
      expect(mockStopNtrip).not.toHaveBeenCalled();
    });

    it('NTRIP が止まっていて設定で有効なら、つないだときに始める', async () => {
      mockSettings = {
        ...mockSettings,
        ntrip: { ...mockSettings.ntrip, enabled: true, host: 'caster.example', mountpoint: 'MP' },
      };
      await render(true);
      emitStatus(LOST);
      await advance(5_000);
      expect(mockConnectBle).toHaveBeenCalledTimes(1);
      expect(mockStartNtrip).toHaveBeenCalledTimes(1);
    });
  });

  describe('T-M6 バックグラウンドでの切り離し', () => {
    it('GPS OFF で記録もしていなければ、バックグラウンドで NTRIP と受信機を切り、前面でつなぎ直す', async () => {
      await render(false);
      await setAppState('background');
      expect(mockStopNtrip).toHaveBeenCalledTimes(1);
      expect(mockDisconnect).toHaveBeenCalledTimes(1);
      // 切り離しは再接続のきっかけにならない
      await advance(10 * 60_000);
      expect(mockConnectBle).not.toHaveBeenCalled();

      await setAppState('active');
      expect(mockConnectBle).toHaveBeenCalledWith('AA:BB');
    });

    it('GPS ON 中・記録中はバックグラウンドでも切らない', async () => {
      await render(true);
      await setAppState('background');
      expect(mockDisconnect).not.toHaveBeenCalled();
      expect(mockStopNtrip).not.toHaveBeenCalled();
    });

    it('inactive（通知センターなど）では切らない', async () => {
      await render(false);
      await setAppState('inactive');
      expect(mockDisconnect).not.toHaveBeenCalled();
    });

    it('自動接続できない（autoConnect OFF）ときは前面でつなぎ直せないので切らない', async () => {
      mockSettings = { ...mockSettings, autoConnect: false };
      await render(false);
      await setAppState('background');
      expect(mockDisconnect).not.toHaveBeenCalled();
    });

    it('バックグラウンドで GPS を OFF にしたら切り離す', async () => {
      const hook = await render(true);
      await setAppState('background');
      expect(mockDisconnect).not.toHaveBeenCalled();
      hook.rerender({ value: false });
      await act(async () => {
        await flush();
      });
      expect(mockDisconnect).toHaveBeenCalledTimes(1);
    });

    it('つないでいる途中にバックグラウンドへ移ったら、つながった後に切り離す', async () => {
      resetExternalGnssForTest(DISCONNECTED);
      let finishConnect: (() => void) | undefined;
      mockConnectBle.mockImplementation(
        () =>
          new Promise((resolve) => {
            finishConnect = () => {
              mockStatusListener?.(CONNECTED);
              resolve(CONNECTED);
            };
          })
      );
      await render(false);
      expect(mockConnectBle).toHaveBeenCalledTimes(1);
      (AppState as unknown as { currentState: AppStateStatus }).currentState = 'background';
      await act(async () => {
        finishConnect?.();
        await flush();
      });
      expect(mockDisconnect).toHaveBeenCalledTimes(1);
    });

    it('位置を使っていないバックグラウンドでは起動時もつながない', async () => {
      resetExternalGnssForTest(DISCONNECTED);
      (AppState as unknown as { currentState: AppStateStatus }).currentState = 'background';
      await render(false);
      expect(mockConnectBle).not.toHaveBeenCalled();
    });
  });

  describe('Bluetoothクラシック（SPP）の受信機', () => {
    beforeEach(() => {
      mockSettings = { ...mockSettings, lastDevice: { type: 'spp', address: 'CC:DD', name: 'DROGGER' } };
      mockConnectSpp.mockImplementation(async () => {
        mockStatusListener?.(CONNECTED);
        return CONNECTED;
      });
    });

    it('起動時に前回のSPP受信機へ connectSpp でつなぐ', async () => {
      resetExternalGnssForTest(DISCONNECTED);
      await render(false);
      expect(mockConnectSpp).toHaveBeenCalledWith('CC:DD');
      expect(mockConnectBle).not.toHaveBeenCalled();
    });
  });
});
