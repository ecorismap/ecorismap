import { ItemValue } from '@react-native-picker/picker/typings/Picker';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, TextInput, Text } from 'react-native';

import { COLOR } from '../../constants/AppConstants';
import { t } from '../../i18n/config';
import { Button, Picker } from '../atoms';

interface Props_DataEditListTable {
  value: string;
  name: string;
  listItems: { value: string; isOther: boolean }[];
  onChangeValue: (name: string, value: string) => void;
}

export const DataEditListTable = (props: Props_DataEditListTable) => {
  const { value, name, listItems, onChangeValue } = props;
  const data = useMemo(() => (value === '' ? [] : value.split(',').map((rowItem) => rowItem.split('|'))), [value]);

  const addValue = useCallback(() => {
    const newValue = value === '' ? `${listItems[0].value}|` : value + ',' + `${listItems[0].value}|`;
    onChangeValue(name, newValue);
  }, [listItems, name, onChangeValue, value]);

  const updateValue = useCallback(
    (selectedItems: string[], values: string[]) => {
      const joinedValue = selectedItems.map((item, index) => `${item}|${values[index]}`).join(',');
      onChangeValue(name, joinedValue);
    },
    [name, onChangeValue]
  );

  return (
    <>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ margin: 5, paddingHorizontal: 10, flex: 100 }}>
          <Text style={styles.title}>{name}</Text>
        </View>
      </View>
      <View style={styles.tr3}>
        <View style={[styles.td3, { flex: 100 }]}>
          <Text style={[styles.title, { textAlign: 'center' }]}>{`${t('common.select')}`}</Text>
        </View>
        <View style={[styles.td3, { flex: 100 }]}>
          <Text style={[styles.title, { textAlign: 'center' }]}>{`${t('common.value')}`}</Text>
        </View>
        <View style={[styles.td3, { minWidth: 40, justifyContent: 'flex-end' }]}>
          <Button
            style={{
              backgroundColor: COLOR.GRAY3,
              padding: 0,
            }}
            name="plus"
            onPress={addValue}
          />
        </View>
      </View>
      <ValueList data={data} listItems={listItems} onEndEditing={updateValue} />
    </>
  );
};

interface Props_List {
  data: string[][];
  listItems: { value: string; isOther: boolean }[];
  onEndEditing: (selectedItems: string[], values: string[]) => void;
}

const ValueList = (props: Props_List) => {
  const { data, listItems, onEndEditing } = props;
  const [values, setValues] = useState<string[]>([]);

  const selectedItems = useMemo(() => data.map((d) => d[0]), [data]);
  const itemValueArray = useMemo(() => listItems.map((v) => v.value), [listItems]);

  const itemChange = useCallback(
    (index: number, value: ItemValue) => {
      const newSelectedItems = [...selectedItems];
      newSelectedItems[index] = value as string;
      const newValues = [...values];
      values[index] = '';
      onEndEditing(newSelectedItems, newValues);
    },
    [onEndEditing, selectedItems, values]
  );

  const changeText = useCallback(
    (index: number, value: string) => {
      const newValues = [...values];
      newValues[index] = value;
      setValues(newValues);
    },
    [values]
  );

  const deleteValue = useCallback(
    (index: number) => {
      const newSelectedItems = [...selectedItems];
      newSelectedItems.splice(index, 1);
      const newValues = [...values];
      newValues.splice(index, 1);

      onEndEditing(newSelectedItems, newValues);
    },
    [onEndEditing, selectedItems, values]
  );

  useEffect(() => {
    setValues(data.map((d) => d[1]));
  }, [data]);

  return (
    <>
      {selectedItems.map((item, index) => (
        <View key={index} style={styles.tr}>
          <View style={[styles.td, { flex: 100 }]}>
            <Picker
              selectedValue={item}
              onValueChange={(value) => itemChange(index, value)}
              itemLabelArray={itemValueArray}
              itemValueArray={itemValueArray}
              maxIndex={itemValueArray.length - 1}
            />
          </View>
          <View style={[styles.td, { flex: 100 }]}>
            <TextInput
              style={styles.input}
              value={values[index] ? values[index].toString() : ''}
              onChangeText={(value) => changeText(index, value)}
              onEndEditing={() => onEndEditing(selectedItems, values)}
              onBlur={() => onEndEditing(selectedItems, values)}
            />
          </View>

          <View style={[styles.td, { minWidth: 40, justifyContent: 'flex-end' }]}>
            <Button
              style={{
                backgroundColor: COLOR.DARKRED,
                padding: 0,
              }}
              name="minus"
              onPress={() => deleteValue(index)}
            />
          </View>
        </View>
      ))}
    </>
  );
};

const styles = StyleSheet.create({
  input: {
    backgroundColor: COLOR.GRAY0,
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

  td3: {
    alignItems: 'center',
    borderColor: COLOR.GRAY2,
    borderTopWidth: 1,
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  title: {
    color: COLOR.GRAY3,
    flex: 1,
    fontSize: 12,
  },
  tr: {
    flexDirection: 'row',
    height: 45,
  },
  tr3: {
    backgroundColor: COLOR.GRAY1,
    //borderColor: COLOR.GRAY1,
    //borderWidth: 1,
    flexDirection: 'row',
    height: 30,
  },
});
