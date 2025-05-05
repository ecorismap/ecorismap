import React, { useCallback, useContext, useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { COLOR, MAPS_BTN } from '../../constants/AppConstants';
import HeaderRightButton from '../molecules/HeaderRightButton';
import { MapButtons } from '../organisms/MapButttons';
import { MapTable } from '../organisms/MapTable';
import { useNavigation } from '@react-navigation/native';
import { MapsContext } from '../../contexts/Maps';
import { Loading } from '../molecules/Loading';
import { t } from '../../i18n/config';
import { ScrollView } from 'react-native-gesture-handler';

export default function MapScreen() {
  //console.log('render Maps');
  const { progress, isLoading, isOffline, pressToggleOnline } = useContext(MapsContext);
  const navigation = useNavigation();

  const headerLeftButton = useCallback(
    () =>
      Platform.OS === 'web' ? null : (
        <HeaderRightButton
          name={isOffline ? MAPS_BTN.OFFLINE : MAPS_BTN.ONLINE}
          backgroundColor={isOffline ? 'red' : COLOR.LIGHTBLUE2}
          onPress={pressToggleOnline}
          labelText={isOffline ? t('Maps.label.offline') : t('Maps.label.online')}
          size={20}
        />
      ),
    [isOffline, pressToggleOnline]
  );

  useEffect(() => {
    navigation.setOptions({
      headerLeft: () => headerLeftButton(),
    });
  }, [headerLeftButton, navigation]);

  return (
    <View style={styles.container}>
      <Loading visible={isLoading} text={t('common.processing') + '\n' + progress + '%'} />
      <ScrollView>
        <MapTable />
      </ScrollView>
      <MapButtons />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
});
