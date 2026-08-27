import React, { useContext, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable } from '../atoms/Pressable';
import { COLOR } from '../../constants/AppConstants';
import { MeasureContext } from '../../contexts/Measure';
import { haversineKm, formatDistanceKm } from '../../utils/Location';
import { t } from '../../i18n/config';

// 測定モード中のインジケータ兼終了UI（native/web共通）
export const HomeMeasureBanner = React.memo(() => {
  const { isMeasuring, measureA, measureB, endMeasure } = useContext(MeasureContext);
  const insets = useSafeAreaInsets();

  const text = useMemo(() => {
    if (!measureA) return '';
    if (!measureB) return t('Home.measure.tapToSetPoint');
    const distance = formatDistanceKm(haversineKm(measureA, measureB));
    return t('Home.measure.distance', { distance });
  }, [measureA, measureB]);

  if (!isMeasuring) return null;

  return (
    <View style={[styles.container, { top: insets.top + 10 }]} pointerEvents="box-none">
      <View style={styles.banner}>
        <MaterialCommunityIcons name="ruler" size={18} color={COLOR.WHITE} />
        <Text style={styles.text}>{text}</Text>
        <Pressable onPress={endMeasure} style={styles.closeButton}>
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
    elevation: 1001,
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 1001,
  },
  text: {
    color: COLOR.WHITE,
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 6,
  },
});
