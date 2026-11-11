import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import { FIX_QUALITY } from '../../lib/gnss/nmea';
import { fixQualityColor, fixQualityLabel } from '../../lib/gnss/toLocation';
import { t } from '../../i18n/config';

const QUALITIES = [FIX_QUALITY.RTK_FIX, FIX_QUALITY.RTK_FLOAT];

// カラータイプ「測位品質」の凡例。品質色は固定なので見せるだけ（選べるのは下の単色＝それ以外の区間の色）
export const GnssQualityLegend = () => (
  <View>
    {QUALITIES.map((quality) => (
      <View key={quality} style={[styles.row, { backgroundColor: fixQualityColor(quality) }]}>
        <Text style={styles.label}>{fixQualityLabel(quality)}</Text>
      </View>
    ))}
    <Text style={styles.note}>{t('LayerEditFeatureStyle.gnssQualityNote')}</Text>
  </View>
);

const styles = StyleSheet.create({
  label: {
    color: COLOR.WHITE,
    fontWeight: '700',
  },
  note: {
    color: COLOR.GRAY4,
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  row: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: COLOR.GRAY2,
    height: 40,
    justifyContent: 'center',
  },
});
