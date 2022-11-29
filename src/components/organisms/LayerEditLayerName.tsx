import React from 'react';
import { View, StyleSheet } from 'react-native';

import { COLOR } from '../../constants/AppConstants';
import { t } from '../../i18n/config';
import { TextInput } from '../atoms';

export const LayerName = (props: any) => {
  const { value, editable, onChangeText, onEndEditing } = props;

  return (
    <View style={styles.tr}>
      <View style={styles.td}>
        <TextInput
          style={styles.input}
          label={t('common.layerName')}
          editable={editable}
          value={value}
          onChangeText={onChangeText}
          onEndEditing={onEndEditing}
          onBlur={onEndEditing}
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
    paddingHorizontal: 12,
    paddingLeft: 10,
  },

  td: {
    alignItems: 'center',
    borderBottomWidth: 1,
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
