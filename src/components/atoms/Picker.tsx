import React, { useRef } from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { Picker as RNPicker } from '@react-native-picker/picker';

import { COLOR } from '../../constants/AppConstants';
import { ItemValue } from '@react-native-picker/picker/typings/Picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import ModalSelector from 'react-native-modal-selector';

interface Props {
  style?: any;
  label?: string;
  selectedValue: string;
  onValueChange: (itemValue: ItemValue, itemIndex: number) => void;
  itemLabelArray: string[];
  itemValueArray: string[];
  maxIndex: number;
  enabled?: boolean;
}

const Picker = React.memo((props: Props) => {
  const { style, label, selectedValue, onValueChange, itemLabelArray, itemValueArray, maxIndex, enabled } = props;

  if (Platform.OS === 'ios') {
    return (
      <PickeriOS
        style={style}
        label={label}
        selectedValue={selectedValue}
        onValueChange={onValueChange}
        itemLabelArray={itemLabelArray}
        itemValueArray={itemValueArray}
        maxIndex={maxIndex}
        enabled={enabled}
      />
    );
  } else {
    return (
      <PickerAndroidOrWeb
        style={style}
        label={label}
        selectedValue={selectedValue}
        onValueChange={onValueChange}
        itemLabelArray={itemLabelArray}
        itemValueArray={itemValueArray}
        maxIndex={maxIndex}
        enabled={enabled}
      />
    );
  }
});

const PickerAndroidOrWeb = React.memo((props: Props) => {
  const { label, selectedValue, onValueChange, itemLabelArray, itemValueArray, maxIndex, enabled } = props;

  return (
    <View style={styles.tr2}>
      {label && <Text style={styles.title}>{label}</Text>}
      <View style={styles.td2}>
        <RNPicker
          style={
            Platform.OS === 'web'
              ? {
                  flex: 1,
                  height: 40,
                  backgroundColor: COLOR.MAIN,
                  borderColor: COLOR.GRAY1,
                  paddingHorizontal: 5,
                  maxWidth: 140,
                }
              : { flex: 1, height: 40, marginLeft: -13 }
          }
          enabled={enabled}
          selectedValue={selectedValue}
          onValueChange={(v, idx) => {
            if (v !== selectedValue) onValueChange(v, idx);
          }}
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

const PickeriOS = React.memo((props: Props) => {
  const { label, selectedValue, onValueChange, itemLabelArray, itemValueArray, maxIndex, enabled } = props;

  const items = itemValueArray.slice(0, maxIndex + 1).map((item, index) => ({
    label: itemLabelArray[index],
    value: itemValueArray[index],
    key: index,
  }));
  const selectedLabel = itemLabelArray[itemValueArray.indexOf(selectedValue)];
  const selectorRef = useRef(null);

  const openSelector = () => {
    if (selectorRef.current) {
      // @ts-ignore
      selectorRef.current.open();
    }
  };

  return (
    <View style={styles.tr2}>
      {label && <Text style={styles.title}>{label}</Text>}
      <View style={styles.td2}>
        <TouchableOpacity onPress={openSelector} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <ModalSelector
            ref={selectorRef}
            data={items}
            initValueTextStyle={{ color: COLOR.BLACK, minWidth: 100 }}
            selectStyle={{ borderWidth: 0 }}
            overlayStyle={{ backgroundColor: COLOR.GRAY3 }}
            accessible={enabled}
            animationType={'none'}
            initValue={selectedLabel}
            onChange={(option) => {
              if (option.value !== selectedValue) onValueChange(option.value, option.key);
            }}
          />
          <MaterialCommunityIcons
            color={COLOR.GRAY4}
            style={[styles.icon, { marginHorizontal: 3 }]}
            size={20}
            name={'chevron-down'}
            iconStyle={{ marginRight: 0 }}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  icon: {
    backgroundColor: COLOR.MAIN,
    flex: 1,
    padding: 0,
  },
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
