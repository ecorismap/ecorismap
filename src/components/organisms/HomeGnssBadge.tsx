import React, { useEffect, useReducer, useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLOR } from '../../constants/AppConstants';
import { useWindow } from '../../hooks/useWindow';
import { t } from '../../i18n/config';
import {
  getExternalGnssSnapshot,
  isExternalFixActive,
  subscribeExternalGnss,
} from '../../lib/gnss/externalGnssStore';
import { estimateHorizontalAccuracy, fixQualityColor, fixQualityLabel, formatAccuracy } from '../../lib/gnss/toLocation';

/** 外部GNSS受信機の接続中だけ、GPSボタンの横に測位品質を出す。途絶して内蔵GPSに戻ったらそれを示す */
export const HomeGnssBadge = React.memo(() => {
  const snapshot = useSyncExternalStore(subscribeExternalGnss, getExternalGnssSnapshot);
  const { isLandscape } = useWindow();
  const insets = useSafeAreaInsets();
  const isConnected = snapshot.status.link === 'connected';
  // 位置が途絶えるとストアは更新されないので、接続中は1秒ごとに鮮度を見直す
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!isConnected) return;
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [isConnected]);

  if (!isConnected) return null;
  const { fix } = snapshot;
  const active = isExternalFixActive(Date.now(), snapshot);
  const label =
    active && fix !== null
      ? `${fixQualityLabel(fix.fixQuality)} ${formatAccuracy(estimateHorizontalAccuracy(fix))}`
      : `${t('GpsSettings.externalGnss.fallback')}`;
  const color = active && fix !== null ? fixQualityColor(fix.fixQuality) : '#777777';

  return (
    <View
      pointerEvents="none"
      style={[styles.badge, { backgroundColor: color, left: 62 + insets.left, top: insets.top + (isLandscape ? 190 : 200) }]}
    >
      <Text style={styles.text}>{label}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  badge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    position: 'absolute',
  },
  text: {
    color: COLOR.WHITE,
    fontSize: 12,
    fontWeight: '700',
  },
});
