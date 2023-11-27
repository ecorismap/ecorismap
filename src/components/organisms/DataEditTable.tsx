import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, TextInput, Text } from 'react-native';

import { COLOR } from '../../constants/AppConstants';
import { Button } from '../atoms';

interface Props_DataEditTable {
  value: string;
  name: string;
  list: { value: string; isOther: boolean }[];
  onChangeValue: (name: string, value: string) => void;
}

export const DataEditTable = (props: Props_DataEditTable) => {
  const { value, name, list, onChangeValue } = props;
  const data = useMemo(() => (value === '' ? [[]] : value.split(',').map((rowItem) => rowItem.split('|'))), [value]);

  const addValue = useCallback(() => {
    const newValue = value === '' ? '|'.repeat(list.length - 1) : '|'.repeat(list.length - 1) + ',' + value;
    onChangeValue(name, newValue);
  }, [list.length, name, onChangeValue, value]);

  const updateValue = useCallback(
    (valueList: string[][]) => {
      onChangeValue(name, valueList.map((rowItem) => rowItem.join('|')).join(','));
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
        {list.map((item, idx) => (
          <View key={idx} style={[styles.td3, { flex: 100 }]}>
            <Text style={[styles.title, { textAlign: 'center' }]}>{item.value}</Text>
          </View>
        ))}
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
      <ValueList data={data} list={list} onEndEditing={updateValue} />
    </>
  );
};

interface Props_List {
  data: string[][];
  list: { value: string; isOther: boolean }[];
  onEndEditing: (valueList: string[][]) => void;
}
const ValueList = (props: Props_List) => {
  const { data, list, onEndEditing } = props;
  const [valueList, setValueList] = useState<string[][]>([[]]);

  const changeText = useCallback(
    (rowIndex: number, colIndex: number, value: string) => {
      const updatedValueList = [...valueList];
      if (value.indexOf('|') === -1 && value.indexOf(',') === -1) {
        updatedValueList[rowIndex][colIndex] = value;
      }
      setValueList(updatedValueList);
      onEndEditing(updatedValueList);
    },
    [onEndEditing, valueList]
  );

  const deleteValue = useCallback(
    (rowIndex: number) => {
      const updatedValue = [...valueList];
      updatedValue.splice(rowIndex, 1);
      onEndEditing(updatedValue);
    },
    [onEndEditing, valueList]
  );

  useEffect(() => {
    setValueList(data);
  }, [data]);

  return (
    <>
      {valueList.map((rowItem, rowIndex) => (
        <View key={rowIndex} style={styles.tr}>
          {list.map((_, colIndex) => (
            <View key={colIndex} style={[styles.td, { flex: 100 }]}>
              <TextInput
                style={styles.input}
                value={rowItem[colIndex] ? rowItem[colIndex].toString() : ''}
                onChangeText={(value) => changeText(rowIndex, colIndex, value)}
                onEndEditing={() => onEndEditing(valueList)}
                onBlur={() => onEndEditing(valueList)}
              />
            </View>
          ))}
          <View style={[styles.td, { minWidth: 40, justifyContent: 'flex-end' }]}>
            <Button
              style={{
                backgroundColor: COLOR.DARKRED,
                padding: 0,
              }}
              name="minus"
              onPress={() => deleteValue(rowIndex)}
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
    borderRadius: 5,
    flex: 2,
    fontSize: 16,
    height: 35,
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
