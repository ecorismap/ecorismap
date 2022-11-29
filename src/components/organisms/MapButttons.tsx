import React from 'react';
import { View, StyleSheet } from 'react-native';
import { MAPS_BTN } from '../../constants/AppConstants';
import { Button } from '../atoms';

interface Props {
  showModalTileMap: () => void;
  gotoMapList: () => void;
}

export const MapButtons = React.memo((props: Props) => {
  const { showModalTileMap, gotoMapList } = props;

  return (
    <View style={styles.buttonContainer}>
      <Button name={MAPS_BTN.MAP_LIST} onPress={gotoMapList} />
      <Button name={MAPS_BTN.MAP_ADD} onPress={showModalTileMap} />
    </View>
  );
});

const styles = StyleSheet.create({
  buttonContainer: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    margin: 20,
  },
});
