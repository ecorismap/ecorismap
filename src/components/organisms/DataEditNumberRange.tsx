import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';

import { TextInput } from '../atoms';
import { COLOR } from '../../constants/AppConstants';
import { t } from '../../i18n/config';

interface Props {
  name: string;
  value: string;
  onChangeText: (name: string, value: string) => void;
}

export const DataEditNumberRange = (props: Props) => {
  const { name, value, onChangeText } = props;
  const [value1, setValue1] = useState('');
  const [value2, setValue2] = useState('');

  useEffect(() => {
    if (value === '') return;
    const splitedValue = value.split(t('common.ndash'));
    setValue1(splitedValue[0]);
    setValue2(splitedValue[1]);
  }, [value]);

  const endEditing = () => {
    onChangeText(name, `${value1}${t('common.ndash')}${value2}`);
  };

  return (
    <View style={styles.tr}>
      <View style={styles.td}>
        <TextInput
          style={styles.input}
          label={name}
          keyboardType="number-pad"
          value={value1}
          onChangeText={setValue1}
          onEndEditing={endEditing}
          onBlur={endEditing}
        />

        <View style={{ marginTop: 20 }}>
          <Text>{`${t('common.ndash')}`}</Text>
        </View>

        <TextInput
          style={styles.input}
          label={' '}
          keyboardType="number-pad"
          value={value2}
          onChangeText={setValue2}
          onEndEditing={endEditing}
          onBlur={endEditing}
        />
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
    paddingLeft: 10,
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
