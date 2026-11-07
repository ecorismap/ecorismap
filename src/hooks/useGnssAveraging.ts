import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { LocationType } from '../types';
import { RootState } from '../store';
import { subscribeExternalFix } from '../lib/gnss/externalGnssStore';
import { averageFixes, AveragingResult } from '../lib/gnss/averaging';
import { FIX_QUALITY, GnssFix } from '../lib/gnss/nmea';
import { isUsableFix } from '../lib/gnss/toLocation';

type AveragingRequest = { resolve: (location: LocationType | undefined) => void };

let presenter: ((request: AveragingRequest) => void) | null = null;

/**
 * 平均化測位のモーダルを開き、記録する位置（キャンセルならundefined）を返す。
 * モーダル（HomeModalGnssAveraging）が画面に載っていなければundefined。
 */
export const requestGnssAveragingAsync = (): Promise<LocationType | undefined> =>
  new Promise((resolve) => {
    if (presenter === null) {
      resolve(undefined);
      return;
    }
    presenter({ resolve });
  });

export type UseGnssAveragingReturnType = {
  visible: boolean;
  targetCount: number;
  setTargetCount: (count: number) => void;
  fixOnly: boolean;
  setFixOnly: (fixOnly: boolean) => void;
  latestFix: GnssFix | null;
  result: AveragingResult | null;
  isComplete: boolean;
  restart: () => void;
  finish: () => void;
  cancel: () => void;
};

export const useGnssAveraging = (): UseGnssAveragingReturnType => {
  const antennaHeight = useSelector((state: RootState) => state.settings.externalGnss?.antennaHeight ?? 0);
  const [request, setRequest] = useState<AveragingRequest | null>(null);
  const [targetCount, setTargetCount] = useState(10);
  const [fixOnly, setFixOnly] = useState(false);
  const [fixes, setFixes] = useState<GnssFix[]>([]);
  const [latestFix, setLatestFix] = useState<GnssFix | null>(null);

  useEffect(() => {
    presenter = (next) => {
      setFixes([]);
      setRequest(next);
    };
    return () => {
      presenter = null;
    };
  }, []);

  const visible = request !== null;
  const isComplete = fixes.length >= targetCount;

  useEffect(() => {
    if (!visible) return;
    return subscribeExternalFix((fix) => {
      setLatestFix(fix);
      if (!isUsableFix(fix) || (fixOnly && fix.fixQuality !== FIX_QUALITY.RTK_FIX)) return;
      setFixes((prev) => (prev.length >= targetCount ? prev : [...prev, fix]));
    });
  }, [visible, fixOnly, targetCount]);

  const result = useMemo(() => averageFixes(fixes, antennaHeight), [fixes, antennaHeight]);

  const close = (location: LocationType | undefined) => {
    request?.resolve(location);
    setRequest(null);
    setFixes([]);
  };

  return {
    visible,
    targetCount,
    // 条件を変えたら集め直す（混ざった平均にしない）
    setTargetCount: (count) => {
      setTargetCount(count);
      setFixes((prev) => prev.slice(0, count));
    },
    fixOnly,
    setFixOnly: (value) => {
      setFixOnly(value);
      setFixes([]);
    },
    latestFix,
    result,
    isComplete,
    restart: () => setFixes([]),
    finish: () => close(result?.location),
    cancel: () => close(undefined),
  };
};
