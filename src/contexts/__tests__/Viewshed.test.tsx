import React, { useContext, ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { ViewshedContext, ViewshedProvider, ViewshedPreviewResult } from '../Viewshed';

const wrapper = ({ children }: { children: ReactNode }) => <ViewshedProvider>{children}</ViewshedProvider>;

const renderViewshed = () => renderHook(() => useContext(ViewshedContext), { wrapper });

const makeResult = (id: string): ViewshedPreviewResult => ({
  id,
  observer: { latitude: 35, longitude: 135 },
  polygons: [{ coords: [{ latitude: 35, longitude: 135 }], holes: {} }],
  circleRing: [{ latitude: 35.1, longitude: 135.1 }],
});

describe('ViewshedContext', () => {
  it('初期状態は仮表示なし', async () => {
    const { result } = await renderViewshed();
    expect(result.current.hasViewshedPreview).toBe(false);
    expect(result.current.viewshedResults).toEqual([]);
  });

  it('addViewshedResultで結果が追加され仮表示ありになる', async () => {
    const { result } = await renderViewshed();
    await act(async () => {
      result.current.addViewshedResult(makeResult('a'));
    });
    expect(result.current.hasViewshedPreview).toBe(true);
    expect(result.current.viewshedResults).toHaveLength(1);
    expect(result.current.viewshedResults[0].id).toBe('a');
  });

  it('複数回の追加で作成順に蓄積される', async () => {
    const { result } = await renderViewshed();
    await act(async () => {
      result.current.addViewshedResult(makeResult('a'));
    });
    await act(async () => {
      result.current.addViewshedResult(makeResult('b'));
    });
    expect(result.current.viewshedResults.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('clearViewshedResultsで全消去され仮表示なしに戻る', async () => {
    const { result } = await renderViewshed();
    await act(async () => {
      result.current.addViewshedResult(makeResult('a'));
      result.current.addViewshedResult(makeResult('b'));
    });
    await act(async () => {
      result.current.clearViewshedResults();
    });
    expect(result.current.hasViewshedPreview).toBe(false);
    expect(result.current.viewshedResults).toEqual([]);
  });
});
