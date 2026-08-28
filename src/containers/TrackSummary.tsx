import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import TrackSummary from '../components/pages/TrackSummary';
import { TrackSummaryContext } from '../contexts/TrackSummary';
import { TrackFocusContext } from '../contexts/TrackFocus';
import { TrackPhotoContext } from '../contexts/TrackPhoto';
import { LocationTrackingContext } from '../contexts/LocationTracking';
import { useBottomSheetNavigation, useBottomSheetRoute } from '../contexts/BottomSheetNavigationContext';
import { RootState } from '../store';
import { ExportType, LineRecordType, LocationType } from '../types';
import { getAllTrackPoints } from '../utils/Location';
import { calcTrackStatistics, buildElevationProfile, findNearestProfileIndex } from '../utils/trackStatistics';
import { generateTrackGPXWithPhotos } from '../utils/Geometry';
import { exportGeoFile } from '../utils/File';
import { MAX_BACKUP_LABEL_LENGTH, truncateForFileName } from '../utils/General';
import { resolveTrackPhotoFileUri, useTrackPhotos } from '../hooks/useTrackPhotos';
import { editSettingsAction } from '../modules/settings';
import { AlertAsync } from '../components/molecules/AlertAsync';
import { t } from '../i18n/config';
import { Platform } from 'react-native';
import dayjs from '../i18n/dayjs';

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

  // 表示中の軌跡をGPX（trk+写真wpt）+写真ファイルのzipでエクスポートする。
  // 写真は表示トグルONのネイティブのみ。localUriがない写真（iCloud未DL等）は
  // GPXのlink参照切れを防ぐためwpt・ファイルともスキップする
  const [isExporting, setIsExporting] = useState(false);
  const pressExportTrack = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      // 記録中は間引き更新前の最新点まで含めるためその場で再取得する
      const exportCoords = isRecordingTarget ? getAllTrackPoints() : record?.coords;
      if (exportCoords === undefined || exportCoords.length < 2) {
        await AlertAsync(t('TrackSummary.notFound'));
        return;
      }
      const time = dayjs().format('YYYY-MM-DD_HH-mm-ss');
      const recordName =
        !isRecordingTarget && typeof record?.field.name === 'string' && record.field.name !== ''
          ? record.field.name
          : `track_${time}`;
      const label = truncateForFileName(recordName, MAX_BACKUP_LABEL_LENGTH);

      const exportPhotos: { filename: string; timestamp: number; latitude: number; longitude: number; fileUri: string }[] =
        [];
      if (Platform.OS !== 'web' && isTrackPhotoVisible) {
        // zip内の同名衝突はname_1.jpg形式でリネームし、wptのlinkと一致させる
        const usedNames = new Map<string, number>();
        for (const photo of trackPhotos) {
          // localUri未取得の写真もフォールバックで実ファイルを解決する（取得できない写真はスキップ）
          const fileUri = await resolveTrackPhotoFileUri(photo);
          if (fileUri === undefined) continue;
          const count = usedNames.get(photo.filename) ?? 0;
          usedNames.set(photo.filename, count + 1);
          let filename = photo.filename;
          if (count > 0) {
            const dot = filename.lastIndexOf('.');
            filename = dot === -1 ? `${filename}_${count}` : `${filename.slice(0, dot)}_${count}${filename.slice(dot)}`;
          }
          exportPhotos.push({
            filename,
            timestamp: photo.timestamp,
            latitude: photo.latitude,
            longitude: photo.longitude,
            fileUri,
          });
        }
      }

      const gpx = generateTrackGPXWithPhotos(exportCoords, recordName, exportPhotos);
      const exportData: { data: string; name: string; folder: string; type: ExportType }[] = [
        { data: gpx, name: `${label}_${time}.gpx`, folder: '', type: 'GPX' },
        ...exportPhotos.map((photo) => ({ data: photo.fileUri, name: photo.filename, folder: '', type: 'PHOTO' as ExportType })),
      ];
      const result = await exportGeoFile(exportData, `track_${label}_${time}`, 'zip');
      if (result === 'saved') {
        await AlertAsync(t('hooks.message.successExportData'));
      } else if (result === 'error') {
        await AlertAsync(t('hooks.message.failExport'));
      }
    } catch (e) {
      await AlertAsync(t('hooks.message.failExport'));
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, isRecordingTarget, record, isTrackPhotoVisible, trackPhotos]);

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
        pressExportTrack,
        isExporting,
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
