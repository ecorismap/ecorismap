import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import { t } from '../../i18n/config';
import { fixQualityColor, fixQualityLabel, formatAccuracy } from '../../lib/gnss/toLocation';
import { LocationType } from '../../types';

interface Props {
  coords: LocationType;
}

/**
 * 外部GNSS受信機で記録したポイントの測位品質・精度・標高を1行で出す。
 * 内蔵GPSの標高はAndroidが楕円体高・iOSが標高と意味が揃わず精度も低いので、受信機の点だけに限る
 */
export const DataEditGnssInfo = React.memo(({ coords }: Props) => {
  const { gnss } = coords;
  if (gnss === undefined) return null;
  const items = [
    typeof coords.accuracy === 'number' ? `±${formatAccuracy(coords.accuracy)}` : null,
    typeof coords.altitude === 'number'
      ? `${t('GpsSettings.externalGnss.altitude')} ${coords.altitude.toFixed(2)}m`
      : null,
    typeof gnss.ellipsoidHeight === 'number'
      ? `${t('GpsSettings.externalGnss.ellipsoidHeight')} ${gnss.ellipsoidHeight.toFixed(2)}m`
      : null,
    gnss.averagedCount !== undefined
      ? `${t('GpsSettings.externalGnss.averaging.averagedCount', { count: gnss.averagedCount })}`
      : null,
  ].filter(Boolean);

  return (
    <View style={styles.row}>
      <View style={[styles.badge, { backgroundColor: fixQualityColor(gnss.fixQuality) }]}>
        <Text style={styles.badgeText}>{fixQualityLabel(gnss.fixQuality)}</Text>
      </View>
      <Text style={styles.text}>{items.join('  ')}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  badge: {
    borderRadius: 4,
    marginRight: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    color: COLOR.WHITE,
    fontSize: 12,
    fontWeight: '700',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: 10,
    marginVertical: 6,
  },
  text: {
    color: COLOR.GRAY4,
    flexShrink: 1,
    fontSize: 13,
  },
});
