import React from 'react';
import { View, StyleSheet } from 'react-native';
import { MAPLIST_BTN } from '../../constants/AppConstants';
import { Button } from '../atoms';

interface Props {
  reloadMapList: () => void;
}
export const MapListButtons = (props: Props) => {
  const { reloadMapList } = props;

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
