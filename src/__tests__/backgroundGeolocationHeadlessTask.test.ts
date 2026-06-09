import BackgroundGeolocation from 'react-native-background-geolocation';
import { trackLogMMKV } from '../utils/mmkvStorage';
import { checkAndStoreLocations, resetTrackLogCache, flushTrackLog } from '../utils/Location';

jest.mock('react-native-background-geolocation', () => {
  const mock = {
    registerHeadlessTask: jest.fn(),
    getState: jest.fn(),
    changePace: jest.fn(),
  };
  return {
    __esModule: true,
    default: mock,
    ...mock,
  };
});

jest.mock('../utils/mmkvStorage', () => ({
  trackLogMMKV: {
    setCurrentLocation: jest.fn(),
    getTrackingState: jest.fn(() => 'off'),
    getGpsState: jest.fn(() => 'off'),
  },
}));

jest.mock('../utils/Location', () => ({
  checkAndStoreLocations: jest.fn(),
  resetTrackLogCache: jest.fn(),
  flushTrackLog: jest.fn(),
  toLocationObject: jest.fn((location: any) => ({
    coords: { ...location.coords },
    timestamp: location.timestamp,
  })),
}));

// モジュールの読み込みでregisterHeadlessTaskが呼ばれ、タスク関数が登録される
import '../backgroundGeolocationHeadlessTask';

const mockBackgroundGeolocation = BackgroundGeolocation as any;
const headlessTask: (event: any) => Promise<void> = mockBackgroundGeolocation.registerHeadlessTask.mock.calls[0][0];

const locationEvent = {
  name: 'location',
  params: {
    coords: { latitude: 35.0, longitude: 135.0, altitude: 10, accuracy: 5, heading: 0, speed: 1 },
    timestamp: 1700000000000,
  },
};

describe('backgroundGeolocationHeadlessTask', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (trackLogMMKV.getTrackingState as jest.Mock).mockReturnValue('off');
    (trackLogMMKV.getGpsState as jest.Mock).mockReturnValue('off');
    mockBackgroundGeolocation.getState.mockResolvedValue({ enabled: true });
  });

  it('タスク関数が登録されている', () => {
    // registerHeadlessTaskの呼び出し自体はモジュール読み込み時（beforeEachのclearAllMocksより前）
    expect(typeof headlessTask).toBe('function');
  });

  describe('boot/terminateイベント（記録再開）', () => {
    it('bootイベント: トラッキング中かつサービス有効ならchangePace(true)で移動モードへ戻す', async () => {
      (trackLogMMKV.getTrackingState as jest.Mock).mockReturnValue('on');

      await headlessTask({ name: 'boot' });

      expect(mockBackgroundGeolocation.changePace).toHaveBeenCalledWith(true);
    });

    it('terminateイベント: トラッキング中かつサービス有効ならchangePace(true)を呼ぶ', async () => {
      (trackLogMMKV.getTrackingState as jest.Mock).mockReturnValue('on');

      await headlessTask({ name: 'terminate' });

      expect(mockBackgroundGeolocation.changePace).toHaveBeenCalledWith(true);
    });

    it('bootイベント: GPSのみON（トラッキングOFF）でもchangePace(true)を呼ぶ', async () => {
      (trackLogMMKV.getGpsState as jest.Mock).mockReturnValue('follow');

      await headlessTask({ name: 'boot' });

      expect(mockBackgroundGeolocation.changePace).toHaveBeenCalledWith(true);
    });

    it('bootイベント: トラッキングOFFかつGPS OFFなら何もしない', async () => {
      await headlessTask({ name: 'boot' });

      expect(mockBackgroundGeolocation.getState).not.toHaveBeenCalled();
      expect(mockBackgroundGeolocation.changePace).not.toHaveBeenCalled();
    });

    it('bootイベント: サービス無効（enabled:false）ならchangePaceを呼ばない', async () => {
      (trackLogMMKV.getTrackingState as jest.Mock).mockReturnValue('on');
      mockBackgroundGeolocation.getState.mockResolvedValue({ enabled: false });

      await headlessTask({ name: 'boot' });

      expect(mockBackgroundGeolocation.changePace).not.toHaveBeenCalled();
    });

    it('bootイベント: changePaceが例外を投げてもタスクは失敗しない', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      (trackLogMMKV.getTrackingState as jest.Mock).mockReturnValue('on');
      mockBackgroundGeolocation.changePace.mockRejectedValue(new Error('native error'));

      await expect(headlessTask({ name: 'boot' })).resolves.toBeUndefined();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('locationイベント（既存挙動の回帰）', () => {
    it('現在地は常にMMKVへ保存される', async () => {
      await headlessTask(locationEvent);

      expect(trackLogMMKV.setCurrentLocation).toHaveBeenCalledWith(
        expect.objectContaining({ latitude: 35.0, longitude: 135.0, timestamp: 1700000000000 })
      );
    });

    it('トラッキング中はキャッシュ破棄→保存→flushのread-modify-writeを行う', async () => {
      (trackLogMMKV.getTrackingState as jest.Mock).mockReturnValue('on');

      await headlessTask(locationEvent);

      expect(resetTrackLogCache).toHaveBeenCalled();
      expect(checkAndStoreLocations).toHaveBeenCalled();
      expect(flushTrackLog).toHaveBeenCalled();
    });

    it('トラッキングOFFなら軌跡は保存しない', async () => {
      await headlessTask(locationEvent);

      expect(checkAndStoreLocations).not.toHaveBeenCalled();
    });

    it('locationイベントではchangePaceを呼ばない', async () => {
      (trackLogMMKV.getTrackingState as jest.Mock).mockReturnValue('on');

      await headlessTask(locationEvent);

      expect(mockBackgroundGeolocation.changePace).not.toHaveBeenCalled();
    });
  });

  describe('その他のイベント', () => {
    it('未対応イベントは何もしない', async () => {
      await headlessTask({ name: 'heartbeat' });

      expect(trackLogMMKV.setCurrentLocation).not.toHaveBeenCalled();
      expect(mockBackgroundGeolocation.changePace).not.toHaveBeenCalled();
    });
  });
});
