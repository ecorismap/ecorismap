import React, { useContext } from 'react';
import { View, StyleSheet } from 'react-native';
import { MAPLIST_BTN } from '../../constants/AppConstants';
import { MapListContext } from '../../contexts/MapList';
import { Button } from '../atoms';

export const MapListButtons = () => {
  const { reloadMapList } = useContext(MapListContext);

  return (
    <View style={styles.buttonContainer}>
      <Button name={MAPLIST_BTN.RELOAD} onPress={reloadMapList} />
    </View>
  );
};

const styles = StyleSheet.create({
  buttonContainer: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    margin: 20,
  },
});
