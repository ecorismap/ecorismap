import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';

import { Picker, TextInput } from '../atoms';
import { COLOR } from '../../constants/AppConstants';
import { ItemValue } from '@react-native-picker/picker/typings/Picker';
import { t } from '../../i18n/config';

interface Props {
  name: string;
  value: string | number | undefined;
  listItems: { value: string; isOther: boolean }[];
  onValueChange: (itemValue: ItemValue) => void;
}

export const DataEditList = (props: Props) => {
  const { name, value, listItems, onValueChange } = props;

  //const [selectedItem, setSelectedItem] = useState<string>('');
  const [otherSelected, setOtherSelected] = useState<boolean>(false);
  const [otherText, setOtherText] = useState('');

  const otherItem = useMemo(() => listItems.find((v) => v.isOther), [listItems]);
  const listItemValues = useMemo(() => listItems.filter((v) => !v.isOther).map((v) => v.value), [listItems]);

  const itemValueArray = useMemo(() => listItems.map((v) => v.value), [listItems]);

  const selectedItem = useMemo(() => {
    const item = value ? value.toString() : '';
    return listItemValues.includes(item) ? item : otherItem !== undefined ? otherItem.value : '';
  }, [listItemValues, otherItem, value]);

  useEffect(() => {
    //選択されている値が「その他」の場合テキストの値をセットする必要がある。
    if (otherItem !== undefined && selectedItem === otherItem.value) {
      setOtherText(value ? value.toString() : '');
      setOtherSelected(true);
    } else {
      setOtherText('');
      setOtherSelected(false);
    }
  }, [value, listItemValues, otherItem, selectedItem]);

  const onItemChange = (itemValue: ItemValue, itemIndex: number) => {
    if (listItems[itemIndex].isOther) {
      setOtherSelected(true);
      onValueChange('');
    } else {
      setOtherSelected(false);
      onValueChange(itemValue);
    }
  };

  const onEndEditing = () => {
    onValueChange(otherText);
  };

  return (
    <View style={styles.tr}>
      <View style={styles.td}>
        <Picker
          label={name}
          selectedValue={selectedItem}
          onValueChange={onItemChange}
          itemLabelArray={itemValueArray}
          itemValueArray={itemValueArray}
          maxIndex={itemValueArray.length - 1}
        />
      </View>
      {otherSelected && (
        <View style={styles.td}>
          <TextInput
            style={styles.input}
            label={t('common.value')}
            value={otherText}
            onChangeText={setOtherText}
            onEndEditing={onEndEditing}
            onBlur={onEndEditing}
          />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  input: {
    backgroundColor: COLOR.WHITE,
    borderColor: COLOR.GRAY1,
    borderWidth: 1,
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
