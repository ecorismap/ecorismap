import type { LngLat } from 'maplibre-gl';
import { renderHook } from '@testing-library/react-hooks';
import {
  applyBehindCameraVisibility,
  BehindTestMarker,
  refreshBehindCameraVisibility,
  refreshOnEvent,
  useHideMarkersBehindCamera,
} from '../useHideMarkersBehindCamera';

const mockMapRef: { current: { getMap: () => unknown } | undefined } = { current: undefined };
jest.mock('react-map-gl/maplibre', () => ({ useMap: () => ({ current: mockMapRef.current }) }));
const mockCreateBehindCameraTest = jest.fn((): ((lngLat: LngLat) => boolean) | null => null);
jest.mock('../../utils/terrain3d/webCamera', () => ({
  createBehindCameraTest: () => mockCreateBehindCameraTest(),
  isUsableLngLat: jest.requireActual('../../utils/terrain3d/webCamera').isUsableLngLat,
}));

const marker = (lng: number): BehindTestMarker & { element: { style: { visibility: string } } } => {
  const element = { style: { visibility: '' } };
  return {
    element,
    getLngLat: () => ({ lng, lat: 35 }) as LngLat,
    getElement: () => element as unknown as HTMLElement,
  };
};

describe('applyBehindCameraVisibility（V-L5）', () => {
  it('カメラの後ろのマーカーだけ隠す', () => {
    const front = marker(139);
    const behind = marker(137);
    applyBehindCameraVisibility([front, behind, null, undefined], (lngLat) => lngLat.lng < 138);
    expect(front.element.style.visibility).toBe('');
    expect(behind.element.style.visibility).toBe('hidden');
  });

  it('傾けていない（判定なし）ときは表示に戻す', () => {
    const behind = marker(137);
    behind.element.style.visibility = 'hidden';
    applyBehindCameraVisibility([behind], null);
    expect(behind.element.style.visibility).toBe('');
  });
});

describe('位置の無いマーカー・判定の例外（Web眺望で真っ白になった件）', () => {
  /** GeolocateControlの現在地ドットは、位置が一度も届いていないとgetLngLatがundefinedを返す */
  const markerWithoutPosition = () => {
    const element = { style: { visibility: '' } };
    return {
      element,
      getLngLat: () => undefined as unknown as LngLat,
      getElement: () => element as unknown as HTMLElement,
    };
  };

  it('位置の無いマーカーは判定せず表示のまま', () => {
    const noPosition = markerWithoutPosition();
    const isBehind = jest.fn((lngLat: LngLat) => lngLat.lng < 138);
    expect(() => applyBehindCameraVisibility([noPosition, marker(137)], isBehind)).not.toThrow();
    expect(noPosition.element.style.visibility).toBe('');
    expect(isBehind).toHaveBeenCalledTimes(1);
  });

  it('判定が例外を出しても外へ出さず、表示は今のまま残す', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const behind = marker(137);
    behind.element.style.visibility = 'hidden';
    mockCreateBehindCameraTest.mockImplementationOnce(() => {
      throw new Error('x=1, y=1, z=26 outside of bounds');
    });
    expect(() => refreshBehindCameraVisibility({} as never, () => [behind])).not.toThrow();
    expect(behind.element.style.visibility).toBe('hidden');
    mockCreateBehindCameraTest.mockImplementationOnce(() => () => {
      throw new Error('boom');
    });
    expect(() => refreshBehindCameraVisibility({} as never, () => [behind])).not.toThrow();
    warn.mockRestore();
  });

  it('マーカーの取り出しが例外を出しても外へ出さない', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(() =>
      refreshBehindCameraVisibility({} as never, () => {
        throw new Error('boom');
      })
    ).not.toThrow();
    warn.mockRestore();
  });
});

describe('refreshOnEvent（V-L5 位置だけ変わったとき）', () => {
  it('通知のたびに判定し直し、外すと呼ばない', () => {
    const listeners = new Map<string, () => void>();
    const source = {
      on: jest.fn((type: string, l: () => void) => listeners.set(type, l)),
      off: jest.fn((type: string) => listeners.delete(type)),
    };
    const update = jest.fn();
    const unsubscribe = refreshOnEvent(source, 'geolocate', update);
    listeners.get('geolocate')?.();
    expect(update).toHaveBeenCalledTimes(1);
    unsubscribe();
    expect(source.off).toHaveBeenCalledWith('geolocate', update);
    expect(listeners.has('geolocate')).toBe(false);
  });

  it('イベント源が無ければ何もしない', () => {
    expect(() => refreshOnEvent(null, 'geolocate', jest.fn())()).not.toThrow();
  });
});

describe('useHideMarkersBehindCamera（地図の描画ハンドラから判定するときも例外を外へ出さない）', () => {
  const createMap = () => {
    const handlers = new Map<string, () => void>();
    const map = {
      on: jest.fn((type: string, l: () => void) => handlers.set(type, l)),
      off: jest.fn((type: string) => handlers.delete(type)),
    };
    return { map, handlers };
  };

  afterEach(() => {
    mockMapRef.current = undefined;
    mockCreateBehindCameraTest.mockReset();
    mockCreateBehindCameraTest.mockImplementation(() => null);
  });

  it('render・idle・初回の判定が例外を出しても、maplibreの描画ループやReactのコミットへ出さない', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { map, handlers } = createMap();
    mockMapRef.current = { getMap: () => map };
    const behind = marker(137);
    mockCreateBehindCameraTest.mockImplementation(() => {
      throw new Error('x=1, y=1, z=26 outside of bounds');
    });
    const { unmount } = renderHook(() => useHideMarkersBehindCamera(() => [behind]));
    expect(handlers.has('render')).toBe(true);
    expect(handlers.has('idle')).toBe(true);
    expect(() => handlers.get('render')?.()).not.toThrow();
    expect(() => handlers.get('idle')?.()).not.toThrow();
    unmount();
    expect(handlers.size).toBe(0);
    warn.mockRestore();
  });

  it('描画のたびに判定し、後ろのマーカーを隠す', () => {
    const { map, handlers } = createMap();
    mockMapRef.current = { getMap: () => map };
    const behind = marker(137);
    let isBehind = false;
    mockCreateBehindCameraTest.mockImplementation(() => () => isBehind);
    renderHook(() => useHideMarkersBehindCamera(() => [behind]));
    expect(behind.element.style.visibility).toBe('');
    isBehind = true;
    handlers.get('render')?.();
    expect(behind.element.style.visibility).toBe('hidden');
  });

  it('判定の失敗は何度起きても警告は1回だけ', () => {
    jest.isolateModules(() => {
      const isolated = require('../useHideMarkersBehindCamera') as typeof import('../useHideMarkersBehindCamera');
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      mockCreateBehindCameraTest.mockImplementation(() => {
        throw new Error('boom');
      });
      isolated.refreshBehindCameraVisibility({} as never, () => []);
      isolated.refreshBehindCameraVisibility({} as never, () => []);
      expect(warn).toHaveBeenCalledTimes(1);
      warn.mockRestore();
    });
  });
});
