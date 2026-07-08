import React, { useContext } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLOR } from '../../constants/AppConstants';
import { GpsSettingsContext } from '../../contexts/GpsSettings';
import { t } from '../../i18n/config';
import { Pressable } from '../atoms/Pressable';
import { BottomSheetHeader } from '../molecules/BottomSheetHeader';
import { GpsAccuracyType } from '../../types';

const ACCURACY_OPTIONS: {
  value: GpsAccuracyType;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}[] = [
  { value: 'HIGH', icon: 'crosshairs-gps' },
  { value: 'MEDIUM', icon: 'crosshairs' },
  { value: 'LOW', icon: 'leaf' },
];

export default function GpsSettings() {
  const { gpsAccuracy, selectGpsAccuracy, gotoBack } = useContext(GpsSettingsContext);

  return (
    <View style={{ flex: 1 }}>
      <BottomSheetHeader title={t('GpsSettings.navigation.title')} showBackButton onBack={gotoBack} />
      <View style={styles.contentContainer}>
        <Text style={styles.sectionTitle}>{`${t('GpsSettings.sectionTitle')}`}</Text>
        {ACCURACY_OPTIONS.map(({ value, icon }) => {
          const selected = value === gpsAccuracy;
          return (
            <Pressable
              key={value}
              style={[styles.card, selected && styles.cardSelected]}
              onPress={() => selectGpsAccuracy(value)}
            >
              <View style={[styles.iconCircle, selected && styles.iconCircleSelected]}>
                <MaterialCommunityIcons name={icon} size={24} color={selected ? COLOR.WHITE : COLOR.GRAY3} />
              </View>
              <View style={styles.cardTextContainer}>
                <Text style={[styles.cardTitle, selected && styles.cardTitleSelected]}>
                  {`${t(`GpsSettings.accuracy.${value.toLowerCase()}.title`)}`}
                </Text>
                <Text style={styles.cardDescription}>
                  {`${t(`GpsSettings.accuracy.${value.toLowerCase()}.description`)}`}
                </Text>
              </View>
              <MaterialCommunityIcons
                name={selected ? 'check-circle' : 'circle-outline'}
                size={22}
                color={selected ? COLOR.BLUE : COLOR.GRAY2}
              />
            </Pressable>
          );
        })}
        <View style={styles.noteRow}>
          <MaterialCommunityIcons name="information-outline" size={16} color={COLOR.GRAY3} />
          <Text style={styles.noteText}>{`${t('GpsSettings.note')}`}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: COLOR.WHITE,
    borderColor: COLOR.GRAY1,
    borderRadius: 12,
    borderWidth: 1,
    elevation: 2,
    flexDirection: 'row',
    marginBottom: 12,
    paddingHorizontal: 15,
    paddingVertical: 14,
    shadowColor: COLOR.BLACK,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  cardDescription: {
    color: COLOR.GRAY4,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  cardSelected: {
    borderColor: COLOR.BLUE,
    borderWidth: 2,
  },
  cardTextContainer: {
    flex: 1,
    marginHorizontal: 12,
  },
  cardTitle: {
    color: COLOR.BLACK,
    fontSize: 16,
    fontWeight: '600',
  },
  cardTitleSelected: {
    color: COLOR.BLUE,
  },
  contentContainer: {
    padding: 20,
  },
  iconCircle: {
    alignItems: 'center',
    backgroundColor: COLOR.GRAY0,
    borderColor: COLOR.GRAY1,
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  iconCircleSelected: {
    backgroundColor: COLOR.BLUE,
    borderColor: COLOR.BLUE,
  },
  noteRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 4,
  },
  noteText: {
    color: COLOR.GRAY3,
    fontSize: 12,
    marginLeft: 5,
  },
  sectionTitle: {
    color: COLOR.GRAY4,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 10,
  },
});
