import React, { useContext, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { PermissionType } from '../../types';

import { COLOR, PERMISSIONDESCRIPTION, PERMISSIONTYPE } from '../../constants/AppConstants';
import { CheckBox } from '../molecules/CheckBox';
import { LayerEditContext } from '../../contexts/LayerEdit';
import { t } from '../../i18n/config';

export const LayerEditRadio = () => {
  const { layer, changePermission, canChangePermission } = useContext(LayerEditContext);
  // trackレイヤはメンバー各自が書き込むためCOMMON（管理者専用データ）は選べない
  const isTrackLayer = layer.id === 'track';
  const permissionList = useMemo(
    () => (Object.keys(PERMISSIONTYPE) as PermissionType[]).filter((v) => !isTrackLayer || v !== 'COMMON'),
    [isTrackLayer]
  );
  const permissionLabels = useMemo(() => permissionList.map((v) => PERMISSIONTYPE[v]), [permissionList]);
  //ラベルの長さで幅を決めて、選択肢どうしの間隔が均等に見えるようにする。
  //全角は12px、半角は7pxで見積もる（英語など横に収まらない言語では折り返す）
  const permissionWidths = useMemo(
    () =>
      permissionLabels.map(
        (label) => 35 + [...label].reduce((w, c) => w + (c.charCodeAt(0) > 0xff ? 12 : 7), 0) + 12
      ),
    [permissionLabels]
  );

  //選択中の共有範囲の説明。TEMPLATEはこの画面では選べないため空にする
  const permissionDescription = useMemo(
    () => (layer.permission in PERMISSIONDESCRIPTION ? PERMISSIONDESCRIPTION[layer.permission as PermissionType] : ''),
    [layer.permission]
  );

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
              //CheckBox自身がflex:1のため、そのまま並べると幅が均等割りされてしまう。
              //ラベルなりの幅のViewで包む（縦方向のViewだとflex:1が高さに効いて潰れる）。
              //余った幅はspace-betweenで項目の間に等分される
              <View key={index} style={{ flexDirection: 'row', width: permissionWidths[index] }}>
                <CheckBox
                  label={permissionLabels[index]}
                  disabled={!canChangePermission}
                  width={permissionWidths[index]}
                  checked={checkedList[index]}
                  onCheck={() => onCheckList(index)}
                  radio={true}
                />
              </View>
            ))}
          </View>
          <Text style={styles.description}>{permissionDescription}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  checkbox: {
    //折り返したときの最低限の間隔。通常はspace-betweenで均等に広がる
    columnGap: 12,
    flexDirection: 'row',
    //横に収まらない言語では折り返す
    flexWrap: 'wrap',
    //Webのように横に広いときも右側だけ余らないように、余白を項目の間で分ける
    justifyContent: 'space-between',
    marginHorizontal: 5,
    marginTop: 2,
    rowGap: 4,
  },
  description: {
    color: COLOR.GRAY3,
    fontSize: 11,
    marginHorizontal: 5,
    marginTop: 4,
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
    fontSize: 12,
  },

  tr: {
    flexDirection: 'row',
    //説明や選択肢の折り返しで伸びるようにする（flex:1のtitleだと文字が潰れる）。
    //余った分は説明の下の余白になる
    minHeight: 96,
  },
  tr2: {
    flex: 1,
    flexDirection: 'column',
    margin: 5,
  },
});
