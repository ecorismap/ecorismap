import React, { useContext } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import { Button, Picker, TextInput } from '../atoms';
import { Pressable } from '../atoms/Pressable';
import { t } from '../../i18n/config';
import { LayerEditFieldItemContext } from '../../contexts/LayerEditFieldItem';
import { FlatList, ScrollView } from 'react-native-gesture-handler';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { CheckBox } from '../molecules/CheckBox';
import { Loading } from '../molecules/Loading';
import { DataEditTimeRange } from '../organisms/DataEditTimeRange';
import { BottomSheetHeader } from '../molecules/BottomSheetHeader';
import { hasCodeLink } from '../../utils/Layer';

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
    codeFieldId,
    codeFieldIds,
    codeFieldNames,
    pressImportDictionary,
    changeUseLastValue,
    changeCodeFieldId,
    changeCodeValue,
    changeCustomFieldReference,
    changeCustomFieldPrimary,
    changeValue,
    pressDeleteValue,
    gotoBack,
    pressListOrder,
  } = useContext(LayerEditFieldItemContext);
  const editable = true;

  const rightComponent =
    itemFormat === 'STRING_DICTIONARY' ? (
      <Button name={'folder-open'} onPress={pressImportDictionary} labelText={t('LayerEdit.label.dictionaty')} />
    ) : undefined;

  if (itemFormat === 'STRING_DICTIONARY') {
    return (
      <View style={styles.container}>
        <BottomSheetHeader
          title={t('LayerEditFieldItem.navigation.title')}
          showBackButton
          onBack={gotoBack}
          rightComponent={rightComponent}
        />
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
          initialNumToRender={1000}
          removeClippedSubviews={false}
        />
      </View>
    );
  } else if (itemFormat === 'REFERENCE') {
    return (
      <View style={styles.container}>
        <BottomSheetHeader title={t('LayerEditFieldItem.navigation.title')} showBackButton onBack={gotoBack} />
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
    //連動先が未設定でも、既に入れてあるコードは見えるようにする（設定を消しただけで値が消えたように見せない）
    const withCode =
      hasCodeLink(itemFormat) && (codeFieldId !== '' || itemValues.some((v) => (v.customFieldValue ?? '') !== ''));

    return (
      <View style={styles.container}>
        <BottomSheetHeader title={t('LayerEditFieldItem.navigation.title')} showBackButton onBack={gotoBack} />
        {(itemFormat === 'STRING' ||
          itemFormat === 'INTEGER' ||
          itemFormat === 'LIST' ||
          itemFormat === 'DATESTRING' ||
          itemFormat === 'TIMERANGE') && (
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
        {hasCodeLink(itemFormat) && (
          <View style={styles.tr}>
            <View style={[styles.td, { flex: 1 }]}>
              <Picker
                label={t('common.codeField')}
                selectedValue={codeFieldId}
                onValueChange={(itemValue) => changeCodeFieldId(itemValue as string)}
                itemLabelArray={codeFieldNames}
                itemValueArray={codeFieldIds}
                maxIndex={codeFieldIds.length - 1}
              />
            </View>
          </View>
        )}
        {(!useLastValue || itemFormat === 'LIST') && (
          <>
            {/* 幅が足りないと値・コードが省略されるので、レイヤ設定のフィールド表と同じく横スクロールにする */}
            {/* 縦スクロールを内側に入れるので、外枠の高さをflexで確定させておく */}
            <ScrollView horizontal={true} style={styles.hScroll} contentContainerStyle={{ flexGrow: 1 }}>
              <View style={styles.table}>
                <View style={styles.tr3}>
                  <View style={[styles.td3, withCode ? styles.valueCell : styles.wideValueCell]}>
                    <Text style={[styles.title, { textAlign: 'center' }]}>{`${t('common.value')}`}</Text>
                  </View>
                  {withCode && (
                    <View style={[styles.td3, styles.valueCell]}>
                      <Text style={[styles.title, { textAlign: 'center' }]}>{`${t('common.code')}`}</Text>
                    </View>
                  )}
                  <View style={[styles.td3, styles.buttonCell]} />
                  <View style={[styles.td3, styles.buttonCell]} />
                </View>
                {/* 縦スクロールはBottomSheetScrollView。素のScrollViewだとシートのドラッグに
                    ジェスチャーを奪われ、一度奪われるとスクロールできなくなる。
                    flex:1が無いと中身の高さのままレイアウトされ、スクロール範囲も出ない */}
                <BottomSheetScrollView style={styles.vScroll}>
                  {itemValues?.map((item, index: number) =>
                    itemFormat === 'TIMERANGE' ? (
                      <DataEditTimeRange
                        key={index}
                        name={'time'}
                        mode={'time'}
                        value={itemValues[0] ? itemValues[0].value.toString() : ''}
                        onValueChange={(value) => changeValue(0, value)}
                      />
                    ) : (
                      <View key={index} style={styles.tr}>
                        <View style={[styles.td, withCode ? styles.valueCell : styles.wideValueCell]}>
                          <TextInput
                            style={styles.input}
                            value={item.value.toString()}
                            editable={editable && !item.isOther}
                            onChangeText={(value: string) => changeValue(index, value)}
                          />
                        </View>
                        {withCode && (
                          <View style={[styles.td, styles.valueCell]}>
                            {/* 「その他」は自由入力なので対応するコードが決められない */}
                            {!item.isOther && (
                              <TextInput
                                style={styles.input}
                                value={(item.customFieldValue ?? '').toString()}
                                editable={editable}
                                onChangeText={(value: string) => changeCodeValue(index, value)}
                              />
                            )}
                          </View>
                        )}
                        <View style={[styles.td, styles.buttonCell]}>
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
                        <View style={[styles.td, styles.buttonCell]}>
                          <Button
                            name="chevron-double-up"
                            onPress={() => pressListOrder(index)}
                            color={COLOR.GRAY2}
                            style={{ backgroundColor: COLOR.MAIN }}
                          />
                        </View>
                      </View>
                    )
                  )}
                </BottomSheetScrollView>
              </View>
            </ScrollView>
            {/* 追加ボタンは横スクロールの外に置き、列を動かしても位置が変わらないようにする */}
            <ListButtons />
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
      itemFormat === 'DECIMAL' ||
      itemFormat === 'TIMERANGE') &&
      itemValues.length < 1) ||
    itemFormat === 'LIST' ||
    itemFormat === 'CHECK' ||
    itemFormat === 'TABLE' ||
    itemFormat === 'LISTTABLE' ||
    itemFormat === 'RADIO';
  return editable ? (
    <View style={styles.button}>
      <Button
        backgroundColor={COLOR.BLUE}
        name="plus"
        disabled={!editable}
        onPress={() => pressAddValue(false)}
        labelText={t('LayerEditFieldItem.label.addValue')}
      />
      {(itemFormat === 'LIST' || itemFormat === 'CHECK' || itemFormat === 'RADIO') && (
        <Pressable style={{ margin: 5 }} disabled={!editable} onPress={() => pressAddValue(true)}>
          <Text style={{ fontSize: 14, color: COLOR.BLUE }}>{`${t('common.addOther')}`}</Text>
        </Pressable>
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
  //widthは幅が足りないときの最小幅（横スクロールになる）。flexは広い画面で伸ばすため
  buttonCell: {
    flex: 2,
    width: 50,
  },
  //コードは値と同じ幅にする
  valueCell: {
    flex: 6,
    width: 150,
  },
  wideValueCell: {
    flex: 8,
    width: 200,
  },
  hScroll: {
    flex: 1,
  },
  table: {
    flex: 1,
    flexDirection: 'column',
  },
  vScroll: {
    flex: 1,
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
