import { renderHook } from '@testing-library/react-hooks';
import { Vibration } from 'react-native';
import * as Speech from 'expo-speech';
import { useProximityAlert } from '../useProximityAlert';
import { trackLogMMKV } from '../../utils/mmkvStorage';
import { LocationType, ProximityAlertSettingsType } from '../../types';

// 台帳 SET-5（接近通知）の判定ロジック。実際に音が聞こえるか・ロック中に鳴るかは実機で確かめる

let mockState: {
  settings: { proximityAlert?: ProximityAlertSettingsType };
  layers: unknown[];
  dataSet: unknown[];
};
let mockLanguage = 'ja';

jest.mock('react-redux', () => ({
  useSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('expo-speech', () => ({ speak: jest.fn() }));
jest.mock('expo-audio', () => ({ setAudioModeAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('../../utils/mmkvStorage', () => ({
  trackLogMMKV: {
    getProximityAlertEnabled: jest.fn(() => false),
    setProximityAlertEnabled: jest.fn(),
  },
}));
jest.mock('../../i18n/config', () => ({
  __esModule: true,
  default: {
    get language() {
      return mockLanguage;
    },
  },
  // ほかの定数の読み込みでも呼ばれるので、引数なしにも耐える
  t: (key: string, params?: { name: string; distance: number }) =>
    params ? `${key}|${params.name}|${params.distance}` : key,
}));
jest.mock('../../utils/Layer', () => ({
  generateLabel: (_layer: unknown, record: { field: { name?: string } }) => record.field.name ?? '',
}));

const speak = Speech.speak as jest.Mock;
const BASE = { latitude: 35, longitude: 135 };
// turf の距離（球の半径 6371008.8m）で、緯度1度あたりのメートル
const METERS_PER_DEGREE = (6371008.8 * Math.PI) / 180;
/** 対象ポイントから北へ meters 離れた位置 */
const at = (meters: number, accuracy?: number): LocationType =>
  ({ latitude: BASE.latitude + meters / METERS_PER_DEGREE, longitude: BASE.longitude, accuracy }) as LocationType;

const pointRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'r1',
  userId: 'u1',
  displayName: null,
  visible: true,
  redraw: false,
  coords: BASE,
  field: { name: '巣A' },
  ...overrides,
});

const setState = (
  proximityAlert: Partial<ProximityAlertSettingsType> | undefined,
  records: unknown[] = [pointRecord()],
  layer: Record<string, unknown> = {}
) => {
  mockState = {
    settings: {
      proximityAlert:
        proximityAlert === undefined
          ? undefined
          : { enabled: true, targetLayerIds: ['layer1'], distanceThreshold: 20, ...proximityAlert },
    },
    layers: [{ id: 'layer1', name: '営巣地', type: 'POINT', ...layer }],
    dataSet: [{ layerId: 'layer1', userId: 'u1', data: records }],
  };
};

/** 音声は、スピーカー出力の設定（非同期）を待ってから呼ばれる */
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe('useProximityAlert', () => {
  let now = 1_000_000;
  let vibrate: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLanguage = 'ja';
    now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    vibrate = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {});
    (trackLogMMKV.getProximityAlertEnabled as jest.Mock).mockReturnValue(false);
    setState({});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const check = async (result: { current: ReturnType<typeof useProximityAlert> }, location: LocationType) => {
    result.current.checkProximity(location);
    await flush();
  };

  it('しきい値の外では鳴らず、内に入ると名前と距離つきで1回だけ知らせ、振動する', async () => {
    const { result } = renderHook(() => useProximityAlert());

    await check(result, at(25));
    expect(speak).not.toHaveBeenCalled();
    expect(vibrate).not.toHaveBeenCalled();

    await check(result, at(15));
    expect(speak).toHaveBeenCalledTimes(1);
    // 読み上げる距離は実測値ではなく、入った段（20m）
    expect(speak).toHaveBeenCalledWith(
      'settings.proximityAlert.speechMessage|巣A|20',
      expect.objectContaining({ language: 'ja' })
    );
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('同じ段に留まっているあいだは、時間が経っても繰り返さない', async () => {
    const { result } = renderHook(() => useProximityAlert());
    await check(result, at(15));
    now += 60_000;
    await check(result, at(14));
    await check(result, at(18));
    expect(speak).toHaveBeenCalledTimes(1);
  });

  it('さらに近づいて小さい段に入るたびに知らせる（20m→10m→5m）', async () => {
    const { result } = renderHook(() => useProximityAlert());
    await check(result, at(15));
    now += 5000;
    await check(result, at(8));
    now += 5000;
    await check(result, at(3));
    expect(speak.mock.calls.map((c) => c[0])).toEqual([
      'settings.proximityAlert.speechMessage|巣A|20',
      'settings.proximityAlert.speechMessage|巣A|10',
      'settings.proximityAlert.speechMessage|巣A|5',
    ]);
  });

  it('前の通知から3秒たたないうちは知らせず、3秒たってから知らせる', async () => {
    const { result } = renderHook(() => useProximityAlert());
    await check(result, at(15));
    now += 2000;
    await check(result, at(8));
    expect(speak).toHaveBeenCalledTimes(1);
    now += 1000;
    await check(result, at(8));
    expect(speak).toHaveBeenCalledTimes(2);
    expect(speak).toHaveBeenLastCalledWith('settings.proximityAlert.speechMessage|巣A|10', expect.anything());
  });

  it('しきい値の外へ出てから近づき直すと、もう一度知らせる', async () => {
    const { result } = renderHook(() => useProximityAlert());
    await check(result, at(15));
    now += 5000;
    await check(result, at(25));
    now += 5000;
    await check(result, at(15));
    expect(speak).toHaveBeenCalledTimes(2);
  });

  it('しきい値を広げると、大きい段から知らせる', async () => {
    setState({ distanceThreshold: 100 });
    const { result } = renderHook(() => useProximityAlert());
    await check(result, at(120));
    expect(speak).not.toHaveBeenCalled();
    await check(result, at(80));
    now += 5000;
    await check(result, at(45));
    expect(speak.mock.calls.map((c) => c[0])).toEqual([
      'settings.proximityAlert.speechMessage|巣A|100',
      'settings.proximityAlert.speechMessage|巣A|50',
    ]);
  });

  it('無効のとき・対象レイヤが無いときは鳴らない', async () => {
    setState({ enabled: false });
    const disabled = renderHook(() => useProximityAlert());
    await check(disabled.result, at(5));

    setState({ targetLayerIds: [] });
    const noTarget = renderHook(() => useProximityAlert());
    await check(noTarget.result, at(5));

    setState({ targetLayerIds: ['other'] });
    const otherLayer = renderHook(() => useProximityAlert());
    await check(otherLayer.result, at(5));

    expect(speak).not.toHaveBeenCalled();
  });

  it('設定が保存されていない（古いデータ）ときは無効として扱う', async () => {
    setState(undefined);
    const { result } = renderHook(() => useProximityAlert());
    await check(result, at(5));
    expect(speak).not.toHaveBeenCalled();
  });

  it('測位の精度が30mより悪いときは判定しない。30m以下なら判定する', async () => {
    const { result } = renderHook(() => useProximityAlert());
    await check(result, at(15, 31));
    expect(speak).not.toHaveBeenCalled();
    await check(result, at(15, 30));
    expect(speak).toHaveBeenCalledTimes(1);
  });

  it('削除済み・非表示・位置なしの記録と、ポイント以外のレイヤは対象にしない', async () => {
    setState({}, [
      pointRecord({ id: 'deleted', deleted: true }),
      pointRecord({ id: 'hidden', visible: false }),
      pointRecord({ id: 'nocoords', coords: undefined }),
    ]);
    const records = renderHook(() => useProximityAlert());
    await check(records.result, at(5));

    setState({}, [pointRecord()], { type: 'LINE' });
    const line = renderHook(() => useProximityAlert());
    await check(line.result, at(5));

    expect(speak).not.toHaveBeenCalled();
  });

  it('複数のポイントが同時に範囲へ入ったときは1つだけ知らせ、3秒後に次を知らせる', async () => {
    setState({}, [pointRecord({ id: 'r1' }), pointRecord({ id: 'r2', field: { name: '巣B' } })]);
    const { result } = renderHook(() => useProximityAlert());
    await check(result, at(15));
    expect(speak.mock.calls.map((c) => c[0])).toEqual(['settings.proximityAlert.speechMessage|巣A|20']);
    now += 3000;
    await check(result, at(15));
    expect(speak.mock.calls.map((c) => c[0])).toEqual([
      'settings.proximityAlert.speechMessage|巣A|20',
      'settings.proximityAlert.speechMessage|巣B|20',
    ]);
  });

  it('ラベルが空の記録は、レイヤ名で知らせる', async () => {
    setState({}, [pointRecord({ field: {} })]);
    const { result } = renderHook(() => useProximityAlert());
    await check(result, at(15));
    expect(speak).toHaveBeenCalledWith('settings.proximityAlert.speechMessage|営巣地|20', expect.anything());
  });

  it('表示言語が英語なら、英語で読み上げる', async () => {
    mockLanguage = 'en-US';
    const { result } = renderHook(() => useProximityAlert());
    await check(result, at(15));
    expect(speak).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ language: 'en' }));
  });

  it('設定を変えると通知済みが消え、同じ場所でもう一度知らせる', async () => {
    const { result, rerender } = renderHook(() => useProximityAlert());
    await check(result, at(15));
    setState({ distanceThreshold: 50 });
    rerender();
    await check(result, at(15));
    expect(speak).toHaveBeenCalledTimes(2);
  });

  it('resetNotifiedPoints で通知済みが消える', async () => {
    const { result } = renderHook(() => useProximityAlert());
    await check(result, at(15));
    result.current.resetNotifiedPoints();
    await check(result, at(15));
    expect(speak).toHaveBeenCalledTimes(2);
  });

  it('有効・無効を端末にも保存する（アプリが終了されたあとの復元用）', () => {
    renderHook(() => useProximityAlert());
    expect(trackLogMMKV.setProximityAlertEnabled).toHaveBeenLastCalledWith(true);

    setState({ enabled: false });
    renderHook(() => useProximityAlert());
    expect(trackLogMMKV.setProximityAlertEnabled).toHaveBeenLastCalledWith(false);
  });
});
