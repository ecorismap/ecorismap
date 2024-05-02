import React, { useCallback, useContext, useEffect } from 'react';
import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { HeaderBackButton, HeaderBackButtonProps } from '@react-navigation/elements';
import { COLOR } from '../../constants/AppConstants';
import { Button, Picker, RectButton2, TextInput } from '../atoms';
import { t } from '../../i18n/config';
import { LayerEditFieldItemContext } from '../../contexts/LayerEditFieldItem';
import { ScrollView } from 'react-native-gesture-handler';

export default function LayerEditFieldItemScreen() {
  const {
    itemValues,
    itemFormat,
    pickerValues,
    refLayerIds,
    refLayerNames,
    refFieldNames,
    primaryFieldNames,
    refFieldValues,
    primaryFieldValues,
    customFieldReference,
    customFieldPrimary,
    changeCustomFieldReference,
    changeCustomFieldPrimary,
    changeValue,
    pressDeleteValue,
    gotoBack,
    pressListOrder,
  } = useContext(LayerEditFieldItemContext);
  const navigation = useNavigation();
  const editable = true;
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
              <Text style={[styles.title, { textAlign: 'center' }]}>{`${t('common.value')}`}</Text>
            </View>
            <View style={styles.td3} />
            <View style={styles.td3} />
          </>
        )}
      </View>
      <ScrollView>
        {itemFormat === 'REFERENCE' && (
          <>
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
                  enabled={pickerValues[0] !== ''}
                  selectedValue={pickerValues[1]}
                  onValueChange={(itemValue) => changeValue(1, itemValue as string)}
                  itemLabelArray={refFieldNames}
                  itemValueArray={refFieldValues}
                  maxIndex={refFieldNames.length - 1}
                />
                <Picker
                  enabled={editable}
                  selectedValue={pickerValues[2]}
                  onValueChange={(itemValue) => changeValue(2, itemValue as string)}
                  itemLabelArray={primaryFieldNames}
                  itemValueArray={primaryFieldValues}
                  maxIndex={primaryFieldNames.length - 1}
                />
              </View>
            </View>
            <View style={styles.tr}>
              <View style={[styles.td, { flex: 3 }]}>
                <View style={[styles.td, { borderBottomWidth: 0, borderLeftWidth: 1, borderRightWidth: 1 }]} />
                <View style={[styles.td, { borderBottomWidth: 0, borderLeftWidth: 1, borderRightWidth: 1 }]}>
                  {pickerValues[1] === '__CUSTOM' && (
                    <TextInput
                      label={t('common.customField')}
                      placeholder={'field1|field2'}
                      placeholderTextColor={COLOR.GRAY3}
                      value={customFieldReference}
                      onChangeText={changeCustomFieldReference}
                      style={styles.input}
                      editable={true}
                    />
                  )}
                </View>
                <View style={[styles.td, { borderBottomWidth: 0, borderLeftWidth: 1, borderRightWidth: 1 }]}>
                  {pickerValues[2] === '__CUSTOM' && (
                    <TextInput
                      label={t('common.customField')}
                      placeholder={'field1|field2'}
                      placeholderTextColor={COLOR.GRAY3}
                      value={customFieldPrimary}
                      onChangeText={changeCustomFieldPrimary}
                      style={styles.input}
                      editable={true}
                    />
                  )}
                </View>
              </View>
            </View>
          </>
        )}

        {itemFormat !== 'REFERENCE' &&
          itemValues?.map((item, index: number) => (
            <View key={index} style={styles.tr}>
              <View style={[styles.td, { flex: 4 }]}>
                <TextInput
                  style={styles.input}
                  value={item.value.toString()}
                  editable={editable && !item.isOther}
                  onChangeText={(value: string) => changeValue(index, value)}
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
              <View style={styles.td}>
                <RectButton2 name="chevron-double-up" onPress={() => pressListOrder(index)} color={COLOR.GRAY2} />
              </View>
            </View>
          ))}
        {itemFormat !== 'REFERENCE' && <ListButtons />}
      </ScrollView>
    </View>
  );
}

const ListButtons = () => {
  const { itemFormat, itemValues, pressAddValue } = useContext(LayerEditFieldItemContext);
  const editable =
    ((itemFormat === 'STRING' ||
      itemFormat === 'STRING_MULTI' ||
      itemFormat === 'INTEGER' ||
      itemFormat === 'DECIMAL') &&
      itemValues.length < 1) ||
    itemFormat === 'LIST' ||
    itemFormat === 'CHECK' ||
    itemFormat === 'TABLE' ||
    itemFormat === 'LISTTABLE' ||
    itemFormat === 'RADIO';
  return editable ? (
    <View style={styles.button}>
      <Button backgroundColor={COLOR.GRAY2} name="plus" disabled={!editable} onPress={() => pressAddValue(false)} />
      {(itemFormat === 'LIST' || itemFormat === 'CHECK' || itemFormat === 'RADIO') && (
        <TouchableOpacity style={{ margin: 5 }} disabled={!editable} onPress={() => pressAddValue(true)}>
          <Text style={{ fontSize: 14, color: COLOR.BLUE }}>{`${t('common.addOther')}`}</Text>
        </TouchableOpacity>
      )}
    </View>
  ) : null;
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
    backgroundColor: COLOR.GRAY0,
    borderRadius: 5,
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
    height: 70,
  },
  tr3: {
    backgroundColor: COLOR.GRAY1,
    borderColor: COLOR.GRAY1,
    borderWidth: 1,
    flexDirection: 'row',
    height: 30,
  },
});
