import React, { useContext, useMemo } from 'react';
import { View, StyleSheet, KeyboardAvoidingView } from 'react-native';

import { DataEditButtons } from '../organisms/DataEditButtons';
import { DataEditPhoto } from '../organisms/DataEditPhoto';
import { DataEditCoords } from '../organisms/DataEditCoords';
import { DataEditNumber } from '../organisms/DataEditNumber';
import { DataEditLayerName } from '../organisms/DataEditLayerName';
import { DataEditList } from '../organisms/DataEditList';
import { DataEditCheck } from '../organisms/DataEditCheck';
import { DataEditRadio } from '../organisms/DataEditRadio';
import { DataEditDatetime } from '../organisms/DataEditDatetime';
import { DataEditReference } from '../organisms/DataEditReference';
import { DataEditRecordSelector } from '../organisms/DataEditRecordSelector';
import { DataEditTable } from '../organisms/DataEditTable';
import { DataEditListTable } from '../organisms/DataEditListTable';
import { DataEditNumberRange } from '../organisms/DataEditNumberRange';
import { DataEditString } from '../organisms/DataEditString';
import { DataEditTimeRange } from '../organisms/DataEditTimeRange';
import { t } from '../../i18n/config';
import { DataEditContext } from '../../contexts/DataEdit';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { ScrollView } from 'react-native-gesture-handler';
import { Button } from '../atoms';
import { COLOR, DATAEDIT_BTN } from '../../constants/AppConstants';
import { DataEditDictionary } from '../organisms/DataEditDictionary';
import { DataEditDynamicDictionary } from '../organisms/DataEditDynamicDictionary';
import { DataEditUserName } from '../organisms/DataEditUserName';
import { BottomSheetHeader } from '../molecules/BottomSheetHeader';
import { resolveCodeField } from '../../utils/Layer';

