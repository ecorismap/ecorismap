import { useEffect, useMemo, useRef } from 'react';
import { useCallback, useState } from 'react';
import BackgroundGeolocation, {
  Location as BackgroundLocation,
  Subscription as BackgroundSubscription,
  State as BackgroundState,
  Config as BackgroundConfig,
  NotificationConfig,
} from '../lib/backgroundGeolocation';
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
  flushTrackLog,
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

// v5の型定義(@transistorsoft/background-geolocation-types)はnotificationをトップレベルに持たないが、
// ネイティブAPIは依然としてフラットなトップレベルnotificationを要求する（型とランタイムの不整合）。
// その差異を吸収するためのローカル型。
type FlatConfig = Partial<BackgroundConfig> & { notification: NotificationConfig };

// disableStopDetection等もv5の型ではgeolocation/activity配下にネストされているが、
// ネイティブAPIはフラットなトップレベルキーを要求する（notificationと同様の不整合）。
type FlatStopDetectionConfig = Partial<BackgroundConfig> & {
  disableStopDetection: boolean;
  pausesLocationUpdatesAutomatically: boolean;
};

// 静止しても記録が勝手に止まらないように静止検出を無効化する設定（常時記録方針）。
// iOSは自動電源オフを完全に防ぐためにdisableStopDetectionとpausesLocationUpdatesAutomatically:false
// の両方が必要（公式ドキュメント推奨の組み合わせ）。
const STOP_DETECTION_DISABLED: FlatStopDetectionConfig = {
  disableStopDetection: true,
  pausesLocationUpdatesAutomatically: false,
};

// 軌跡ライン（trailing polyline）の再描画を約1秒ごとにスロットルするための間隔
const TRACK_META_UPDATE_INTERVAL_MS = 1000;

// iOSのCLLocationManagerは位置サービス開始時にキャッシュ済みの古い位置を即配信する。
// transistorsoft/react-native-background-geolocation の getCurrentPosition はこれを
// maximumAge を無視して返す既知のiOS不具合（issue #113、iOSは未修正）があるため、
// ライブラリが各位置に付与する age(ms) でこの古いキャッシュ位置を検出して表示系から弾く。
const STALE_LOCATION_AGE_MS = 30000;

// 方位(azimuth)の state 更新を間引くための設定。
// 磁気センサーは毎秒数十回発火するため、そのまま setAzimuth すると Home 配下が高頻度再レンダリングして
// 方位表示が「ふらふら」する/もたつく。頻度と最小角度差で間引いて再描画を抑制する。
const AZIMUTH_THROTTLE_MS = 200; // 最大 5 回/秒
const AZIMUTH_MIN_DELTA_DEG = 1; // 1°未満の変化は無視（静止時のノイズで再描画しない）

// コンパスモード（headingUp）でのカメラ回転の間引き設定
const COMPASS_CAMERA_MIN_INTERVAL_MS = 100;
const COMPASS_CAMERA_MIN_DELTA_DEG = 2;

// 角度のラップ（0/360のまたぎ）を考慮した絶対差（0..180）
export const angularDeltaDeg = (a: number, b: number): number => Math.abs(((b - a + 540) % 360) - 180);

/**
 * 方位の state を更新すべきか判定する純粋関数。
 * - 直前更新から throttleMs 未満ならスキップ（頻度制限）
 * - 直前値との角度差（0-360のラップを考慮）が minDeltaDeg 未満ならスキップ
 * - 初回（prevDeg が null）は常に更新
 */
export const shouldEmitAzimuth = (
  prevDeg: number | null,
  nextDeg: number,
  msSinceLast: number,
  throttleMs: number,
  minDeltaDeg: number
): boolean => {
  if (msSinceLast < throttleMs) return false;
  if (prevDeg === null) return true;
  return angularDeltaDeg(prevDeg, nextDeg) >= minDeltaDeg;
};

/**
 * コンパスモードでカメラを回転すべきか判定する純粋関数。
 * - 初回（prevDeg が null）は常に回転（カメラが任意の向きで止まっている可能性があるため）
 * - 直前回転から minIntervalMs 未満ならスキップ
 * - 直前値との角度差（0-360のラップを考慮）が minDeltaDeg 未満ならスキップ
 */
