import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';

import { COLOR } from '../../constants/AppConstants';
import { Button } from '../atoms';
import { LayerType } from '../../types';
import { t } from '../../i18n/config';

interface Props_ColorList {
  data: LayerType['colorStyle']['colorList'];
  changeColorValue: (index: number, value: string) => void;
  selectValueColor: (index: number) => void;
  deleteValueColor: (index: number) => void;
}
interface Props_ColorListButtons {
  addColor: () => void;
  reloadFieldValue: () => void;
}

export const ColorTable = (props: any) => {
  const { data, changeColorValue, selectValueColor, deleteValueColor, addColor, reloadFieldValue } = props;

  return (
    <View style={{ marginTop: 0 }}>
      <ColorListTitle />
      <ColorList
        data={data}
        changeColorValue={changeColorValue}
        selectValueColor={selectValueColor}
        deleteValueColor={deleteValueColor}
      />
      <ColorListButtons addColor={addColor} reloadFieldValue={reloadFieldValue} />
    </View>
  );
};

const ColorListTitle = () => {
  return (
    <View style={styles.tr3}>
      <View style={[styles.td3, { flex: 5 }]}>
        <Text style={[styles.title, { textAlign: 'center' }]}>{t('common.fieldValue')}</Text>
      </View>
      <View style={[styles.td3, { flex: 3 }]}>
        <Text style={[styles.title, { textAlign: 'center' }]}>{t('common.color')}</Text>
      </View>
      <View style={styles.td3} />
    </View>
  );
};

const ColorList = (props: Props_ColorList) => {
  const { data, changeColorValue, selectValueColor, deleteValueColor } = props;

  return (
    <>
      {data.map((item, index: number) => (
        <View key={index} style={styles.tr}>
          <View style={[styles.td, { flex: 5, borderRightWidth: 1 }]}>
            <TextInput
              style={styles.input}
              value={item.value?.toString()}
              onChangeText={(value) => changeColorValue(index, value)}
            />
          </View>

          <TouchableOpacity
            style={[styles.td, { flex: 3, backgroundColor: data[index].color }]}
            onPress={() => selectValueColor(index)}
          >
            <Text>{item.color}</Text>
          </TouchableOpacity>

          <View style={styles.td}>
            <Button
              style={{
                backgroundColor: COLOR.DARKRED,
                padding: 0,
              }}
              name="minus"
              onPress={() => deleteValueColor(index)}
            />
          </View>
        </View>
      ))}
    </>
  );
};

const ColorListButtons = (props: Props_ColorListButtons) => {
  const { addColor, reloadFieldValue } = props;

  return (
    <View style={styles.button}>
      <Button backgroundColor={COLOR.GRAY2} name="autorenew" onPress={reloadFieldValue} />
      <Button backgroundColor={COLOR.GRAY2} name="plus" onPress={addColor} />
    </View>
  );
};

const styles = StyleSheet.create({
  button: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    margin: 5,
  },
  input: {
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
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 10,
    //borderTopWidth: 1,
  },
  title: {
    color: COLOR.GRAY3,
    flex: 1,
    fontSize: 12,
  },
  tr: {
    flexDirection: 'row',
    height: 60,
  },
  tr3: {
    backgroundColor: COLOR.GRAY1,
    borderBottomWidth: 1,
    borderColor: COLOR.GRAY1,
    flexDirection: 'row',
    height: 30,
  },
});
