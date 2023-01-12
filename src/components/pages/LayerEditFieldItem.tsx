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
  pickerValues: string[];
  refLayerIds: LayerType['id'][];
  refLayerNames: LayerType['name'][];
  refFieldNames: string[];
  primaryFieldNames: string[];
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
    pickerValues,
    refLayerIds,
    refLayerNames,
    refFieldNames,
    primaryFieldNames,
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
      <View style={styles.tr3}>
        {itemFormat === 'REFERENCE' ? (
          <>
            <View style={[styles.td3, { flex: 1 }]}>
              <Text style={[styles.title, { textAlign: 'center' }]}>{'reference layer'}</Text>
            </View>
            <View style={[styles.td3, { flex: 1 }]}>
              <Text style={[styles.title, { textAlign: 'center' }]}>{'reference field'}</Text>
            </View>
            <View style={[styles.td3, { flex: 1 }]}>
              <Text style={[styles.title, { textAlign: 'center' }]}>{'primary field'}</Text>
            </View>
          </>
        ) : (
          <>
            <View style={[styles.td3, { flex: 4 }]}>
              <Text style={[styles.title, { textAlign: 'center' }]}>{t('common.value')}</Text>
            </View>
            <View style={styles.td3} />
          </>
        )}
      </View>
      <ScrollView>
        {itemFormat === 'REFERENCE' && (
          <View style={styles.tr}>
            <View style={[styles.td, { flex: 3 }]}>
              <Picker
                enabled={editable}
                selectedValue={pickerValues[0]}
                onValueChange={(itemValue) => changeValue(0, itemValue as string)}
                itemLabelArray={refLayerNames}
                itemValueArray={refLayerIds}
                maxIndex={refLayerIds.length - 1}
              />
              <Picker
                enabled={editable}
                selectedValue={pickerValues[1]}
                onValueChange={(itemValue) => changeValue(1, itemValue as string)}
                itemLabelArray={refFieldNames}
                itemValueArray={refFieldNames}
                maxIndex={refFieldNames.length - 1}
              />
              <Picker
                enabled={editable}
                selectedValue={pickerValues[2]}
                onValueChange={(itemValue) => changeValue(2, itemValue as string)}
                itemLabelArray={primaryFieldNames}
                itemValueArray={primaryFieldNames}
                maxIndex={primaryFieldNames.length - 1}
              />
            </View>
          </View>
        )}

        {itemFormat !== 'REFERENCE' &&
          itemValues?.map((item, index: number) => (
            <View key={index} style={styles.tr}>
              <View style={[styles.td, { flex: 4 }]}>
                <TextInput
                  style={styles.input}
                  value={item.value.toString()}
                  editable={editable && !item.isOther}
                  onChangeText={(value) => changeValue(index, value)}
                />
              </View>
              <View style={styles.td}>
                <Button
                  style={{
                    backgroundColor: COLOR.DARKRED,
                    padding: 0,
                  }}
                  name="minus"
                  disabled={!editable}
                  onPress={() => pressDeleteValue(index)}
                />
              </View>
            </View>
          ))}
        {itemFormat !== 'STRING' &&
          itemFormat !== 'INTEGER' &&
          itemFormat !== 'DECIMAL' &&
          itemFormat !== 'REFERENCE' && (
            <ListButtons editable={editable} format={itemFormat} addValue={pressAddValue} />
          )}
      </ScrollView>
    </View>
  );
}

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
