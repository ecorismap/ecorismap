import type { LngLat } from 'maplibre-gl';
import { applyBehindCameraVisibility, BehindTestMarker, refreshOnEvent } from '../useHideMarkersBehindCamera';

jest.mock('react-map-gl/maplibre', () => ({ useMap: () => ({ current: undefined }) }));
jest.mock('../../utils/terrain3d/webCamera', () => ({ createBehindCameraTest: () => null }));

const marker = (lng: number): BehindTestMarker & { element: { style: { visibility: string } } } => {
  const element = { style: { visibility: '' } };
  return {
    element,
    getLngLat: () => ({ lng, lat: 35 } as LngLat),
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
