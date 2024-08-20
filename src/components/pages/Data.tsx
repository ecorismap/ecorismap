import React, { useCallback, useContext, useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';

import { DataTable } from '../organisms/DataTable';
import { DataButton } from '../organisms/DataButton';

import { useNavigation } from '@react-navigation/native';
import { HeaderBackButton, HeaderBackButtonProps } from '@react-navigation/elements';
import { DataContext } from '../../contexts/Data';
//import perf, { FirebasePerformanceTypes } from '@react-native-firebase/perf';
import { ScrollView } from 'react-native-gesture-handler';

export default function DataScreen() {
  //console.log('render Data');

  const { layer, isChecked, gotoBack } = useContext(DataContext);

  const navigation = useNavigation();

  const headerLeftButton = useCallback(
    (props_: JSX.IntrinsicAttributes & HeaderBackButtonProps) => (
      <HeaderBackButton {...props_} labelVisible={false} onPress={gotoBack} />
    ),
    [gotoBack]
  );

  useEffect(() => {
    navigation.setOptions({
      title: layer.name,
      headerTitleStyle: {
        fontSize: layer.name.length > 13 ? 10 : 15,
      },
      headerLeft: (props: JSX.IntrinsicAttributes & HeaderBackButtonProps) => headerLeftButton(props),
    });
  }, [gotoBack, headerLeftButton, isChecked, layer.name, navigation]);

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
      <ScrollView horizontal={true} contentContainerStyle={{ flexGrow: 1 }}>
        {Platform.OS === 'web' ? (
          <ScrollView style={{ flex: 1, flexDirection: 'column', marginBottom: 10 }}>
            <DataTable />
          </ScrollView>
        ) : (
          <View style={{ flex: 1, flexDirection: 'column', marginBottom: 10 }}>
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
