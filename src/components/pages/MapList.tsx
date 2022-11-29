import { HeaderBackButton, HeaderBackButtonProps } from '@react-navigation/elements';
import { useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect } from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator, Text } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import { TileMapItemType } from '../../types';
import { MapListButtons } from '../organisms/MapListButtons';
import { MapListTable } from '../organisms/MapListTable';
import { t } from '../../i18n/config';

interface Props {
  data: TileMapItemType[];
  isLoading: boolean;
  addMap: (map: TileMapItemType) => void;
  reloadMapList: () => void;
  gotoBack: () => void;
}

export default function MapListScreen(props: Props) {
  //console.log('render Maps');
  const { data, isLoading, addMap, reloadMapList, gotoBack } = props;
  const navigation = useNavigation();

  const headerLeftButton = useCallback(
    (props_: JSX.IntrinsicAttributes & HeaderBackButtonProps) => <HeaderBackButton {...props_} onPress={gotoBack} />,
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
          <MapListTable data={data} addMap={addMap} />
        </ScrollView>
      )}
      <MapListButtons reloadMapList={reloadMapList} />
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
