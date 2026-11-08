import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import BackgroundGeolocation, { Location as BackgroundLocation } from '../lib/backgroundGeolocation';
import { LocationType } from '../types';
import { RootState } from '../store';
import { subscribeExternalFix } from '../lib/gnss/externalGnssStore';
import { averageFixes, AveragingResult } from '../lib/gnss/averaging';
import { FIX_QUALITY, GnssFix } from '../lib/gnss/nmea';
import { isUsableFix } from '../lib/gnss/toLocation';

/** external=外部GNSS受信機、internal=端末内蔵のGPS */
export type AveragingSource = 'external' | 'internal';

type AveragingRequest = { source: AveragingSource; resolve: (location: LocationType | undefined) => void };

let presenter: ((request: AveragingRequest) => void) | null = null;

/**
 * 平均化測位のモーダルを開き、記録する位置（キャンセルならundefined）を返す。
 * モーダル（HomeModalGnssAveraging）が画面に載っていなければundefined。
 */
export const requestGnssAveragingAsync = (source: AveragingSource): Promise<LocationType | undefined> =>
  new Promise((resolve) => {
    if (presenter === null) {
      resolve(undefined);
      return;
    }
    presenter({ source, resolve });
  });

// 内蔵GPSの取得間隔。静止中は通常の位置更新（distanceFilter）が止まるので、平均化中だけ別に取り続ける
const INTERNAL_INTERVAL_MS = 1000;

/** 内蔵GPSの位置を、平均化の計算に流せるよう受信機の1エポックと同じ形にする（測位品質は単独扱い） */
const internalLocationToFix = (location: BackgroundLocation): GnssFix => {
  const { latitude, longitude, altitude, accuracy, altitude_accuracy, speed, heading } = location.coords;
  // 水平精度は半径なので、緯度・経度の標準偏差に等分して戻す（estimateHorizontalAccuracyで元の値になる）
  const std = typeof accuracy === 'number' && accuracy >= 0 ? accuracy / Math.SQRT2 : null;
  // timestampは型上ISO文字列かepoch msのどちらもあり得る
  const receivedAt =
    typeof location.timestamp === 'number' ? location.timestamp : Date.parse(location.timestamp);
  return {
    time: String(location.timestamp),
    latitude,
    longitude,
    altitudeMsl: typeof altitude === 'number' ? altitude : null,
    geoidSeparation: null,
    fixQuality: FIX_QUALITY.SINGLE,
    satellites: null,
    hdop: null,
    diffAge: null,
    speed: typeof speed === 'number' && speed >= 0 ? speed : null,
    course: typeof heading === 'number' && heading >= 0 ? heading : null,
    stdLat: std,
    stdLon: std,
    stdAlt: typeof altitude_accuracy === 'number' && altitude_accuracy >= 0 ? altitude_accuracy : null,
    receivedAt: Number.isFinite(receivedAt) ? receivedAt : Date.now(),
  };
};

const subscribeInternalFix = (listener: (fix: GnssFix) => void): (() => void) => {
  let active = true;
  let remove: (() => void) | null = null;
  // 型定義は同期でSubscriptionを返すが、v5の実体はPromiseで返す。どちらでも受けられるようにする
  Promise.resolve(
    BackgroundGeolocation.watchPosition(
      { interval: INTERNAL_INTERVAL_MS, desiredAccuracy: BackgroundGeolocation.DesiredAccuracy.High, persist: false },
      (location) => {
        if (active) listener(internalLocationToFix(location));
      },
      (errorCode) => console.log('[averaging] watchPosition error', errorCode)
    )
  )
    .then((subscription) => {
      if (active) remove = () => subscription.remove();
      else subscription.remove();
    })
    .catch((e) => console.log('[averaging] watchPosition failed', e));
  return () => {
    active = false;
    remove?.();
  };
};

/** idle=条件を選んで開始待ち、collecting=エポック収集中、done=目標数に達して記録待ち */
export type AveragingPhase = 'idle' | 'collecting' | 'done';

export type UseGnssAveragingReturnType = {
  visible: boolean;
  source: AveragingSource;
  phase: AveragingPhase;
  targetCount: number;
  setTargetCount: (count: number) => void;
  fixOnly: boolean;
  setFixOnly: (fixOnly: boolean) => void;
  latestFix: GnssFix | null;
  result: AveragingResult | null;
  start: () => void;
  stop: () => void;
  finish: () => void;
  cancel: () => void;
};

export const useGnssAveraging = (): UseGnssAveragingReturnType => {
  const externalAntennaHeight = useSelector((state: RootState) => state.settings.externalGnss?.antennaHeight ?? 0);
  const [request, setRequest] = useState<AveragingRequest | null>(null);
  const [targetCount, setTargetCount] = useState(10);
  const [fixOnly, setFixOnly] = useState(false);
  const [fixes, setFixes] = useState<GnssFix[]>([]);
  const [isCollecting, setIsCollecting] = useState(false);
  const [latestFix, setLatestFix] = useState<GnssFix | null>(null);

  const reset = () => {
    setIsCollecting(false);
    setFixes([]);
  };

  useEffect(() => {
    presenter = (next) => {
      reset();
      setLatestFix(null);
      setRequest(next);
    };
    return () => {
      presenter = null;
    };
  }, []);

  const visible = request !== null;
  const source = request?.source ?? 'external';
  // 内蔵GPSにはRTKの測位品質もアンテナ高もない
  const requireFix = source === 'external' && fixOnly;
  const antennaHeight = source === 'external' ? externalAntennaHeight : 0;
  const phase: AveragingPhase = fixes.length >= targetCount ? 'done' : isCollecting ? 'collecting' : 'idle';

  useEffect(() => {
    if (!visible) return;
    const subscribe = source === 'external' ? subscribeExternalFix : subscribeInternalFix;
    return subscribe((fix) => {
      setLatestFix(fix);
      if (!isCollecting || !isUsableFix(fix) || (requireFix && fix.fixQuality !== FIX_QUALITY.RTK_FIX)) return;
      setFixes((prev) => (prev.length >= targetCount ? prev : [...prev, fix]));
    });
  }, [visible, source, isCollecting, requireFix, targetCount]);

  const result = useMemo(() => averageFixes(fixes, antennaHeight), [fixes, antennaHeight]);

  const close = (location: LocationType | undefined) => {
    request?.resolve(location);
    setRequest(null);
    reset();
  };

  return {
    visible,
    source,
    phase,
    targetCount,
    // 条件を変えたら開始前に戻す（混ざった平均にしない）
    setTargetCount: (count) => {
      setTargetCount(count);
      reset();
    },
    fixOnly,
    setFixOnly: (value) => {
      setFixOnly(value);
      reset();
    },
    latestFix,
    result,
    start: () => {
      setFixes([]);
      setIsCollecting(true);
    },
    stop: reset,
    finish: () => {
      if (phase !== 'done' || result === null) return;
      if (source === 'external') {
        close(result.location);
        return;
      }
      // gnssは外部受信機の点の印（データ画面の測位品質表示・標高の扱い）なので内蔵GPSの点には付けない
      const { gnss: _gnss, ...location } = result.location;
      close(location);
    },
    cancel: () => close(undefined),
  };
};
