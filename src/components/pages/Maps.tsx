import React, { useContext } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { COLOR, MAPS_BTN } from '../../constants/AppConstants';
import { Button } from '../atoms';
import { MapButtons } from '../organisms/MapButttons';
import { MapTable } from '../organisms/MapTable';
import { MapsContext } from '../../contexts/Maps';
import { Loading } from '../molecules/Loading';
import { t } from '../../i18n/config';
import { BottomSheetHeader } from '../molecules/BottomSheetHeader';

export default function MapScreen() {
  //console.log('render Maps');
  const { progress, isLoading, isOffline, pressToggleOnline, gotoDownload } = useContext(MapsContext);

  const leftComponent =
    Platform.OS !== 'web' ? (
      <Button
        name={isOffline ? MAPS_BTN.OFFLINE : MAPS_BTN.ONLINE}
        backgroundColor={isOffline ? 'red' : COLOR.LIGHTBLUE2}
        onPress={pressToggleOnline}
        labelText={isOffline ? t('Maps.label.offline') : t('Maps.label.online')}
        size={20}
        borderRadius={50}
      />
    ) : undefined;

  const rightComponent =
    Platform.OS !== 'web' ? (
      <Button
        name="arrow-right"
        backgroundColor={COLOR.MAIN}
        onPress={gotoDownload}
        labelText={t('Home.navigation.download')}
        labelTextColor={COLOR.GRAY3}
        labelFontSize={11}
        size={20}
        color={COLOR.GRAY3}
        borderRadius={5}
        borderWidth={1}
        borderColor={COLOR.GRAY3}
        style={{ width: 75, height: 36, marginLeft: 'auto' }}
      />
    ) : undefined;

  return (
    <View style={styles.container}>
      <BottomSheetHeader
        title={t('Maps.navigation.title')}
        leftComponent={leftComponent}
        rightComponent={rightComponent}
      />
      <Loading visible={isLoading} text={t('common.processing') + '\n' + progress + '%'} />
      <View style={styles.tableContainer}>
        <MapTable />
      </View>
      <MapButtons />
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
});
