import React from 'react';
import { View, StyleSheet } from 'react-native';
import { TextInput, RectButton } from '../atoms';
import { COLOR } from '../../constants/AppConstants';
import { LatLonDMSType } from '../../types';
import { t } from '../../i18n/config';

interface Props {
  label: string;
  latlon: LatLonDMSType;
  latlonType: 'latitude' | 'longitude';
  isDecimal: boolean;
  changeLatLonType: () => void;
  onChangeText: (val: string, latlonType: 'latitude' | 'longitude', dmsType: 'decimal' | 'deg' | 'min' | 'sec') => void;
}

export const DataEditCoords = (props: Props) => {
  const { label, latlon, latlonType, isDecimal, changeLatLonType, onChangeText } = props;

  return (
    <View style={styles.tr}>
      <View style={[styles.td, { flex: 9 }]}>
        {isDecimal ? (
          <TextInput
            style={styles.input}
            label={label}
            value={latlon[latlonType].decimal}
            keyboardType="number-pad"
            onChangeText={(val: string) => onChangeText(val, latlonType, 'decimal')}
          />
        ) : (
          <>
            <TextInput
              style={styles.input}
              label={label}
              value={latlon[latlonType].deg}
              keyboardType="number-pad"
              onChangeText={(val: string) => onChangeText(val, latlonType, 'deg')}
            />
            <TextInput
              style={styles.input}
              label={t('coomon.minutes')}
              value={latlon[latlonType].min}
              keyboardType="number-pad"
              onChangeText={(val: string) => onChangeText(val, latlonType, 'min')}
            />
            <TextInput
              style={styles.input}
              label={t('coomon.second')}
              value={latlon[latlonType].sec}
              keyboardType="number-pad"
              onChangeText={(val: string) => onChangeText(val, latlonType, 'sec')}
            />
          </>
        )}
      </View>
      <View style={[styles.td, { flex: 1, justifyContent: 'flex-end' }]}>
        <RectButton name="arrow-left-right" onPress={changeLatLonType} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  input: {
    backgroundColor: COLOR.GRAY0,
    borderRadius: 5,
    flex: 2,
    fontSize: 16,
    height: 40,
    paddingHorizontal: 12,
    paddingLeft: 10,
    paddingVertical: 0,
  },
  td: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: COLOR.GRAY2,
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 0,
  },
  tr: {
    flexDirection: 'row',
    height: 70,
  },
});
