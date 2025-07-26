import { HeaderBackButton, HeaderBackButtonProps } from '@react-navigation/elements';
import { useNavigation } from '@react-navigation/native';
import React, { useCallback, useContext, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import { MapListButtons } from '../organisms/MapListButtons';
import { MapListTable } from '../organisms/MapListTable';
import { t } from '../../i18n/config';
import { MapListContext } from '../../contexts/MapList';
import { ScrollView } from 'react-native-gesture-handler';

export default function MapListScreen() {
  //console.log('render Maps');
  const { isLoading, gotoBack } = useContext(MapListContext);
  const navigation = useNavigation();

  const customHeader = useCallback(
    (props_: JSX.IntrinsicAttributes & HeaderBackButtonProps) => (
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 63, backgroundColor: COLOR.MAIN }}>
        <View style={{ flex: 1.5, justifyContent: 'center' }}>
          {/* @ts-ignore */}
          <HeaderBackButton {...props_} labelVisible={true} onPress={gotoBack} style={{ marginLeft: 10 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontSize: 16 }}>{t('MapList.navigation.title')}</Text>
        </View>
        <View style={{ flex: 1.5 }} />
      </View>
    ),
    [gotoBack]
  );

  useEffect(() => {
    navigation.setOptions({
      header: customHeader,
    });
  }, [customHeader, navigation]);

  return (
    <View style={styles.container}>
      {isLoading ? (
        <View style={styles.indicator}>
          <ActivityIndicator size="large" color={COLOR.BLUE} />
          <Text>Loading...</Text>
        </View>
      ) : (
        <ScrollView horizontal={true} contentContainerStyle={{ flexGrow: 1 }}>
          <MapListTable />
        </ScrollView>
      )}
      <MapListButtons />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  indicator: {
    alignItems: 'center',
    flex: 1,
    //flexDirection: 'row',
    justifyContent: 'center',

    //padding: 10,
  },
});
