import React, { useCallback, useContext, useEffect } from 'react';
import { View, StyleSheet, Platform, Text, ActivityIndicator } from 'react-native';

import { DataTable } from '../organisms/DataTable';
import { DataButton } from '../organisms/DataButton';

import { useNavigation } from '@react-navigation/native';
import { HeaderBackButton, HeaderBackButtonProps } from '@react-navigation/elements';
import { DataContext } from '../../contexts/Data';
//import perf, { FirebasePerformanceTypes } from '@react-native-firebase/perf';
import { ScrollView } from 'react-native-gesture-handler';
import { DictionaryTextInput } from '../molecules/DictionaryTextInput';
import { t } from '../../i18n/config';
import { COLOR } from '../../constants/AppConstants';

export default function DataScreen() {
  //console.log('render Data');

  const { layer, gotoBack, addDataByDictionary, isExporting } = useContext(DataContext);

  const navigation = useNavigation();

  const customHeader = useCallback(
    (props_: JSX.IntrinsicAttributes & HeaderBackButtonProps) => (
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          height: 63,
          backgroundColor: COLOR.MAIN,
        }}
      >
        <View style={{ flex: 1.5, justifyContent: 'center' }}>
          {/* @ts-ignore */}
          <HeaderBackButton
            {...props_}
            label={t('Layers.navigation.title')}
            labelStyle={{ fontSize: 11 }}
            onPress={gotoBack}
            style={{ marginLeft: 10 }}
          />
        </View>
        <View style={{ minWidth: 200, flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text numberOfLines={1} adjustsFontSizeToFit>
            {layer.name}
          </Text>
        </View>
        <View style={{ flex: 1.5 }} />
      </View>
    ),
    [gotoBack, layer.name]
  );

  useEffect(() => {
    navigation.setOptions({
      header: customHeader,
    });
  }, [customHeader, navigation]);

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
    justifyContent: 'flex-end',
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
