import React, { useContext } from 'react';
import { View, StyleSheet } from 'react-native';
import { MAPS_BTN } from '../../constants/AppConstants';
import { MapsContext } from '../../contexts/Maps';
import { Button } from '../atoms';

export const MapButtons = React.memo(() => {
  const { pressOpenEditMap, gotoMapList, pressImportMaps, pressExportMaps } = useContext(MapsContext);

  return (
    <View style={styles.buttonContainer}>
      {/* <Button name={MAPS_BTN.MAP_LIST} onPress={gotoMapList} /> */}

      <Button name={MAPS_BTN.IMPORT} onPress={pressImportMaps} />
      <Button name={MAPS_BTN.MAP_ADD} onPress={() => pressOpenEditMap(null)} />
      <Button name={MAPS_BTN.EXPORT} onPress={pressExportMaps} />
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
