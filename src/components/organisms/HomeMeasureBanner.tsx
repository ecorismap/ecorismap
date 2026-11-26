import React, { useContext, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable } from '../atoms/Pressable';
import { COLOR } from '../../constants/AppConstants';
import { MeasureContext } from '../../contexts/Measure';
import { MapViewContext } from '../../contexts/MapView';
import { getMeasureProfile, MeasureProfile } from '../../utils/measureProfile';
import { haversineKm, formatDistanceKm } from '../../utils/Location';
import { t } from '../../i18n/config';
import { useHomeTopLayout } from '../../hooks/useHomeTopLayout';

// 測定モード中のインジケータ兼終了UI（native/web共通）
export const HomeMeasureBanner = React.memo(() => {
  const { isMeasuring, measureA, measureB, endMeasure } = useContext(MeasureContext);
  const { isTerrainActive } = useContext(MapViewContext);
  const { measureBannerTop } = useHomeTopLayout();

  // 3D表示中は起伏に沿った距離と標高差も出す（標高タイルから求めるので非同期）
  // undefined: 計算中, null: 取得失敗（水平距離だけ出す）
  const [profile, setProfile] = useState<MeasureProfile | null | undefined>(undefined);
  useEffect(() => {
    setProfile(undefined);
    if (!isTerrainActive || !measureA || !measureB) return;
    let cancelled = false;
    getMeasureProfile(measureA, measureB)
      .catch(() => null)
      .then((p) => {
        if (!cancelled) setProfile(p);
      });
    return () => {
      cancelled = true;
    };
  }, [isTerrainActive, measureA, measureB]);

  const text = useMemo(() => {
    if (!measureA) return '';
    if (!measureB) return t('Home.measure.tapToSetPoint');
    const distance = formatDistanceKm(haversineKm(measureA, measureB));
    if (!isTerrainActive || profile === null) return t('Home.measure.distance', { distance });
    if (profile === undefined) return t('Home.measure.distance3dLoading', { distance });
    const surface = formatDistanceKm(profile.surfaceM / 1000);
    const lines = [t('Home.measure.distance3d', { distance, surface })];
    if (profile.elevationDiffM !== null) {
      const diff = Math.round(profile.elevationDiffM);
      lines.push(t('Home.measure.elevationDiff', { diff: `${diff > 0 ? '+' : ''}${diff}` }));
    }
    return lines.join('\n');
  }, [measureA, measureB, isTerrainActive, profile]);

  if (!isMeasuring) return null;

  return (
    <View style={[styles.container, { top: measureBannerTop }]} pointerEvents="box-none">
      <View style={styles.banner}>
        <MaterialCommunityIcons name="ruler" size={18} color={COLOR.WHITE} />
        <Text testID="home-measure-text" style={styles.text}>{text}</Text>
        <Pressable testID="home-measure-close" onPress={endMeasure} style={styles.closeButton}>
          <MaterialCommunityIcons name="close" size={18} color={COLOR.WHITE} />
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  banner: {
    alignItems: 'center',
    backgroundColor: COLOR.BANNER_BACKGROUND,
    borderRadius: 20,
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  closeButton: {
    marginLeft: 10,
  },
  container: {
    alignItems: 'center',
    paddingHorizontal: 10,
    elevation: 1001,
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 1001,
  },
  text: {
    color: COLOR.WHITE,
    flexShrink: 1,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 6,
  },
});
