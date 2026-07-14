import React, { useContext } from 'react';
import { View, StyleSheet, Platform, Text, ActivityIndicator, Switch } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { DataTable } from '../organisms/DataTable';
import { DataButton } from '../organisms/DataButton';

import { DataContext } from '../../contexts/Data';
//import perf, { FirebasePerformanceTypes } from '@react-native-firebase/perf';
import { ScrollView } from 'react-native-gesture-handler';
import { DictionaryTextInput } from '../molecules/DictionaryTextInput';
import { t } from '../../i18n/config';
import { COLOR, DATA_BTN } from '../../constants/AppConstants';
import { BottomSheetHeader } from '../molecules/BottomSheetHeader';

export default function DataScreen() {
  //console.log('render Data');

  const { layer, gotoBack, addDataByDictionary, isExporting, isLocationEnabled, pressToggleLocation, isEditable } =
    useContext(DataContext);

  // 過去の不具合でdictionaryFieldIdが残留したレイヤがあるため、辞書型フィールドの実在も確認する
  const hasValidDictionaryField =
    layer.dictionaryFieldId !== undefined &&
    layer.field.some((f) => f.id === layer.dictionaryFieldId && f.format === 'STRING_DICTIONARY');

  // useEffect(() => {
  //   let screenTrace: FirebasePerformanceTypes.ScreenTrace;
  //   (async () => {
  //     screenTrace = await perf().startScreenTrace('DataScreen');
  //     screenTrace.start();
  //   })();
  //   return () => {
  //     (async () => {
  //       await screenTrace.stop();
  //     })();
  //   };
  // }, []);

  return (
    <View style={styles.container}>
      <BottomSheetHeader title={layer.name} showBackButton onBack={gotoBack} />
      {hasValidDictionaryField && (
        <View style={styles.dictionaryContainer}>
          {/* 位置あり/なし切替。辞書からのデータ追加時に現在地を付与するかを制御する */}
          {layer.type === 'POINT' && (
            <View style={styles.locationToggle}>
              <MaterialCommunityIcons
                name={isLocationEnabled ? DATA_BTN.LOCATION_ON : DATA_BTN.LOCATION_OFF}
                size={22}
                color={isLocationEnabled ? COLOR.BLUE : COLOR.GRAY3}
              />
              <Switch
                value={isLocationEnabled}
                onValueChange={pressToggleLocation}
                disabled={!isEditable}
                trackColor={{ false: COLOR.GRAY2, true: COLOR.LIGHTBLUE }}
                thumbColor={isLocationEnabled ? COLOR.BLUE : COLOR.GRAY1}
                // iOSのSwitchはデフォルトでalignSelf: 'flex-start'を持つため、親のalignItems: 'center'が効かない
                style={{ alignSelf: 'center' }}
              />
            </View>
          )}
          <View style={styles.dictionaryInput}>
            <DictionaryTextInput
              initialValue=""
              table={`_${layer.id}_${layer.dictionaryFieldId}`}
              handleSelect={(text: string) => addDataByDictionary(layer.dictionaryFieldId!, text)}
              clearOnSelect
            />
          </View>
        </View>
      )}
      <View style={styles.tableContainer}>
        <ScrollView horizontal={true} contentContainerStyle={{ flexGrow: 1 }}>
          {Platform.OS === 'web' ? (
            <ScrollView style={{ flex: 1 }}>
              <DataTable />
            </ScrollView>
          ) : (
            <View style={{ flex: 1 }}>
              <DataTable />
            </View>
          )}
        </ScrollView>
      </View>
      <DataButton />
      {isExporting && (
        <View style={styles.exportingOverlay}>
          <View style={styles.exportingOverlayContent}>
            <ActivityIndicator size="large" color={COLOR.PROGRESS_BAR_FILL} />
            <Text style={styles.exportingOverlayText}>{t('Data.message.exporting')}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  dictionaryContainer: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    margin: 10,
  },
  dictionaryInput: {
    flex: 1,
  },
  locationToggle: {
    alignItems: 'center',
    flexDirection: 'row',
    // 辞書入力行の高さ（マイクボタン: アイコン30 + パディング8×2 = 46）に合わせて中心を揃える
    height: 46,
    marginRight: 8,
  },
  tableContainer: {
    flex: 1,
  },
  exportingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLOR.SAVING_OVERLAY,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  exportingOverlayContent: {
    backgroundColor: COLOR.WHITE,
    borderRadius: 10,
    paddingVertical: 20,
    paddingHorizontal: 24,
    minWidth: 220,
    alignItems: 'center',
    shadowColor: COLOR.BLACK,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  exportingOverlayText: {
    marginTop: 12,
    fontSize: 16,
    color: COLOR.TEXT_DARK,
  },
});
