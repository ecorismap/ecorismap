import React, { useContext } from 'react';
import { View, StyleSheet, Platform, Text, ActivityIndicator } from 'react-native';

import { DataTable } from '../organisms/DataTable';
import { DataButton } from '../organisms/DataButton';

import { DataContext } from '../../contexts/Data';
//import perf, { FirebasePerformanceTypes } from '@react-native-firebase/perf';
import { ScrollView } from 'react-native-gesture-handler';
import { DictionaryTextInput } from '../molecules/DictionaryTextInput';
import { t } from '../../i18n/config';
import { COLOR } from '../../constants/AppConstants';
import { BottomSheetHeader } from '../molecules/BottomSheetHeader';

export default function DataScreen() {
  //console.log('render Data');

  const { layer, gotoBack, addDataByDictionary, isExporting } = useContext(DataContext);

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
      {layer.dictionaryFieldId !== undefined && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', margin: 10 }}>
          <DictionaryTextInput
            initialValue=""
            table={`_${layer.id}_${layer.dictionaryFieldId}`}
            handleSelect={(text: string) => addDataByDictionary(layer.dictionaryFieldId!, text)}
            clearOnSelect
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
