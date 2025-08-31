import { useEffect, useMemo, useRef } from 'react';
import { useCallback, useState } from 'react';
import * as Location from 'expo-location';
import MapView from 'react-native-maps';
import { MapRef } from 'react-map-gl/maplibre';
import { LocationStateType, LocationType, TrackingStateType, TrackLogType } from '../types';
import { shallowEqual, useSelector } from 'react-redux';
import { 
  checkAndStoreLocations, 
  getStoredLocations,
  CHUNK_SIZE,
  DISPLAY_BUFFER_SIZE,
  saveTrackChunk,
  getTrackChunk,
  getTrackMetadata,
  saveTrackMetadata,
  getAllTrackPoints,
  clearAllChunks,
  type TrackChunkMetadata
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
import { isLocationTypeArray } from '../utils/General';
import { Linking } from 'react-native';
import { MockGpsGenerator, MockGpsConfig, LONG_TRACK_TEST_CONFIG } from '../utils/mockGpsHelper';
import { logMemoryUsage, logObjectSize, logChunkStats, PerformanceTimer } from '../utils/memoryMonitor';

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

  const locations = (event.data as any).locations as Location.LocationObject[];
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
  trackLog: TrackLogType;
  toggleHeadingUp: (headingUp_: boolean) => Promise<void>;
  toggleGPS: (gpsState: LocationStateType) => Promise<void>;
  toggleTracking: (trackingState: TrackingStateType) => Promise<void>;
  checkUnsavedTrackLog: () => Promise<{ isOK: boolean; message: string }>;
  saveTrackLog: () => Promise<{
    isOK: boolean;
    message: string;
  }>;
  confirmLocationPermission: () => Promise<Location.PermissionStatus.GRANTED | undefined>;
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
  const [trackLog, setTrackLog] = useState<TrackLogType>(() => getStoredLocations());
  const { addTrackRecord } = useRecord();
  const [azimuth, setAzimuth] = useState(0);
  const gpsSubscriber = useRef<{ remove(): void } | undefined>(undefined);
  const headingSubscriber = useRef<LocationSubscription | undefined>(undefined);

  const updateGpsPosition = useRef<(pos: Location.LocationObject) => void>(() => null);
  const gpsAccuracy = useSelector((state: RootState) => state.settings.gpsAccuracy);
  const appState = useRef(RNAppState.currentState);
  const [currentLocation, setCurrentLocation] = useState<LocationType | null>(null);
  const [headingUp, setHeadingUp] = useState(false);
  const [gpsState, setGpsState] = useState<LocationStateType>('off');
  const [trackingState, setTrackingState] = useState<TrackingStateType>('off');

  // 擬似GPS用の設定とインスタンス
  const [useMockGps, setUseMockGps] = useState(false);  // 常にfalseから開始
  const mockGpsRef = useRef<MockGpsGenerator | null>(null);
  
  // チャンク管理用のref
  const currentChunkRef = useRef<Location.LocationObjectCoords[]>([]);
  const currentChunkIndexRef = useRef<number>(0);
  const displayBufferRef = useRef<Location.LocationObjectCoords[]>([]);
  const trackMetadataRef = useRef<TrackChunkMetadata>(getTrackMetadata());
  const lastUIUpdateRef = useRef<number>(0);  // UI更新のスロットリング用
  const pendingUIUpdateRef = useRef<boolean>(false);  // UI更新の重複防止用
  
  // 保存済みチャンクのキャッシュ（毎回読み込まないため）
  const savedChunksCacheRef = useRef<Location.LocationObjectCoords[][]>([]);
  const lastLoadedChunkIndex = useRef<number>(-1);

  const gpsAccuracyOption = useMemo(() => {
    // トラック記録中は固定設定を使用
    switch (gpsAccuracy) {
      case 'HIGH':
        return { accuracy: Location.Accuracy.Highest, distanceInterval: 2 };
      case 'MEDIUM':
        return { accuracy: Location.Accuracy.High, distanceInterval: 10 };
      case 'LOW':
        return { accuracy: Location.Accuracy.Balanced };
      default:
        return { accuracy: Location.Accuracy.Highest, distanceInterval: 2 };
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
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
      if (foregroundStatus !== 'granted') {
        await AlertAsync(t('hooks.message.permitAccessGPS'));
        openSettings();
        return;
      }

      return 'granted' as Location.PermissionStatus.GRANTED;
    } catch (e: any) {
      // エラーハンドリング
    }
  }, []);

  const startGPS = useCallback(async () => {
    //GPSもトラッキングもOFFの場合
    if (gpsSubscriber.current === undefined && !(await Location.hasStartedLocationUpdatesAsync(TASK.FETCH_LOCATION))) {
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
          }
        };
        
        // start()は内部で既に動作中かチェックして適切に処理する
        mockGpsRef.current.start((pos) => {
          updateGpsPosition.current(pos);
        });
        
        console.log('Started mock GPS');
      } else {
        // 実際のGPSを使用
        gpsSubscriber.current = await Location.watchPositionAsync(gpsAccuracyOption, (pos) => {
          updateGpsPosition.current(pos);
        });
      }
    }
    if (headingSubscriber.current === undefined && !useMockGps) {
      headingSubscriber.current = await Location.watchHeadingAsync((pos) => {
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
      // 最後のチャンクを保存
      if (currentChunkRef.current.length > 0) {
        saveTrackChunk(currentChunkIndexRef.current, currentChunkRef.current);
        saveTrackMetadata(trackMetadataRef.current);
        console.log(`Saved final chunk ${currentChunkIndexRef.current} with ${currentChunkRef.current.length} points`);
        console.log(`Total saved: ${trackMetadataRef.current.totalPoints} points in ${trackMetadataRef.current.totalChunks + 1} chunks`);
      }
      
      if (!useMockGps && await Location.hasStartedLocationUpdatesAsync(TASK.FETCH_LOCATION)) {
        await Location.stopLocationUpdatesAsync(TASK.FETCH_LOCATION);

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
        // GPSサブスクライバーもクリア
        if (gpsSubscriber.current !== undefined) {
          gpsSubscriber.current.remove();
          gpsSubscriber.current = undefined;
        }
        console.log('Stopped mock GPS tracking');
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
    // メタデータを初期化または復元
    trackMetadataRef.current = getTrackMetadata();
    currentChunkIndexRef.current = trackMetadataRef.current.lastChunkIndex;
    
    // 最新チャンクを読み込み
    if (trackMetadataRef.current.totalPoints > 0) {
      currentChunkRef.current = getTrackChunk(currentChunkIndexRef.current) || [];
      // 表示用バッファに最新ポイントをロード（全チャンクを読み込まないように修正）
      // 最後の1-2チャンクから最新500ポイントを取得
      displayBufferRef.current = [];
      
      // 現在のチャンクから取得
      displayBufferRef.current = [...currentChunkRef.current];
      
      // 足りない場合は前のチャンクから補充
      if (displayBufferRef.current.length < DISPLAY_BUFFER_SIZE && currentChunkIndexRef.current > 0) {
        const prevChunk = getTrackChunk(currentChunkIndexRef.current - 1);
        if (prevChunk) {
          const needed = DISPLAY_BUFFER_SIZE - displayBufferRef.current.length;
          const startIdx = Math.max(0, prevChunk.length - needed);
          displayBufferRef.current = [...prevChunk.slice(startIdx), ...displayBufferRef.current];
        }
      }
      
      console.log(`[Startup] Loaded displayBuffer with ${displayBufferRef.current.length} points (max 2 chunks)`);
      
      // 保存済みチャンクを取得（一時的に無効化）
      console.log(`[Startup] Skipping chunk loading (disabled for debugging)`);
      // const startupTimer = new PerformanceTimer('Startup');
      // 
      // savedChunksCacheRef.current = [];
      // for (let i = 0; i < currentChunkIndexRef.current; i++) {
      //   const chunk = getTrackChunk(i);
      //   if (chunk && chunk.length > 0) {
      //     savedChunksCacheRef.current.push(chunk);
      //   }
      // }
      // lastLoadedChunkIndex.current = currentChunkIndexRef.current - 1;
      // 
      // startupTimer.log(`Loaded ${savedChunksCacheRef.current.length} chunks`);
      // logObjectSize('Startup savedChunks', savedChunksCacheRef.current);
      logMemoryUsage('After startup (no chunk load)');
      
      // 起動時のsetTrackLogを一時的にコメントアウト（無限ループ防止）
      // setTrackLog({
      //   track: [...displayBufferRef.current],
      //   distance: 0, // 後で計算
      //   lastTimeStamp: trackMetadataRef.current.lastTimeStamp,
      //   // savedChunks: [...savedChunksCacheRef.current],
      //   // currentChunk: [...currentChunkRef.current]
      // });
    } else {
      // 初回起動時は空から開始
      currentChunkRef.current = [];
      displayBufferRef.current = [];
      savedChunksCacheRef.current = [];
      lastLoadedChunkIndex.current = -1;
      // 起動時のsetTrackLogを一時的にコメントアウト（無限ループ防止）
      // setTrackLog({
      //   track: [],
      //   distance: 0,
      //   lastTimeStamp: 0,
      //   // savedChunks: [],
      //   // currentChunk: []
      // });
    }
    
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
          }
        };
      }
      
      // 新しいコールバック処理（チャンクベース）
      mockGpsRef.current.start((pos) => {
        const coords = pos.coords;
        
        // 1. 現在のチャンクに追加
        currentChunkRef.current.push(coords);
        
        // 2. 表示用バッファを更新（内部的に管理、コピーは作らない）
        displayBufferRef.current.push(coords);
        if (displayBufferRef.current.length > DISPLAY_BUFFER_SIZE) {
          displayBufferRef.current.shift();
        }
        
        // 3. メタデータを更新
        trackMetadataRef.current.totalPoints++;
        trackMetadataRef.current.lastTimeStamp = pos.timestamp;
        
        // デバッグ: 100ポイントごとにメモリ状態を詳細確認
        if (trackMetadataRef.current.totalPoints % 100 === 0) {
          console.log(`[Debug] Point ${trackMetadataRef.current.totalPoints}:`);
          console.log(`  - currentChunk length: ${currentChunkRef.current.length}`);
          console.log(`  - displayBuffer length: ${displayBufferRef.current.length}`);
          console.log(`  - savedChunksCache length: ${savedChunksCacheRef.current.length}`);
          
          // オブジェクトの参照を確認
          const currentChunkSize = JSON.stringify(currentChunkRef.current).length;
          const displayBufferSize = JSON.stringify(displayBufferRef.current).length;
          console.log(`  - currentChunk size: ${(currentChunkSize / 1024).toFixed(2)}KB`);
          console.log(`  - displayBuffer size: ${(displayBufferSize / 1024).toFixed(2)}KB`);
        }
        
        // 4. チャンクが満杯になったら保存
        if (currentChunkRef.current.length >= CHUNK_SIZE) {
          // 現在のチャンクを保存
          saveTrackChunk(currentChunkIndexRef.current, currentChunkRef.current);
          
          // メタデータを更新
          currentChunkIndexRef.current++;
          trackMetadataRef.current.lastChunkIndex = currentChunkIndexRef.current;
          trackMetadataRef.current.totalChunks++;
          saveTrackMetadata(trackMetadataRef.current);
          
          // 保存したチャンクをキャッシュに追加（メモリ問題のため完全削除）
          // const savedChunk = [...currentChunkRef.current];
          // savedChunksCacheRef.current.push(savedChunk);
          // lastLoadedChunkIndex.current = currentChunkIndexRef.current - 1;
          
          console.log(`[ChunkSave] Chunk saved to MMKV only (no memory cache)`);
          
          // 新しいチャンクを開始
          currentChunkRef.current = [];
          
          console.log(`[ChunkSave] Saved chunk ${currentChunkIndexRef.current - 1}, starting new chunk ${currentChunkIndexRef.current}`);
          // console.log(`[Cache] Added to cache, now has ${savedChunksCacheRef.current.length} chunks`);
          logChunkStats(
            currentChunkIndexRef.current,
            0,
            trackMetadataRef.current.totalChunks,
            trackMetadataRef.current.totalPoints
          );
          logMemoryUsage('After chunk save');
        }
        
        // 5. 現在位置を更新（常に更新）
        updateGpsPosition.current(pos);
        
        // 6. UIを更新（setTimeoutでバッチング - より安全）
        const now = Date.now();
        const timeSinceLastUpdate = now - lastUIUpdateRef.current;
        
        // 最小更新間隔（200ms）を設定して、Maximum update depth exceededを防ぐ
        const MIN_UPDATE_INTERVAL = 200; // 200ms = 秒間5回まで（最も安全）
        
        if (timeSinceLastUpdate >= MIN_UPDATE_INTERVAL && !pendingUIUpdateRef.current) {
          lastUIUpdateRef.current = now;
          pendingUIUpdateRef.current = true;
          
          // setTimeoutを使用して次のイベントループで実行
          setTimeout(() => {
            // フラグを先にリセット（重要）
            pendingUIUpdateRef.current = false;
            
            // トラックログを更新（リアルタイム表示）
            setTrackLog({
              track: [...displayBufferRef.current], // 互換性のため残す
              distance: 0,
              lastTimeStamp: pos.timestamp,
              // チャンク情報のみ提供（データは含まない）
              savedChunks: [], // 空配列（メモリ節約）
              currentChunk: [...currentChunkRef.current],
              savedChunkCount: currentChunkIndexRef.current // 保存済みチャンク数
            });
            
            // ログ出力
            logObjectSize('displayBuffer', displayBufferRef.current);
            logObjectSize('currentChunk', currentChunkRef.current);
            logMemoryUsage('After UI update');
          }, 0);
        }
        
        // 7. プログレス表示
        const progress = mockGpsRef.current ? mockGpsRef.current.getProgress() : null;
        if (progress && progress.current % 100 === 0) {
          console.log(`[Progress] ${progress.current}/${progress.total} (${progress.percentage.toFixed(1)}%)`);
          console.log(`[Stats] Total points: ${trackMetadataRef.current.totalPoints}, Chunks: ${trackMetadataRef.current.totalChunks}`);
          console.log(`[Buffer] Current chunk: ${currentChunkRef.current.length}, Display: ${displayBufferRef.current.length}`);
          console.log(`[Info] savedChunksCache disabled, using only displayBuffer`);
          logMemoryUsage(`Progress ${progress.percentage.toFixed(0)}%`);
        }
      });
      
      console.log('Started mock GPS tracking with chunk system');
    } else {
      // 実際のGPSでトラッキング
      if (!(await Location.hasStartedLocationUpdatesAsync(TASK.FETCH_LOCATION))) {
        await Location.startLocationUpdatesAsync(TASK.FETCH_LOCATION, {
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
      headingSubscriber.current = await Location.watchHeadingAsync((pos) => {
        setAzimuth(pos.trueHeading);
      });
    }
  }, [gpsAccuracyOption, useMockGps]);

  const moveCurrentPosition = useCallback(async () => {
    //console.log('moveCurrentPosition');
    // console.log('moveCurrentPosition2');
    const location = useMockGps && mockGpsRef.current ? 
      mockGpsRef.current.getCurrentLocation() : 
      await Location.getLastKnownPositionAsync();
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
        updateGpsPosition.current = (pos: Location.LocationObject) => {
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
        updateGpsPosition.current = (pos: Location.LocationObject) => {
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
      const { status: foregroundStatus } = await Location.getForegroundPermissionsAsync();
      if (foregroundStatus !== 'granted') return;
      if (headingUp_) {
        if (headingSubscriber.current !== undefined) headingSubscriber.current.remove();

        let lastHeading = 0;
        let lastUpdateTime = 0;

        headingSubscriber.current = await Location.watchHeadingAsync((pos) => {
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
        headingSubscriber.current = await Location.watchHeadingAsync((pos) => {
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
    // トラッキング中の現在地更新とトラックログ更新
    const currentCoords = trackLogMMKV.getCurrentLocation();

    if (!currentCoords) return;

    if (gpsState === 'follow' || RNAppState.currentState === 'background') {
      (mapViewRef.current as MapView).animateCamera(
        {
          center: {
            latitude: currentCoords.latitude,
            longitude: currentCoords.longitude,
          },
        },
        { duration: 5 }
      );
    }
    setCurrentLocation(currentCoords);

    // トラックログも更新（描画のため）
    setTrackLog(getStoredLocations());
  }, [gpsState, mapViewRef]);

  // トラックログをトラック用のレコードに追加する
  const saveTrackLog = useCallback(async () => {
    // 最後のチャンクを保存
    if (currentChunkRef.current.length > 0) {
      saveTrackChunk(currentChunkIndexRef.current, currentChunkRef.current);
      saveTrackMetadata(trackMetadataRef.current);
    }
    
    // 全チャンクを結合
    const allPoints = getAllTrackPoints();
    
    if (!isLocationTypeArray(allPoints)) return { isOK: false, message: 'Invalid track log' };
    if (allPoints.length < 2) return { isOK: true, message: '' };
    
    const cleanupedLine = cleanupLine(allPoints);
    
    // レコードに追加
    const ret = addTrackRecord(cleanupedLine);
    if (!ret.isOK) {
      return { isOK: ret.isOK, message: ret.message };
    }
    
    // チャンクデータをクリア
    clearAllChunks();
    
    // リセット
    currentChunkRef.current = [];
    currentChunkIndexRef.current = 0;
    displayBufferRef.current = [];
    savedChunksCacheRef.current = [];
    lastLoadedChunkIndex.current = -1;
    trackMetadataRef.current = {
      totalChunks: 0,
      totalPoints: 0,
      lastChunkIndex: 0,
      lastTimeStamp: 0
    };
    
    // UIもクリア
    setTrackLog({ track: [], distance: 0, lastTimeStamp: 0 });
    
    console.log(`Saved track with ${allPoints.length} points`);
    
    return { isOK: true, message: '' };
  }, [addTrackRecord]);

  const checkUnsavedTrackLog = useCallback(async () => {
    // チャンクまたは表示バッファにデータがある場合
    const hasData = trackMetadataRef.current.totalPoints > 0 || currentChunkRef.current.length > 0 || trackLog.track.length > 1;
    
    if (hasData) {
      const ans = await ConfirmAsync(t('hooks.message.saveTracking'));
      if (ans) {
        const ret = await saveTrackLog();
        if (!ret.isOK) return ret;
      } else {
        // チャンクデータをクリア
        clearAllChunks();
        
        // リセット
        currentChunkRef.current = [];
        currentChunkIndexRef.current = 0;
        displayBufferRef.current = [];
        trackMetadataRef.current = {
          totalChunks: 0,
          totalPoints: 0,
          lastChunkIndex: 0,
          lastTimeStamp: 0
        };
        
        // stateも更新
        setTrackLog({ track: [], distance: 0, lastTimeStamp: 0 });
      }
    }
    return { isOK: true, message: '' };
  }, [saveTrackLog, trackLog.track.length]);

  // 擬似GPSモード切り替え関数を追加
  const toggleMockGps = useCallback(async (enabled: boolean, config?: MockGpsConfig) => {
    console.log(`toggleMockGps called: enabled=${enabled}`);
    
    // 現在のGPS/トラッキングを停止
    if (gpsState !== 'off') {
      console.log('Stopping GPS...');
      await toggleGPS('off');
    }
    if (trackingState === 'on') {
      console.log('Stopping tracking...');
      await toggleTracking('off');
    }

    // 既存のインスタンスを必ずクリーンアップ
    if (mockGpsRef.current) {
      console.log('Cleaning up existing mock GPS instance...');
      mockGpsRef.current.stop();
      mockGpsRef.current = null;
    }

    // 擬似GPSの設定を更新
    setUseMockGps(enabled);
    
    if (enabled && config) {
      // 新しい設定でMockGpsGeneratorを作成
      mockGpsRef.current = new MockGpsGenerator(config);
      console.log(`Mock GPS enabled with scenario: ${config.scenario}`);
    } else {
      console.log('Mock GPS disabled');
    }
  }, [gpsState, trackingState, toggleGPS, toggleTracking]);

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

      const hasStarted = await Location.hasStartedLocationUpdatesAsync(TASK.FETCH_LOCATION);
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
      Location.hasStartedLocationUpdatesAsync(TASK.FETCH_LOCATION).then((hasStarted) => {
        if (hasStarted) {
          Location.stopLocationUpdatesAsync(TASK.FETCH_LOCATION);
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

        if (trackingState === 'on') {
          if (gpsState === 'show' || gpsState === 'follow') {
            if (headingSubscriber.current === undefined && !useMockGps) {
              //console.log('add heading');
              headingSubscriber.current = await Location.watchHeadingAsync((pos) => {
                setAzimuth(pos.trueHeading);
              });
            }
          }
        }

        if (headingUp) toggleHeadingUp(true);
      } else if (appState.current === 'active' && nextAppState.match(/inactive|background/)) {
        //console.log('App has come to the background!');
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
  }, [gpsState, headingUp, toggleHeadingUp, trackingState, useMockGps]);

  return {
    currentLocation,
    gpsState,
    trackingState,
    headingUp,
    azimuth,
    trackLog,
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
