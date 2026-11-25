import { ItemValue } from '@react-native-picker/picker/typings/Picker';
import React from 'react';
import { View, StyleSheet } from 'react-native';

import { COLOR } from '../../constants/AppConstants';
import { Picker } from '../atoms';

interface Props {
  label: string;
  value: string;
  onValueChange: (itemValue: ItemValue, itemIndex: number) => void;
  itemLabelArray: string[];
  itemValueArray: string[];
  style?: { [key: string]: string | number };
  /** E2Eから要素を特定するためのID */
  testID?: string;
}

export const SimplePicker = React.memo((props: Props) => {
  const { label, value, onValueChange, itemLabelArray, itemValueArray, style, testID } = props;

  return (
    <View style={[styles.tr, style]}>
      <View style={styles.td}>
        <Picker
          testID={testID}
          label={label}
          selectedValue={value}
          onValueChange={onValueChange}
          itemLabelArray={itemLabelArray}
          itemValueArray={itemValueArray}
          maxIndex={itemValueArray.length - 1}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  td: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: COLOR.GRAY2,
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 2,
  },

  tr: {
    flex: 1,
    flexDirection: 'row',
    height: 65,
  },
});
