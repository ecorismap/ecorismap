import React, { useMemo, useContext } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput } from 'react-native';

import { COLOR, DATAFORMAT } from '../../constants/AppConstants';
import { LayerEditContext } from '../../contexts/LayerEdit';
import { t } from '../../i18n/config';
import { FormatType } from '../../types';
import { Button, Picker, RectButton2 } from '../atoms';

export const LayerEditFieldTitle = () => {
  const { pressAddField } = useContext(LayerEditContext);
  const editable = true;
  return (
    <View style={styles.tr3}>
      <View style={[styles.td3, { flex: 6 }]}>
        <Text style={[styles.title, { textAlign: 'center' }]}>{`${t('common.fieldName')}`}</Text>
      </View>
      <View style={[styles.td3, { flex: 8 }]}>
        <Text style={[styles.title, { textAlign: 'center' }]}>{`${t('common.dataFormat')}`}</Text>
      </View>
      <View style={[styles.td3, { flex: 2 }]} />
      <View style={[styles.td3, { flex: 2 }]}>
        <Text style={[styles.title, { textAlign: 'center' }]}>{`${t('common.setValue')}`}</Text>
      </View>
      <View style={[styles.td3, { flex: 2 }]}>
        <Button
          style={{
            backgroundColor: COLOR.GRAY3,
            padding: 0,
          }}
          size={30}
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
    submitFieldName,
    onChangeFieldFormat,
    pressDeleteField,
    gotoLayerEditFieldItem,
  } = useContext(LayerEditContext);
  const editable = true;
  const formatTypeValues = useMemo(() => Object.keys(DATAFORMAT), []);
  const formatTypeLabels = useMemo(() => Object.values(DATAFORMAT), []);

  return (
    <FlatList
      data={layer.field}
      initialNumToRender={layer.field.length}
      keyExtractor={(item) => item.id}
      removeClippedSubviews={false}
      renderItem={({ item, index }) => {
        return (
          <View key={index} style={styles.tr}>
            <View style={[styles.td, { flex: 6, borderRightWidth: 1 }]}>
              <TextInput
                style={styles.input}
                value={item.name}
                editable={editable}
                onChangeText={(val: string) => onChangeFieldName(index!, val)}
                onEndEditing={() => submitFieldName(index!)}
                onBlur={() => submitFieldName(index!)}
                //multiline={true}
              />
            </View>
            <View style={[styles.td, { flex: 8 }]}>
              <Picker
                enabled={editable}
                selectedValue={item.format}
                onValueChange={(itemValue) => (editable ? onChangeFieldFormat(index!, itemValue as FormatType) : null)}
                itemLabelArray={formatTypeLabels}
                itemValueArray={formatTypeValues}
                maxIndex={formatTypeValues.length - 1}
              />
            </View>
            <View style={[styles.td, { flex: 2 }]}>
              <Button
                style={{
                  backgroundColor: COLOR.DARKRED,
                  padding: 0,
                }}
                name="minus"
                disabled={!editable}
                onPress={() => pressDeleteField(index!)}
              />
            </View>
            <View style={[styles.td, { flex: 2 }]}>
              {(item.format === 'LIST' ||
                item.format === 'RADIO' ||
                item.format === 'CHECK' ||
                item.format === 'STRING' ||
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
                  onPress={() => gotoLayerEditFieldItem(index!, item)}
                />
              )}
            </View>
            <View style={[styles.td, { flex: 2 }]}>
              <RectButton2 name="chevron-double-up" disabled={!editable} onPress={() => onChangeFieldOrder(index)} />
            </View>
          </View>
        );
      }}
    />
  );
};

const styles = StyleSheet.create({
  input: {
    backgroundColor: COLOR.GRAY0,
    borderRadius: 5,
    flex: 2,
    fontSize: 16,
    height: 40,
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
