import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';

import { COLOR } from '../../constants/AppConstants';
import { CreateProjectType } from '../../types';
import { CheckBox } from '../molecules/CheckBox';

interface Props {
  name: string;
  value: string;
  list: CreateProjectType[];
  labels: string[];
  onValueChange: (value: CreateProjectType) => void;
}

export const ProjectEditRadio = (props: Props) => {
  const { name, value, list, labels, onValueChange } = props;

  const [checkedList, setCheckedList] = useState<boolean[]>([]);

  useEffect(() => {
    const newCheckedList = list.map((v) => v === value);
    setCheckedList(newCheckedList);
  }, [value, list]);

  const onCheckList = (index: number) => {
    const newCheckedList = checkedList.map(() => false);
    newCheckedList[index] = true;
    setCheckedList(newCheckedList);
    const checkedValueStrings = list[index];
    onValueChange(checkedValueStrings);
  };

  return (
    <View style={styles.tr}>
      <View style={styles.td}>
        <View style={styles.tr2}>
          <Text style={styles.title}>{name}</Text>
          <View style={styles.checkbox}>
            {list.map((item, index) => (
              <CheckBox
                key={index}
                label={labels[index]}
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
    //backgroundColor: COLOR.GRAY1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    margin: 5,
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
    height: 70,
  },
  tr2: {
    flex: 1,
    flexDirection: 'column',
    margin: 5,
  },
});
