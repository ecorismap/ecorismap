import type { Map as MaplibreMap } from 'maplibre-gl';
import { avoidExactHorizontalPitch, clearWebVista, lookBy, startWebVista } from '../webVista';
import { VISTA_PITCH_DEG } from '../constants';

jest.mock('../../viewshed', () => ({ getDemElevation: jest.fn() }));

describe('avoidExactHorizontalPitch（真水平でmaplibreのタイルズームがNaNになる件）', () => {
  it('真水平（90度）ちょうどはわずかに下へずらす', () => {
    const pitch = avoidExactHorizontalPitch(90);
    expect(pitch).toBeLessThan(90);
    expect(90 - pitch).toBeLessThan(0.01);
  });

  it('ずらした俯角では、カメラと注視点の高さの差が標高に対して丸めで消えない', () => {
    // maplibreのcoveringTiles: cameraCoord.z = centerCoord.z + cos(pitch) × cameraToCenterDistance / worldSize
    const centerZ = 1000 / (40075016.686 * Math.cos((40 * Math.PI) / 180)); // 標高1000m・北緯40度
    const offset = (pitch: number) => (Math.cos((pitch * Math.PI) / 180) * 693) / (512 * Math.pow(2, 20.5));
    expect(centerZ + offset(90) - centerZ).toBe(0);
    expect(centerZ + offset(avoidExactHorizontalPitch(90)) - centerZ).not.toBe(0);
  });

  it('真水平の近く（丸め誤差の範囲）もずらし、それ以外はそのまま', () => {
    expect(avoidExactHorizontalPitch(90 + 1e-9)).toBe(avoidExactHorizontalPitch(90));
    expect(avoidExactHorizontalPitch(89.9999)).toBe(avoidExactHorizontalPitch(90));
    expect(avoidExactHorizontalPitch(80)).toBe(80);
    expect(avoidExactHorizontalPitch(100)).toBe(100);
    expect(avoidExactHorizontalPitch(0)).toBe(0);
  });
});

describe('眺望のカメラ更新（jumpToへ渡す俯角）', () => {
  const createMap = () => {
    const jumpTo = jest.fn();
    const listeners = { addEventListener: jest.fn(), removeEventListener: jest.fn() };
    const map = {
      jumpTo,
      queryTerrainElevation: () => 1000,
      getZoom: () => 15,
      getTerrain: () => ({ source: 'dem' }),
      setMaxPitch: jest.fn(),
      setCenterClampedToGround: jest.fn(),
      getVerticalFieldOfView: () => 37,
      setVerticalFieldOfView: jest.fn(),
      calculateCameraOptionsFromTo: () => ({ center: [138.7, 35.3], zoom: 20.5, pitch: 90, bearing: 0 }),
      transform: {
        height: 768,
        pixelsPerMeter: 1,
        farZ: 1000,
        overrideNearFarZ: jest.fn(),
        clearNearFarZOverride: jest.fn(),
      },
      getStyle: () => ({ sources: {} }),
      getSource: () => undefined,
      getCanvasContainer: () => listeners,
      getContainer: () => ({ clientHeight: 768 }),
      on: jest.fn(),
      off: jest.fn(),
      easeTo: jest.fn(),
      triggerRepaint: jest.fn(),
    };
    return { map: map as unknown as MaplibreMap, jumpTo };
  };

  // jestの実行環境（react-native）のwindowにはイベントAPIが無い
  const win = window as unknown as Record<string, unknown>;
  const original = { add: win.addEventListener, remove: win.removeEventListener };
  beforeEach(() => {
    win.addEventListener = jest.fn();
    win.removeEventListener = jest.fn();
  });
  afterEach(() => {
    clearWebVista(false);
    win.addEventListener = original.add;
    win.removeEventListener = original.remove;
  });

  it('眺望の開始（既定の俯角＝真水平）でも、maplibreへは90度ちょうどを渡さない', async () => {
    expect(VISTA_PITCH_DEG).toBe(90);
    const { map, jumpTo } = createMap();
    await expect(startWebVista(map, 35.3, 138.7)).resolves.toBe(true);
    const pitches = jumpTo.mock.calls.map(([options]) => options.pitch).filter((p) => p !== undefined);
    expect(pitches.length).toBeGreaterThan(0);
    pitches.forEach((p) => expect(p).not.toBe(90));
  });

  it('3Dを抜けて解除するときは、上限を戻す前に立ち位置・俯角0へカメラを置く（傾いた2Dが保存されない）', async () => {
    const { map, jumpTo } = createMap();
    await startWebVista(map, 35.3, 138.7);
    jumpTo.mockClear();
    const setMaxPitch = map.setMaxPitch as unknown as jest.Mock;
    setMaxPitch.mockClear();
    clearWebVista(false);
    expect(jumpTo).toHaveBeenCalledWith({ center: [138.7, 35.3], zoom: 15, pitch: 0, bearing: 0 });
    expect(setMaxPitch).toHaveBeenCalledWith(85);
    expect(jumpTo.mock.invocationCallOrder[0]).toBeLessThan(setMaxPitch.mock.invocationCallOrder[0]);
    expect(map.easeTo).not.toHaveBeenCalled();
  });

  it('見回して水平へ戻ったときも90度ちょうどを渡さない', async () => {
    const { map, jumpTo } = createMap();
    await startWebVista(map, 35.3, 138.7);
    lookBy(0, 10);
    lookBy(0, -10);
    const last = jumpTo.mock.calls[jumpTo.mock.calls.length - 1][0];
    expect(last.pitch).toBeLessThan(90);
    expect(last.pitch).toBeCloseTo(90, 2);
  });
});
