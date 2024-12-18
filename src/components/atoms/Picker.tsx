import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

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
  dropdownIcon?: boolean;
}

const Picker = React.memo((props: Props) => {
  const {
    style,
    label,
    selectedValue,
    onValueChange,
    itemLabelArray,
    itemValueArray,
    maxIndex,
    enabled,
    dropdownIcon,
  } = props;

  return (
    <CustomPicker
      style={style}
      label={label}
      selectedValue={selectedValue}
      onValueChange={onValueChange}
      itemLabelArray={itemLabelArray}
      itemValueArray={itemValueArray}
      maxIndex={maxIndex}
      enabled={enabled}
      dropdownIcon={dropdownIcon}
    />
  );
});

const CustomPicker = React.memo((props: Props) => {
  const {
    style,
    label,
    selectedValue,
    onValueChange,
    itemLabelArray,
    itemValueArray,
    maxIndex,
    enabled,
    dropdownIcon,
  } = props;

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
        <TouchableOpacity onPress={openSelector} style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <View style={{ flex: 10 }}>
            <ModalSelector
              ref={selectorRef}
              data={items}
              initValueTextStyle={{
                color: COLOR.BLACK,
                minWidth: 100,
                textAlign: 'left',
                paddingLeft: 6,
                justifyContent: 'center',
              }}
              selectStyle={{ borderWidth: 0 }}
              //overlayStyle={{ backgroundColor: COLOR.DARKGREEN }}
              accessible={enabled}
              animationType={'none'}
              initValue={selectedLabel}
              onChange={(option) => {
                if (option.value !== selectedValue) onValueChange(option.value, option.key);
              }}
            />
          </View>
          {dropdownIcon === false ? null : (
            <View style={{ alignItems: 'flex-end', flex: 1, minWidth: 10 }}>
              <MaterialCommunityIcons
                color={COLOR.GRAY4}
                style={[styles.icon, { marginHorizontal: 3, backgroundColor: style.backgroundColor ?? COLOR.MAIN }]}
                size={20}
                name={'chevron-down'}
                iconStyle={{ marginRight: 0 }}
              />
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  icon: {
    backgroundColor: COLOR.MAIN,
    //flex: 1,
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
