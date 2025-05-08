import React from 'react';
import { View, StyleSheet } from 'react-native';

import { TextInput } from '../atoms';
import { COLOR } from '../../constants/AppConstants';
import { t } from '../../i18n/config';

interface Props {
  value: string;
}

export const DataEditUserName = (props: Props) => {
  const { value } = props;

  return (
    <View style={styles.tr}>
      <View style={styles.td}>
        <TextInput label={t('common.userName')} value={value} style={styles.input} editable={false} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  input: {
    borderRadius: 5,
    flex: 2,
    fontSize: 16,
    height: 40,
    paddingHorizontal: 12,
    paddingLeft: 10,
  },

  td: {
    alignItems: 'center',
    borderColor: COLOR.GRAY2,
    borderTopWidth: 1,
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
