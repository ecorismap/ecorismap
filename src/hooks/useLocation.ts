import { useEffect, useMemo, useRef } from 'react';
import { useCallback, useState } from 'react';
import BackgroundGeolocation, {
  Location as BackgroundLocation,
  Subscription as BackgroundSubscription,
  State as BackgroundState,
} from 'react-native-background-geolocation';
import { watchHeadingAsync, LocationSubscription } from 'expo-location';
import MapView from 'react-native-maps';
import { MapRef } from 'react-map-gl/maplibre';
import { LocationStateType, LocationType, TrackingStateType, TrackMetadataType } from '../types';
import { shallowEqual, useSelector } from 'react-redux';
import {
  checkAndStoreLocations,
  clearStoredLocations,
  getTrackMetadata,
  getAllTrackPoints,
  clearAllChunks,
  getCurrentChunkInfo,
  getLineLength,
  toLocationObject,
} from '../utils/Location';
import { trackLogMMKV } from '../utils/mmkvStorage';
import { hasOpened } from '../utils/Project';
import * as projectStore from '../lib/firebase/firestore';
import { isLoggedIn } from '../utils/Account';
import { RootState } from '../store';
import { isMapView } from '../utils/Map';
import { t } from '../i18n/config';
import { AppState as RNAppState, Platform } from 'react-native';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import * as Notifications from 'expo-notifications';
import { useRecord } from './useRecord';
import { Linking } from 'react-native';
import { isLocationType } from '../utils/General';
import { useProximityAlert } from './useProximityAlert';

const openSettings = () => {
  Linking.openSettings().catch(() => {
    // 設定ページを開けなかった場合
  });
};

export type UseLocationReturnType = {
  currentLocation: LocationType | null;
  gpsState: LocationStateType;
  trackingState: TrackingStateType;
  headingUp: boolean;
  azimuth: number;
  trackMetadata: TrackMetadataType;
  savingTrackStatus: {
    isSaving: boolean;
    phase: '' | 'merging' | 'filtering' | 'cleaning' | 'saving';
    message: string;
  };
  toggleHeadingUp: (headingUp_: boolean) => Promise<void>;
  toggleGPS: (gpsState: LocationStateType) => Promise<void>;
  toggleTracking: (trackingState: TrackingStateType) => Promise<void>;
  checkUnsavedTrackLog: () => Promise<{ isOK: boolean; message: string }>;
  saveTrackLog: () => Promise<{
    isOK: boolean;
    message: string;
  }>;
  confirmLocationPermission: () => Promise<'granted' | undefined>;
};

