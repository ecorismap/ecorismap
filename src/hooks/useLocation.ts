import { useEffect, useMemo, useRef } from 'react';
import { useCallback, useState } from 'react';
import BackgroundGeolocation, {
  Location as BackgroundLocation,
  Subscription as BackgroundSubscription,
  Config as BackgroundConfig,
  NotificationConfig,
} from '../lib/backgroundGeolocation';
import { watchHeadingAsync, getForegroundPermissionsAsync, LocationSubscription } from 'expo-location';
import MapView from 'react-native-maps';
import { MapRef } from 'react-map-gl/maplibre';
import {
  GnssMetaType,
  LayerType,
  LocationStateType,
  LocationType,
  RecordType,
  TrackingStateType,
  TrackMetadataType,
} from '../types';
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
  flushPendingTrackLog,
  LocationObjectInput,
} from '../utils/Location';
import {
  getActiveExternalFix,
  getExternalGnssSnapshot,
  isExternalFixActive,
  subscribeExternalFix,
} from '../lib/gnss/externalGnssStore';
import { gnssFixToLocation, isUsableFix } from '../lib/gnss/toLocation';
import {
  DEFAULT_GNSS_TRACK_DISTANCE,
  DEFAULT_GNSS_TRACK_MODE,
  shouldRecordGnssTrackPoint,
} from '../lib/gnss/trackThinning';
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
import { STALE_LOCATION_AGE_MS, TRACK_ACCURACY } from '../constants/AppConstants';
import {
  formatTrackTime,
  initialTrackDiscardWatchState,
  isSampleLocation,
  observeTrackAccuracy,
  TrackDiscardWatchState,
} from '../utils/trackRecordingNotice';

const openSettings = () => {
  Linking.openSettings().catch(() => {
    // 設定ページを開けなかった場合
  });
};

// v5の型定義(@transistorsoft/background-geolocation-types)はnotificationをトップレベルに持たないが、
// ネイティブAPIは依然としてフラットなトップレベルnotificationを要求する（型とランタイムの不整合）。
// その差異を吸収するためのローカル型。
type FlatConfig = Partial<BackgroundConfig> & { notification: NotificationConfig };

// 稼働中のサービスへ反映する設定（通知テキスト＋位置精度）。精度もv5の型ではgeolocation配下だが、
// ネイティブはフラットなトップレベルキーを読む（上と同じ不整合）。
type FlatServiceConfig = FlatConfig & { desiredAccuracy: number; distanceFilter: number };

type AuthorizationStatusValue = Awaited<ReturnType<typeof BackgroundGeolocation.requestPermission>>;

// iOSの一時的な正確な位置（requestTemporaryFullAccuracy）の目的キー。
// Info.plistのNSLocationTemporaryUsageDescriptionDictionaryに同じキーで説明文を置く（ないとiOSが要求を拒否する）
export const TEMPORARY_FULL_ACCURACY_PURPOSE_KEY = 'TrackRecording';

/** 精度の許可を確かめる操作の種類（案内の文言を分ける） */
export type LocationAccuracyPurpose = 'gps' | 'tracking';

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

// foreground service通知の設定を生成（textのみ可変。title/channel/色/アイコンは共通）。
// 「トラックの記録中」テキストはトラッキング開始時に明示的にsetConfigする場合のみ使い、
// 既定（ready）はGPS用テキストにする。既定をトラッキング用にすると、設定なしのstart()や
// プラグイン停止中のgetCurrentPosition（Androidは一時的にFGSを起動）で
// GPSのみONなのに「記録中」通知が表示されてしまう。
const makeNotification = (text: string): NotificationConfig => ({
  sticky: true,
  title: 'EcorisMap',
  text,
  channelName: 'EcorisMap Tracking',
  color: '#0F5FBA',
  smallIcon: 'drawable/ic_notification',
  largeIcon: 'mipmap/ic_launcher',
});

// 軌跡ライン（trailing polyline）の再描画を約1秒ごとにスロットルするための間隔
const TRACK_META_UPDATE_INTERVAL_MS = 1000;

// 外部GNSS受信機の位置を表示・軌跡へ反映する最短間隔（1Hz出力の揺らぎを見込んで1秒より少し短く）
const EXTERNAL_FIX_APPLY_INTERVAL_MS = 900;

// サービス遷移キュー内の1操作に許す最大時間。changePace(true)は内部の位置ワンショットが
// locationTimeout（既定60秒）まで待ち得るため、それより長く取る。ネイティブ側のPromiseが
// 返ってこない場合にキューが永久に詰まり、以後のGPS/軌跡トグルが一切効かなくなる
// （アプリをキルするまで復旧しない）のを防ぐための安全弁。
export const SERVICE_OP_TIMEOUT_MS = 90_000;

// changePace(true)が一時的エラーで失敗したあと、静止のままか確認してやり直すまでの待ち時間。
// サービス起動直後は位置リクエストが競合しやすいため少し間を置く（ヘッドレスタスクと同じ値）。
export const CHANGE_PACE_RETRY_DELAY_MS = 3000;

