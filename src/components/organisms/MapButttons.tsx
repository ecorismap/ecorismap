import React, { useContext } from 'react';
import { View, StyleSheet } from 'react-native';
import { MAPS_BTN } from '../../constants/AppConstants';
import { MapsContext } from '../../contexts/Maps';
import { Button } from '../atoms';
import { t } from '../../i18n/config';

export const MapButtons = React.memo(() => {
  const { pressOpenEditMap, pressImportMaps, pressExportMaps } = useContext(MapsContext);

  return (
    <View style={styles.buttonContainer}>
      {/* <Button name={MAPS_BTN.MAP_LIST} onPress={gotoMapList} /> */}

      <Button
        name={MAPS_BTN.IMPORT}
        onPress={pressImportMaps}
        tooltipText={t('Maps.tooltip.import')}
        labelText={t('Maps.label.import')}
      />
      <Button
        name={MAPS_BTN.MAP_ADD}
        onPress={() => pressOpenEditMap(null)}
        tooltipText={t('Maps.tooltip.add')}
        labelText={t('Maps.label.add')}
      />
      <Button
        name={MAPS_BTN.EXPORT}
        onPress={pressExportMaps}
        tooltipText={t('Maps.tooltip.download')}
        tooltipPosition={{ right: 1 }}
        labelText={t('Maps.label.export')}
        labelFontSize={9}
      />
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
