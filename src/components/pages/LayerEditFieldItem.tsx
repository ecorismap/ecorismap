import React, { useCallback, useContext, useEffect } from 'react';
import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { HeaderBackButton, HeaderBackButtonProps } from '@react-navigation/elements';
import { COLOR } from '../../constants/AppConstants';
import { Button, Picker, RectButton2, TextInput } from '../atoms';
import { t } from '../../i18n/config';
import { LayerEditFieldItemContext } from '../../contexts/LayerEditFieldItem';
import { FlatList, ScrollView } from 'react-native-gesture-handler';
import { CheckBox } from '../molecules/CheckBox';
import { Loading } from '../molecules/Loading';

export default function LayerEditFieldItemScreen() {
  const {
    isLoading,
    dictionaryData,
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
    useLastValue,
    pressImportDictionary,
    changeUseLastValue,
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
    (props_: JSX.IntrinsicAttributes & HeaderBackButtonProps) => (
      <HeaderBackButton {...props_} labelVisible={false} onPress={gotoBack} />
    ),
    [gotoBack]
  );
  const headerRightButton = useCallback(() => {
    return (
      <View style={styles.headerRight}>
        <Button
          name={'folder-open'}
          onPress={pressImportDictionary}
          tooltipText={t('LayerEditFieldItem.tooltip.importDictionaryData')}
        />
      </View>
    );
  }, [pressImportDictionary]);

  useEffect(() => {
    navigation.setOptions({
      headerLeft: (props_: JSX.IntrinsicAttributes & HeaderBackButtonProps) => headerLeftButton(props_),
      headerRight: () => headerRightButton(),
    });
  }, [headerLeftButton, headerRightButton, navigation]);

  if (itemFormat === 'STRING_DICTIONARY') {
    return (
      <View style={styles.container}>
        <Loading visible={isLoading} text="" />

        <FlatList
          data={dictionaryData}
          renderItem={({ item }) => (
            <View style={[styles.tr, { height: 30 }]}>
              <View style={[styles.td, { flex: 1, backgroundColor: COLOR.GRAY0 }]}>
                <Text style={[styles.title, { textAlign: 'left' }]}>{item}</Text>
              </View>
            </View>
          )}
          ListHeaderComponent={ListTitle}
          keyExtractor={(item) => item}
          stickyHeaderIndices={[0]}
          // initialNumToRender={1000}
          // removeClippedSubviews={false}
        />
      </View>
    );
  } else if (itemFormat === 'REFERENCE') {
    return (
      <View style={styles.container}>
        <View style={styles.tr3}>
          <View style={[styles.td3, { flex: 1 }]}>
            <Text style={[styles.title, { textAlign: 'center' }]}>{'reference layer'}</Text>
          </View>
          <View style={[styles.td3, { flex: 1 }]}>
            <Text style={[styles.title, { textAlign: 'center' }]}>{'reference field'}</Text>
          </View>
          <View style={[styles.td3, { flex: 1 }]}>
            <Text style={[styles.title, { textAlign: 'center' }]}>{'primary field'}</Text>
          </View>
        </View>
        <ScrollView>
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
        </ScrollView>
      </View>
    );
  } else {
    return (
      <View style={styles.container}>
        {(itemFormat === 'STRING' || itemFormat === 'INTEGER') && (
          <View style={styles.checkbox}>
            <CheckBox
              label={t('common.useLastValue')}
              labelSize={14}
              labelColor="black"
              width={300}
              checked={useLastValue}
              onCheck={changeUseLastValue}
            />
          </View>
        )}
        {!useLastValue && (
          <>
            <View style={styles.tr3}>
              <View style={[styles.td3, { flex: 4 }]}>
                <Text style={[styles.title, { textAlign: 'center' }]}>{`${t('common.value')}`}</Text>
              </View>
              <View style={styles.td3} />
              <View style={styles.td3} />
            </View>
            <ScrollView>
              {itemValues?.map((item, index: number) => (
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
              <ListButtons />
            </ScrollView>
          </>
        )}
      </View>
    );
  }
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

const ListTitle = () => (
  <View style={[styles.tr, { height: 35 }]}>
    <View style={[styles.td, { flex: 1, backgroundColor: COLOR.GRAY1 }]}>
      <View style={{ flex: 1 }}>
        <Text style={{ textAlign: 'center' }}>{t('LayerEditFieldItem.dictionaryData')}</Text>
      </View>
    </View>
  </View>
);

const styles = StyleSheet.create({
  button: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    margin: 10,
  },
  checkbox: {
    //backgroundColor: COLOR.BLUE,
    flexDirection: 'column',
    height: 45,
    //justifyContent: 'space-between',
    margin: 2,
    width: 180,
  },
  container: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  headerRight: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginRight: 10,
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
