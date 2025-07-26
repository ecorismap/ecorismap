import React, { useCallback, useContext, useEffect } from 'react';
import { View, StyleSheet, Platform, Text } from 'react-native';

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

  const { layer, gotoBack, addDataByDictinary } = useContext(DataContext);

  const navigation = useNavigation();

  const customHeader = useCallback(
    (props_: JSX.IntrinsicAttributes & HeaderBackButtonProps) => (
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 63, backgroundColor: COLOR.MAIN }}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          {/* @ts-ignore */}
          <HeaderBackButton
            {...props_}
            labelVisible={true}
            label={t('Layers.navigation.title')}
            labelStyle={{ fontSize: 11 }}
            onPress={gotoBack}
            style={{ marginLeft: 10 }}
          />
        </View>
        <View style={{ flex: 2, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontSize: layer.name.length > 13 ? 10 : 15 }}>{layer.name}</Text>
        </View>
        <View style={{ flex: 1 }} />
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
            handleSelect={(text: string) => addDataByDictinary(layer.dictionaryFieldId!, text)}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
});
