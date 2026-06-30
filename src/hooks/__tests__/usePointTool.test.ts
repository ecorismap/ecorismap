// i18nモックを最初に設定
jest.mock('../../i18n/config', () => ({
  __esModule: true,
  t: jest.fn((key) => key),
}));

import { renderHook } from '@testing-library/react-hooks';
import { usePointTool } from '../usePointTool';
import BackgroundGeolocation from '../../lib/backgroundGeolocation';
import { LocationType } from '../../types';

// react-redux のモック（usePointTool は useSelector / useDispatch を直接使用）
jest.mock('react-redux', () => ({
  useDispatch: () => jest.fn(),
  useSelector: (selector: any) =>
    selector({
      user: { uid: 'user1', displayName: 'tester' },
      settings: { projectId: undefined },
    }),
}));

// BackgroundGeolocation のモック（getCurrentPosition がフォールバックで使われる）
jest.mock('../../lib/backgroundGeolocation', () => ({
  __esModule: true,
  default: {
    getCurrentPosition: jest.fn(),
    DesiredAccuracy: { High: 'HIGH' },
  },
}));

// useRecord のモック（addRecordWithCheck に渡される座標を検証できるようにする）
const mockAddRecordWithCheck = jest.fn((featureType: string, coords: LocationType) => ({
  isOK: true,
  message: '',
  layer: { id: 'layer1' },
  record: { id: 'rec1', coords },
}));
jest.mock('../useRecord', () => ({
  useRecord: () => ({ addRecordWithCheck: mockAddRecordWithCheck }),
}));

const mockGetCurrentPosition = BackgroundGeolocation.getCurrentPosition as jest.Mock;

describe('usePointTool.addCurrentPoint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('preferredLocation を渡すと getCurrentPosition を呼ばず、その座標でレコードを作る', async () => {
    const { result } = renderHook(() => usePointTool());
    const preferred: LocationType = { latitude: 35.1, longitude: 139.2, timestamp: 1000 };

    const res = await result.current.addCurrentPoint(preferred);

    expect(mockGetCurrentPosition).not.toHaveBeenCalled();
    expect(mockAddRecordWithCheck).toHaveBeenCalledWith('POINT', preferred);
    expect(res.isOK).toBe(true);
    expect(res.record?.coords).toEqual(preferred);
  });

  it('preferredLocation が未指定なら getCurrentPosition にフォールバックする', async () => {
    mockGetCurrentPosition.mockResolvedValueOnce({
      coords: { latitude: 36.5, longitude: 140.5 },
      timestamp: 2000,
    });
    const { result } = renderHook(() => usePointTool());

    const res = await result.current.addCurrentPoint();

    expect(mockGetCurrentPosition).toHaveBeenCalledTimes(1);
    expect(mockAddRecordWithCheck).toHaveBeenCalledWith(
      'POINT',
      expect.objectContaining({ latitude: 36.5, longitude: 140.5 })
    );
    expect(res.isOK).toBe(true);
  });

  it('preferredLocation が不正な座標なら getCurrentPosition にフォールバックする', async () => {
    mockGetCurrentPosition.mockResolvedValueOnce({
      coords: { latitude: 36.5, longitude: 140.5 },
      timestamp: 2000,
    });
    const { result } = renderHook(() => usePointTool());

    // latitude/longitude が number でない不正な値
    const invalid = { latitude: undefined, longitude: undefined } as unknown as LocationType;
    await result.current.addCurrentPoint(invalid);

    expect(mockGetCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it('preferredLocation も getCurrentPosition も無い場合は isOK=false を返す', async () => {
    mockGetCurrentPosition.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => usePointTool());

    const res = await result.current.addCurrentPoint();

    expect(res.isOK).toBe(false);
    expect(mockAddRecordWithCheck).not.toHaveBeenCalled();
  });

  it('getCurrentPosition を samples:3 / maximumAge:0 で呼ぶ（新鮮な位置を強制）', async () => {
    mockGetCurrentPosition.mockResolvedValueOnce({
      coords: { latitude: 36.5, longitude: 140.5 },
      timestamp: 2000,
    });
    const { result } = renderHook(() => usePointTool());

    await result.current.addCurrentPoint();

    expect(mockGetCurrentPosition).toHaveBeenCalledWith(
      expect.objectContaining({ samples: 3, maximumAge: 0 })
    );
  });

  it('getCurrentPosition が age の大きい古いキャッシュ位置を返したら採用せず isOK=false', async () => {
    mockGetCurrentPosition.mockResolvedValueOnce({
      coords: { latitude: 36.5, longitude: 140.5 },
      timestamp: 2000,
      age: 120000, // 2分前 = STALE_LOCATION_AGE_MS(30s) 超過
    });
    const { result } = renderHook(() => usePointTool());

    const res = await result.current.addCurrentPoint();

    expect(res.isOK).toBe(false);
    expect(mockAddRecordWithCheck).not.toHaveBeenCalled();
  });

  it('getCurrentPosition が age の小さい新鮮な位置を返したら採用する', async () => {
    mockGetCurrentPosition.mockResolvedValueOnce({
      coords: { latitude: 36.5, longitude: 140.5 },
      timestamp: 2000,
      age: 1000, // 1秒前 = 新鮮
    });
    const { result } = renderHook(() => usePointTool());

    const res = await result.current.addCurrentPoint();

    expect(res.isOK).toBe(true);
    expect(mockAddRecordWithCheck).toHaveBeenCalledWith(
      'POINT',
      expect.objectContaining({ latitude: 36.5, longitude: 140.5 })
    );
  });
});
