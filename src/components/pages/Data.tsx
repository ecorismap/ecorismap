import React, { useContext, useMemo } from 'react';
import { View, StyleSheet, Platform, Text, ActivityIndicator, Switch } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { DataTable } from '../organisms/DataTable';
import { DataModalFilter } from '../organisms/DataModalFilter';
import { DataButton } from '../organisms/DataButton';

import { DataContext } from '../../contexts/Data';
//import perf, { FirebasePerformanceTypes } from '@react-native-firebase/perf';
import { ScrollView } from 'react-native-gesture-handler';
import { DictionaryTextInput } from '../molecules/DictionaryTextInput';
import { DynamicDictionaryTextInput } from '../molecules/DynamicDictionaryTextInput';
import { t } from '../../i18n/config';
import { COLOR, DATA_BTN, DATAEDIT_BTN } from '../../constants/AppConstants';
import { FILTER_BLANK, FILTER_NOT_BLANK, getFilterableFieldNames } from '../../utils/Data';
import { BottomSheetHeader } from '../molecules/BottomSheetHeader';
import { Button } from '../atoms';
import { Pressable } from '../atoms/Pressable';

export default function DataScreen() {
  //console.log('render Data');

  const {
    layer,
    projectId,
    gotoBack,
    addDataByDictionary,
    isExporting,
    isLocationEnabled,
    isLocationLocked,
    pressToggleLocation,
    pressToggleLocationLock,
    isEditable,
    filterText,
    filterFieldName,
    isFiltering,
    clearFilter,
    showOnlyFilteredRecords,
    sortedRecordSet,
    getFieldCandidates,
    filterTarget,
    openFilterDialog,
    closeFilterDialog,
    applyFilter,
  } = useContext(DataContext);

  //空白/空白以外のトークンは表示用ラベルに変換する
  const filterValueLabel =
    filterText === FILTER_BLANK
      ? t('Data.label.blank')
      : filterText === FILTER_NOT_BLANK
        ? t('Data.label.notBlank')
        : filterText;

  //絞り込みモーダルの対象列の選択肢。データ表の列と同じ並び（User→フィールド順）
  const fieldOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    if (projectId !== undefined && layer.permission !== 'COMMON') options.push({ value: '_user_', label: 'User' });
    getFilterableFieldNames(layer).forEach((name) => options.push({ value: name, label: name }));
    return options;
  }, [layer, projectId]);

  // 過去の不具合でdictionaryFieldIdが残留したレイヤがあるため、対応フィールドの実在も確認する
  const dictionaryField = layer.field.find(
    (f) => f.id === layer.dictionaryFieldId && (f.format === 'STRING_DICTIONARY' || f.format === 'STRING_DYNAMIC')
  );
  const hasValidDictionaryField = layer.dictionaryFieldId !== undefined && dictionaryField !== undefined;

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
      <BottomSheetHeader
        title={layer.name}
        showBackButton
        onBack={gotoBack}
        rightComponent={
          <Pressable style={styles.headerFilterButton} onPress={() => openFilterDialog(filterFieldName || (fieldOptions[0]?.value ?? ''))}>
            <MaterialCommunityIcons
              name={isFiltering ? 'filter' : 'filter-outline'}
              size={20}
              color={isFiltering ? COLOR.BLUE : COLOR.GRAY4}
            />
            <Text style={[styles.headerFilterButtonText, isFiltering && { color: COLOR.BLUE }]}>
              {t('Data.label.filter')}
            </Text>
          </Pressable>
        }
      />
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
              {/* ロック中は記録後も位置ONのままにする */}
              <Button
                name={isLocationLocked ? 'lock' : 'lock-open-variant'}
                onPress={pressToggleLocationLock}
                disabled={!isEditable}
                color={isLocationLocked ? COLOR.BLUE : COLOR.GRAY3}
                backgroundColor="transparent"
                size={22}
              />
            </View>
          )}
          <View style={styles.dictionaryInput}>
            {dictionaryField?.format === 'STRING_DYNAMIC' ? (
              <DynamicDictionaryTextInput
                initialValue=""
                fieldKey={`${layer.id}_${layer.dictionaryFieldId}`}
                handleSelect={(text: string) => addDataByDictionary(layer.dictionaryFieldId!, text)}
                clearOnSelect
                commitOnSelectOnly
              />
            ) : (
              <DictionaryTextInput
                initialValue=""
                table={`_${layer.id}_${layer.dictionaryFieldId}`}
                handleSelect={(text: string) => addDataByDictionary(layer.dictionaryFieldId!, text)}
                clearOnSelect
              />
            )}
          </View>
        </View>
      )}
      {/* 絞り込みは列ヘッダの長押しから設定する。絞り込み中だけ状態と解除手段を出す */}
      {isFiltering && (
        <View style={styles.filterContainer}>
          <MaterialCommunityIcons name="filter" size={18} color={COLOR.BLUE} />
          <Text style={styles.filterLabel} numberOfLines={1}>
            {filterFieldName === ''
              ? `${t('Data.label.filter')}: ${filterValueLabel}`
              : `${filterFieldName === '_user_' ? 'User' : filterFieldName}: ${filterValueLabel}`}
          </Text>
          <Text style={styles.filterCount}>{t('Data.message.filterResult', { count: sortedRecordSet.length })}</Text>
          <View style={styles.filterSpacer} />
          <Pressable style={styles.filterMapButton} onPress={showOnlyFilteredRecords}>
            <MaterialCommunityIcons name={DATAEDIT_BTN.JUMP} size={18} color={COLOR.BLUE} />
            <Text style={styles.filterMapButtonText}>{t('Data.label.showOnMap')}</Text>
          </Pressable>
          <Button
            name="close-circle"
            onPress={clearFilter}
            color={COLOR.GRAY3}
            backgroundColor="transparent"
            size={20}
            style={styles.filterClearButton}
          />
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
      {/* 開いているときだけマウントする（Modalを常設すると毎回のレンダリングコストになる） */}
      {filterTarget !== undefined && (
        <DataModalFilter
          visible={true}
          fieldOptions={fieldOptions}
          initialFieldName={filterTarget}
          defaultValue={
            filterTarget === filterFieldName && filterText !== FILTER_BLANK && filterText !== FILTER_NOT_BLANK
              ? filterText
              : ''
          }
          getFieldCandidates={getFieldCandidates}
          pressOK={applyFilter}
          pressCancel={closeFilterDialog}
        />
      )}
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
  filterContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 36,
    marginBottom: 5,
    marginHorizontal: 10,
  },
  filterClearButton: {
    //ボタン自体の余白でアイコンが内側に寄って見えるため、右端へ少し出す
    marginLeft: 4,
    marginRight: -8,
  },
  filterCount: {
    color: COLOR.GRAY4,
    fontSize: 12,
    marginLeft: 6,
  },
  filterLabel: {
    color: COLOR.BLACK,
    //長い条件は省略する。件数はアイコンのすぐ隣に置きたいので伸ばさない
    flexShrink: 1,
    fontSize: 14,
    marginLeft: 4,
  },
  filterMapButton: {
    alignItems: 'center',
    borderColor: COLOR.BLUE,
    borderRadius: 4,
    borderWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  filterMapButtonText: {
    color: COLOR.BLUE,
    fontSize: 12,
    marginLeft: 3,
  },
  filterSpacer: {
    flex: 1,
  },
  headerFilterButton: {
    alignItems: 'center',
    flexDirection: 'row',
    padding: 5,
  },
  headerFilterButtonText: {
    color: COLOR.GRAY4,
    fontSize: 12,
    marginLeft: 2,
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
