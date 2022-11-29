import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { PermissionType } from '../../types';

import { COLOR } from '../../constants/AppConstants';
import { CheckBox } from '../molecules/CheckBox';

interface Props {
  editable: boolean;
  name: string;
  value: PermissionType;
  valueList: PermissionType[];
  valueLabels: string[];
  onValueChange: (value: PermissionType) => void;
}

export const LayerEditRadio = (props: Props) => {
  const { editable, name, value, valueList, valueLabels, onValueChange } = props;

  const [checkedList, setCheckedList] = useState<boolean[]>([]);

  useEffect(() => {
    const newCheckedList = valueList.map((v) => v === value);
    setCheckedList(newCheckedList);
  }, [value, valueList]);

  const onCheckList = (index: number) => {
    const newCheckedList = checkedList.map(() => false);
    newCheckedList[index] = true;
    setCheckedList(newCheckedList);
    onValueChange(valueList[index]);
  };

  return (
    <View style={styles.tr}>
      <View style={styles.td}>
        <View style={styles.tr2}>
          <Text style={styles.title}>{name}</Text>
          <View style={styles.checkbox}>
            {valueList.map((item, index) => (
              <CheckBox
                key={index}
                label={valueLabels[index]}
                disabled={!editable}
                width={200}
                checked={checkedList[index]}
                onCheck={() => onCheckList(index)}
                radio={true}
              />
            ))}
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  checkbox: {
    //backgroundColor: COLOR.BLUE,
    flexDirection: 'row',
    justifyContent: 'space-between',
    margin: 5,
  },
  td: {
    alignItems: 'center',
    //borderBottomWidth: 1,
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
    height: 70,
  },
  tr2: {
    flex: 1,
    flexDirection: 'column',
    margin: 5,
  },
});
