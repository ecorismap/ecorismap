import React from 'react';
import { View, StyleSheet } from 'react-native';

import { Picker } from '../atoms';
import { COLOR } from '../../constants/AppConstants';

interface Props {
  label: string;
  value: string;
  pickerItems: string[];
  onValueChange: (itemValue: string, itemIndex: number) => void;
}

export const ProjectNamePicker = (props: Props) => {
  const { label, value, pickerItems, onValueChange } = props;

  return (
    <View style={styles.tr}>
      <View style={styles.td}>
        <Picker
          label={label}
          selectedValue={value}
          onValueChange={(itemValue, itemIndex) => onValueChange(itemValue as string, itemIndex)}
          itemLabelArray={pickerItems}
          itemValueArray={pickerItems}
          maxIndex={pickerItems.length - 1}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
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
