import React, { useCallback, useContext, useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { COLOR, MAPS_BTN } from '../../constants/AppConstants';
import HeaderRightButton from '../molecules/HeaderRightButton';
import { MapButtons } from '../organisms/MapButttons';
import { MapModalTileMap } from '../organisms/MapModalTileMap';
import { MapItems } from '../organisms/MapItems';
import { useNavigation } from '@react-navigation/native';
import { MapsContext } from '../../contexts/Maps';

export default function MapScreen() {
  //console.log('render Maps');
  const { isOffline, pressToggleOnline } = useContext(MapsContext);
  const navigation = useNavigation();

  const headerLeftButton = useCallback(
    () =>
      Platform.OS === 'web' ? null : (
        <HeaderRightButton
          name={isOffline ? MAPS_BTN.OFFLINE : MAPS_BTN.ONLINE}
          backgroundColor={isOffline ? 'red' : COLOR.BLUE}
          onPress={pressToggleOnline}
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
      <MapItems />
      <MapButtons />
      <MapModalTileMap />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
});
