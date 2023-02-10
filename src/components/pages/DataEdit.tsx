import React, { useCallback, useContext, useEffect } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';

import { COLOR, NAV_BTN } from '../../constants/AppConstants';
import HeaderRightButton from '../molecules/HeaderRightButton';
import { DataEditModalPhotoView } from '../organisms/DataEditModalPhotoView';
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
import { useScreen } from '../../hooks/useScreen';
import { DataEditRecordSelector } from '../organisms/DataEditRecordSelector';
import { DataEditTable } from '../organisms/DataEditTable';
import { useSelector } from 'react-redux';
import { AppState } from '../../modules';
import { DataEditListTable } from '../organisms/DataEditListTable';
import { DataEditNumberRange } from '../organisms/DataEditNumberRange';
import { DataEditString } from '../organisms/DataEditString';
import { DataEditTimeRange } from '../organisms/DataEditTimeRange';
import { t } from '../../i18n/config';
import { DataEditContext } from '../../contexts/DataEdit';

export default function DataEditScreen() {
  // console.log('render DataEdit');
  const {
    layer,
    data,
    latlon,
    isEditingRecord,
    isDecimal,
    recordNumber,
    maxRecordNumber,
    changeLatLonType,
    changeLatLon,
    changeField,
    submitField,
    onChangeRecord,
    pressAddReferenceData,
    gotoBack,
    gotoReferenceData,
    onClose,
  } = useContext(DataEditContext);

  const { screenState, expandData, openData } = useScreen();
  const navigation = useNavigation();
  const layers = useSelector((state: AppState) => state.layers);

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

  const headerRightButton = useCallback(() => {
    return (
      <View style={{ flexDirection: 'row' }}>
        <HeaderRightButton
          name={screenState === 'opened' ? NAV_BTN.EXPAND : NAV_BTN.COLLAPSE}
          backgroundColor={COLOR.GRAY0}
          onPress={screenState === 'opened' ? expandData : openData}
          borderRadius={5}
          size={21}
          color={COLOR.BLACK}
        />
        <HeaderRightButton
          name={NAV_BTN.CLOSE}
          backgroundColor={COLOR.GRAY0}
          onPress={onClose}
          borderRadius={5}
          size={21}
          color={COLOR.BLACK}
        />
      </View>
    );
  }, [expandData, screenState, onClose, openData]);

  useEffect(() => {
    navigation.setOptions({
      headerTitle: () => headerTitleButton(),
      //headerLeft: (props: JSX.IntrinsicAttributes & HeaderBackButtonProps) => headerLeftButton(props),
      headerRight: () => headerRightButton(),
    });
  }, [headerLeftButton, headerRightButton, headerTitleButton, navigation]);
  //console.log(layer.name);
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      enabled
      keyboardVerticalOffset={10}
    >
      <ScrollView>
        <DataEditLayerName value={layer.name} />

        {layer.field.map(({ name, format, list }, index) => {
          switch (format) {
            case 'PHOTO':
              return (
                <View key={index}>
                  <DataEditPhoto fieldName={name} />
                  <DataEditModalPhotoView />
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
              const refField = list && list[1] && list[1].value;
              const primaryField = list && list[2] && list[2].value;
              const primaryKey = primaryField === '_id' ? data.id : primaryField && data.field[primaryField];
              //console.log(refLayerId, refField, primaryField, primaryKey);
              return (
                refLayer !== undefined &&
                refField !== undefined &&
                primaryKey !== undefined && (
                  <DataEditReference
                    key={index}
                    name={name}
                    primaryKey={primaryKey}
                    refLayer={refLayer}
                    refField={refField}
                    isEditingRecord={isEditingRecord}
                    onPress={gotoReferenceData}
                    pressAddReferenceData={pressAddReferenceData}
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
});
