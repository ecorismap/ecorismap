import React from 'react';
import { View, StyleSheet } from 'react-native';

import { TextInput } from '../atoms';
import { COLOR } from '../../constants/AppConstants';

interface Props {
  name: string;
  value: string | number | undefined;
  multiline?: boolean;
  editable?: boolean;
  onChangeText: (name: string, value: string) => void;
  onEndEditing: () => void;
}

export const DataEditString = (props: Props) => {
  const { name, value, multiline, editable, onChangeText, onEndEditing } = props;

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
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'center',
      paddingHorizontal: 10,
      paddingVertical: 0,
    },
    tr: {
      flexDirection: 'row',
      height: multiline ? 140 : 70,
    },
  });

  return (
    <View style={styles.tr}>
      <View style={styles.td}>
        <TextInput
          style={styles.input}
          label={name}
          value={value ? value.toString() : ''}
          onChangeText={onChangeText}
          onEndEditing={onEndEditing}
          onBlur={onEndEditing}
          editable={editable}
          multiline={multiline}
        />
      </View>
    </View>
  );
};
