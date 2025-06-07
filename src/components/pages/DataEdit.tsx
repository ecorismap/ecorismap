import React, { useCallback, useContext, useEffect } from 'react';
import { View, StyleSheet, KeyboardAvoidingView } from 'react-native';

import { DataEditButtons } from '../organisms/DataEditButtons';
import { DataEditPhoto } from '../organisms/DataEditPhoto';
import { DataEditCoords } from '../organisms/DataEditCoords';
import { DataEditNumber } from '../organisms/DataEditNumber';
import { DataEditLayerName } from '../organisms/DataEditLayerName';
import { DataEditList } from '../organisms/DataEditList';
import { DataEditCheck } from '../organisms/DataEditCheck';
import { DataEditRadio } from '../organisms/DataEditRadio';
import { useNavigation } from '@react-navigation/native';
import { HeaderBackButton, HeaderBackButtonProps } from '@react-navigation/elements';
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
import { DataEditUserName } from '../organisms/DataEditUserName';

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
    pressAddReferenceDataByDictinary,
    gotoBack,
    gotoReferenceData,
  } = useContext(DataEditContext);

  const navigation = useNavigation();
  const layers = useSelector((state: RootState) => state.layers);
  const headerForDevice = useCallback(
    (props_: JSX.IntrinsicAttributes & HeaderBackButtonProps) => (
      <View style={{ flexDirection: 'row', justifyContent: 'center', height: 63, backgroundColor: COLOR.MAIN }}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <HeaderBackButton
            {...props_}
            labelVisible={true}
            label={t('Data.navigation.title')}
            labelStyle={{ fontSize: 11 }}
            onPress={gotoBack}
            style={{ width: 80, marginLeft: 20 }}
          />
        </View>
        <View style={{ flex: 1 }}>
          {maxRecordNumber > 0 && (
            <DataEditRecordSelector
              recordNumber={recordNumber}
              maxRecordNumber={maxRecordNumber}
              onChangeRecord={onChangeRecord}
            />
          )}
        </View>
        <View style={{ flexDirection: 'row', flex: 1, justifyContent: 'flex-end', alignItems: 'center' }}>
          <View style={{ marginRight: 13 }}>
            <Button
              name={DATAEDIT_BTN.SAVE}
              onPress={pressSaveData}
              backgroundColor={isEditingRecord ? COLOR.BLUE : COLOR.LIGHTBLUE}
              disabled={!isEditingRecord}
              labelText={t('DataEdit.label.save')}
            />
          </View>
        </View>
      </View>
    ),
    [gotoBack, isEditingRecord, maxRecordNumber, onChangeRecord, pressSaveData, recordNumber]
  );

  const headerTitleButton = useCallback(
    () => (
      <View style={{ flexDirection: 'row' }}>
        {maxRecordNumber > 0 && (
          <DataEditRecordSelector
            recordNumber={recordNumber}
            maxRecordNumber={maxRecordNumber}
            onChangeRecord={onChangeRecord}
          />
        )}
      </View>
    ),
    [maxRecordNumber, onChangeRecord, recordNumber]
  );
  const headerLeftButton = useCallback(
    (props_: JSX.IntrinsicAttributes & HeaderBackButtonProps) => (
      <View style={{ flexDirection: 'row' }}>
        <HeaderBackButton {...props_} onPress={gotoBack} />
      </View>
    ),
    [gotoBack]
  );

  const headerRightButton = useCallback(
    () => (
      <View style={styles.headerRight}>
        <Button
          name={DATAEDIT_BTN.SAVE}
          onPress={pressSaveData}
          backgroundColor={isEditingRecord ? COLOR.BLUE : COLOR.LIGHTBLUE}
          disabled={!isEditingRecord}
        />
      </View>
    ),
    [isEditingRecord, pressSaveData]
  );

  useEffect(() => {
    navigation.setOptions({
      header: (props: JSX.IntrinsicAttributes & HeaderBackButtonProps) => headerForDevice(props),
    });
  }, [headerLeftButton, headerForDevice, headerRightButton, headerTitleButton, navigation]);
  //console.log(layer.name);
  return (
    <KeyboardAvoidingView style={styles.container} behavior={'padding'}>
      <ScrollView>
        {projectId && data.displayName && <DataEditUserName value={data.displayName} />}
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
                    pressAddReferenceDataByDictinary={pressAddReferenceDataByDictinary}
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
      <DataEditButtons />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  headerRight: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginRight: 10,
  },
});
