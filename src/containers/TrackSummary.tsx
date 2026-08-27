import React, { useCallback, useContext, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import TrackSummary from '../components/pages/TrackSummary';
import { TrackSummaryContext } from '../contexts/TrackSummary';
import { TrackFocusContext } from '../contexts/TrackFocus';
import { TrackPhotoContext } from '../contexts/TrackPhoto';
import { useBottomSheetNavigation, useBottomSheetRoute } from '../contexts/BottomSheetNavigationContext';
import { RootState } from '../store';
import { LineRecordType } from '../types';
import { calcTrackStatistics, buildElevationProfile, findNearestProfileIndex } from '../utils/trackStatistics';
import { useTrackPhotos } from '../hooks/useTrackPhotos';
import { editSettingsAction } from '../modules/settings';

export default function TrackSummaryContainers() {
  const { goBack, canGoBack, closeBottomSheet } = useBottomSheetNavigation();
  const { params } = useBottomSheetRoute<'TrackSummary'>();
  const dataSet = useSelector((state: RootState) => state.dataSet);
  const dispatch = useDispatch();

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

  // タップ地点から開いた場合はその場所を初期フォーカスにしてマーカーを即表示する。
  // 表示対象が変わったらリセットし、画面を離れたら消す
  const { setTrackFocusPoint } = useContext(TrackFocusContext);
  const initialFocusLatLon = params?.initialFocusLatLon;
  useEffect(() => {
    if (initialFocusLatLon !== undefined && profile.length >= 2) {
      const index = findNearestProfileIndex(profile, initialFocusLatLon);
      setTrackFocusPoint({ ...profile[index], index });
    } else {
      setTrackFocusPoint(null);
    }
    return () => setTrackFocusPoint(null);
  }, [initialFocusLatLon, profile, setTrackFocusPoint]);

  // 軌跡の記録時間帯で端末ライブラリの写真を照合し、地図側のマーカーへContext経由で渡す。
  // 画面を離れたら消す（TrackFocusと同じライフサイクル）
  const isTrackPhotoVisible = useSelector((state: RootState) => state.settings.isTrackPhotoVisible !== false);
  const { trackPhotos, isLimitedAccess, presentLimitedPicker } = useTrackPhotos(record?.coords, isTrackPhotoVisible);
  const { setTrackPhotos, setSelectedPhoto } = useContext(TrackPhotoContext);
  useEffect(() => {
    setTrackPhotos(trackPhotos);
  }, [trackPhotos, setTrackPhotos]);
  useEffect(() => {
    return () => {
      setTrackPhotos([]);
      setSelectedPhoto(null);
    };
  }, [setTrackPhotos, setSelectedPhoto]);

  const toggleTrackPhotoVisible = useCallback(() => {
    dispatch(editSettingsAction({ isTrackPhotoVisible: !isTrackPhotoVisible }));
  }, [dispatch, isTrackPhotoVisible]);

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
        isTrackPhotoVisible,
        toggleTrackPhotoVisible,
        trackPhotoCount: trackPhotos.length,
        isLimitedAccess,
        presentLimitedPicker,
      }}
    >
      <TrackSummary />
    </TrackSummaryContext.Provider>
  );
}
