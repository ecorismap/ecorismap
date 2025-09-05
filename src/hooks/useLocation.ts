import { useEffect, useMemo, useRef } from 'react';
import { useCallback, useState } from 'react';
import * as ExpoLocation from 'expo-location';
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
} from '../utils/Location';
import { trackLogMMKV } from '../utils/mmkvStorage';
import { hasOpened } from '../utils/Project';
import * as projectStore from '../lib/firebase/firestore';
import { isLoggedIn } from '../utils/Account';
import { RootState } from '../store';
import { isMapView } from '../utils/Map';
import { t } from '../i18n/config';
import { LocationSubscription } from 'expo-location';
import { TASK } from '../constants/AppConstants';
import { AppState as RNAppState, Platform } from 'react-native';
import { EventEmitter } from 'fbemitter';
import * as TaskManager from 'expo-task-manager';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import * as Notifications from 'expo-notifications';
import { useRecord } from './useRecord';
import { cleanupLine } from '../utils/Coords';
import { Linking } from 'react-native';
import { MockGpsGenerator, MockGpsConfig, LONG_TRACK_TEST_CONFIG } from '../utils/mockGpsHelper';
import { isLocationType } from '../utils/General';

const openSettings = () => {
  Linking.openSettings().catch(() => {
    // 設定ページを開けなかった場合
  });
};

const locationEventsEmitter = new EventEmitter();

