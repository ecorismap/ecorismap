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

  const headerLeftButton = useCallback(
    (props_: JSX.IntrinsicAttributes & HeaderBackButtonProps) => (
      <HeaderBackButton {...props_} labelVisible={false} onPress={gotoBack} />
    ),
    [gotoBack]
  );

  useEffect(() => {
    navigation.setOptions({
      headerLeft: (props_: JSX.IntrinsicAttributes & HeaderBackButtonProps) => headerLeftButton(props_),
      headerBackTitle: t('common.back'),
    });
  }, [headerLeftButton, navigation]);

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