export const shouldRotateCompassCamera = (
  prevDeg: number | null,
  nextDeg: number,
  msSinceLast: number,
  minIntervalMs: number,
  minDeltaDeg: number
): boolean => {
  if (prevDeg === null) return true;
  if (msSinceLast < minIntervalMs) return false;
  return angularDeltaDeg(prevDeg, nextDeg) >= minDeltaDeg;
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
  // 方位スロットル用（最後に反映した角度と時刻）
  const lastAzimuthRef = useRef<number | null>(null);
  const lastAzimuthTsRef = useRef(0);
  // heading購読の競合による二重購読を防ぐためのフラグ
  const headingSubscribingRef = useRef(false);
  const bgReadyRef = useRef(false);
  const initializedRef = useRef(false);
  const trackingStateRef = useRef<TrackingStateType>('off');
  const gpsStateRef = useRef<LocationStateType>('off');
  const locationSubscription = useRef<BackgroundSubscription | null>(null);
  const gpsAccuracy = useSelector((state: RootState) => state.settings.gpsAccuracy);
  const appState = useRef(RNAppState.currentState);
  // トラックメタデータ(=軌跡ライン再描画)の更新を約1秒にスロットルする。
  // 現在地マーカーは setCurrentLocation で毎点更新するため滑らかさは維持される。
  const lastTrackMetaUpdateRef = useRef(0);
  // チャンクのrollover（savedChunkCount変化）時はスロットルを無視して即時反映する。
  const lastSavedChunkIndexRef = useRef(0);
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
        return { desiredAccuracy: BackgroundGeolocation.DesiredAccuracy.High, distanceFilter: 2 };
      case 'MEDIUM':
        return { desiredAccuracy: BackgroundGeolocation.DesiredAccuracy.Medium, distanceFilter: 10 };
      case 'LOW':
        return { desiredAccuracy: BackgroundGeolocation.DesiredAccuracy.Low, distanceFilter: 50 };
      default:
        return { desiredAccuracy: BackgroundGeolocation.DesiredAccuracy.High, distanceFilter: 2 };
    }
  }, [gpsAccuracy]);

  // 方位を間引いて反映する（頻度制限＋最小角度差）。全てのheadingコールバックはこれを使う。
  const pushAzimuth = useCallback((heading: number) => {
    const now = Date.now();
    if (!shouldEmitAzimuth(lastAzimuthRef.current, heading, now - lastAzimuthTsRef.current, AZIMUTH_THROTTLE_MS, AZIMUTH_MIN_DELTA_DEG)) {
      return;
    }
    lastAzimuthRef.current = heading;
    lastAzimuthTsRef.current = now;
    setAzimuth(heading);
  }, []);

  // 通常（コンパスOFF）用のheading購読を保証する。既に購読中/購読処理中なら何もしない（多重購読防止）。
  const ensureHeadingSubscription = useCallback(async () => {
    if (headingSubscriber.current !== null || headingSubscribingRef.current) return;
    headingSubscribingRef.current = true;
    try {
      headingSubscriber.current = await watchHeadingAsync((pos) => {
        pushAzimuth(pos.trueHeading);
      });
    } catch (error) {
      console.error('Failed to start heading subscriber:', error);
    } finally {
      headingSubscribingRef.current = false;
    }
  }, [pushAzimuth]);

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
        authStatus === BackgroundGeolocation.AuthorizationStatus.Always ||
        authStatus === BackgroundGeolocation.AuthorizationStatus.WhenInUse
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

        // iOSが開始直後に流す古いキャッシュ位置（age が大きい）は、現在地マーカー/カメラ/接近通知に
        // 使うと誤った場所へ飛ぶため弾く。軌跡保存（checkAndStoreLocations）は独自のフィルタ
        // （timestamp単調性・accuracy≤100m）に任せるため、ここでは表示系のみ抑止する。
        const isStaleLocation = typeof location.age === 'number' && location.age > STALE_LOCATION_AGE_MS;

        // バックグラウンド中は画面が見えないため、React state更新とカメラ移動をスキップして
        // CPU/ブリッジ消費を抑える（MMKVへの保存と接近通知は継続。
        // 表示はフォアグラウンド復帰時にsyncLocationFromMMKVで復元される）。
        // 'inactive'（iOSのApp Switcher等、画面がまだ見える状態）はUI更新を継続する。
        const isInBackground = RNAppState.currentState === 'background';

        // トラッキング中のみ軌跡を保存
        if (isTracking) {
          // checkAndStoreLocationsが更新後のmetadata/現在チャンクを返すため、ここでの再読み込みは不要
          const result = checkAndStoreLocations([normalized]);

          if (result && !isInBackground) {
            // 軌跡ラインの再描画は約1秒にスロットル（rollover=savedChunkCount変化時は即時反映）。
            const now = Date.now();
            const chunkChanged = result.metadata.lastChunkIndex !== lastSavedChunkIndexRef.current;
            if (chunkChanged || now - lastTrackMetaUpdateRef.current >= TRACK_META_UPDATE_INTERVAL_MS) {
              lastTrackMetaUpdateRef.current = now;
              lastSavedChunkIndexRef.current = result.metadata.lastChunkIndex;
              setTrackMetadata({
                distance: result.metadata.currentDistance,
                lastTimeStamp: result.metadata.lastTimeStamp,
                savedChunkCount: result.metadata.lastChunkIndex,
                currentChunkSize: result.chunk.length,
                totalPoints: result.metadata.totalPoints,
                currentLocation: latest,
              });
            }
          }
        }

        // 古いキャッシュ位置（isStaleLocation）は現在地表示・カメラ・接近通知には使わない。
        if (!isStaleLocation) {
          // GPSオンまたはトラッキング中は現在地をMMKVに保存（フォアグラウンド復帰時の同期用）
          trackLogMMKV.setCurrentLocation(latest);

          if (!isInBackground) {
            // 現在地を更新
            setCurrentLocation(latest);

            // カメラ移動（followモード時）
            if (gpsStateRef.current === 'follow') {
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
          }

          // 接近通知チェック（GPSオンまたはトラッキング中。バックグラウンドでも継続）
          checkProximityRef.current(latest);
        }
      } catch (error) {
        console.error('[tracking] Failed to persist location', error);
      }
    },
    [mapViewRef]
  );

  const ensureBackgroundGeolocation = useCallback(async () => {
    // アプリプロセス再生成時に残るリスナーを初回だけクリアして重複通知を防ぐ
    if (!bgReadyRef.current) {
      try {
        await BackgroundGeolocation.removeListeners();
      } catch (error) {
        console.warn('[tracking] Failed to remove existing background listeners', error);
      }
    }

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
      ...STOP_DETECTION_DISABLED,
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

    // reset:falseの場合（kill後復帰などサービス稼働中）はready()で設定が適用されないため、
    // 稼働中のサービスにも静止検出の無効化を明示的に反映する。
    if (isServiceRunning) {
      await BackgroundGeolocation.setConfig(STOP_DETECTION_DISABLED);
    }

    if (!locationSubscription.current) {
      locationSubscription.current = BackgroundGeolocation.onLocation(
        (location) => handleBackgroundLocation(location),
        (error) => {
          // 499(Location request cancelled)と408(timeout)は一時的・非致命的。
          // changePace直後のgetCurrentPositionで継続リクエストが横取りされた際などに発生するため無視する。
          if (error === 499 || error === 408) return;
          console.error('[tracking] location error', error);
        }
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
          const gpsNotificationConfig: FlatConfig = {
            notification: {
              sticky: true,
              title: 'EcorisMap',
              text: t('hooks.notification.gpsOn'),
              channelName: 'EcorisMap Tracking',
              color: '#0F5FBA',
              smallIcon: 'drawable/ic_notification',
              largeIcon: 'mipmap/ic_launcher',
            },
          };
          await BackgroundGeolocation.setConfig(gpsNotificationConfig);
          await BackgroundGeolocation.start();
          // 移動モードにして位置更新を継続させる
          await BackgroundGeolocation.changePace(true);
        }
      }

      await ensureHeadingSubscription();
    },
    [ensureBackgroundGeolocation, ensureHeadingSubscription]
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
      // メモリ内の未書き込みポイントをMMKVへ確定（停止後にsaveTrackLog/破棄で正しく読めるように）
      flushTrackLog();
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
      // heading購読を解除（stopGPSと対称。磁気センサーの購読が残るのを防ぐ）
      if (headingSubscriber.current !== null) {
        headingSubscriber.current.remove();
        headingSubscriber.current = null;
      }
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
      const trackingNotificationConfig: FlatConfig = {
        notification: {
          sticky: true,
          title: 'EcorisMap',
          text: t('hooks.notification.inTracking'),
          channelName: 'EcorisMap Tracking',
          color: '#0F5FBA',
          smallIcon: 'drawable/ic_notification',
          largeIcon: 'mipmap/ic_launcher',
        },
      };
      await BackgroundGeolocation.setConfig(trackingNotificationConfig);

      const state: BackgroundState = await BackgroundGeolocation.getState();
      if (!state.enabled) {
        await BackgroundGeolocation.start();
      }

      // 強制的に移動モードにして位置更新を継続させる
      // BackgroundGeolocationはデフォルトで静止モード(isMoving:false)で開始されるため必須
      await BackgroundGeolocation.changePace(true);

      // トラッキング状態をMMKVに保存（kill後の復帰で正しく復元するため）
      trackLogMMKV.setTrackingState('on');

      await ensureHeadingSubscription();
    } catch (error) {
      console.error('Error in startTracking:', error);
      throw error;
    }
  }, [ensureBackgroundGeolocation, ensureHeadingSubscription]);

  const moveCurrentPosition = useCallback(async () => {
    try {
      const location = await BackgroundGeolocation.getCurrentPosition({
        persist: false,
        samples: 3, // 複数fixを集めて最良を返す（ライブラリ既定）。samples:1だとiOSは最初のキャッシュを返す。
        maximumAge: 0, // キャッシュ位置を採用しない（best-effort。iOSでは無視され得るため下のageで再判定）。
        desiredAccuracy: gpsAccuracyOption.desiredAccuracy,
        timeout: 30,
      } as any);

      // iOSは maximumAge を無視して古いキャッシュ位置を返すことがある（issue #113）。
      // 戻り値の age を見て、古ければ採用せず直近の新鮮な現在地（MMKV）にフォールバックする。
      let coords: LocationType | undefined;
      const isFresh = !!location && !(typeof location.age === 'number' && location.age > STALE_LOCATION_AGE_MS);
      if (location && isFresh) {
        coords = location.coords as LocationType;
      } else {
        const latestCached = trackLogMMKV.getCurrentLocation();
        if (
          latestCached &&
          typeof latestCached.timestamp === 'number' &&
          Date.now() - latestCached.timestamp <= STALE_LOCATION_AGE_MS
        ) {
          coords = latestCached;
        }
      }
      // 新鮮な現在地が得られなければカメラを動かさない（誤った場所へ飛ぶより安全。
      // startGPS内のchangePace(true)で間もなく新鮮なonLocationが来てfollowで追従する）。
      if (!coords) return;

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
          // stopTrackingはGPSも停止する（UIフローでは続けてtoggleGPS('off')が呼ばれ状態が整合する）
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

        if (headingSubscriber.current !== null) {
          headingSubscriber.current.remove();
          headingSubscriber.current = null;
        }

        let lastHeading: number | null = null;
        let lastUpdateTime = 0;

        headingSubscriber.current = await watchHeadingAsync((pos) => {
          // iOSでtrue headingが取得できない場合は-1が返る（不正値は無視）
          if (pos.trueHeading < 0) return;
          const newHeading = pos.trueHeading % 360;
          const currentTime = Date.now();

          // 角度の変化が小さい/間隔が短い場合はカメラ回転をスキップ（方位stateは更新）
          if (
            !shouldRotateCompassCamera(
              lastHeading,
              newHeading,
              currentTime - lastUpdateTime,
              COMPASS_CAMERA_MIN_INTERVAL_MS,
              COMPASS_CAMERA_MIN_DELTA_DEG
            )
          ) {
            pushAzimuth(pos.trueHeading);
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

          pushAzimuth(pos.trueHeading);
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

        // GPS/トラッキング中はマーカーの向き表示にazimuthが必要なため、通常のheading購読を復元する
        if (gpsStateRef.current !== 'off' || trackingStateRef.current === 'on') {
          await ensureHeadingSubscription();
        }
      }
      setHeadingUp(headingUp_);
    },
    [confirmLocationPermission, ensureHeadingSubscription, mapViewRef, pushAzimuth]
  );

  // フォアグラウンド復帰時にMMKVからデータを同期する関数
  const syncLocationFromMMKV = useCallback(() => {
    const latestCoords = trackLogMMKV.getCurrentLocation();
    if (!latestCoords) return;

    // トラッキング中の場合、メタデータを更新
    if (trackingStateRef.current === 'on') {
      const chunkInfo = getCurrentChunkInfo();
      const metadata = getTrackMetadata();
      // スロットル用refも同期（バックグラウンド中にrolloverしていた場合の余分な即時更新を防ぐ）
      lastSavedChunkIndexRef.current = chunkInfo.currentChunkIndex;
      lastTrackMetaUpdateRef.current = Date.now();
      setTrackMetadata({
        distance: metadata.currentDistance,
        lastTimeStamp: metadata.lastTimeStamp,
        savedChunkCount: chunkInfo.currentChunkIndex,
        currentChunkSize: chunkInfo.currentChunkSize,
        totalPoints: metadata.totalPoints,
        currentLocation: latestCoords,
      });
    }

    // カメラ移動（followモード時、またはトラッキング中。
    // バックグラウンド中はカメラ追従を止めているため、復帰時に1回だけ現在地へセンタリングしてUXを維持する）
    if (gpsStateRef.current === 'follow' || trackingStateRef.current === 'on') {
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
      setSavingTrackStatus({ isSaving: true, phase: 'merging', message: t('hooks.progress.mergingTrackLog') });

      // 全チャンクを結合（重い処理の可能性）
      const allPoints = await new Promise<ReturnType<typeof getAllTrackPoints>>((resolve) => {
        setTimeout(() => {
          const points = getAllTrackPoints();
          resolve(points);
        }, 0);
      });

      setSavingTrackStatus({ isSaving: true, phase: 'filtering', message: t('hooks.progress.validatingTrackLog') });

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
        warningMessage = t('hooks.message.excludedInvalidLocation', { invalidCount });
      }

      if (validPoints.length < 2) {
        return { isOK: true, message: warningMessage || t('hooks.message.insufficientTrackLog') };
      }

      setSavingTrackStatus({ isSaving: true, phase: 'saving', message: t('hooks.progress.savingTrackLog') });

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

        // 現在地もクリア（表示更新のトリガー）
        setCurrentLocation(null);
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
            const trackMetadataFromMMKV = getTrackMetadata();
            setTrackMetadata({
              distance: trackMetadataFromMMKV.currentDistance,
              lastTimeStamp: trackMetadataFromMMKV.lastTimeStamp,
              savedChunkCount: chunkInfo.currentChunkIndex,
              currentChunkSize: chunkInfo.currentChunkSize,
              totalPoints: trackMetadataFromMMKV.totalPoints,
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
                await ensureHeadingSubscription();
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
          const { isOK, message } = await checkUnsavedTrackLog();
          if (!isOK) {
            await AlertAsync(message);
          }
        }
      } else {
        const { isOK, message } = await checkUnsavedTrackLog();
        if (!isOK) {
          await AlertAsync(message);
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
                await ensureHeadingSubscription();
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
    // 初期化はマウント時に1回だけ実行する（本体はinitializedRefで多重実行を防いでいる）。
    // 依存配列に状態やコールバックを含めると、依存変化時の再実行でクリーンアップが
    // heading/onLocation購読を破棄し（本体は早期returnするため）再購読されず、
    // 追跡中に位置・方位の更新が止まる不具合の原因になる。クリーンアップはアンマウント時のみ実行する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
              await ensureHeadingSubscription();
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

        // メモリ内の未書き込みポイントをMMKVへ確定（この後アプリがkillされてもheadlessが続きから記録できるように）
        flushTrackLog();

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
    ensureHeadingSubscription,
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
