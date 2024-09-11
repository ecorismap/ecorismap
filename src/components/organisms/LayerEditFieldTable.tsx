import React, { useMemo, useContext } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';

import { COLOR, DATAFORMAT } from '../../constants/AppConstants';
import { LayerEditContext } from '../../contexts/LayerEdit';
import { t } from '../../i18n/config';
import { FormatType } from '../../types';
import { Button, Picker, RectButton2 } from '../atoms';
import { FlatList } from 'react-native-gesture-handler';
import { CheckBox } from '../molecules/CheckBox';

export const LayerEditFieldTitle = () => {
  const { pressAddField } = useContext(LayerEditContext);
  const editable = true;
  return (
    <View style={styles.tr3}>
      <View style={[styles.td3, { flex: 6, width: 150 }]}>
        <Text style={[styles.title, { textAlign: 'center' }]}>{`${t('common.fieldName')}`}</Text>
      </View>
      <View style={[styles.td3, { flex: 7, width: 175 }]}>
        <Text style={[styles.title, { textAlign: 'center' }]}>{`${t('common.dataFormat')}`}</Text>
      </View>
      <View style={[styles.td3, { flex: 3, width: 75 }]}>
        <Text style={[styles.title, { textAlign: 'center' }]}>{`${t('common.setValue')}`}</Text>
      </View>
      <View style={[styles.td3, { flex: 4, width: 100 }]}>
        <Text style={[styles.title, { textAlign: 'center' }]}>{`${t('common.option')}`}</Text>
      </View>
      <View style={[styles.td3, { flex: 3, width: 75 }]}>
        {/* <Text style={[styles.title, { textAlign: 'center' }]}>{`${t('common.delete')}`}</Text> */}
      </View>
      <View style={[styles.td3, { flex: 2, width: 50 }]}>
        <Button
          style={{
            backgroundColor: COLOR.GRAY3,
            padding: 0,
          }}
          name="plus"
          disabled={!editable}
          onPress={pressAddField}
        />
      </View>
    </View>
  );
};

export const LayerEditFieldTable = () => {
  const {
    layer,
    onChangeFieldOrder,
    onChangeFieldName,
    onChangeOption,
    submitFieldName,
    onChangeFieldFormat,
    pressDeleteField,
    gotoLayerEditFieldItem,
  } = useContext(LayerEditContext);
  const editable = true;
  const formatTypeValues = useMemo(() => Object.keys(DATAFORMAT), []);
  const formatTypeLabels = useMemo(() => Object.values(DATAFORMAT), []);

  return (
    <View style={{ flexDirection: 'column', flex: 1, marginBottom: 10 }}>
      <FlatList
        data={layer.field}
        initialNumToRender={layer.field.length}
        keyExtractor={(item) => item.id}
        removeClippedSubviews={false}
        renderItem={({ item, index }) => {
          return (
            <View key={index} style={styles.tr}>
              <View style={[styles.td, { flex: 6, borderRightWidth: 1, width: 150 }]}>
                <TextInput
                  style={styles.input}
                  value={item.name}
                  editable={editable}
                  onChangeText={(val: string) => onChangeFieldName(index, val)}
                  onEndEditing={() => submitFieldName(index)}
                  onBlur={() => submitFieldName(index)}
                  //multiline={true}
                />
              </View>
              <View style={[styles.td, { flex: 7, width: 175 }]}>
                <Picker
                  enabled={editable}
                  selectedValue={item.format}
                  onValueChange={(itemValue) => (editable ? onChangeFieldFormat(index, itemValue as FormatType) : null)}
                  itemLabelArray={formatTypeLabels}
                  itemValueArray={formatTypeValues}
                  maxIndex={formatTypeValues.length - 1}
                />
              </View>
              <View style={[styles.td, { flex: 3, width: 75 }]}>
                {(item.format === 'LIST' ||
                  item.format === 'RADIO' ||
                  item.format === 'CHECK' ||
                  item.format === 'STRING' ||
                  item.format === 'STRING_MULTI' ||
                  item.format === 'STRING_DICTIONARY' ||
                  item.format === 'INTEGER' ||
                  item.format === 'REFERENCE' ||
                  item.format === 'TABLE' ||
                  item.format === 'LISTTABLE') && (
                  <Button
                    style={{
                      //color: COLOR.BLACK,
                      backgroundColor: COLOR.GRAY4,
                      padding: 0,
                    }}
                    name="play"
                    size={16}
                    onPress={() => gotoLayerEditFieldItem(index, item)}
                  />
                )}
              </View>
              <View style={[styles.td, { flex: 4, width: 100 }]}>
                {item.format === 'STRING_DICTIONARY' && (
                  <CheckBox
                    label={t('common.useAdd')}
                    labelSize={11}
                    width={95}
                    numberOfLines={2}
                    checked={item.useDictionaryAdd ?? false}
                    onCheck={(checked) => onChangeOption(index, checked)}
                    disabled={!editable}
                  />
                )}
              </View>
              <View style={[styles.td, { flex: 3, width: 75 }]}>
                <RectButton2
                  name="chevron-double-up"
                  disabled={!editable}
                  onPress={() => onChangeFieldOrder(index)}
                  color={COLOR.GRAY2}
                />
              </View>
              <View style={[styles.td, { flex: 2, width: 50 }]}>
                <Button
                  style={{
                    backgroundColor: COLOR.DARKRED,
                    padding: 0,
                  }}
                  name="minus"
                  size={16}
                  disabled={!editable}
                  onPress={() => pressDeleteField(index)}
                />
              </View>
            </View>
          );
        }}
        ListHeaderComponent={<LayerEditFieldTitle />}
        disableVirtualization={true}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  input: {
    backgroundColor: COLOR.GRAY0,
    borderRadius: 5,
    flex: 1,
    fontSize: 16,
    height: 40,
    maxWidth: 130,
    paddingHorizontal: 5,
    paddingLeft: 10,
    textAlignVertical: 'center',
  },

  td: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: COLOR.GRAY2,
    //flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 5,
    paddingVertical: 0,
  },

  td3: {
    //flex: 1,
    alignItems: 'center',
    borderColor: COLOR.GRAY2,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  title: {
    color: COLOR.GRAY3,
    flex: 1,
    fontSize: 12,
  },
  tr: {
    flexDirection: 'row',
    flex: 1,
    height: 65,
  },

  tr3: {
    backgroundColor: COLOR.GRAY1,
    borderBottomWidth: 1,
    borderColor: COLOR.GRAY1,
    flexDirection: 'row',
    height: 50,
  },
});
