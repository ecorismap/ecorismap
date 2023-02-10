import React, { useCallback, useContext, useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { COLOR, MAPS_BTN, NAV_BTN } from '../../constants/AppConstants';
import HeaderRightButton from '../molecules/HeaderRightButton';
import { MapButtons } from '../organisms/MapButttons';
import { MapModalTileMap } from '../organisms/MapModalTileMap';
import { MapItems } from '../organisms/MapItems';
import { useNavigation } from '@react-navigation/native';
import { useScreen } from '../../hooks/useScreen';
import { MapsContext } from '../../contexts/Maps';

export default function MapScreen() {
  //console.log('render Maps');
  const { isOffline, pressToggleOnline } = useContext(MapsContext);
  const navigation = useNavigation();
  const { screenState, expandData, openData, closeData } = useScreen();

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

  const headerRightButton = useCallback(
    () => (
      <View style={{ flexDirection: 'row' }}>
        <HeaderRightButton
          name={screenState === 'opened' ? NAV_BTN.EXPAND : NAV_BTN.COLLAPSE}
          backgroundColor={COLOR.GRAY0}
          onPress={screenState === 'opened' ? expandData : openData}
          borderRadius={5}
          size={21}
          color={COLOR.BLACK}
        />
        <HeaderRightButton
          name={NAV_BTN.CLOSE}
          backgroundColor={COLOR.GRAY0}
          onPress={closeData}
          borderRadius={5}
          size={21}
          color={COLOR.BLACK}
        />
      </View>
    ),
    [closeData, expandData, screenState, openData]
  );

  useEffect(() => {
    navigation.setOptions({
      headerLeft: () => headerLeftButton(),
      headerRight: () => headerRightButton(),
    });
  }, [headerLeftButton, headerRightButton, navigation]);

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