TaskManager.defineTask(TASK.FETCH_LOCATION, async (event) => {
  if (event.error) {
    return console.error('[tracking]', 'Something went wrong within the background location task...', event.error);
  }

  const locations = (event.data as any).locations as ExpoLocation.LocationObject[];
  //console.log('[tracking]', 'Received new locations', locations);

  try {
    // MMKVに保存されているトラックログをチェックして、必要な位置情報を取得
    // バックグラウンドの場合もフォアグラウンドの場合も、MMKVにログを保持し続ける
    checkAndStoreLocations(locations);
    // データは渡さず、イベントのみ発火（受信側で直接MMKVから読み込む）
    locationEventsEmitter.emit('update');
  } catch (error) {
    //console.log('[tracking]', 'Something went wrong when saving a new location...', error);
  }
});

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
  confirmLocationPermission: () => Promise<ExpoLocation.PermissionStatus.GRANTED | undefined>;
  // 擬似GPS関連
  useMockGps: boolean;
  toggleMockGps: (enabled: boolean, config?: MockGpsConfig) => Promise<void>;
  mockGpsProgress?: { current: number; total: number; percentage: number };
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
  const [azimuth, setAzimuth] = useState(0);
  const gpsSubscriber = useRef<{ remove(): void } | undefined>(undefined);
  const headingSubscriber = useRef<LocationSubscription | undefined>(undefined);

  const updateGpsPosition = useRef<(pos: ExpoLocation.LocationObject) => void>(() => null);
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

  // 擬似GPS用の設定とインスタンス
  const [useMockGps, setUseMockGps] = useState(false); // 常にfalseから開始
  const mockGpsRef = useRef<MockGpsGenerator | null>(null);
  const mockGpsLastUpdateRef = useRef<number>(0); // バッチ処理用：最後のUI更新時刻

  // 擬似GPS専用のref変数は削除（チャンク管理はLocation.tsに統一）

  const gpsAccuracyOption = useMemo(() => {
    // トラック記録中は固定設定を使用
    switch (gpsAccuracy) {
      case 'HIGH':
        return { accuracy: ExpoLocation.Accuracy.Highest, distanceInterval: 2 };
      case 'MEDIUM':
        return { accuracy: ExpoLocation.Accuracy.High, distanceInterval: 10 };
      case 'LOW':
        return { accuracy: ExpoLocation.Accuracy.Balanced };
      default:
        return { accuracy: ExpoLocation.Accuracy.Highest, distanceInterval: 2 };
    }
  }, [gpsAccuracy]);

  const confirmLocationPermission = useCallback(async () => {
    try {
      if (Platform.OS === 'android') {
        const { status: notificationStatus } = await Notifications.requestPermissionsAsync();
        if (notificationStatus !== 'granted') {
          await AlertAsync(t('hooks.message.permitAccessGPS'));
          openSettings();
          return;
        }
      }
      const { status: foregroundStatus } = await ExpoLocation.requestForegroundPermissionsAsync();
      if (foregroundStatus !== 'granted') {
        await AlertAsync(t('hooks.message.permitAccessGPS'));
        openSettings();
        return;
      }

      return 'granted' as ExpoLocation.PermissionStatus.GRANTED;
    } catch (e: any) {
      // エラーハンドリング
    }
  }, []);

  const startGPS = useCallback(async () => {
    //GPSもトラッキングもOFFの場合
    if (
      gpsSubscriber.current === undefined &&
      !(await ExpoLocation.hasStartedLocationUpdatesAsync(TASK.FETCH_LOCATION))
    ) {
      if (useMockGps) {
        // 擬似GPSを使用
        // 既存のインスタンスがなければデフォルト設定で作成
        if (!mockGpsRef.current) {
          mockGpsRef.current = new MockGpsGenerator(LONG_TRACK_TEST_CONFIG);
        }

        gpsSubscriber.current = {
          remove: () => {
            if (mockGpsRef.current) {
              mockGpsRef.current.stop();
              mockGpsRef.current = null;
            }
          },
        };

        // start()は内部で既に動作中かチェックして適切に処理する
        mockGpsRef.current.start((pos) => {
          updateGpsPosition.current(pos);
        });
      } else {
        // 実際のGPSを使用
        gpsSubscriber.current = await ExpoLocation.watchPositionAsync(gpsAccuracyOption, (pos) => {
          updateGpsPosition.current(pos);
        });
      }
    }
    if (headingSubscriber.current === undefined && !useMockGps) {
      headingSubscriber.current = await ExpoLocation.watchHeadingAsync((pos) => {
        setAzimuth(pos.trueHeading);
      });
    }
  }, [gpsAccuracyOption, useMockGps]);

  const stopGPS = useCallback(async () => {
    if (gpsSubscriber.current !== undefined) {
      gpsSubscriber.current.remove();
      gpsSubscriber.current = undefined;
    }
    if (headingSubscriber.current !== undefined) {
      headingSubscriber.current.remove();
      headingSubscriber.current = undefined;
    }
    if (mockGpsRef.current) {
      mockGpsRef.current.stop();
      mockGpsRef.current = null;
    }
  }, []);

  const stopTracking = useCallback(async () => {
    try {
      // チャンクシステムは自動的に保存されるため、追加の保存処理は不要

      if (!useMockGps && (await ExpoLocation.hasStartedLocationUpdatesAsync(TASK.FETCH_LOCATION))) {
        await ExpoLocation.stopLocationUpdatesAsync(TASK.FETCH_LOCATION);

        if (headingSubscriber.current !== undefined) {
          headingSubscriber.current.remove();
          headingSubscriber.current = undefined;
        }
      } else if (useMockGps) {
        // 擬似GPSの停止
        if (mockGpsRef.current) {
          mockGpsRef.current.stop();
          mockGpsRef.current = null; // インスタンスも削除
        }
        // バッチ処理用の変数をリセット
        mockGpsLastUpdateRef.current = 0;
        // GPSサブスクライバーもクリア
        if (gpsSubscriber.current !== undefined) {
          gpsSubscriber.current.remove();
          gpsSubscriber.current = undefined;
        }
      }
    } catch (e) {
      // エラーハンドリング
    } finally {
      if (isLoggedIn(dataUser) && hasOpened(projectId)) {
        projectStore.deleteCurrentPosition(dataUser.uid!, projectId);
        setCurrentLocation(null);
      }
    }
  }, [projectId, dataUser, useMockGps]);

  const startTracking = useCallback(async () => {
    // チャンクシステムを初期化（通常/擬似GPS共通）
    clearStoredLocations();

    if (useMockGps) {
      // 擬似GPSでトラッキング
      // 既存のインスタンスがなければデフォルト設定で作成
      if (!mockGpsRef.current) {
        mockGpsRef.current = new MockGpsGenerator(LONG_TRACK_TEST_CONFIG);
      }

      // GPSサブスクライバーも設定（GPS状態の管理のため）
      if (gpsSubscriber.current === undefined) {
        gpsSubscriber.current = {
          remove: () => {
            if (mockGpsRef.current) {
              mockGpsRef.current.stop();
              mockGpsRef.current = null;
            }
          },
        };
      }

      // 擬似GPSのコールバック処理（通常GPSと同じ処理フローを使用）
      mockGpsRef.current.start((pos) => {
        // checkAndStoreLocationsを使用して通常GPSと同じ処理
        checkAndStoreLocations([pos]);

        // UI更新の動的バッチ処理
        const now = Date.now();
        const config = mockGpsRef.current?.getConfig();

        if (config) {
          // 更新間隔に基づいて動的に調整
          // - 10ms以下: 500msごと（50倍の削減、2回/秒）
          // - 50ms以下: 200msごと（4-10倍の削減、5回/秒）
          // - 100ms以下: 100msごと（同じか削減、10回/秒）
          // - それ以上: そのまま
          let uiUpdateInterval: number;
          if (config.updateInterval <= 10) {
            uiUpdateInterval = 500; // 非常に高速な場合は500msごと（2回/秒）
          } else if (config.updateInterval <= 50) {
            uiUpdateInterval = 200; // 高速な場合は200msごと（5回/秒）
          } else if (config.updateInterval <= 100) {
            uiUpdateInterval = 100; // 中速の場合も100msごと（10回/秒）
          } else {
            uiUpdateInterval = config.updateInterval; // 通常速度はそのまま
          }

          // 指定された間隔が経過したらUIを更新
          if (now - mockGpsLastUpdateRef.current >= uiUpdateInterval) {
            // 軌跡の表示更新
            locationEventsEmitter.emit('update');
            // 現在地マーカーも同じタイミングで更新
            updateGpsPosition.current(pos);
            mockGpsLastUpdateRef.current = now;
          }
        }

        // プログレス表示（開発用）
        const progress = mockGpsRef.current ? mockGpsRef.current.getProgress() : null;
        if (progress && progress.current % 100 === 0) {
          console.log(`[MockGPS Progress] ${progress.current}/${progress.total} (${progress.percentage.toFixed(1)}%)`);
        }

        // 擬似GPSが停止したかチェック（ポイント数に達した場合など）
        if (mockGpsRef.current && !mockGpsRef.current.isRunning()) {
          console.log('Mock GPS has stopped, stopping tracking...');
          stopTracking();
        }
      });
    } else {
      // 実際のGPSでトラッキング
      if (!(await ExpoLocation.hasStartedLocationUpdatesAsync(TASK.FETCH_LOCATION))) {
        await ExpoLocation.startLocationUpdatesAsync(TASK.FETCH_LOCATION, {
          ...gpsAccuracyOption,
          pausesUpdatesAutomatically: false,
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: 'EcorisMap',
            notificationBody: t('hooks.notification.inTracking'),
            killServiceOnDestroy: false,
          },
        });
      }
    }

    if (headingSubscriber.current === undefined && !useMockGps) {
      headingSubscriber.current = await ExpoLocation.watchHeadingAsync((pos) => {
        setAzimuth(pos.trueHeading);
      });
    }
  }, [gpsAccuracyOption, stopTracking, useMockGps]);

  const moveCurrentPosition = useCallback(async () => {
    //console.log('moveCurrentPosition');
    // console.log('moveCurrentPosition2');
    const location =
      useMockGps && mockGpsRef.current
        ? mockGpsRef.current.getCurrentLocation()
        : await ExpoLocation.getLastKnownPositionAsync();
    // console.log('moveCurrentPosition3', location);
    if (location === null) return;
    setCurrentLocation(location.coords);
    if (mapViewRef.current === null || !isMapView(mapViewRef.current)) return;
    mapViewRef.current.animateCamera(
      {
        center: location.coords,
      },
      { duration: 5 }
    );
    //console.log('moveCurrentPosition4', location.coords);
  }, [mapViewRef, useMockGps]);

  const toggleGPS = useCallback(
    async (gpsState_: LocationStateType) => {
      if (gpsState_ === 'off') {
        await stopGPS();
        if (isLoggedIn(dataUser) && hasOpened(projectId)) {
          projectStore.deleteCurrentPosition(dataUser.uid!, projectId);
          setCurrentLocation(null);
        }
      } else if (gpsState_ === 'follow') {
        await moveCurrentPosition();
        updateGpsPosition.current = (pos: ExpoLocation.LocationObject) => {
          (mapViewRef.current as MapView).animateCamera(
            {
              center: {
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
              },
            },
            { duration: 5 }
          );
          setCurrentLocation(pos.coords);
        };
        await startGPS();
      } else if (gpsState_ === 'show') {
        updateGpsPosition.current = (pos: ExpoLocation.LocationObject) => {
          setCurrentLocation(pos.coords);
        };
        await startGPS();
      }

      setGpsState(gpsState_);
    },
    [stopGPS, dataUser, projectId, moveCurrentPosition, startGPS, mapViewRef]
  );

  const toggleTracking = useCallback(
    async (trackingState_: TrackingStateType) => {
      //Tracking Stateの変更後の処理

      //console.log('!!!!wakeup', trackingState)
      if (trackingState_ === 'on') {
        await moveCurrentPosition();
        await startTracking();
      } else if (trackingState_ === 'off') {
        await stopTracking();
      }
      setTrackingState(trackingState_);
    },
    [moveCurrentPosition, startTracking, stopTracking]
  );

  const toggleHeadingUp = useCallback(
    async (headingUp_: boolean) => {
      if (mapViewRef.current === null) return;
      const { status: foregroundStatus } = await ExpoLocation.getForegroundPermissionsAsync();
      if (foregroundStatus !== 'granted') return;
      if (headingUp_) {
        if (headingSubscriber.current !== undefined) headingSubscriber.current.remove();

        let lastHeading = 0;
        let lastUpdateTime = 0;

        headingSubscriber.current = await ExpoLocation.watchHeadingAsync((pos) => {
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
        if (headingSubscriber.current !== undefined) headingSubscriber.current.remove();
        headingSubscriber.current = await ExpoLocation.watchHeadingAsync((pos) => {
          setAzimuth(pos.trueHeading);
        });

        (mapViewRef.current as MapView).animateCamera(
          {
            heading: 0,
          },
          { duration: 500 }
        );
      }
      setHeadingUp(headingUp_);
    },
    [mapViewRef]
  );

  const updateCurrentLocationFromTracking = useCallback(async () => {
    // チャンク処理はcheckAndStoreLocationsで完了済み
    // ここではメタデータ更新のみを行う

    // 現在地を取得（MMKVから直接）
    const latestCoords = trackLogMMKV.getCurrentLocation();

    if (!latestCoords) return;

    // トラッキング中の場合、メタデータを更新（通常/擬似GPS共通）
    if (trackingState === 'on') {
      const chunkInfo = getCurrentChunkInfo();
      const metadata = getTrackMetadata();

      // メタデータを更新（現在地を含める）
      setTrackMetadata({
        distance: metadata.currentDistance,
        lastTimeStamp: metadata.lastTimeStamp,
        savedChunkCount: chunkInfo.currentChunkIndex,
        currentChunkSize: chunkInfo.currentChunkSize,
        totalPoints: metadata.totalPoints,
        currentLocation: latestCoords,
      });
    }

    // 現在位置の更新
    if (gpsState === 'follow' || RNAppState.currentState === 'background') {
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
    setCurrentLocation(latestCoords);
  }, [gpsState, mapViewRef, trackingState]);

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
        console.warn(`saveTrackLog: ${warningMessage}`);
      }

      if (validPoints.length < 2) {
        return { isOK: true, message: warningMessage || '有効なトラックデータが不足しています' };
      }

      setSavingTrackStatus({ isSaving: true, phase: 'cleaning', message: 'トラックを最適化中...' });

      // cleanupLineの処理（時間がかかる可能性がある）
      const cleanupedLine = await new Promise<LocationType[]>((resolve) => {
        setTimeout(() => {
          const result = cleanupLine(validPoints);
          resolve(result);
        }, 0);
      });

      setSavingTrackStatus({ isSaving: true, phase: 'saving', message: 'データを保存中...' });

      // レコードに追加（Redux更新も重い可能性）
      const ret = await new Promise<ReturnType<typeof addTrackRecord>>((resolve) => {
        setTimeout(() => {
          const result = addTrackRecord(cleanupedLine);
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

      // console.log(`Saved track with ${allPoints.length} points`);

      return { isOK: true, message: warningMessage };
    } finally {
      setSavingTrackStatus({ isSaving: false, phase: '', message: '' });
    }
  }, [addTrackRecord]);

  const checkUnsavedTrackLog = useCallback(async () => {
    // メタデータからデータの有無を確認
    const metadata = getTrackMetadata();
    const hasData = metadata.totalPoints > 0 || trackMetadata.totalPoints > 1;

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

  // 擬似GPSモード切り替え関数を追加
  const toggleMockGps = useCallback(
    async (enabled: boolean, config?: MockGpsConfig) => {
      // 現在のGPS/トラッキングを停止
      if (gpsState !== 'off') {
        await toggleGPS('off');
      }
      if (trackingState === 'on') {
        await toggleTracking('off');
      }

      // 既存のインスタンスを必ずクリーンアップ
      if (mockGpsRef.current) {
        mockGpsRef.current.stop();
        mockGpsRef.current = null;
      }

      // 擬似GPSの設定を更新
      setUseMockGps(enabled);

      if (enabled && config) {
        // 新しい設定でMockGpsGeneratorを作成
        mockGpsRef.current = new MockGpsGenerator(config);
      }
    },
    [gpsState, trackingState, toggleGPS, toggleTracking]
  );

  useEffect(() => {
    // console.log('#define locationEventsEmitter update function');

    const eventSubscription = locationEventsEmitter.addListener('update', updateCurrentLocationFromTracking);
    return () => {
      // console.log('clean locationEventsEmitter');
      eventSubscription && eventSubscription.remove();
    };
  }, [updateCurrentLocationFromTracking]);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    (async () => {
      //kill後の起動時にログ取得中なら終了させる。なぜかエラーになるがtry catchする

      const hasStarted = await ExpoLocation.hasStartedLocationUpdatesAsync(TASK.FETCH_LOCATION);
      if (hasStarted) {
        //再起動時にトラックを止める
        await stopTracking();
      }
      const { isOK, message } = await checkUnsavedTrackLog();
      if (!isOK) {
        await AlertAsync(message);
      }
    })();

    return () => {
      ExpoLocation.hasStartedLocationUpdatesAsync(TASK.FETCH_LOCATION).then((hasStarted) => {
        if (hasStarted) {
          ExpoLocation.stopLocationUpdatesAsync(TASK.FETCH_LOCATION);
        }
      });

      if (gpsSubscriber.current !== undefined) {
        gpsSubscriber.current.remove();
        gpsSubscriber.current = undefined;
      }
      if (headingSubscriber.current !== undefined) {
        headingSubscriber.current.remove();
        headingSubscriber.current = undefined;
      }
      if (mockGpsRef.current) {
        mockGpsRef.current.stop();
        mockGpsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const subscription = RNAppState.addEventListener('change', async (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        //console.log('App has come to the foreground!');

        // GPSがONの場合、GPSサブスクライバーを再開
        if ((gpsState === 'show' || gpsState === 'follow') && gpsSubscriber.current === undefined) {
          // GPSを再開
          await startGPS();
        }

        if (trackingState === 'on') {
          if (gpsState === 'show' || gpsState === 'follow') {
            if (headingSubscriber.current === undefined && !useMockGps) {
              //console.log('add heading');
              headingSubscriber.current = await ExpoLocation.watchHeadingAsync((pos) => {
                setAzimuth(pos.trueHeading);
              });
            }
          }
        }

        if (headingUp) toggleHeadingUp(true);
      } else if (appState.current === 'active' && nextAppState.match(/inactive|background/)) {
        //console.log('App has come to the background!');
        
        // バックグラウンド時はGPSサブスクライバーを一時停止（トラッキング中でない場合）
        if (trackingState !== 'on' && gpsSubscriber.current !== undefined) {
          gpsSubscriber.current.remove();
          gpsSubscriber.current = undefined;
        }
        
        if (headingSubscriber.current !== undefined) {
          //console.log('remove heading');
          headingSubscriber.current.remove();
          headingSubscriber.current = undefined;
        }
      }

      appState.current = nextAppState;
      //console.log('AppState', appState.current);
    });

    return () => {
      subscription && subscription.remove();
    };
  }, [gpsState, headingUp, toggleHeadingUp, trackingState, useMockGps, startGPS]);

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
    // 擬似GPS関連の追加
    useMockGps,
    toggleMockGps,
    mockGpsProgress: mockGpsRef.current?.getProgress(),
  } as const;
};;
