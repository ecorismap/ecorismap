import React, { useContext, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { PermissionType } from '../../types';

import { COLOR, PERMISSIONTYPE } from '../../constants/AppConstants';
import { CheckBox } from '../molecules/CheckBox';
import { LayerEditContext } from '../../contexts/LayerEdit';
import { t } from '../../i18n/config';

export const LayerEditRadio = () => {
  const { layer, changePermission, canChangePermission } = useContext(LayerEditContext);
  const permissionLabels = useMemo(() => Object.values(PERMISSIONTYPE), []);
  const permissionList = useMemo(() => Object.keys(PERMISSIONTYPE) as PermissionType[], []);

  const [checkedList, setCheckedList] = useState<boolean[]>([]);

  useEffect(() => {
    const newCheckedList = permissionList.map((v) => v === layer.permission);
    setCheckedList(newCheckedList);
  }, [layer.permission, permissionList]);

  const onCheckList = (index: number) => {
    if (!canChangePermission) return;
    const newCheckedList = checkedList.map(() => false);
    newCheckedList[index] = true;
    setCheckedList(newCheckedList);
    changePermission(permissionList[index]);
  };

  return (
    <View style={styles.tr}>
      <View style={styles.td}>
        <View style={styles.tr2}>
          <Text style={styles.title}>{`${t('common.permission')}`}</Text>
          <View style={styles.checkbox}>
            {permissionList.map((item, index) => (
              <CheckBox
                key={index}
                label={permissionLabels[index]}
                disabled={!canChangePermission}
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
