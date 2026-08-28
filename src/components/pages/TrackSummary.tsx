import React, { useContext, useMemo } from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLOR } from '../../constants/AppConstants';
import { TrackSummaryContext } from '../../contexts/TrackSummary';
import { t } from '../../i18n/config';
import dayjs from '../../i18n/dayjs';
import { BottomSheetHeader } from '../molecules/BottomSheetHeader';
import { TrackSummaryChart } from '../organisms/TrackSummaryChart';

const formatDuration = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = m.toString().padStart(2, '0');
  const ss = s.toString().padStart(2, '0');
  return `${h}:${mm}:${ss}`;
};

interface StatItem {
  key: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  value: string;
}

export default function TrackSummary() {
  const {
    statistics,
    profile,
    isRecording,
    gotoBack,
    isTrackPhotoVisible,
    toggleTrackPhotoVisible,
    trackPhotoCount,
    isLimitedAccess,
    presentLimitedPicker,
  } = useContext(TrackSummaryContext);

  const timeRangeText = useMemo(() => {
    if (statistics === null || statistics.startTime === null || statistics.endTime === null) return null;
    return `${dayjs(statistics.startTime).format('L HH:mm')} - ${dayjs(statistics.endTime).format('HH:mm')}`;
  }, [statistics]);

  const statItems: StatItem[] = useMemo(() => {
    if (statistics === null) return [];
    return [
      {
        key: 'distance',
        icon: 'map-marker-distance',
        label: t('TrackSummary.label.distance'),
        value: `${statistics.distanceKm.toFixed(2)} km`,
      },
      {
        key: 'duration',
        icon: 'clock-outline',
        label: t('TrackSummary.label.duration'),
        value: statistics.durationSeconds !== null ? formatDuration(statistics.durationSeconds) : '--',
      },
      {
        key: 'averageSpeed',
        icon: 'speedometer-medium',
        label: t('TrackSummary.label.averageSpeed'),
        value: statistics.averageSpeedKmh !== null ? `${statistics.averageSpeedKmh.toFixed(1)} km/h` : '--',
      },
      {
        key: 'maxSpeed',
        icon: 'speedometer',
        label: t('TrackSummary.label.maxSpeed'),
        value: statistics.maxSpeedKmh !== null ? `${statistics.maxSpeedKmh.toFixed(1)} km/h` : '--',
      },
      {
        key: 'ascent',
        icon: 'trending-up',
        label: t('TrackSummary.label.ascent'),
        value: statistics.ascent !== null ? `${Math.round(statistics.ascent)} m` : '--',
      },
      {
        key: 'descent',
        icon: 'trending-down',
        label: t('TrackSummary.label.descent'),
        value: statistics.descent !== null ? `${Math.round(statistics.descent)} m` : '--',
      },
      {
        key: 'maxAltitude',
        icon: 'summit',
        label: t('TrackSummary.label.maxAltitude'),
        value: statistics.maxAltitude !== null ? `${Math.round(statistics.maxAltitude)} m` : '--',
      },
      {
        key: 'minAltitude',
        icon: 'image-filter-hdr',
        label: t('TrackSummary.label.minAltitude'),
        value: statistics.minAltitude !== null ? `${Math.round(statistics.minAltitude)} m` : '--',
      },
    ];
  }, [statistics]);

  return (
    <View style={{ flex: 1 }}>
      <BottomSheetHeader
        title={isRecording ? t('TrackSummary.navigation.titleRecording') : t('TrackSummary.navigation.title')}
        showBackButton
        onBack={gotoBack}
        rightComponent={
          Platform.OS !== 'web' ? (
            <TouchableOpacity
              style={styles.photoToggle}
              onPress={toggleTrackPhotoVisible}
              accessibilityLabel={t('TrackSummary.label.photos')}
            >
              <MaterialCommunityIcons
                name={isTrackPhotoVisible ? 'image-multiple' : 'image-off-outline'}
                size={22}
                color={isTrackPhotoVisible ? COLOR.BLACK : COLOR.GRAY3}
              />
              {isTrackPhotoVisible && trackPhotoCount > 0 && (
                <Text style={styles.photoCount}>{trackPhotoCount}</Text>
              )}
            </TouchableOpacity>
          ) : undefined
        }
      />
      {statistics === null ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>{`${t('TrackSummary.notFound')}`}</Text>
        </View>
      ) : (
        <ScrollView>
          <View style={styles.contentContainer}>
            {/* グラフを先頭に置き、シートを半分開いた状態でも見えるようにする */}
            {profile.length >= 2 ? (
              <TrackSummaryChart profile={profile} />
            ) : (
              <View style={styles.noAltitudeContainer}>
                <Text style={styles.emptyText}>{`${t('TrackSummary.noAltitudeData')}`}</Text>
              </View>
            )}
            {Platform.OS !== 'web' && isTrackPhotoVisible && isLimitedAccess && (
              <View style={styles.limitedRow}>
                <MaterialCommunityIcons name="alert-circle-outline" size={16} color={COLOR.GRAY3} />
                <Text style={styles.limitedText}>{t('TrackSummary.limitedAccess')}</Text>
                <TouchableOpacity onPress={presentLimitedPicker}>
                  <Text style={styles.limitedLink}>{t('TrackSummary.selectMorePhotos')}</Text>
                </TouchableOpacity>
              </View>
            )}
            {timeRangeText !== null && (
              <View style={styles.timeRow}>
                <MaterialCommunityIcons name="calendar-clock" size={16} color={COLOR.GRAY3} />
                <Text style={styles.timeText}>{timeRangeText}</Text>
              </View>
            )}
            <View style={styles.grid}>
              {statItems.map(({ key, icon, label, value }) => (
                <View key={key} style={styles.card}>
                  <View style={styles.cardLabelRow}>
                    <MaterialCommunityIcons name={icon} size={16} color={COLOR.GRAY3} />
                    <Text style={styles.cardLabel}>{label}</Text>
                  </View>
                  <Text style={styles.cardValue}>{value}</Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLOR.WHITE,
    borderColor: COLOR.GRAY1,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    width: '48.5%',
  },
  cardLabel: {
    color: COLOR.GRAY3,
    fontSize: 12,
    marginLeft: 4,
  },
  cardLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 4,
  },
  cardValue: {
    color: COLOR.BLACK,
    fontSize: 18,
    fontWeight: '600',
  },
  contentContainer: {
    padding: 15,
  },
  emptyContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  emptyText: {
    color: COLOR.GRAY3,
    fontSize: 14,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  limitedLink: {
    color: COLOR.BLUE,
    fontSize: 12,
    marginLeft: 8,
    textDecorationLine: 'underline',
  },
  limitedRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  limitedText: {
    color: COLOR.GRAY3,
    fontSize: 12,
    marginLeft: 4,
  },
  noAltitudeContainer: {
    alignItems: 'center',
    backgroundColor: COLOR.WHITE,
    borderColor: COLOR.GRAY1,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 120,
  },
  timeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 12,
    marginTop: 12,
  },
  photoCount: {
    color: COLOR.BLACK,
    fontSize: 12,
    marginLeft: 3,
  },
  photoToggle: {
    alignItems: 'center',
    flexDirection: 'row',
    padding: 5,
  },
  timeText: {
    color: COLOR.GRAY4,
    fontSize: 13,
    marginLeft: 6,
  },
});
