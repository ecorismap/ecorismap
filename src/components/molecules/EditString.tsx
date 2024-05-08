import React from 'react';
import { View, StyleSheet } from 'react-native';

import { TextInput } from '../atoms';
import { COLOR } from '../../constants/AppConstants';

interface Props {
  name: string;
  value: string | number | undefined;
  editable?: boolean;
  placeholder?: string;
  style?: { [key: string]: string | number };
  onChangeText: (name: string, value: string) => void;
  onEndEditing: () => void;
}

export const EditString = (props: Props) => {
  const { style, name, value, editable, placeholder, onChangeText, onEndEditing } = props;

  return (
    <View style={styles.tr}>
      <View style={styles.td}>
        <TextInput
          style={[styles.input, style]}
          label={name}
          value={value ? value.toString() : ''}
          placeholder={placeholder ?? ''}
          placeholderTextColor={COLOR.GRAY3}
          onChangeText={onChangeText}
          onEndEditing={onEndEditing}
          onBlur={onEndEditing}
          editable={editable}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  input: {
    flex: 2,
    fontSize: 16,
    height: 40,
    paddingHorizontal: 12,
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
