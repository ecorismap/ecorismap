import { useEffect, useReducer, useSyncExternalStore } from 'react';
import {
  ExternalGnssSnapshot,
  getExternalGnssSnapshot,
  isExternalFixActive,
  subscribeExternalGnss,
} from '../lib/gnss/externalGnssStore';

/** 外部GNSS受信機の状態と、いまその位置を使っているか（途絶判定込み）を返す */
export const useExternalGnssStatus = (): { snapshot: ExternalGnssSnapshot; active: boolean } => {
  const snapshot = useSyncExternalStore(subscribeExternalGnss, getExternalGnssSnapshot);
  const isConnected = snapshot.status.link === 'connected';
  // 位置が途絶えるとストアは更新されないので、接続中は1秒ごとに鮮度を見直す
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!isConnected) return;
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [isConnected]);
  return { snapshot, active: isExternalFixActive(Date.now(), snapshot) };
};