// 499(Location request cancelled)/408(timeout)は一時的・非致命的な位置エラー。
// ブリッジ経由ではErrorのmessageにコードが入った形で届くため文字列で判定する。
const isTransientLocationError = (error: unknown): boolean => {
  const code = error instanceof Error ? error.message : String(error);
  return code === '499' || code === '408';
};

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Promiseにタイムアウトを付ける。元のPromiseは打ち切れないが、呼び出し側（キュー）の待ちを解放する。
const withTimeout = <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`[gps] ${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });

// 移動モードへ切り替える。changePace(true)はネイティブで位置ワンショット（motionchange）を伴うため、
// GPS未捕捉（圏外・捕捉前）ではlocationTimeout後に408、start()直後は競合で499として「拒否」される。
// 切替自体は適用されていることが多いので、拒否を致命扱いにせず、状態を確認して静止のままなら
// 1回だけやり直す。それでも失敗した場合も例外にはしない（サービスは稼働しており、位置が届けば
// 記録は続くため）。以前はここで例外になるとstartTrackingが途中で抜け、MMKVのトラッキング状態が
// 'on'にならず、GPS復帰後に届いた位置がすべて破棄される不具合があった。
const ensureMovingState = async (): Promise<void> => {
  try {
    await BackgroundGeolocation.changePace(true);
    return;
  } catch (error) {
    if (!isTransientLocationError(error)) {
      console.warn('[gps] changePace(true) failed', error);
      return;
    }
  }
  try {
    await delay(CHANGE_PACE_RETRY_DELAY_MS);
    const state = await BackgroundGeolocation.getState();
    if (!state.enabled || state.isMoving) return;
    await BackgroundGeolocation.changePace(true);
  } catch (error) {
    console.warn('[gps] changePace(true) retry failed', error);
  }
};

// iOSのCLLocationManagerは位置サービス開始時にキャッシュ済みの古い位置を即配信する。
// transistorsoft/react-native-background-geolocation の getCurrentPosition はこれを
// maximumAge を無視して返す既知のiOS不具合（issue #113、iOSは未修正）があるため、
// ライブラリが各位置に付与する age(ms) でこの古いキャッシュ位置を検出してstale扱いにする。
// 閾値は軌跡記録開始直後のstale除外フィルタ（utils/Location.ts）と共有（AppConstants参照）。

// 方位(azimuth)の state 更新を間引くための設定。
// 磁気センサーは毎秒数十回発火するため、そのまま setAzimuth すると Home 配下が高頻度再レンダリングして
// 方位表示が「ふらふら」する/もたつく。頻度と最小角度差で間引いて再描画を抑制する。
// ただしheadingUp（コンパスモード）中は、この間引きを使わずカメラ回転コマンドと同期した
// 強制更新（setAzimuthImmediate）に一本化する。カメラと方角線・コンパスアイコンが別々の
// 間引きを通ると角度がズレて「真上固定のはずの方角線が揺れる」ため。
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
  // currentLocationが「最後に取得済みのキャッシュ位置（古い）」であることを示す。
  // GPS ON直後の衛星捕捉中に灰色マーカー表示に使い、新鮮な位置の受信で解除される。
  isLocationStale: boolean;
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
  /** resetHeading=falseなら解除時に北へ戻さない（3Dの眺望で、向いている方角のまま止める） */
  toggleHeadingUp: (headingUp_: boolean, resetHeading?: boolean) => Promise<void>;
  toggleGPS: (gpsState: LocationStateType) => Promise<void>;
  toggleTracking: (trackingState: TrackingStateType) => Promise<void>;
  /** interrupted: iOSで記録中にアプリが終了されたあとの確認（最後の点の時刻を示す。軌跡監査 T-M4） */
  checkUnsavedTrackLog: (options?: { interrupted?: boolean }) => Promise<{ isOK: boolean; message: string }>;
  saveTrackLog: () => Promise<{
    isOK: boolean;
    message: string;
    layer?: LayerType;
    record?: RecordType;
  }>;
  confirmLocationPermission: () => Promise<'granted' | undefined>;
  /**
   * 位置の精度の許可を確かめる（軌跡監査 T-M5）。「おおよその位置」なら iOS は一時的な正確な位置を求め、
   * それでも正確でなければ設定を開くか尋ねる。false は設定を開いた（呼び出し側は開始をやめる）
   */
  confirmLocationAccuracy: (purpose: LocationAccuracyPurpose) => Promise<boolean>;
  // Web専用: maplibre GeolocateControl（地図の現在地ボタン）のイベントからアプリのGPS状態を同期する
  updateLocationFromWebGeolocate: (coords: LocationType) => void;
  endWebGeolocate: () => void;
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
  // 軌跡に最後に保存した点（外部GNSS受信機の位置の間引きの基準）。記録していない間はnull
  const lastTrackPointRef = useRef<LocationType | null>(null);
  const gnssTrackMode = useSelector((state: RootState) => state.settings.externalGnss?.trackMode);
  const gnssTrackDistance = useSelector((state: RootState) => state.settings.externalGnss?.trackDistance);
  const gnssTrackThinningRef = useRef({ mode: DEFAULT_GNSS_TRACK_MODE, distance: DEFAULT_GNSS_TRACK_DISTANCE });
  gnssTrackThinningRef.current = {
    mode: gnssTrackMode ?? DEFAULT_GNSS_TRACK_MODE,
    distance: gnssTrackDistance ?? DEFAULT_GNSS_TRACK_DISTANCE,
  };
  const gpsStateRef = useRef<LocationStateType>('off');
  const locationSubscription = useRef<BackgroundSubscription | null>(null);
  const providerSubscription = useRef<BackgroundSubscription | null>(null);
  // 記録中に精度で捨てられる点が続いているか（軌跡監査 T-M5）。知らせをバックグラウンドで出せないときは前面復帰で出す
  const trackDiscardWatchRef = useRef<TrackDiscardWatchState>(initialTrackDiscardWatchState);
  const pendingDiscardNoticeRef = useRef(false);
  // 精度の許可の確認（ダイアログ）を重ねないための実行中のPromise。許可の変更をバックグラウンドで受けたら前面復帰で確かめる
  const accuracyCheckRef = useRef<Promise<boolean> | null>(null);
  const pendingAccuracyCheckRef = useRef(false);
  const lastAccuracyAuthorizationRef = useRef<number | null>(null);
  const gpsAccuracy = useSelector((state: RootState) => state.settings.gpsAccuracy);
  const appState = useRef(RNAppState.currentState);
  // トラックメタデータ(=軌跡ライン再描画)の更新を約1秒にスロットルする。
  // 現在地マーカーは setCurrentLocation で毎点更新するため滑らかさは維持される。
  const lastTrackMetaUpdateRef = useRef(0);
  // チャンクのrollover（savedChunkCount変化）時はスロットルを無視して即時反映する。
  const lastSavedChunkIndexRef = useRef(0);
  const [currentLocation, setCurrentLocation] = useState<LocationType | null>(null);
  // 表示中のcurrentLocationがキャッシュ由来の古い位置かどうか（灰色マーカー表示用）
  const [isLocationStale, setIsLocationStale] = useState(false);
  const isLocationStaleRef = useRef(false);
  // GPS/トラッキングON以降にfresh位置を1回でも表示したか。
  // getCurrentPosition（最大30秒）が遅れて解決した際に、onLocationで表示済みの
  // fresh位置を古いキャッシュで巻き戻さないためのガード。
  const hasFreshFixRef = useRef(false);
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
  // サービス遷移キューの中では、キューに積んだ時点ではなく実行時点の最新の精度設定を使う
  const gpsAccuracyOptionRef = useRef(gpsAccuracyOption);
  gpsAccuracyOptionRef.current = gpsAccuracyOption;

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

  // 間引きをバイパスして方位を即時反映する（headingUp中のカメラ回転と同期させる用）。
  // スロットル用refも同時に更新しないと、north-upへ戻った直後のpushAzimuthが
  // 古いprev値と比較して誤判定するため、必ず両refを同期する。
  const setAzimuthImmediate = useCallback((heading: number) => {
    lastAzimuthRef.current = heading;
    lastAzimuthTsRef.current = Date.now();
    setAzimuth(heading);
  }, []);

  // 通常（コンパスOFF）用のheading購読を保証する。既に購読中/購読処理中なら何もしない（多重購読防止）。
  const ensureHeadingSubscription = useCallback(async () => {
    if (headingSubscriber.current !== null || headingSubscribingRef.current) return;
    headingSubscribingRef.current = true;
    try {
      headingSubscriber.current = await watchHeadingAsync((pos) => {
        // iOSは真北未取得時にtrueHeadingへ-1を返すため弾く（コンパスON時の購読と同じ対策）
        if (pos.trueHeading < 0) return;
        pushAzimuth(pos.trueHeading);
      });
    } catch (error) {
      console.error('Failed to start heading subscriber:', error);
    } finally {
      headingSubscribingRef.current = false;
    }
  }, [pushAzimuth]);

  // 方位盤（コンパスボタン）の常時回転用。権限プロンプトは出さず、
  // 未許可なら購読しない（方位盤は静止表示のままになる）。
  const ensureHeadingSubscriptionIfPermitted = useCallback(async () => {
    if (headingSubscriber.current !== null) return;
    try {
      const { granted } = await getForegroundPermissionsAsync();
      if (granted) await ensureHeadingSubscription();
    } catch {
      // 権限APIが使えない環境では静止表示にフォールバック
    }
  }, [ensureHeadingSubscription]);

  // checkProximityをrefで同期（onLocationコールバックがクロージャで古い参照を保持する問題を回避）
  useEffect(() => {
    checkProximityRef.current = checkProximity;
  }, [checkProximity]);

  // stale表示状態を更新する（値が変わらないときはsetStateを呼ばず再レンダリングを避ける）
  const setLocationStale = useCallback((stale: boolean) => {
    if (isLocationStaleRef.current === stale) return;
    isLocationStaleRef.current = stale;
    setIsLocationStale(stale);
  }, []);

  // Web専用: maplibre GeolocateControl（地図の現在地ボタン）のイベントからアプリのGPS状態を同期する。
  // Web版はBackgroundGeolocationが使えずGeolocateControlが唯一の位置取得手段のため、
  // ここで同期しないとgpsState/currentLocationが常にOFF扱いになり、
  // 位置トグル付き辞書追加や現在地ポイント追加が機能しない。
  const updateLocationFromWebGeolocate = useCallback(
    (coords: LocationType) => {
      if (Platform.OS !== 'web') return;
      setCurrentLocation(coords);
      setLocationStale(false);
      if (gpsStateRef.current === 'off') {
        setGpsState('show');
        gpsStateRef.current = 'show';
      }
    },
    [setLocationStale]
  );

  const endWebGeolocate = useCallback(() => {
    if (Platform.OS !== 'web') return;
    setGpsState('off');
    gpsStateRef.current = 'off';
    setCurrentLocation(null);
    setLocationStale(false);
  }, [setLocationStale]);

  // 前面復帰・起動時の「位置の許可がない」案内を出したか。許可が戻るまで繰り返し出さない
  // （設定画面から戻るのも前面復帰なので、毎回出して設定へ飛ばすと抜けられなくなる）
  const locationDeniedNoticeShownRef = useRef(false);

  // GPS・軌跡・コンパスの開始操作で呼ぶ。通知（Android）と位置の許可を確かめ、なければ案内して設定を開く
  const confirmLocationPermission = useCallback(async (): Promise<'granted' | undefined> => {
    try {
      if (Platform.OS === 'android') {
        const notificationPermission = await Notifications.getPermissionsAsync();
        if (notificationPermission.status !== 'granted') {
          if (notificationPermission.canAskAgain) {
            const { status: notificationStatus } = await Notifications.requestPermissionsAsync();
            if (notificationStatus !== 'granted') {
              await AlertAsync(t('hooks.message.permitNotificationForGPS'));
              openSettings();
              return;
            }
          } else {
            await AlertAsync(t('hooks.message.permitNotificationForGPS'));
            openSettings();
            return;
          }
        }
      }

      // 位置権限だけを要求する。引数なしだと5.6.0以降のiOSはモーション（Motion & Fitness）許可も
      // 続けて要求するが、本アプリはdisableMotionActivityUpdates:trueで使っておらず不要なダイアログになる。
      // 5.8.xは拒否をAuthorizationStatusの数値でrejectする（resolveしない）。数値のrejectは結果として判定し、
      // それ以外の例外だけを外側のcatchへ回す。
      let authStatus: AuthorizationStatusValue;
      try {
        authStatus = await BackgroundGeolocation.requestPermission('location');
      } catch (rejected: unknown) {
        if (typeof rejected !== 'number') throw rejected;
        authStatus = rejected as AuthorizationStatusValue;
      }
      if (
        authStatus === BackgroundGeolocation.AuthorizationStatus.Always ||
        authStatus === BackgroundGeolocation.AuthorizationStatus.WhenInUse
      ) {
        locationDeniedNoticeShownRef.current = false;
        return 'granted';
      }

      locationDeniedNoticeShownRef.current = true;
      await AlertAsync(t('hooks.message.permitAccessGPS'));
      openSettings();
      return;
    } catch (e: unknown) {
      console.error('confirmLocationPermission error', e);
    }
  }, []);

  // 起動時の復元・前面復帰でGPSや記録を使っているときのheading再購読。権限プロンプトと通知の確認はしない
  // （通知の確認と案内は開始操作のconfirmLocationPermissionだけで行う）。位置の許可がなければ、
  // 許可が戻るまでに一度だけ案内する。設定画面は開かない（戻るたびに飛ばされて抜けられなくなるため）
  const resubscribeHeadingForService = useCallback(async () => {
    if (headingSubscriber.current !== null) return;
    let granted = false;
    try {
      ({ granted } = await getForegroundPermissionsAsync());
    } catch (error) {
      console.warn('[tracking] Failed to read location permission', error);
      return;
    }
    if (granted) {
      locationDeniedNoticeShownRef.current = false;
      await ensureHeadingSubscription();
      return;
    }
    console.warn('[tracking] Heading subscription skipped: location permission not granted');
    if (locationDeniedNoticeShownRef.current) return;
    locationDeniedNoticeShownRef.current = true;
    await AlertAsync(t('hooks.message.permitAccessGPS'));
  }, [ensureHeadingSubscription]);

  // 位置の精度の許可（「おおよその位置」かどうか）を確かめる（軌跡監査 T-M5）。おおよその位置では精度が km 単位になり、
  // 軌跡の点が checkLocations の精度条件で1点も保存されない。iOS は一時的な正確な位置を求め（OSのダイアログ）、
  // それでも正確でなければ、Android ははじめから、設定を開くか尋ねる。確認の途中で重ねて呼ばれたら同じ結果を待つ
  const confirmLocationAccuracy = useCallback((purpose: LocationAccuracyPurpose): Promise<boolean> => {
    if (Platform.OS === 'web') return Promise.resolve(true);
    // ready() の前はプラグインの状態を読めない（初期化の途中に押されたときだけ。許可の変更は onProviderChange で拾う）
    if (!bgReadyRef.current) return Promise.resolve(true);
    if (accuracyCheckRef.current !== null) return accuracyCheckRef.current;
    const run = async (): Promise<boolean> => {
      try {
        const { Full, Reduced } = BackgroundGeolocation.AccuracyAuthorization;
        const provider = await BackgroundGeolocation.getProviderState();
        lastAccuracyAuthorizationRef.current = provider.accuracyAuthorization;
        if (provider.accuracyAuthorization !== Reduced) return true;
        if (Platform.OS === 'ios') {
          try {
            const granted = await BackgroundGeolocation.requestTemporaryFullAccuracy(TEMPORARY_FULL_ACCURACY_PURPOSE_KEY);
            lastAccuracyAuthorizationRef.current = granted;
            if (granted === Full) return true;
          } catch (error) {
            console.warn('[gps] requestTemporaryFullAccuracy failed', error);
          }
        }
        const key = Platform.OS === 'ios' ? 'reducedAccuracyIos' : 'reducedAccuracyAndroid';
        const openSettingsChosen = await ConfirmAsync(
          `${t(`hooks.message.${key}`)}\n${t(
            purpose === 'tracking' ? 'hooks.message.reducedAccuracyTracking' : 'hooks.message.reducedAccuracyGps'
          )}`,
          { true: t('hooks.message.openLocationSettings'), false: t('hooks.message.continueReducedAccuracy') }
        );
        if (openSettingsChosen) {
          openSettings();
          return false;
        }
        return true;
      } catch (error) {
        // 状態を読めないときは開始を妨げない（記録中の精度の見張りが代わりに知らせる）
        console.warn('[gps] failed to check location accuracy authorization', error);
        return true;
      }
    };
    const promise = run().finally(() => {
      accuracyCheckRef.current = null;
    });
    accuracyCheckRef.current = promise;
    return promise;
  }, []);

  // GPS ON・記録中に許可が「おおよその位置」へ変わった、または起動時の復元で GPS・記録を続けるときに確かめる。
  // 動いているものは止めない（設定を開いたかどうかの結果は使わない）
  const checkLocationAccuracyWhileRunning = useCallback(async () => {
    if (gpsStateRef.current === 'off' && trackingStateRef.current !== 'on') return;
    await confirmLocationAccuracy(trackingStateRef.current === 'on' ? 'tracking' : 'gps');
  }, [confirmLocationAccuracy]);

  // onProviderChange はプラグインの購読（ensureBackgroundGeolocation）で1回だけ登録するので、最新の処理を ref で呼ぶ
  const handleProviderChangeRef = useRef<(accuracyAuthorization: number) => void>(() => undefined);
  handleProviderChangeRef.current = (accuracyAuthorization: number) => {
    const previous = lastAccuracyAuthorizationRef.current;
    lastAccuracyAuthorizationRef.current = accuracyAuthorization;
    // GPSや位置サービスの入切でも届くので、「おおよその位置」へ変わったときだけ扱う
    if (accuracyAuthorization !== BackgroundGeolocation.AccuracyAuthorization.Reduced || previous === accuracyAuthorization) {
      return;
    }
    if (gpsStateRef.current === 'off' && trackingStateRef.current !== 'on') return;
    if (RNAppState.currentState !== 'active') {
      pendingAccuracyCheckRef.current = true;
      return;
    }
    checkLocationAccuracyWhileRunning().catch((error) => console.warn('[gps] accuracy check failed', error));
  };

  // 記録中に精度で捨てられる点が続いたら知らせる（軌跡監査 T-M5）。applyLocation は同期処理なので待たない
  const showTrackDiscardNotice = useCallback(() => {
    pendingDiscardNoticeRef.current = false;
    AlertAsync(t('hooks.message.trackPointsDiscardedByAccuracy')).catch(() => undefined);
  }, []);

  // 内蔵GPS・外部GNSS受信機の両方の位置がここに合流する。
  // gnssは外部受信機の位置のときだけ渡され、現在地（ポイント記録に使われる）にだけ載せる。軌跡には残さない。
  // isSample: プラグインの途中経過の位置（sample:true）。現在地の表示にだけ使い、軌跡には入れない（軌跡監査 T-L6）
  const applyLocation = useCallback(
    (normalized: LocationObjectInput, isStaleLocation: boolean, gnss?: GnssMetaType, isSample = false) => {
      const isTracking = trackingStateRef.current === 'on';
      const isGpsOn = gpsStateRef.current !== 'off';
      if (!isTracking) {
        lastTrackPointRef.current = null;
        trackDiscardWatchRef.current = initialTrackDiscardWatchState;
      }

      // トラッキング中でもGPSオンでもない場合は何もしない
      if (!isTracking && !isGpsOn) {
        return;
      }

      try {
        const latest: LocationType = { ...normalized.coords, timestamp: normalized.timestamp, ...(gnss && { gnss }) };

        // バックグラウンド中は画面が見えないため、React state更新とカメラ移動をスキップして
        // CPU/ブリッジ消費を抑える（MMKVへの保存と接近通知は継続。
        // 表示はフォアグラウンド復帰時にsyncLocationFromMMKVで復元される）。
        // 'inactive'（iOSのApp Switcher等、画面がまだ見える状態）はUI更新を継続する。
        const isInBackground = RNAppState.currentState === 'background';

        // トラッキング中のみ軌跡を保存。外部GNSS受信機の位置は設定に応じて間引く
        // （表示・現在地・接近通知は毎回更新するので、ポイント記録や平均化には影響しない）
        const thinning = gnssTrackThinningRef.current;
        const skipTrackPoint =
          gnss !== undefined &&
          !shouldRecordGnssTrackPoint(lastTrackPointRef.current, latest, thinning.mode, thinning.distance);
        if (isTracking && !isSample) {
          // 精度で捨てられる点が続いているかを見る（間引きの前に、届いたすべての点で数える）
          const watched = observeTrackAccuracy(
            trackDiscardWatchRef.current,
            normalized.coords.accuracy,
            normalized.timestamp,
            TRACK_ACCURACY.RECORD
          );
          trackDiscardWatchRef.current = watched.state;
          if (watched.notify) {
            if (isInBackground) {
              pendingDiscardNoticeRef.current = true;
            } else {
              showTrackDiscardNotice();
            }
          }
        }
        if (isTracking && !skipTrackPoint && !isSample) {
          // checkAndStoreLocationsが更新後のmetadata/現在チャンクを返すため、ここでの再読み込みは不要。
          // 外部GNSS受信機の点には測位品質（軌跡の色分け用）と楕円体高だけを付けて保存する
          const trackInput =
            gnss !== undefined
              ? {
                  ...normalized,
                  coords: {
                    ...normalized.coords,
                    fixQuality: gnss.fixQuality,
                    ...(typeof gnss.ellipsoidHeight === 'number' && { ellipsoidHeight: gnss.ellipsoidHeight }),
                  },
                }
              : normalized;
          const result = checkAndStoreLocations([trackInput]);
          if (result) lastTrackPointRef.current = result.chunk[result.chunk.length - 1] ?? null;

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
          // fresh位置を受信したのでstale表示（灰色マーカー）を解除する。
          // isInBackground分岐の外に置き、バックグラウンド中でもfresh受信の事実を記録して
          // 復帰時のsyncLocationFromMMKV表示がstale扱いにならないようにする。
          hasFreshFixRef.current = true;
          setLocationStale(false);

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
    [mapViewRef, setLocationStale, showTrackDiscardNotice]
  );

  const handleBackgroundLocation = useCallback(
    (location: BackgroundLocation) => {
      // 外部GNSS受信機が使える位置を出している間は内蔵GPSの位置を使わない（途絶したら自動で戻る）
      if (isExternalFixActive()) return;
      // iOSが開始直後に流す古いキャッシュ位置（age が大きい）は、現在地マーカー/カメラ/接近通知に
      // 使うと誤った場所へ飛ぶため弾く。軌跡保存（checkAndStoreLocations）は独自のフィルタ
      // （timestamp単調性・accuracy≤100m）に任せるため、ここでは表示系のみ抑止する。
      const isStaleLocation = typeof location.age === 'number' && location.age > STALE_LOCATION_AGE_MS;
      const normalized = toLocationObject(location);
      // 外部GNSS受信機の接続中に内蔵GPSへ戻った区間は、標高を残さない。
      // 内蔵GPSの標高はAndroidでは楕円体高（日本で海抜より30〜40m高い）で、受信機の測位標高と混ざると標高グラフが跳ねるため
      if (getExternalGnssSnapshot().status.link === 'connected') {
        normalized.coords = { ...normalized.coords, altitude: null, altitudeAccuracy: null };
      }
      applyLocation(normalized, isStaleLocation, undefined, isSampleLocation(location));
    },
    [applyLocation]
  );

  // 外部GNSS受信機の位置を合流させる。10Hz出力でも表示と軌跡は内蔵GPSと同じく約1秒ごとにする
  const antennaHeight = useSelector((state: RootState) => state.settings.externalGnss?.antennaHeight ?? 0);
  const antennaHeightRef = useRef(antennaHeight);
  antennaHeightRef.current = antennaHeight;
  useEffect(() => {
    let lastAppliedAt = 0;
    return subscribeExternalFix((fix) => {
      if (!isUsableFix(fix) || fix.receivedAt - lastAppliedAt < EXTERNAL_FIX_APPLY_INTERVAL_MS) return;
      lastAppliedAt = fix.receivedAt;
      const { timestamp, gnss, ...coords } = gnssFixToLocation(fix, antennaHeightRef.current);
      applyLocation({ coords, timestamp: timestamp ?? fix.receivedAt }, false, gnss);
    });
  }, [applyLocation]);

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
      // 既定はGPS用テキスト。トラッキング用テキストはstartTracking/init復帰で明示設定する。
      notification: makeNotification(t('hooks.notification.gpsOn')),
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

    // 位置の許可（精度を含む）の変更。GPS ON・記録中に「おおよその位置」へ変わったら知らせる（軌跡監査 T-M5）
    if (!providerSubscription.current) {
      try {
        providerSubscription.current = BackgroundGeolocation.onProviderChange((event) =>
          handleProviderChangeRef.current(event.accuracyAuthorization)
        );
      } catch (error) {
        console.warn('[gps] Failed to subscribe provider changes', error);
      }
    }

    bgReadyRef.current = true;
    return state;
  }, [gpsAccuracyOption.desiredAccuracy, gpsAccuracyOption.distanceFilter, handleBackgroundLocation]);

  // 「GPS OFFかつ非トラッキング」という最新の意図をrefから読む。
  // gpsStateRef/trackingStateRefは各toggleの冒頭で同期更新されるため常に最新の意図を指す。
  // await境界を跨いだ再チェックに関数呼び出しで使う（直接比較するとTSのnarrowingで矛盾扱いになる）。
  const isGpsOffIntended = useCallback(
    () => gpsStateRef.current === 'off' && trackingStateRef.current !== 'on',
    []
  );

  // --- サービス遷移の直列化キュー ---
  // start/stop/getStateの交錯レース（ON→OFF→ON連打、復帰reconcileとON操作の競合等）を防ぐため、
  // enabled状態を変える操作はすべてこのキューを通す。getStateは即時に状態を読むが
  // start/stopの効果は非同期適用のため、直列化しないとスナップショットが処理中の操作を反映しない。
  const serviceOpChain = useRef<Promise<void>>(Promise.resolve());
  const runExclusive = useCallback((op: () => Promise<void>): Promise<void> => {
    // 1操作にタイムアウトを付け、ネイティブPromiseが返らない場合でもキューが詰まり続けないようにする
    const result = serviceOpChain.current.then(() => withTimeout(op(), SERVICE_OP_TIMEOUT_MS, 'service op'));
    // チェーン自体は失敗を飲み込んで継続（エラーは呼び出し元のresultへ伝播）
    serviceOpChain.current = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }, []);

  // サービス状態を「実行時点の最新意図（gpsStateRef/trackingStateRef）」に収束させるreconciler。
  // すべてのstart/stop遷移はここを通る。opが実行時に意図を読み直すため、連打しても最終意図に
  // 収束する（古いstopが新しいstartを殺せない）。キュー内では前opのstart/stopが完了済みのため
  // getStateスナップショットは整合する。
  // 注意: キュー内からsyncBackgroundServiceを再帰呼び出しするとデッドロックする。
  const syncBackgroundService = useCallback(
    () =>
      runExclusive(async () => {
        await ensureBackgroundGeolocation();
        const isTracking = trackingStateRef.current === 'on';
        const wantOn = gpsStateRef.current !== 'off' || isTracking;
        if (wantOn) {
          // 意図に応じた通知テキストを常に反映（start前の設定と、GPS→トラッキング昇格時の
          // 稼働中サービスのテキスト書き換えを兼ねる）。精度設定も毎回反映する。サービス稼働中は
          // ready({reset:false})が設定を捨てるため、ここで渡さないとGPS設定の変更が記録を止めるまで効かない
          const { desiredAccuracy, distanceFilter } = gpsAccuracyOptionRef.current;
          const serviceConfig: FlatServiceConfig = {
            notification: makeNotification(
              isTracking ? t('hooks.notification.inTracking') : t('hooks.notification.gpsOn')
            ),
            desiredAccuracy,
            distanceFilter,
          };
          await BackgroundGeolocation.setConfig(serviceConfig);
          const state = await BackgroundGeolocation.getState();
          if (!state.enabled) {
            await BackgroundGeolocation.start();
          }
          // 静止モードで開始される/kill復帰で静止モードの可能性があるため常に移動モードへ
          // （GPS未捕捉時の408/競合時の499は非致命。ensureMovingState参照）
          await ensureMovingState();
        } else {
          // enabledガードは実体と乖離し得るため無条件stop（冪等）。通知残留対策を維持
          await BackgroundGeolocation.stop();
        }
      }),
    [ensureBackgroundGeolocation, runExclusive]
  );

  // GPS設定で精度を変えたら、GPS ON中・記録中のサービスへすぐ反映する（キュー経由。初回マウントでは呼ばない）
  const appliedGpsAccuracyRef = useRef(gpsAccuracy);
  useEffect(() => {
    if (appliedGpsAccuracyRef.current === gpsAccuracy) return;
    appliedGpsAccuracyRef.current = gpsAccuracy;
    if (Platform.OS === 'web') return;
    if (isGpsOffIntended()) return;
    syncBackgroundService().catch((error) => {
      console.error('[gps] failed to apply accuracy setting', error);
    });
  }, [gpsAccuracy, isGpsOffIntended, syncBackgroundService]);

  const startGPS = useCallback(
    async (mode: LocationStateType) => {
      if (mode === 'off') return;
      try {
        await syncBackgroundService();
      } catch (error) {
        // ネイティブ呼び出しの失敗/タイムアウトはログに留め、UI側の意図（gpsState）は維持する。
        // 例外を伝播させるとtoggleGPSが未処理拒否になり、heading購読も開始されない。
        console.error('[gps] start error', error);
      }
      // sync完了までにOFFへ変わっていたらheading購読は開始しない
      if (isGpsOffIntended()) return;
      await ensureHeadingSubscription();
    },
    [syncBackgroundService, ensureHeadingSubscription, isGpsOffIntended]
  );

  const stopGPS = useCallback(async () => {
    try {
      // トラッキング中はsyncがwantOn=trueと判定するため停止されない（従来のtrackingガードを包含）
      await syncBackgroundService();
    } catch (error) {
      console.error('[gps] stop error', error);
    }
    // heading購読はここでは解除しない: 方位盤（コンパスボタン）をGPS OFFでも端末の向きに
    // 追従させるため、購読は「フォアグラウンド＋権限あり」に紐づく（バックグラウンド移行時に解除）
  }, [syncBackgroundService]);

  const stopTracking = useCallback(async () => {
    try {
      // メモリ内の未書き込みポイントをMMKVへ確定（停止後にsaveTrackLog/破棄で正しく読めるように）
      flushTrackLog();
      // 先に意図（ref/state/MMKV）を確定させる。syncBackgroundServiceは「実行時点の意図」を
      // 読むため、意図の更新を後置するとwantOn=trueと誤判定して停止されない。
      trackLogMMKV.setTrackingState('off');
      setGpsState('off');
      gpsStateRef.current = 'off';
      trackLogMMKV.setGpsState('off');
      // 軌跡記録停止時はBackgroundGeolocationも停止（意図off/offなのでstopに収束）
      await syncBackgroundService();
      // React Stateをクリア（メモリ解放を促進）
      setCurrentLocation(null);
      setLocationStale(false);
      // heading購読は解除しない（方位盤の常時回転用。バックグラウンド移行時に解除される）
    } catch (e) {
    } finally {
      if (isLoggedIn(dataUser) && hasOpened(projectId)) {
        projectStore.deleteCurrentPosition(dataUser.uid!, projectId);
        setCurrentLocation(null);
      }
    }
  }, [projectId, dataUser, syncBackgroundService, setLocationStale]);

  const startTracking = useCallback(async () => {
    try {
      // チャンクシステムを初期化。すでに記録中（MMKVの記録状態が'on'）なら消さない: 開始が重なったとき、
      // 先に始めた記録の点を黙って消してしまうため。判定はtrackingStateRefではなくMMKVで行う
      // （toggleTracking('on')がここより前にrefを'on'にするので、refでは区別できない）
      if (trackLogMMKV.getTrackingState() !== 'on') {
        clearStoredLocations();
        trackDiscardWatchRef.current = initialTrackDiscardWatchState;
        pendingDiscardNoticeRef.current = false;
      }

      // トラッキング状態を先にMMKVへ確定する（kill後の復帰での復元と、checkAndStoreLocationsの
      // 記録ガードの両方がこの値を見る）。stopTrackingと同じく「意図を先に確定→サービス遷移」の順にする。
      // sync側のネイティブ呼び出しが例外になった場合でも、サービスが稼働していれば届いた位置を
      // 取りこぼさないため、syncの後置きにしてはならない。
      trackLogMMKV.setTrackingState('on');

      // サービス開始（通知テキストinTracking・start・changePaceはsyncが意図から導出して実行。
      // 呼び出し前にtoggleTrackingがtrackingStateRef='on'を同期設定済みであることが前提）
      await syncBackgroundService();

      await ensureHeadingSubscription();
    } catch (error) {
      console.error('Error in startTracking:', error);
      throw error;
    }
  }, [syncBackgroundService, ensureHeadingSubscription]);

  // 最後に取得済みの位置（MMKVキャッシュ・年齢無制限）を即座にマーカー表示する。
  // GPS/トラッキングONの直後、衛星捕捉までの「無反応」を避けるための即時フィードバック。
  // キャッシュが古い（STALE超）場合はstale扱いで灰色マーカーになる。
  // 表示専用でありトラックログには一切書き込まない（記録側はcheckLocationsのstaleフィルタで防護）。
  // 戻り値: 'fresh'=30秒以内のキャッシュを表示 / 'stale'=古いキャッシュを表示 / 'none'=キャッシュなし。
  // 呼び出し側は'fresh'ならワンショット取得（getCurrentPosition）を省略できる。
  const showLastKnownLocation = useCallback(
    (moveCamera: boolean): 'fresh' | 'stale' | 'none' => {
      const cached = trackLogMMKV.getCurrentLocation();
      if (!cached || !isLocationType(cached)) return 'none';
      const isFreshCache =
        typeof cached.timestamp === 'number' && Date.now() - cached.timestamp <= STALE_LOCATION_AGE_MS;
      setCurrentLocation(cached);
      setLocationStale(!isFreshCache);
      if (moveCamera && mapViewRef.current !== null && isMapView(mapViewRef.current)) {
        (mapViewRef.current as MapView).animateCamera(
          {
            center: {
              latitude: cached.latitude,
              longitude: cached.longitude,
            },
          },
          { duration: 5 }
        );
      }
      return isFreshCache ? 'fresh' : 'stale';
    },
    [mapViewRef, setLocationStale]
  );

  const moveCurrentPosition = useCallback(async () => {
    try {
      const externalFix = getActiveExternalFix();
      if (externalFix !== null) {
        const coords = gnssFixToLocation(externalFix, antennaHeightRef.current);
        hasFreshFixRef.current = true;
        setLocationStale(false);
        setCurrentLocation(coords);
        if (mapViewRef.current !== null && isMapView(mapViewRef.current)) {
          mapViewRef.current.animateCamera({ center: { latitude: coords.latitude, longitude: coords.longitude } }, {
            duration: 5,
          });
        }
        return;
      }
      const location = await BackgroundGeolocation.getCurrentPosition({
        persist: false,
        samples: 3, // 複数fixを集めて最良を返す（ライブラリ既定）。samples:1だとiOSは最初のキャッシュを返す。
        maximumAge: 0, // キャッシュ位置を採用しない（best-effort。iOSでは無視され得るため下のageで再判定）。
        desiredAccuracy: gpsAccuracyOption.desiredAccuracy,
        timeout: 30,
      } as any);

      // iOSは maximumAge を無視して古いキャッシュ位置を返すことがある（issue #113）。
      // 戻り値の age を見て、古ければ最後に取得済みの位置（MMKV・年齢無制限）へ
      // フォールバックし、stale表示（灰色マーカー）で即時フィードバックする。
      // 待っている間に外部受信機の位置が入り始めたら、内蔵GPSの位置で上書きしない
      if (isExternalFixActive()) return;
      let coords: LocationType | undefined;
      let stale = false;
      const isFresh = !!location && !(typeof location.age === 'number' && location.age > STALE_LOCATION_AGE_MS);
      if (location && isFresh) {
        coords = location.coords as LocationType;
      } else {
        // fresh取得失敗。onLocationで既にfresh位置を表示済みなら古いキャッシュへ巻き戻さない
        // （getCurrentPositionはtimeout 30秒で解決が遅れることがあるため）。
        if (hasFreshFixRef.current) return;
        const latestCached = trackLogMMKV.getCurrentLocation();
        if (latestCached && isLocationType(latestCached)) {
          coords = latestCached;
          stale = !(
            typeof latestCached.timestamp === 'number' &&
            Date.now() - latestCached.timestamp <= STALE_LOCATION_AGE_MS
          );
        } else if (location) {
          // MMKVも空（初回起動等）: OSキャッシュ由来のstale位置をlast-knownとして灰色表示
          coords = location.coords as LocationType;
          stale = true;
        }
      }
      if (!coords) return;

      if (isFresh) {
        hasFreshFixRef.current = true;
      }
      setLocationStale(stale);
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
  }, [gpsAccuracyOption.desiredAccuracy, mapViewRef, setLocationStale]);

  const toggleGPS = useCallback(
    async (gpsState_: LocationStateType) => {
      const wasOff = gpsStateRef.current === 'off';

      // GPSのみONのケースでもトラッキング状態を確実にOFFにしておく（キル復帰での誤保存防止）
      if (trackingStateRef.current !== 'on') {
        trackLogMMKV.setTrackingState('off');
      }
      trackLogMMKV.setGpsState(gpsState_);

      // 先にUIを更新（ボタンの色を即座に変更）
      setGpsState(gpsState_);
      gpsStateRef.current = gpsState_;

      if (gpsState_ === 'off') {
        setLocationStale(false);
        await stopGPS();
        if (isLoggedIn(dataUser) && hasOpened(projectId)) {
          projectStore.deleteCurrentPosition(dataUser.uid!, projectId);
          setCurrentLocation(null);
        }
      } else {
        if (wasOff) {
          // OFF→ONではfresh受信済みフラグをリセット（stale巻き戻り防止ガードの基準）
          hasFreshFixRef.current = false;
        }
        // ON系遷移では常に最後の既知位置へ即センタリング（show→followの追従復帰を含む）。
        // GPS稼働中はonLocationがキャッシュを毎点更新しているため実質「現在地」への即移動になる。
        // awaitより前に同期実行する（moveCurrentPositionは最大30秒かかり得るため）。
        const known = showLastKnownLocation(gpsState_ === 'follow');
        if (gpsState_ === 'follow' && known !== 'fresh') {
          // 新鮮な位置が手元に無いときだけワンショット取得する
          // （samples:3は数秒かかり、稼働中の位置ストリームとも競合するため、freshキャッシュがあれば冗長）。
          await moveCurrentPosition();
        }
        await startGPS(gpsState_);
      }
    },
    [stopGPS, dataUser, projectId, moveCurrentPosition, startGPS, setLocationStale, showLastKnownLocation]
  );

  const toggleTracking = useCallback(
    async (trackingState_: TrackingStateType) => {
      try {
        if (trackingState_ === 'on') {
          // 先にUIを更新（ボタンの色を即座に変更）
          setTrackingState(trackingState_);
          trackingStateRef.current = trackingState_;
          // 最後の既知位置を即表示（衛星捕捉までの無反応を避ける）。
          // startTracking内のclearStoredLocationsがMMKVの現在地キャッシュを消すため、
          // 必ずstartTrackingより前に読むこと（順序が重要）。
          const known = showLastKnownLocation(true);
          await startTracking();
          if (known !== 'fresh') {
            // 新鮮な位置が手元に無いときだけワンショット取得（toggleGPSと同方針）
            await moveCurrentPosition();
          }
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
    [moveCurrentPosition, startTracking, stopTracking, showLastKnownLocation]
  );

  const toggleHeadingUp = useCallback(
    async (headingUp_: boolean, resetHeading = true) => {
      // 解除は地図が無くても（2D→3D切替でMapViewがアンマウントされた直後でも）購読の除去まで進める。
      // ここで return すると購読が残り、後から入った3Dカメラをセンサーが回し続ける
      if (mapViewRef.current === null && headingUp_) return;

      if (headingUp_) {
        // 位置情報権限のチェックは呼び出し元（pressCompass）の責務。
        // ここで再チェックするとネイティブ往復が重複し回転開始が遅れる。
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

          // 角度の変化が小さい/間隔が短い場合はカメラ回転をスキップ。
          // このとき方位stateも更新しない（カメラ静止中にセンサー生値を流すと、
          // カメラ実ヘディングとズレて方角線が微妙に揺れ続けるため）。
          if (
            !shouldRotateCompassCamera(
              lastHeading,
              newHeading,
              currentTime - lastUpdateTime,
              COMPASS_CAMERA_MIN_INTERVAL_MS,
              COMPASS_CAMERA_MIN_DELTA_DEG
            )
          ) {
            return;
          }

          // 地図の差し替え中（2D⇔3D）は ref が一時的に null になる
          const mapView = mapViewRef.current;
          if (mapView === null) return;

          lastHeading = newHeading;
          lastUpdateTime = currentTime;

          (mapView as MapView).animateCamera(
            {
              heading: newHeading,
            },
            { duration: 200 }
          );

          // カメラに指示した値と同一値で即時更新し、方角線・コンパスアイコンをカメラと同期させる
          setAzimuthImmediate(newHeading);
        });
      } else {
        // headingUpをfalseにする場合は権限不要
        if (headingSubscriber.current !== null) {
          headingSubscriber.current.remove();
          headingSubscriber.current = null;
        }

        if (resetHeading && mapViewRef.current !== null) {
          (mapViewRef.current as MapView).animateCamera(
            {
              heading: 0,
            },
            { duration: 500 }
          );
        }

        // 通常のheading購読を復元する（マーカーの向き・方位盤の回転に使用。
        // headingUpに入れた時点で位置権限は許可済みなので無条件でよい）
        await ensureHeadingSubscription();
      }
      setHeadingUp(headingUp_);
    },
    [ensureHeadingSubscription, mapViewRef, setAzimuthImmediate]
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
        return { isOK: true, message: warningMessage || t('hooks.message.insufficientTrackLog'), layer: undefined, record: undefined };
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
        return { isOK: ret.isOK, message: ret.message, layer: undefined, record: undefined };
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
      setLocationStale(false);

      return { isOK: true, message: warningMessage, layer: ret.layer, record: ret.record };
    } finally {
      setSavingTrackStatus({ isSaving: false, phase: '', message: '' });
    }
  }, [addTrackRecord, setLocationStale]);

  const checkUnsavedTrackLog = useCallback(async (options?: { interrupted?: boolean }) => {
    // メタデータからデータの有無を確認
    const metadata = getTrackMetadata();
    const totalPoints = Math.max(metadata.totalPoints, trackMetadata.totalPoints);
    const hasData = totalPoints > 1;

    if (hasData) {
      // iOSで記録中にアプリが終了されたあとは、記録が止まったことと最後の点の時刻を示す（軌跡監査 T-M4）。
      // iOSには常駐通知がなく、終了から次に開くまで記録されていないことに気づけないため
      const lastTimeStamp = Math.max(metadata.lastTimeStamp, trackMetadata.lastTimeStamp);
      const message =
        options?.interrupted === true && lastTimeStamp > 0
          ? t('hooks.message.saveInterruptedTracking', { time: formatTrackTime(lastTimeStamp) })
          : t('hooks.message.saveTracking');
      const ans = await ConfirmAsync(message);
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
        setLocationStale(false);
      }
    }
    return { isOK: true, message: '' };
  }, [saveTrackLog, trackMetadata.totalPoints, trackMetadata.lastTimeStamp, setLocationStale]);

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
      // iOSは記録中にアプリが終了されたあと、開き直すと記録を止める（意図した方針）。止める前に、記録中だったかを
      // MMKVから読んでおき、保存の確認で「中断された」ことと最後の点の時刻を示す（軌跡監査 T-M4）
      const wasInterruptedOnIos = Platform.OS === 'ios' && trackLogMMKV.getTrackingState() === 'on';

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
          if (!wasTracking && gpsStateRef.current === 'off') {
            // 保存状態はGPS OFF・非トラッキングなのにサービスが稼働している
            // （Activity再生成をまたいだ乖離など）。changePaceで生かし続けず
            // 停止してforeground service通知を消す（意図off/offなのでstopに収束）。
            await syncBackgroundService();
            const { isOK, message } = await checkUnsavedTrackLog();
            if (!isOK) {
              await AlertAsync(message);
            }
            // GPS OFFでも方位盤を回すため、権限があればheading購読だけは開始する（プロンプトなし）
            await ensureHeadingSubscriptionIfPermitted();
            return;
          }
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

          // 移動モードの再有効化と通知テキストの整合（キル後再起動で静止モード/テキスト不整合の可能性）。
          // サービス稼働中のためsyncはsetConfig+changePaceになる（stopは呼ばれない）。
          await syncBackgroundService();

          try {
            await resubscribeHeadingForService();
          } catch (error) {
            console.error('Error restoring heading subscriber:', error);
          }

          // 最新の位置を設定して軌跡を表示（CurrentTrackLogは currentLocation の変更をトリガーに再レンダリングする）。
          // キャッシュが古ければstale（灰色マーカー）として表示する。
          showLastKnownLocation(false);
          // 終了している間に許可が「おおよその位置」へ変わっていれば知らせる（軌跡監査 T-M5）
          await checkLocationAccuracyWhileRunning();
        } else {
          await stopTracking();
          const { isOK, message } = await checkUnsavedTrackLog({ interrupted: wasInterruptedOnIos });
          if (!isOK) {
            await AlertAsync(message);
          }
        }
      } else {
        const { isOK, message } = await checkUnsavedTrackLog({ interrupted: wasInterruptedOnIos });
        if (!isOK) {
          await AlertAsync(message);
        }

        // GPSまたは軌跡がオンの場合はBackgroundGeolocationを開始
        // （通知テキスト・start・changePaceはsyncが意図から導出。ref復元済みが前提）
        if (gpsStateRef.current !== 'off' || wasTracking) {
          await syncBackgroundService();
          try {
            await resubscribeHeadingForService();
          } catch (error) {
            console.error('Error starting heading subscriber:', error);
          }

          // 現在位置設定（GPS/軌跡共通）: キャッシュ位置を即表示（古ければ灰色マーカー）
          const known = showLastKnownLocation(false);
          if (known === 'none' && wasTracking) {
            await moveCurrentPosition();
          }
          await checkLocationAccuracyWhileRunning();
        }
      }

      // GPS OFFでも方位盤（コンパスボタン）を回すため、権限があればheading購読を開始する
      // （冪等・プロンプトなし。上の分岐で購読済みなら何もしない）
      await ensureHeadingSubscriptionIfPermitted();
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
      if (providerSubscription.current) {
        providerSubscription.current.remove();
        providerSubscription.current = null;
      }
    };
    // 初期化はマウント時に1回だけ実行する（本体はinitializedRefで多重実行を防いでいる）。
    // 依存配列に状態やコールバックを含めると、依存変化時の再実行でクリーンアップが
    // heading/onLocation購読を破棄し（本体は早期returnするため）再購読されず、
    // 追跡中に位置・方位の更新が止まる不具合の原因になる。クリーンアップはアンマウント時のみ実行する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Web版ではタブの表示/非表示でもAppStateが background/active を行き来する。
    // この処理はBackgroundGeolocation・MMKV軌跡・端末方位センサーが前提でWebには存在しないため、
    // 実行するとタブ復帰のたびに権限リクエスト（→権限エラーのアラート）が走ってしまう。
    if (Platform.OS === 'web') return;

    const subscription = RNAppState.addEventListener('change', async (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        // フォアグラウンド復帰時
        try {
          syncLocationFromMMKV();
        } catch (error) {
          console.error('Failed to refresh current location on foreground:', error);
        }

        // Android: GPS OFF・非トラッキングなのにサービスが稼働していれば停止する
        // （foreground service通知が残留した場合の自己修復）。
        // クロージャのstateではなくrefで判定する（ON操作のawait中に復帰しても誤停止しない）。
        // getStateは毎復帰のsync実行を避ける安価な事前フィルタ。古い値を読んでも、
        // syncBackgroundServiceが実行時に意図を再読するため直後のON操作を誤停止しない。
        if (Platform.OS === 'android' && gpsStateRef.current === 'off' && trackingStateRef.current !== 'on') {
          try {
            const bgState = await BackgroundGeolocation.getState();
            if (bgState.enabled) {
              await syncBackgroundService();
            }
          } catch (error) {
            console.error('[gps] reconcile on foreground failed:', error);
          }
        }

        // ヘディング再購読
        if (headingSubscriber.current === null) {
          const usesLocationService = trackingState === 'on' || gpsState !== 'off' || headingUp;
          if (usesLocationService) {
            // サービス利用中は位置の許可がなければ案内する。プロンプト・通知の確認・設定画面への遷移はしない
            // （通知をオフにしたまま戻るたびに設定へ飛ばされ、抜けられなくなっていた。T-L16）
            try {
              await resubscribeHeadingForService();
            } catch (error) {
              console.error('Error resubscribing heading watcher on foreground:', error);
            }
          } else {
            // 方位盤の回転のみが目的の場合はサイレントに再購読（権限プロンプトなし）
            await ensureHeadingSubscriptionIfPermitted();
          }
        }

        if (headingUp) toggleHeadingUp(true);

        // バックグラウンドで受けた許可の変更・精度の知らせを、前面に戻ってから出す（軌跡監査 T-M5）
        if (pendingAccuracyCheckRef.current) {
          pendingAccuracyCheckRef.current = false;
          checkLocationAccuracyWhileRunning().catch((error) => console.warn('[gps] accuracy check failed', error));
        }
        if (pendingDiscardNoticeRef.current && trackingStateRef.current === 'on') {
          showTrackDiscardNotice();
        }
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
    resubscribeHeadingForService,
    ensureHeadingSubscriptionIfPermitted,
    syncBackgroundService,
    checkLocationAccuracyWhileRunning,
    showTrackDiscardNotice,
  ]);

  useEffect(() => {
    trackingStateRef.current = trackingState;
  }, [trackingState]);

  // アンマウント時に未書き込みの点をMMKVへ確定する（補助。点の書き込みは点が届いたときにしか判定しないため、
  // 立ち止まると直前の点がメモリにだけ残る。主な対策はheadlessタスク先頭のflush。軌跡監査 T-L3）
  useEffect(() => {
    return () => {
      flushPendingTrackLog();
    };
  }, []);

  useEffect(() => {
    gpsStateRef.current = gpsState;
  }, [gpsState]);

  return {
    currentLocation,
    isLocationStale,
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
    confirmLocationAccuracy,
    updateLocationFromWebGeolocate,
    endWebGeolocate,
  } as const;
};