export default function DataEditScreen() {
  // console.log('render DataEdit');
  const {
    layer,
    data,
    latlon,
    isDecimal,
    recordNumber,
    maxRecordNumber,
    isEditingRecord,
    projectId,
    pressSaveData,
    changeLatLonType,
    changeLatLon,
    changeField,
    submitField,
    onChangeRecord,
    pressAddReferenceData,
    pressAddReferenceDataByDictionary,
    gotoBack,
    gotoReferenceData,
  } = useContext(DataEditContext);

  const layers = useSelector((state: RootState) => state.layers);

  //コードの入れ先は選択肢から自動で入る項目なので、手入力させない。
  //直接書き換えられると区分と表記が食い違い、しかも区分を変えた時点で黙って上書きされる
  const codeFieldIds = useMemo(
    () =>
      new Set(layer.field.map((f) => resolveCodeField(layer, f)?.id).filter((id): id is string => id !== undefined)),
    [layer]
  );

  const centerComponent =
    maxRecordNumber > 0 ? (
      <DataEditRecordSelector
        recordNumber={recordNumber}
        maxRecordNumber={maxRecordNumber}
        onChangeRecord={onChangeRecord}
      />
    ) : undefined;

  const rightComponent = (
    <Button
      name={DATAEDIT_BTN.SAVE}
      onPress={pressSaveData}
      backgroundColor={isEditingRecord ? COLOR.BLUE : COLOR.LIGHTBLUE}
      disabled={!isEditingRecord}
      labelText={t('DataEdit.label.save')}
    />
  );

  return (
    <KeyboardAvoidingView style={styles.container} behavior={'padding'}>
      <BottomSheetHeader
        title={t('DataEdit.navigation.title')}
        showBackButton
        onBack={gotoBack}
        centerComponent={centerComponent}
        rightComponent={rightComponent}
      />
      <View style={styles.contentContainer}>
        {/* flex:1で高さを親に合わせる。付けないとScrollView自体が中身の高さになり、
            はみ出した分はシートに切られたまま「引っ張っても戻る」だけでスクロールできない。
            キーボード表示中でも辞書候補などのタップが1回で反応するようhandledを指定 */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {projectId && data.displayName && layer.permission !== 'COMMON' && (
            <DataEditUserName value={data.displayName} />
          )}
          <DataEditLayerName value={layer.name} />

          {layer.field.map(({ id, name, format, list }, index) => {
            switch (format) {
              case 'PHOTO':
                return (
                  <View key={index}>
                    <DataEditPhoto fieldName={name} />
                  </View>
                );
              case 'STRING':
                return (
                  <DataEditString
                    key={index}
                    name={name}
                    value={data.field[name] as string | number | undefined}
                    editable={!codeFieldIds.has(id)}
                    onChangeText={(value) => changeField(name, value)}
                    onEndEditing={() => submitField(name, format)}
                  />
                );
              case 'STRING_MULTI':
                return (
                  <DataEditString
                    key={index}
                    name={name}
                    multiline={true}
                    value={data.field[name] as string | number | undefined}
                    editable={!codeFieldIds.has(id)}
                    onChangeText={(value) => changeField(name, value)}
                    onEndEditing={() => submitField(name, format)}
                  />
                );
              case 'STRING_DICTIONARY':
                return (
                  <DataEditDictionary
                    key={index}
                    name={name}
                    value={data.field[name] as string | number | undefined}
                    table={`_${layer.id}_${id}`}
                    onChangeText={changeField}
                    onEndEditing={() => submitField(name, format)}
                  />
                );
              case 'STRING_DYNAMIC':
                return (
                  <DataEditDynamicDictionary
                    key={index}
                    name={name}
                    value={data.field[name] as string | number | undefined}
                    layerId={layer.id}
                    fieldId={id}
                    onChangeText={changeField}
                    onEndEditing={() => submitField(name, format)}
                  />
                );
              case 'DATETIME':
                return (
                  <DataEditDatetime
                    key={index}
                    name={name}
                    mode={'datetime'}
                    value={data.field[name] as string}
                    onValueChange={(value) => changeField(name, value as string)}
                  />
                );
              case 'DATESTRING':
                return (
                  <DataEditDatetime
                    key={index}
                    name={name}
                    mode={'date'}
                    value={data.field[name] as string}
                    onValueChange={(value) => changeField(name, value as string)}
                  />
                );
              case 'TIMESTRING':
                return (
                  <DataEditDatetime
                    key={index}
                    name={name}
                    mode={'time'}
                    value={data.field[name] as string}
                    onValueChange={(value) => changeField(name, value as string)}
                  />
                );
              case 'TIMERANGE':
                return (
                  <DataEditTimeRange
                    key={index}
                    name={name}
                    mode={'time'}
                    value={data.field[name] as string}
                    onValueChange={(value) => changeField(name, value as string)}
                  />
                );
              case 'LIST':
                return (
                  list && (
                    <DataEditList
                      key={index}
                      name={name}
                      value={data.field[name] as string | number | undefined}
                      listItems={list}
                      onValueChange={(value) => changeField(name, value as string)}
                    />
                  )
                );
              case 'CHECK':
                return (
                  list && (
                    <DataEditCheck
                      key={index}
                      name={name}
                      value={data.field[name] as string}
                      checkItems={list}
                      onValueChange={(value) => changeField(name, value)}
                    />
                  )
                );
              case 'RADIO':
                return (
                  list && (
                    <DataEditRadio
                      key={index}
                      name={name}
                      value={data.field[name] as string}
                      checkItems={list}
                      onValueChange={(value) => changeField(name, value)}
                    />
                  )
                );
              case 'SERIAL':
                return (
                  <DataEditNumber
                    key={index}
                    name={name}
                    type={format}
                    value={data.field[name] as number}
                    onChangeText={changeField}
                    onEndEditing={() => submitField(name, format)}
                  />
                );
              case 'INTEGER':
                return (
                  <DataEditNumber
                    key={index}
                    name={name}
                    type={format}
                    value={data.field[name] as number}
                    editable={!codeFieldIds.has(id)}
                    onChangeText={changeField}
                    onEndEditing={() => submitField(name, format)}
                  />
                );
              case 'DECIMAL':
                return (
                  <DataEditNumber
                    key={index}
                    name={name}
                    type={format}
                    value={data.field[name] as number}
                    editable={!codeFieldIds.has(id)}
                    onChangeText={changeField}
                    onEndEditing={() => submitField(name, format)}
                  />
                );
              case 'NUMBERRANGE':
                return (
                  <DataEditNumberRange
                    key={index}
                    name={name}
                    value={data.field[name] as string}
                    onChangeText={changeField}
                  />
                );
              case 'REFERENCE':
                const refLayerId = list && list[0] && list[0].value;
                const refLayer = layers.find((l) => l.id === refLayerId);
                return (
                  refLayer && (
                    <DataEditReference
                      key={index}
                      name={name}
                      list={list}
                      refLayer={refLayer}
                      onPress={gotoReferenceData}
                      pressAddReferenceData={pressAddReferenceData}
                      pressAddReferenceDataByDictionary={pressAddReferenceDataByDictionary}
                    />
                  )
                );
              case 'TABLE':
                return (
                  list && (
                    <DataEditTable
                      key={index}
                      name={name}
                      value={data.field[name] as string}
                      list={list}
                      onChangeValue={changeField}
                    />
                  )
                );
              case 'LISTTABLE':
                return (
                  list && (
                    <DataEditListTable
                      key={index}
                      name={name}
                      value={data.field[name] as string}
                      listItems={list}
                      onChangeValue={changeField}
                    />
                  )
                );
              default:
                return null;
            }
          })}
          {layer.type === 'POINT' && latlon && (
            <>
              <DataEditCoords
                label={t('common.longitude')}
                latlon={latlon}
                latlonType="longitude"
                isDecimal={isDecimal}
                changeLatLonType={changeLatLonType}
                onChangeText={changeLatLon}
              />
              <DataEditCoords
                label={t('common.latitude')}
                latlon={latlon}
                latlonType="latitude"
                isDecimal={isDecimal}
                changeLatLonType={changeLatLonType}
                onChangeText={changeLatLon}
              />
            </>
          )}
        </ScrollView>
      </View>
      <DataEditButtons />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  //最後の項目が下端に貼り付かないよう、少し余白を残す
  scrollContent: {
    paddingBottom: 20,
  },
});
