import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Picker as RNPicker } from '@react-native-picker/picker';

import { COLOR } from '../../constants/AppConstants';
import { ItemValue } from '@react-native-picker/picker/typings/Picker';

interface Props {
  style?: any;
  label?: string;
  selectedValue: string;
  onValueChange: ((itemValue: ItemValue, itemIndex: number) => void) | undefined;
  itemLabelArray: string[];
  itemValueArray: string[];
  maxIndex: number;
  enabled?: boolean;
}

const Picker = React.memo((props: Props) => {
  const { style, label, selectedValue, onValueChange, itemLabelArray, itemValueArray, maxIndex, enabled } = props;

  return (
    <View style={styles.tr2}>
      {label && <Text style={styles.title}>{label}</Text>}
      <View style={styles.td2}>
        <RNPicker
          itemStyle={Platform.OS === 'ios' ? { height: 40, fontSize: 12 } : {}}
          style={
            style
              ? style
              : Platform.OS === 'web'
              ? { flex: 1, height: 40, backgroundColor: COLOR.MAIN, borderColor: COLOR.GRAY1, paddingHorizontal: 5 }
              : { flex: 1, height: 40, marginLeft: -13 }
          }
          enabled={enabled}
          selectedValue={selectedValue}
          onValueChange={onValueChange}
          mode="dropdown"
        >
          {itemValueArray.map((item, index) =>
            index <= maxIndex ? ( //Multiを除く
              <RNPicker.Item key={index} label={itemLabelArray[index]} value={item} style={{ fontSize: 14 }} />
            ) : null
          )}
        </RNPicker>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  td2: {
    alignItems: 'center',
    flex: 2,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
  },
  title: {
    color: COLOR.GRAY3,
    flex: 1,
    fontSize: 12,
  },
  tr2: {
    flex: 1,
    flexDirection: 'column',
    margin: 0,
  },
});

export default Picker;
