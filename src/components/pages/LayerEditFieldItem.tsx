import React, { useCallback, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Text, TouchableOpacity, TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { HeaderBackButton, HeaderBackButtonProps } from '@react-navigation/elements';
import { FormatType, LayerType } from '../../types';
import { COLOR } from '../../constants/AppConstants';
import { Button, Picker } from '../atoms';
import { t } from '../../i18n/config';

interface Props {
  itemValues: { value: string; isOther: boolean }[];
  itemFormat: FormatType;
  pickerItems: LayerType['id'][];
  pickerItemLabels: LayerType['name'][];
  editable: boolean;
  changeValue: (index: number, value: string) => void;
  pressDeleteValue: (id: number) => void;
  pressAddValue: (other?: boolean) => void;
  gotoBack: () => void;
}
export default function LayerEditFieldItemScreen(props: Props) {
  const {
    itemValues,
    itemFormat,
    pickerItems,
    pickerItemLabels,
    editable,
    changeValue,
    pressDeleteValue,
    pressAddValue,
    gotoBack,
  } = props;
  const navigation = useNavigation();

  const headerLeftButton = useCallback(
    (props_: JSX.IntrinsicAttributes & HeaderBackButtonProps) => <HeaderBackButton {...props_} onPress={gotoBack} />,
    [gotoBack]
  );

  useEffect(() => {
    navigation.setOptions({
      headerLeft: (props_: JSX.IntrinsicAttributes & HeaderBackButtonProps) => headerLeftButton(props_),
    });
  }, [headerLeftButton, navigation]);

  return (
    <View style={styles.container}>
      <LayerFieldTitle />
      <ScrollView>
        <ValueList
          editable={editable}
          data={itemValues}
          format={itemFormat}
          pickerItems={pickerItems}
          pickerItemLabels={pickerItemLabels}
          changeValue={changeValue}
          deleteValue={pressDeleteValue}
        />
        <ListButtons editable={editable} format={itemFormat} addValue={pressAddValue} />
      </ScrollView>
    </View>
  );
}

const LayerFieldTitle = () => {
  return (
    <View style={styles.tr3}>
      <View style={[styles.td3, { flex: 4 }]}>
        <Text style={[styles.title, { textAlign: 'center' }]}>{t('common.value')}</Text>
      </View>
      <View style={styles.td3} />
    </View>
  );
};

interface Props_List {
  editable: boolean;
  data: { value: string; isOther: boolean }[];
  format: FormatType;
  pickerItems?: LayerType['id'][];
  pickerItemLabels?: LayerType['name'][];
  changeValue: (index: number, value: string) => void;
  deleteValue: (index: number) => void;
}
const ValueList = (props: Props_List) => {
  const { editable, data, format, pickerItems, pickerItemLabels, changeValue, deleteValue } = props;

  return (
    <>
      {data?.map((item, index: number) => (
        <View key={index} style={styles.tr}>
          <View style={[styles.td, { flex: 4 }]}>
            {format === 'REFERENCE' ? (
              <Picker
                enabled={editable}
                selectedValue={item.value.toString()}
                onValueChange={(itemValue) => (editable ? changeValue(0, itemValue as string) : null)}
                itemLabelArray={pickerItemLabels!}
                itemValueArray={pickerItems!}
                maxIndex={pickerItems!.length - 1}
              />
            ) : (
              <TextInput
                style={styles.input}
                value={item.value.toString()}
                editable={editable && !item.isOther}
                onChangeText={(value) => changeValue(index, value)}
              />
            )}
          </View>
          <View style={styles.td}>
            <Button
              style={{
                backgroundColor: COLOR.DARKRED,
                padding: 0,
              }}
              name="minus"
              disabled={!editable}
              onPress={() => deleteValue(index)}
            />
          </View>
        </View>
      ))}
    </>
  );
};

interface Props_ListButtons {
  editable: boolean;
  format: FormatType;
  addValue: (other?: boolean) => void;
}

const ListButtons = (props: Props_ListButtons) => {
  const { editable, format, addValue } = props;

  return (
    <View style={styles.button}>
      <Button backgroundColor={COLOR.GRAY2} name="plus" disabled={!editable} onPress={() => addValue(false)} />
      {(format === 'LIST' || format === 'CHECK' || format === 'RADIO') && (
        <TouchableOpacity style={{ margin: 5 }} disabled={!editable} onPress={() => addValue(true)}>
          <Text style={{ fontSize: 14, color: COLOR.BLUE }}>{t('common.addOther')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  button: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    margin: 10,
  },
  container: {
    flex: 1,
    justifyContent: 'flex-start',
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
    height: 60,
  },
  tr3: {
    backgroundColor: COLOR.GRAY1,
    borderColor: COLOR.GRAY1,
    borderWidth: 1,
    flexDirection: 'row',
    height: 30,
  },
});
