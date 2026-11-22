import React from 'react';
import { render, act } from '@testing-library/react-native';
import { SavedTrackLog } from '../SavedTrackLog';
import { AppStateContext } from '../../../contexts/AppState';
import { getTrackChunkForDisplay } from '../../../utils/Location';
import { LocationType } from '../../../types';

jest.mock('react-native-maps', () => {
  const mockReact = require('react');
  return {
    __esModule: true,
    Polyline: (props: object) => mockReact.createElement('Polyline', props),
  };
});

jest.mock('react-redux', () => ({
  useSelector: jest.fn(() => false),
}));

jest.mock('../../../utils/Layer', () => ({
  isTrackGnssQualityColored: jest.fn(() => false),
}));

jest.mock('../../../lib/gnss/toLocation', () => ({
  trackFixColor: jest.fn(() => undefined),
}));

jest.mock('../../../utils/Location', () => ({
  getTrackChunkForDisplay: jest.fn(),
  splitTrackByAccuracy: jest.fn((coordinates: unknown[]) => [{ coordinates, isLowAccuracy: false }]),
}));

const point = (i: number): LocationType => ({ latitude: 35, longitude: 135 + i * 0.001, timestamp: i });

type View = Awaited<ReturnType<typeof render>>;
const polylines = (view: View) => view.container.queryAll((node) => node.type === 'Polyline');

const flushLoad = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
};

describe('SavedTrackLog（軌跡監査 T-L14）', () => {
  const setLoading = jest.fn();
  const contextValue = { setLoading } as unknown as React.ContextType<typeof AppStateContext>;
  const renderLog = (savedChunkCount: number) => (
    <AppStateContext.Provider value={contextValue}>
      <SavedTrackLog savedChunkCount={savedChunkCount} />
    </AppStateContext.Provider>
  );

  beforeEach(() => {
    jest.clearAllMocks();
    (getTrackChunkForDisplay as jest.Mock).mockImplementation((index: number) => [point(index * 2), point(index * 2 + 1)]);
  });

  it('初回の読み込みだけLoadingを出し、チャンクが増えても既存の線を描いたまま足す', async () => {
    const view = await render(renderLog(1));
    // 初回は読み込み終わるまでLoadingを出す
    expect(setLoading).toHaveBeenCalledWith(true);

    await flushLoad();
    expect(setLoading).toHaveBeenLastCalledWith(false);
    expect(polylines(view)).toHaveLength(1);

    // 記録中のチャンク切り替え: 既存の線は消えず（読み込み中も描いたまま）、Loadingも出し入れしない
    setLoading.mockClear();
    await view.rerender(renderLog(2));
    expect(polylines(view).length).toBeGreaterThanOrEqual(1);

    await flushLoad();
    expect(polylines(view)).toHaveLength(2);
    expect(setLoading).not.toHaveBeenCalled();
  });

  it('保存でチャンクが0になったあと、次の記録の初回はまたLoadingを出す', async () => {
    const view = await render(renderLog(1));
    await flushLoad();
    await view.rerender(renderLog(0));
    expect(polylines(view)).toHaveLength(0);

    setLoading.mockClear();
    await view.rerender(renderLog(1));
    expect(setLoading).toHaveBeenCalledWith(true);
    await flushLoad();
    expect(setLoading).toHaveBeenLastCalledWith(false);
    expect(polylines(view)).toHaveLength(1);
  });
});
