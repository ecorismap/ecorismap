import React, { useContext } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import { MapListButtons } from '../organisms/MapListButtons';
import { MapListTable } from '../organisms/MapListTable';
import { t } from '../../i18n/config';
import { MapListContext } from '../../contexts/MapList';
import { ScrollView } from 'react-native-gesture-handler';
import { BottomSheetHeader } from '../molecules/BottomSheetHeader';

export default function MapListScreen() {
  //console.log('render Maps');
  const { isLoading, gotoBack } = useContext(MapListContext);

  return (
    <View style={styles.container}>
      <BottomSheetHeader title={t('MapList.navigation.title')} showBackButton onBack={gotoBack} />
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
