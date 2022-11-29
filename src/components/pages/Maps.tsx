import React, { useCallback, useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { COLOR, MAPS_BTN, NAV_BTN } from '../../constants/AppConstants';
import HeaderRightButton from '../molecules/HeaderRightButton';
import { MapButtons } from '../organisms/MapButttons';
import { MapModalTileMap } from '../organisms/MapModalTileMap';
import { MapItems } from '../organisms/MapItems';
import { TileMapType } from '../../types';
import { useNavigation } from '@react-navigation/native';
import { useDisplay } from '../../hooks/useDisplay';

interface Props {
  isOffline: boolean;
  maps: TileMapType[];
  editedMap: TileMapType;
  isMapEditorOpen: boolean;
  changeVisible: (visible: boolean, index: number) => void;
  changeMapOrder: (index: number) => void;
  pressToggleOnline: () => void;
  pressDownloadMap: (item: TileMapType) => void;
  pressDeleteMap: (tileMap: TileMapType) => void;
  pressOpenEditMap: (editTileMap: TileMapType | null) => void;
  pressEditMapOK: (newTileMap: TileMapType) => void;
  pressEditMapCancel: () => void;
  gotoMapList: () => void;
}

export default function MapScreen(props: Props) {
  //console.log('render Maps');
  const {
    isOffline,
    maps,
    editedMap,
    isMapEditorOpen,
    changeMapOrder,
    changeVisible,
    pressToggleOnline,
    pressDownloadMap,
    pressDeleteMap,
    pressOpenEditMap,
    pressEditMapOK,
    pressEditMapCancel,
    gotoMapList,
  } = props;
  const navigation = useNavigation();
  const { isDataOpened, expandData, openData, closeData } = useDisplay();

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
          name={isDataOpened === 'opened' ? NAV_BTN.EXPAND : NAV_BTN.COLLAPSE}
          backgroundColor={COLOR.GRAY0}
          onPress={isDataOpened === 'opened' ? expandData : openData}
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
    [closeData, expandData, isDataOpened, openData]
  );

  useEffect(() => {
    navigation.setOptions({
      headerLeft: () => headerLeftButton(),
      headerRight: () => headerRightButton(),
    });
  }, [headerLeftButton, headerRightButton, navigation]);

  return (
    <View style={styles.container}>
      <MapItems
        tileMap={maps}
        changeMapOrder={changeMapOrder}
        changeVisible={changeVisible}
        downloadTileMap={pressDownloadMap}
        showModalTileMap={pressOpenEditMap}
      />
      <MapButtons showModalTileMap={() => pressOpenEditMap(null)} gotoMapList={gotoMapList} />
      <MapModalTileMap
        visible={isMapEditorOpen}
        deleteTileMap={pressDeleteMap}
        pressOK={pressEditMapOK}
        pressCancel={pressEditMapCancel}
        data={editedMap}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
});
