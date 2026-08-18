import React, { useCallback, useContext, useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import TrackSummary from '../components/pages/TrackSummary';
import { TrackSummaryContext } from '../contexts/TrackSummary';
import { TrackFocusContext } from '../contexts/TrackFocus';
import { useBottomSheetNavigation, useBottomSheetRoute } from '../contexts/BottomSheetNavigationContext';
import { RootState } from '../store';
import { LineRecordType } from '../types';
import { calcTrackStatistics, buildElevationProfile } from '../utils/trackStatistics';

export default function TrackSummaryContainers() {
  const { goBack, canGoBack, closeBottomSheet } = useBottomSheetNavigation();
  const { params } = useBottomSheetRoute<'TrackSummary'>();
  const dataSet = useSelector((state: RootState) => state.dataSet);

  const record = useMemo(() => {
    if (params === undefined) return undefined;
    const targetData = dataSet.find((d) => d.layerId === params.layerId && d.userId === params.userId);
    const target = targetData?.data.find((r) => r.id === params.recordId);
    if (target === undefined || !Array.isArray(target.coords)) return undefined;
    return target as LineRecordType;
  }, [dataSet, params]);

  const statistics = useMemo(
    () => (record?.coords !== undefined ? calcTrackStatistics(record.coords) : null),
    [record]
  );
  const profile = useMemo(() => (record?.coords !== undefined ? buildElevationProfile(record.coords) : []), [record]);

  // 表示対象が変わったら地図マーカー（グラフカーソル）をリセットし、画面を離れたら消す
  const { setTrackFocusPoint } = useContext(TrackFocusContext);
  useEffect(() => {
    setTrackFocusPoint(null);
    return () => setTrackFocusPoint(null);
  }, [profile, setTrackFocusPoint]);

  // 両導線とも地図（Home）から開くため、戻る＝シートを閉じて地図に戻る
  const gotoBack = useCallback(() => {
    closeBottomSheet();
    if (canGoBack()) goBack();
  }, [canGoBack, closeBottomSheet, goBack]);

  return (
    <TrackSummaryContext.Provider
      value={{
        record,
        statistics,
        profile,
        gotoBack,
      }}
    >
      <TrackSummary />
    </TrackSummaryContext.Provider>
  );
}
