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

export const DataEditRadio = (props: Props) => {
  const { name, value, checkItems, onValueChange } = props;

  const [checkedList, setCheckedList] = useState<boolean[]>([]);
  const [otherChecked, setOtherChecked] = useState<boolean>(false);
  const [otherText, setOtherText] = useState('');

  const otherItem = useMemo(() => checkItems.find((v) => v.isOther), [checkItems]);
  const checkItemValues = useMemo(() => checkItems.filter((v) => !v.isOther).map((v) => v.value), [checkItems]);

  useEffect(() => {
    const newCheckedList = checkItemValues.map((v) => v === value);
    setCheckedList(newCheckedList);
    if (otherItem !== undefined) {
      const hasInputedText = !checkItemValues.includes(value);
      if (hasInputedText && value !== '') {
        setOtherText(value);
        setOtherChecked(true);
      }
    }
  }, [value, checkItemValues, otherItem]);

  const onCheckList = (index: number) => {
    const newCheckedList = checkedList.map(() => false);
    newCheckedList[index] = true;
    setCheckedList(newCheckedList);
    const checkedValueStrings = checkItemValues[index];
    onValueChange(checkedValueStrings);
    if (otherItem !== undefined) setOtherChecked(false);
  };

  const onEndEditing = (input: string) => {
    onValueChange(input);
  };

  const onOtherCheck = () => {
    setCheckedList(checkedList.map(() => false));
    setOtherChecked(true);
    onValueChange(otherText);
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
                width={35 + item.length * 15 + 30}
                checked={checkedList[index]}
                onCheck={() => onCheckList(index)}
                radio={true}
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
                radio={true}
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
    height: 79,
  },
  tr2: {
    flex: 1,
    flexDirection: 'column',
    margin: 5,
  },
});
