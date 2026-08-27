import React, { useContext, ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { MeasureContext, MeasureProvider } from '../Measure';

const wrapper = ({ children }: { children: ReactNode }) => <MeasureProvider>{children}</MeasureProvider>;

const renderMeasure = () => renderHook(() => useContext(MeasureContext), { wrapper });

describe('MeasureContext', () => {
  it('初期状態は非測定・両点null', async () => {
    const { result } = await renderMeasure();
    expect(result.current.isMeasuring).toBe(false);
    expect(result.current.measureA).toBeNull();
    expect(result.current.measureB).toBeNull();
  });

  it('startMeasureでA点が設定され測定モードになる', async () => {
    const { result } = await renderMeasure();
    await act(async () => {
      result.current.startMeasure({ latitude: 35, longitude: 135 });
    });
    expect(result.current.isMeasuring).toBe(true);
    expect(result.current.measureA).toEqual({ latitude: 35, longitude: 135 });
    expect(result.current.measureB).toBeNull();
  });

  it('setMeasureBでB点が設定され、再設定で置換される', async () => {
    const { result } = await renderMeasure();
    await act(async () => {
      result.current.startMeasure({ latitude: 35, longitude: 135 });
    });
    await act(async () => {
      result.current.setMeasureB({ latitude: 36, longitude: 136 });
    });
    expect(result.current.measureB).toEqual({ latitude: 36, longitude: 136 });
    await act(async () => {
      result.current.setMeasureB({ latitude: 37, longitude: 137 });
    });
    expect(result.current.measureB).toEqual({ latitude: 37, longitude: 137 });
  });

  it('startMeasureをやり直すとB点はリセットされる', async () => {
    const { result } = await renderMeasure();
    await act(async () => {
      result.current.startMeasure({ latitude: 35, longitude: 135 });
    });
    await act(async () => {
      result.current.setMeasureB({ latitude: 36, longitude: 136 });
    });
    await act(async () => {
      result.current.startMeasure({ latitude: 34, longitude: 134 });
    });
    expect(result.current.measureA).toEqual({ latitude: 34, longitude: 134 });
    expect(result.current.measureB).toBeNull();
  });

  it('endMeasureで両点がクリアされ非測定に戻る', async () => {
    const { result } = await renderMeasure();
    await act(async () => {
      result.current.startMeasure({ latitude: 35, longitude: 135 });
    });
    await act(async () => {
      result.current.setMeasureB({ latitude: 36, longitude: 136 });
    });
    await act(async () => {
      result.current.endMeasure();
    });
    expect(result.current.isMeasuring).toBe(false);
    expect(result.current.measureA).toBeNull();
    expect(result.current.measureB).toBeNull();
  });
});
