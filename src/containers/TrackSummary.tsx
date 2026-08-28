import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import TrackSummary from '../components/pages/TrackSummary';
import { TrackSummaryContext } from '../contexts/TrackSummary';
import { TrackFocusContext } from '../contexts/TrackFocus';
import { TrackPhotoContext } from '../contexts/TrackPhoto';
import { LocationTrackingContext } from '../contexts/LocationTracking';
import { useBottomSheetNavigation, useBottomSheetRoute } from '../contexts/BottomSheetNavigationContext';
import { RootState } from '../store';
import { LineRecordType, LocationType } from '../types';
import { getAllTrackPoints } from '../utils/Location';
import { calcTrackStatistics, buildElevationProfile, findNearestProfileIndex } from '../utils/trackStatistics';
import { useTrackPhotos } from '../hooks/useTrackPhotos';
import { editSettingsAction } from '../modules/settings';

// 記録中サマリーのライブ更新間隔。統計・グラフはMMKV全点読み出しを伴うため間引き、
// 写真はメディアライブラリ走査を伴うためさらに長い間隔にする
const RECORDING_STATS_INTERVAL_MS = 5 * 1000;
const RECORDING_PHOTO_INTERVAL_MS = 30 * 1000;

export default function TrackSummaryContainers() {
  const { goBack, canGoBack, closeBottomSheet } = useBottomSheetNavigation();
  const { params } = useBottomSheetRoute<'TrackSummary'>();
  const dataSet = useSelector((state: RootState) => state.dataSet);
  const dispatch = useDispatch();

  const isRecordingTarget = params !== undefined && 'recording' in params;

  const record = useMemo(() => {
    if (params === undefined || 'recording' in params) return undefined;
    const targetData = dataSet.find((d) => d.layerId === params.layerId && d.userId === params.userId);
    const target = targetData?.data.find((r) => r.id === params.recordId);
    if (target === undefined || !Array.isArray(target.coords)) return undefined;
    return target as LineRecordType;
  }, [dataSet, params]);

  // 記録中の軌跡ログ。trackMetadata（記録中は約1秒間隔で更新）をトリガーに、
  // MMKVからの全点読み出しを一定間隔に間引いて再読込する（間引いた分はトレーリングで拾う）
  const { trackMetadata } = useContext(LocationTrackingContext);
  const totalPoints = trackMetadata.totalPoints;
  const [recordingCoords, setRecordingCoords] = useState<LocationType[] | undefined>(undefined);
  const lastStatsLoadRef = useRef(0);
  useEffect(() => {
    if (!isRecordingTarget) return;
    if (totalPoints === 0) {
      // 記録の保存・破棄でログが消えたら表示も消す
      setRecordingCoords(undefined);
      return;
    }
    const load = () => {
      lastStatsLoadRef.current = Date.now();
      setRecordingCoords(getAllTrackPoints());
    };
    const elapsed = Date.now() - lastStatsLoadRef.current;
    if (elapsed >= RECORDING_STATS_INTERVAL_MS) {
      load();
    } else {
      const timer = setTimeout(load, RECORDING_STATS_INTERVAL_MS - elapsed);
      return () => clearTimeout(timer);
    }
  }, [isRecordingTarget, totalPoints]);

  const coords = isRecordingTarget ? recordingCoords : record?.coords;

  const statistics = useMemo(() => (coords !== undefined ? calcTrackStatistics(coords) : null), [coords]);
  const profile = useMemo(() => (coords !== undefined ? buildElevationProfile(coords) : []), [coords]);

  // タップ地点から開いた場合はその場所を初期フォーカスにしてマーカーを即表示する。
  // 記録中はprofileが伸び続けて再計算されるため、初期フォーカスは一度だけ適用し
  // 以後のグラフカーソル操作を上書きしない
  const { setTrackFocusPoint } = useContext(TrackFocusContext);
  const initialFocusLatLon = params?.initialFocusLatLon;
  const appliedInitialFocusRef = useRef(false);
  useEffect(() => {
    appliedInitialFocusRef.current = false;
  }, [initialFocusLatLon]);
  useEffect(() => {
    if (initialFocusLatLon === undefined || profile.length < 2) {
      if (!appliedInitialFocusRef.current) setTrackFocusPoint(null);
      return;
    }
    if (appliedInitialFocusRef.current) return;
    appliedInitialFocusRef.current = true;
    const index = findNearestProfileIndex(profile, initialFocusLatLon);
    setTrackFocusPoint({ ...profile[index], index });
  }, [initialFocusLatLon, profile, setTrackFocusPoint]);
  // 画面を離れたらフォーカスマーカーを消す
  useEffect(() => {
    return () => setTrackFocusPoint(null);
  }, [setTrackFocusPoint]);

  // 軌跡の記録時間帯で端末ライブラリの写真を照合し、地図側のマーカーへContext経由で渡す。
  // 画面を離れたら消す（TrackFocusと同じライフサイクル）
  const isTrackPhotoVisible = useSelector((state: RootState) => state.settings.isTrackPhotoVisible !== false);
  // 記録中は写真の再照合（ライブラリ走査）をさらに長い間隔に間引く
  const [photoCoords, setPhotoCoords] = useState<LocationType[] | undefined>(undefined);
  const lastPhotoLoadRef = useRef(0);
  useEffect(() => {
    if (!isRecordingTarget) return;
    if (recordingCoords === undefined) {
      setPhotoCoords(undefined);
      return;
    }
    const apply = () => {
      lastPhotoLoadRef.current = Date.now();
      setPhotoCoords(recordingCoords);
    };
    const elapsed = Date.now() - lastPhotoLoadRef.current;
    if (elapsed >= RECORDING_PHOTO_INTERVAL_MS) {
      apply();
    } else {
      const timer = setTimeout(apply, RECORDING_PHOTO_INTERVAL_MS - elapsed);
      return () => clearTimeout(timer);
    }
  }, [isRecordingTarget, recordingCoords]);
  const { trackPhotos, isLimitedAccess, presentLimitedPicker } = useTrackPhotos(
    isRecordingTarget ? photoCoords : record?.coords,
    isTrackPhotoVisible
  );
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
        statistics,
        profile,
        isRecording: isRecordingTarget,
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
