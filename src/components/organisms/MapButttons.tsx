import React, { useContext } from 'react';
import { View, StyleSheet } from 'react-native';
import { MAPS_BTN } from '../../constants/AppConstants';
import { MapsContext } from '../../contexts/Maps';
import { Button } from '../atoms';
import { t } from '../../i18n/config';

export const MapButtons = React.memo(() => {
  const { gotoMapEdit, pressImportMaps } = useContext(MapsContext);

  return (
    <View style={styles.buttonContainer}>
      {/* <Button name={MAPS_BTN.MAP_LIST} onPress={gotoMapList} /> */}

      <Button name={MAPS_BTN.IMPORT} onPress={pressImportMaps} labelText={t('Maps.label.import')} />
      <Button name={MAPS_BTN.MAP_ADD} onPress={() => gotoMapEdit(null)} labelText={t('Maps.label.add')} />
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