export const useLocation = (mapViewRef: React.RefObject<MapView | MapRef | null>): UseLocationReturnType => {
  const projectId = useSelector((state: RootState) => state.settings.projectId, shallowEqual);
  const user = useSelector((state: RootState) => state.user);
  const dataUser = useMemo(
    () => (projectId === undefined ? { ...user, uid: undefined, displayName: null } : user),
    [projectId, user]
  );

  // MMKVから直接トラックログを取得して管理（Reduxは使用しない）
  const [trackMetadata, setTrackMetadata] = useState<TrackMetadataType>(() => {
    const metadata = getTrackMetadata();
    const chunkInfo = getCurrentChunkInfo();
    return {
      distance: metadata.currentDistance,
      lastTimeStamp: metadata.lastTimeStamp,
      savedChunkCount: chunkInfo.currentChunkIndex,
      currentChunkSize: chunkInfo.currentChunkSize,
      totalPoints: metadata.totalPoints,
    };
  });
  const { addTrackRecord } = useRecord();
  const { checkProximity } = useProximityAlert();
  const checkProximityRef = useRef(checkProximity);
  const [azimuth, setAzimuth] = useState(0);
  const headingSubscriber = useRef<LocationSubscription | null>(null);
  const bgReadyRef = useRef(false);
  const initializedRef = useRef(false);
  const trackingStateRef = useRef<TrackingStateType>('off');
  const gpsStateRef = useRef<LocationStateType>('off');
  const locationSubscription = useRef<BackgroundSubscription | null>(null);
  const gpsAccuracy = useSelector((state: RootState) => state.settings.gpsAccuracy);
  const appState = useRef(RNAppState.currentState);
  const [currentLocation, setCurrentLocation] = useState<LocationType | null>(null);
  const [headingUp, setHeadingUp] = useState(false);
  const [gpsState, setGpsState] = useState<LocationStateType>('off');
  const [trackingState, setTrackingState] = useState<TrackingStateType>('off');
  const [savingTrackStatus, setSavingTrackStatus] = useState<{
    isSaving: boolean;
    phase: '' | 'merging' | 'filtering' | 'cleaning' | 'saving';
    message: string;
  }>({ isSaving: false, phase: '', message: '' });

  const gpsAccuracyOption = useMemo(() => {
    switch (gpsAccuracy) {
      case 'HIGH':
        return { desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_HIGH, distanceFilter: 2 };
      case 'MEDIUM':
        return { desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_MEDIUM, distanceFilter: 10 };
      case 'LOW':
        return { desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_LOW, distanceFilter: 50 };
      default:
        return { desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_HIGH, distanceFilter: 2 };
    }
  }, [gpsAccuracy]);

  // checkProximityをrefで同期（onLocationコールバックがクロージャで古い参照を保持する問題を回避）
  useEffect(() => {
    checkProximityRef.current = checkProximity;
  }, [checkProximity]);

  const confirmLocationPermission = useCallback(async () => {
    try {
      if (Platform.OS === 'android') {
        const notificationPermission = await Notifications.getPermissionsAsync();
        if (notificationPermission.status !== 'granted') {
          if (notificationPermission.canAskAgain) {
            const { status: notificationStatus } = await Notifications.requestPermissionsAsync();
            if (notificationStatus !== 'granted') {
              await AlertAsync(t('hooks.message.permitAccessGPS'));
              openSettings();
              return;
            }
          } else {
            await AlertAsync(t('hooks.message.permitAccessGPS'));
            openSettings();
            return;
          }
        }
      }

      const authStatus = await BackgroundGeolocation.requestPermission();
      if (
        authStatus === BackgroundGeolocation.AUTHORIZATION_STATUS_ALWAYS ||
        authStatus === BackgroundGeolocation.AUTHORIZATION_STATUS_WHEN_IN_USE
      ) {
        return 'granted';
      }

      await AlertAsync(t('hooks.message.permitAccessGPS'));
      openSettings();
      return;
    } catch (e: any) {
      console.error('confirmLocationPermission error', e);
    }
  }, []);

  const handleBackgroundLocation = useCallback(
    (location: BackgroundLocation) => {
      const isTracking = trackingStateRef.current === 'on';
      const isGpsOn = gpsStateRef.current !== 'off';

      // トラッキング中でもGPSオンでもない場合は何もしない
      if (!isTracking && !isGpsOn) {
        return;
      }

      try {
        const normalized = toLocationObject(location);
        const latest = { ...normalized.coords, timestamp: normalized.timestamp };

        // トラッキング中のみ軌跡を保存
        if (isTracking) {
          checkAndStoreLocations([normalized]);

          // メタデータを更新
          const chunkInfo = getCurrentChunkInfo();
          const metadata = getTrackMetadata();
          setTrackMetadata({
            distance: metadata.currentDistance,
            lastTimeStamp: metadata.lastTimeStamp,
            savedChunkCount: chunkInfo.currentChunkIndex,
            currentChunkSize: chunkInfo.currentChunkSize,
            totalPoints: metadata.totalPoints,
            currentLocation: latest,
          });
        }

        // GPSオンまたはトラッキング中は現在地をMMKVに保存（フォアグラウンド復帰時の同期用）
        trackLogMMKV.setCurrentLocation(latest);

        // 常に現在地を更新
        setCurrentLocation(latest);

        // カメラ移動（followモードまたはバックグラウンド時のトラッキング中）
        if (gpsStateRef.current === 'follow' || (isTracking && RNAppState.currentState === 'background')) {
          if (mapViewRef.current !== null && isMapView(mapViewRef.current)) {
            (mapViewRef.current as MapView).animateCamera(
              {
                center: {
                  latitude: latest.latitude,
                  longitude: latest.longitude,
                },
              },
              { duration: 5 }
            );
          }
        }

        // 接近通知チェック（GPSオンまたはトラッキング中）
        checkProximityRef.current(latest);
      } catch (error) {
        console.error('[tracking] Failed to persist location', error);
      }
    },
    [mapViewRef]
  );

  const ensureBackgroundGeolocation = useCallback(async () => {
    // 既存のサービス状態を確認（アプリキル後の再起動でサービスが動作中かどうか）
    const existingState = await BackgroundGeolocation.getState();
    const isServiceRunning = existingState.enabled;

    const config = {
      desiredAccuracy: gpsAccuracyOption.desiredAccuracy,
      distanceFilter: gpsAccuracyOption.distanceFilter,
      stopOnTerminate: false,
      startOnBoot: true,
      enableHeadless: true,
      foregroundService: true,
      locationAuthorizationRequest: 'WhenInUse',
      disableLocationAuthorizationAlert: true,
      disableMotionActivityUpdates: true,
      notification: {
        sticky: true,
        title: 'EcorisMap',
        text: t('hooks.notification.inTracking'),
        channelName: 'EcorisMap Tracking',
        color: '#0F5FBA',
        smallIcon: 'drawable/ic_notification',
        largeIcon: 'mipmap/ic_launcher',
      },
      allowsBackgroundLocationUpdates: true,
      // サービスが動作中（アプリキル後の再起動）の場合はresetしない
      // resetするとバックグラウンドで継続中の記録が途切れる
      reset: !isServiceRunning,
    } as const;

    const state = await BackgroundGeolocation.ready(config);

    if (!locationSubscription.current) {
      locationSubscription.current = BackgroundGeolocation.onLocation(
        (location) => handleBackgroundLocation(location),
        (error) => console.error('[tracking] location error', error)
      );
    }

    bgReadyRef.current = true;
    return state;
  }, [gpsAccuracyOption.desiredAccuracy, gpsAccuracyOption.distanceFilter, handleBackgroundLocation]);

  const startGPS = useCallback(
    async (mode: LocationStateType) => {
      if (mode === 'off') return;
      await ensureBackgroundGeolocation();

      // トラッキング中でなければBackgroundGeolocationを開始
      if (trackingStateRef.current !== 'on') {
        const state = await BackgroundGeolocation.getState();
        if (!state.enabled) {
          // GPSのみオン時の通知メッセージを設定
          await BackgroundGeolocation.setConfig({
            notification: {
              sticky: true,
              title: 'EcorisMap',
              text: t('hooks.notification.gpsOn'),
              channelName: 'EcorisMap Tracking',
              color: '#0F5FBA',
              smallIcon: 'drawable/ic_notification',
              largeIcon: 'mipmap/ic_launcher',
            },
          });
          await BackgroundGeolocation.start();
          // 移動モードにして位置更新を継続させる
          await BackgroundGeolocation.changePace(true);
        }
      }

      if (headingSubscriber.current === null) {
        try {
          headingSubscriber.current = await watchHeadingAsync((pos) => {
            setAzimuth(pos.trueHeading);
          });
        } catch (error) {
          console.error('Failed to start heading subscriber:', error);
        }
      }
    },
    [ensureBackgroundGeolocation]
  );

  const stopGPS = useCallback(async () => {
    // トラッキング中でなければBackgroundGeolocationを停止
    if (trackingStateRef.current !== 'on') {
      const state = await BackgroundGeolocation.getState();
      if (state.enabled) {
        await BackgroundGeolocation.stop();
      }
    }
    if (headingSubscriber.current !== null) {
      headingSubscriber.current.remove();
      headingSubscriber.current = null;
    }
  }, []);

  const stopTracking = useCallback(async () => {
    try {
      await ensureBackgroundGeolocation();
      // 軌跡記録停止時はBackgroundGeolocationも停止
      const state: BackgroundState = await BackgroundGeolocation.getState();
      if (state.enabled) {
        await BackgroundGeolocation.stop();
      }
      // トラッキング状態をMMKVからクリア
      trackLogMMKV.setTrackingState('off');
      // GPSも停止
      setGpsState('off');
      gpsStateRef.current = 'off';
      trackLogMMKV.setGpsState('off');
      // React Stateをクリア（メモリ解放を促進）
      setCurrentLocation(null);
    } catch (e) {
    } finally {
      if (isLoggedIn(dataUser) && hasOpened(projectId)) {
        projectStore.deleteCurrentPosition(dataUser.uid!, projectId);
        setCurrentLocation(null);
      }
    }
  }, [projectId, dataUser, ensureBackgroundGeolocation]);

  const startTracking = useCallback(async () => {
    try {
      // チャンクシステムを初期化
      clearStoredLocations();

      await ensureBackgroundGeolocation();

      // トラッキング用の通知メッセージを設定
      await BackgroundGeolocation.setConfig({
        notification: {
          sticky: true,
          title: 'EcorisMap',
          text: t('hooks.notification.inTracking'),
          channelName: 'EcorisMap Tracking',
          color: '#0F5FBA',
          smallIcon: 'drawable/ic_notification',
          largeIcon: 'mipmap/ic_launcher',
        },
      });

      const state: BackgroundState = await BackgroundGeolocation.getState();
      if (!state.enabled) {
        await BackgroundGeolocation.start();
      }

      // 強制的に移動モードにして位置更新を継続させる
      // BackgroundGeolocationはデフォルトで静止モード(isMoving:false)で開始されるため必須
      await BackgroundGeolocation.changePace(true);

      // トラッキング状態をMMKVに保存（kill後の復帰で正しく復元するため）
      trackLogMMKV.setTrackingState('on');

      if (headingSubscriber.current === null) {
        headingSubscriber.current = await watchHeadingAsync((pos) => {
          setAzimuth(pos.trueHeading);
        });
      }
    } catch (error) {
      console.error('Error in startTracking:', error);
      throw error;
    }
  }, [ensureBackgroundGeolocation]);

  const moveCurrentPosition = useCallback(async () => {
    try {
      const location = await BackgroundGeolocation.getCurrentPosition({
        persist: false,
        samples: 1,
        desiredAccuracy: gpsAccuracyOption.desiredAccuracy,
        timeout: 30,
      } as any);
      if (!location) return;
      const coords = location.coords;
      setCurrentLocation(coords);
      if (mapViewRef.current === null || !isMapView(mapViewRef.current)) return;
      mapViewRef.current.animateCamera(
        {
          center: {
            latitude: coords.latitude,
            longitude: coords.longitude,
          },
        },
        { duration: 5 }
      );
    } catch (error) {
      console.error('moveCurrentPosition error', error);
    }
  }, [gpsAccuracyOption.desiredAccuracy, mapViewRef]);

  const toggleGPS = useCallback(
    async (gpsState_: LocationStateType) => {
      // GPSのみONのケースでもトラッキング状態を確実にOFFにしておく（キル復帰での誤保存防止）
      if (trackingStateRef.current !== 'on') {
        trackLogMMKV.setTrackingState('off');
      }
      trackLogMMKV.setGpsState(gpsState_);

      // 先にUIを更新（ボタンの色を即座に変更）
      setGpsState(gpsState_);
      gpsStateRef.current = gpsState_;

      if (gpsState_ === 'off') {
        await stopGPS();
        if (isLoggedIn(dataUser) && hasOpened(projectId)) {
          projectStore.deleteCurrentPosition(dataUser.uid!, projectId);
          setCurrentLocation(null);
        }
      } else {
        if (gpsState_ === 'follow') {
          await moveCurrentPosition();
        }
        await startGPS(gpsState_);
      }
    },
    [stopGPS, dataUser, projectId, moveCurrentPosition, startGPS]
  );

  const toggleTracking = useCallback(
    async (trackingState_: TrackingStateType) => {
      try {
        if (trackingState_ === 'on') {
          // 先にUIを更新（ボタンの色を即座に変更）
          setTrackingState(trackingState_);
          trackingStateRef.current = trackingState_;
          await startTracking();
          await moveCurrentPosition();
        } else if (trackingState_ === 'off') {
          // 先にUIを更新（ボタンの色を即座に変更）
          setTrackingState(trackingState_);
          trackingStateRef.current = trackingState_;
          await stopTracking();
          // GPSがオンの場合はstopTracking内でBackgroundGeolocationは継続している
        }
      } catch (error) {
        console.error('Error in toggleTracking:', error);
        setTrackingState(trackingState_);
        trackingStateRef.current = trackingState_;
      }
    },
    [moveCurrentPosition, startTracking, stopTracking]
  );

  const toggleHeadingUp = useCallback(
    async (headingUp_: boolean) => {
      if (mapViewRef.current === null) return;

      if (headingUp_) {
        // headingUpをtrueにする場合のみ権限チェック
        const permissionStatus = await confirmLocationPermission();
        if (permissionStatus !== 'granted') return;

        if (headingSubscriber.current !== null) headingSubscriber.current.remove();

        let lastHeading = 0;
        let lastUpdateTime = 0;

        headingSubscriber.current = await watchHeadingAsync((pos) => {
          const newHeading = Math.abs((-1.0 * pos.trueHeading) % 360);
          const currentTime = Date.now();

          // 角度の変化が小さい場合はアニメーションをスキップ
          const headingDiff = Math.abs(newHeading - lastHeading);
          if (headingDiff < 2 && headingDiff > 0) {
            setAzimuth(pos.trueHeading);
            return;
          }

          // 最小更新間隔を設定（ミリ秒）
          const minUpdateInterval = 100;
          if (currentTime - lastUpdateTime < minUpdateInterval) {
            setAzimuth(pos.trueHeading);
            return;
          }

          lastHeading = newHeading;
          lastUpdateTime = currentTime;

          (mapViewRef.current as MapView).animateCamera(
            {
              heading: newHeading,
            },
            { duration: 200 }
          );

          setAzimuth(pos.trueHeading);
        });
      } else {
        // headingUpをfalseにする場合は権限不要
        if (headingSubscriber.current !== null) {
          headingSubscriber.current.remove();
          headingSubscriber.current = null;
        }

        (mapViewRef.current as MapView).animateCamera(
          {
            heading: 0,
          },
          { duration: 500 }
        );
      }
      setHeadingUp(headingUp_);
    },
    [confirmLocationPermission, mapViewRef]
  );

  // フォアグラウンド復帰時にMMKVからデータを同期する関数
  const syncLocationFromMMKV = useCallback(() => {
    const latestCoords = trackLogMMKV.getCurrentLocation();
    if (!latestCoords) return;

    // トラッキング中の場合、メタデータを更新
    if (trackingStateRef.current === 'on') {
      const chunkInfo = getCurrentChunkInfo();
      const metadata = getTrackMetadata();
      setTrackMetadata({
        distance: metadata.currentDistance,
        lastTimeStamp: metadata.lastTimeStamp,
        savedChunkCount: chunkInfo.currentChunkIndex,
        currentChunkSize: chunkInfo.currentChunkSize,
        totalPoints: metadata.totalPoints,
        currentLocation: latestCoords,
      });
    }

    // カメラ移動（followモード時）
    if (gpsStateRef.current === 'follow') {
      if (mapViewRef.current !== null && isMapView(mapViewRef.current)) {
        (mapViewRef.current as MapView).animateCamera(
          {
            center: {
              latitude: latestCoords.latitude,
              longitude: latestCoords.longitude,
            },
          },
          { duration: 5 }
        );
      }
    }
    setCurrentLocation(latestCoords);
  }, [mapViewRef]);

  // トラックログをトラック用のレコードに追加する
  const saveTrackLog = useCallback(async () => {
    try {
      setSavingTrackStatus({ isSaving: true, phase: 'merging', message: 'トラックデータを結合中...' });

      // 全チャンクを結合（重い処理の可能性）
      const allPoints = await new Promise<ReturnType<typeof getAllTrackPoints>>((resolve) => {
        setTimeout(() => {
          const points = getAllTrackPoints();
          resolve(points);
        }, 0);
      });

      setSavingTrackStatus({ isSaving: true, phase: 'filtering', message: 'データを検証中...' });

      // isLocationTypeを使って有効な点のみをフィルタリング
      const validPoints = await new Promise<LocationType[]>((resolve) => {
        setTimeout(() => {
          const points = allPoints.filter((point) => isLocationType(point)) as LocationType[];
          resolve(points);
        }, 0);
      });

      // 除外された点の数を計算
      const invalidCount = allPoints.length - validPoints.length;

      // 除外された点があれば警告メッセージを作成
      let warningMessage = '';
      if (invalidCount > 0) {
        warningMessage = `${invalidCount}個の無効な位置データを除外しました。`;
      }

      if (validPoints.length < 2) {
        return { isOK: true, message: warningMessage || '有効なトラックデータが不足しています' };
      }

      setSavingTrackStatus({ isSaving: true, phase: 'saving', message: 'データを保存中...' });

      // 全トラックの総距離を計算
      const totalDistance = getLineLength(validPoints);
      const distanceText = totalDistance > 0 ? `${totalDistance.toFixed(2)} km` : '';

      // レコードに追加（Redux更新も重い可能性）
      // 注意: cleanupLineは getAllTrackPoints で一括適用済み
      const ret = await new Promise<ReturnType<typeof addTrackRecord>>((resolve) => {
        setTimeout(() => {
          const result = addTrackRecord(validPoints, { distance: distanceText });
          resolve(result);
        }, 0);
      });

      if (!ret.isOK) {
        return { isOK: ret.isOK, message: ret.message };
      }

      // チャンクデータをクリア
      clearAllChunks();

      // UIもクリア
      setTrackMetadata({
        distance: 0,
        lastTimeStamp: 0,
        savedChunkCount: 0,
        currentChunkSize: 0,
        totalPoints: 0,
      });

      // 現在地もクリア（メモリ解放）
      setCurrentLocation(null);

      return { isOK: true, message: warningMessage };
    } finally {
      setSavingTrackStatus({ isSaving: false, phase: '', message: '' });
    }
  }, [addTrackRecord]);

  const checkUnsavedTrackLog = useCallback(async () => {
    // メタデータからデータの有無を確認
    const metadata = getTrackMetadata();
    const totalPoints = Math.max(metadata.totalPoints, trackMetadata.totalPoints);
    const hasData = totalPoints > 1;

    if (hasData) {
      const ans = await ConfirmAsync(t('hooks.message.saveTracking'));
      if (ans) {
        const ret = await saveTrackLog();
        if (!ret.isOK) return ret;
      } else {
        // チャンクデータをクリア
        clearAllChunks();

        // stateも更新
        setTrackMetadata({
          distance: 0,
          lastTimeStamp: 0,
          savedChunkCount: 0,
          currentChunkSize: 0,
          totalPoints: 0,
        });
      }
    }
    return { isOK: true, message: '' };
  }, [saveTrackLog, trackMetadata.totalPoints]);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    // 初期化済みの場合はスキップ（依存配列の変更による再実行を防ぐ）
    if (initializedRef.current) {
      return;
    }

    (async () => {
      initializedRef.current = true;

      // kill後復帰用に保存済みの状態を先に読み出す
      const savedTrackingState = Platform.OS === 'android' ? trackLogMMKV.getTrackingState() : 'off';
      const savedGpsState = Platform.OS === 'android' ? trackLogMMKV.getGpsState() : 'off';
      const wasTracking = savedTrackingState === 'on';

      if (savedGpsState !== 'off') {
        setGpsState(savedGpsState);
        gpsStateRef.current = savedGpsState;
      }

      if (wasTracking && Platform.OS === 'android') {
        // onLocationで弾かれないように先にref/stateを復元
        trackingStateRef.current = 'on';
        setTrackingState('on');
        if (gpsStateRef.current === 'off') {
          setGpsState('follow');
          gpsStateRef.current = 'follow';
        }
      }
      // 追跡が不要な場合は念のためトラッキング状態をクリア（GPSのみONでの誤保存防止）
      if (!wasTracking) {
        trackLogMMKV.setTrackingState('off');
      }

      await ensureBackgroundGeolocation();
      const state = await BackgroundGeolocation.getState();

      if (state.enabled) {
        if (Platform.OS === 'android') {
          // MMKVから保存されたトラッキング状態を取得して復元
          if (wasTracking) {
            const chunkInfo = getCurrentChunkInfo();
            const metadata = getTrackMetadata();
            setTrackMetadata({
              distance: metadata.currentDistance,
              lastTimeStamp: metadata.lastTimeStamp,
              savedChunkCount: chunkInfo.currentChunkIndex,
              currentChunkSize: chunkInfo.currentChunkSize,
              totalPoints: metadata.totalPoints,
            });
            await moveCurrentPosition();
          }

          // 移動モードを確実に有効化（アプリキル後の再起動で静止モードになっている可能性があるため）
          await BackgroundGeolocation.changePace(true);

          if (headingSubscriber.current === null) {
            try {
              const permissionStatus = await confirmLocationPermission();
              if (permissionStatus !== 'granted') {
                console.warn('[tracking] Heading subscription skipped: permission not granted');
              } else {
                headingSubscriber.current = await watchHeadingAsync((pos) => {
                  setAzimuth(pos.trueHeading);
                });
              }
            } catch (error) {
              console.error('Error restoring heading subscriber:', error);
            }
          }

          // 最新の位置を設定して軌跡を表示（CurrentTrackLogは currentLocation の変更をトリガーに再レンダリングする）
          const latestCoords = trackLogMMKV.getCurrentLocation();
          if (latestCoords) {
            setCurrentLocation(latestCoords);
          }
        } else {
          await stopTracking();
          // 軌跡記録中だった場合のみ保存確認（GPSのみONの場合はスキップ）
          if (trackLogMMKV.getTrackingState() === 'on') {
            const { isOK, message } = await checkUnsavedTrackLog();
            if (!isOK) {
              await AlertAsync(message);
            }
          }
        }
      } else {
        // 軌跡記録中だった場合のみ保存確認（GPSのみONの場合はスキップ）
        if (wasTracking) {
          const { isOK, message } = await checkUnsavedTrackLog();
          if (!isOK) {
            await AlertAsync(message);
          }
        }

        // GPSまたは軌跡がオンの場合はBackgroundGeolocationを開始
        if (gpsStateRef.current !== 'off' || wasTracking) {
          const bgState = await BackgroundGeolocation.getState();
          if (!bgState.enabled) {
            await BackgroundGeolocation.start();
            await BackgroundGeolocation.changePace(true);
          }
          if (headingSubscriber.current === null) {
            try {
              const permissionStatus = await confirmLocationPermission();
              if (permissionStatus === 'granted') {
                headingSubscriber.current = await watchHeadingAsync((pos) => {
                  setAzimuth(pos.trueHeading);
                });
              }
            } catch (error) {
              console.error('Error starting heading subscriber:', error);
            }
          }

          // 現在位置設定（GPS/軌跡共通）
          const latestCoords = trackLogMMKV.getCurrentLocation();
          if (latestCoords) {
            setCurrentLocation(latestCoords);
          } else if (wasTracking) {
            await moveCurrentPosition();
          }
        }
      }
      console.log('[tracking] useEffect initialization completed');
    })();

    return () => {
      if (headingSubscriber.current !== null) {
        headingSubscriber.current.remove();
        headingSubscriber.current = null;
      }
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }
    };
  }, [
    checkUnsavedTrackLog,
    confirmLocationPermission,
    ensureBackgroundGeolocation,
    stopTracking,
    trackingState,
    moveCurrentPosition,
  ]);

  useEffect(() => {
    const subscription = RNAppState.addEventListener('change', async (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        // フォアグラウンド復帰時
        try {
          syncLocationFromMMKV();
        } catch (error) {
          console.error('Failed to refresh current location on foreground:', error);
        }

        // ヘディング再購読
        const shouldSubscribeHeading = trackingState === 'on' || gpsState !== 'off' || headingUp;
        if (shouldSubscribeHeading && headingSubscriber.current === null) {
          try {
            const permissionStatus = await confirmLocationPermission();
            if (permissionStatus === 'granted') {
              headingSubscriber.current = await watchHeadingAsync((pos) => {
                setAzimuth(pos.trueHeading);
              });
            } else {
              console.warn('[tracking] Skipped heading subscription on foreground: permission not granted');
            }
          } catch (error) {
            console.error('Error resubscribing heading watcher on foreground:', error);
          }
        }

        if (headingUp) toggleHeadingUp(true);
      } else if (appState.current === 'active' && nextAppState.match(/inactive|background/)) {
        // バックグラウンド移行時
        // BackgroundGeolocationは継続（onLocationで位置更新を続ける）

        // ヘディング購読を停止（バッテリー節約）
        if (headingSubscriber.current !== null) {
          headingSubscriber.current.remove();
          headingSubscriber.current = null;
        }
      }

      appState.current = nextAppState;
    });

    return () => {
      subscription && subscription.remove();
    };
  }, [
    gpsState,
    headingUp,
    toggleHeadingUp,
    trackingState,
    syncLocationFromMMKV,
    confirmLocationPermission,
  ]);

  useEffect(() => {
    trackingStateRef.current = trackingState;
  }, [trackingState]);

  useEffect(() => {
    gpsStateRef.current = gpsState;
  }, [gpsState]);

  return {
    currentLocation,
    gpsState,
    trackingState,
    headingUp,
    azimuth,
    trackMetadata,
    savingTrackStatus,
    toggleGPS,
    toggleTracking,
    toggleHeadingUp,
    checkUnsavedTrackLog,
    saveTrackLog,
    confirmLocationPermission,
  } as const;
};
