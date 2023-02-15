import { cloneDeep } from 'lodash';
import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Text, ScrollView } from 'react-native';

import { COLOR } from '../../constants/AppConstants';
import { CheckBox } from '../molecules/CheckBox';
import { CheckInput } from '../molecules/CheckInput';

interface Props {
  name: string;
  value: string;
  checkItems: { value: string; isOther: boolean }[];
  onValueChange: (value: string) => void;
}

export const DataEditCheck = (props: Props) => {
  const { name, value, checkItems, onValueChange } = props;
  const [checkedList, setCheckedList] = useState<boolean[]>([]);
  const [otherChecked, setOtherChecked] = useState<boolean>(false);
  const [otherText, setOtherText] = useState('');

  const otherItem = useMemo(() => checkItems.find((v) => v.isOther), [checkItems]);
  const checkItemValues = useMemo(() => checkItems.filter((v) => !v.isOther).map((v) => v.value), [checkItems]);

  useEffect(() => {
    const checkedValue = value.split(',');
    const newCheckedList = checkItemValues.map((v) => checkedValue.includes(v));
    setCheckedList(newCheckedList);
    if (otherItem !== undefined) {
      const inputedText = checkedValue.find((v) => !checkItemValues.includes(v));
      if (inputedText !== undefined && inputedText !== '') {
        setOtherText(inputedText);
        setOtherChecked(true);
      }
    }
  }, [value, checkItems, checkItemValues, otherItem]);

  const onCheckList = (index: number, checked: boolean) => {
    const newCheckedList = cloneDeep(checkedList);
    newCheckedList[index] = checked;
    setCheckedList(newCheckedList);
    const checkedValueStrings = checkItemValues
      .filter((checkedValue: string, idx: number) => newCheckedList[idx] && checkedValue)
      .join(',');
    if (otherChecked) {
      onValueChange(checkedValueStrings + ',' + otherText);
    } else {
      onValueChange(checkedValueStrings);
    }
  };

  const onEndEditing = (input: string) => {
    const checkedValueStrings = checkItemValues
      .filter((checkedValue: string, idx: number) => checkedList[idx] && checkedValue)
      .join(',');
    onValueChange(checkedValueStrings + ',' + input);
  };

  const onOtherCheck = (checked: boolean) => {
    setOtherChecked(checked);
    const checkedValueStrings = checkItemValues
      .filter((checkedValue: string, idx: number) => checkedList[idx] && checkedValue)
      .join(',');
    if (checked) {
      onValueChange(checkedValueStrings + ',' + otherText);
    } else {
      onValueChange(checkedValueStrings);
    }
  };

  return (
    <View style={styles.tr}>
      <View style={styles.td}>
        <View style={styles.tr2}>
          <Text style={styles.title}>{name}</Text>
          <ScrollView horizontal={true} style={styles.checkbox}>
            {checkItemValues.map((item, index) => (
              <CheckBox
                key={index}
                label={item}
                width={35 + item.length * 15 + 50}
                checked={checkedList[index]}
                onCheck={(checked) => onCheckList(index, checked)}
              />
            ))}
            {otherItem !== undefined && (
              <CheckInput
                label={otherItem.value}
                width={35 + 3 * 15 + 50}
                text={otherText}
                checked={otherChecked}
                onCheck={onOtherCheck}
                onEndEditing={onEndEditing}
              />
            )}
          </ScrollView>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  checkbox: {
    flexDirection: 'row',
    marginHorizontal: 5,
    marginVertical: 0,
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
  title: {
    color: COLOR.GRAY3,
    flex: 1,
    fontSize: 12,
  },

  tr: {
    flexDirection: 'row',
    height: 75,
  },
  tr2: {
    flex: 1,
    flexDirection: 'column',
    margin: 5,
  },
});
