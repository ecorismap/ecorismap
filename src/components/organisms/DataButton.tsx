import React, { useContext, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { COLOR, DATA_BTN } from '../../constants/AppConstants';
import { DataContext } from '../../contexts/Data';
import { Button } from '../atoms';
import { t } from '../../i18n/config';

export const DataButton = () => {
  const {
    layer,
    projectId,
    isChecked,
    isEditable,
    isExporting,
    isLocationEnabled,
    pressAddData,
    pressDeleteData,
    pressExportData,
    pressToggleLocation,
  } = useContext(DataContext);

  const exportDisabled = useMemo(() => false && projectId !== undefined, [projectId]);

  return (
    <View style={styles.button}>
      {(layer.type === 'NONE' || layer.type === 'POINT') && (
        <Button
          name={DATA_BTN.ADD}
          onPress={pressAddData}
          backgroundColor={isEditable ? COLOR.BLUE : COLOR.LIGHTBLUE}
          disabled={!isEditable}
          labelText={t('Data.label.add')}
        />
      )}
      {layer.type === 'POINT' && (
        <Button
          name={isLocationEnabled ? DATA_BTN.LOCATION_ON : DATA_BTN.LOCATION_OFF}
          onPress={pressToggleLocation}
          backgroundColor={isLocationEnabled ? COLOR.BLUE : COLOR.GRAY3}
          disabled={!isEditable}
          labelText={t('Data.label.location')}
        />
      )}
      {!exportDisabled && (
        <Button
          name={DATA_BTN.EXPORT}
          onPress={pressExportData}
          backgroundColor={isChecked && isEditable && !isExporting ? COLOR.BLUE : COLOR.LIGHTBLUE}
          disabled={!(isChecked && isEditable) || isExporting}
          labelText={t('Data.label.export')}
        />
      )}
      <Button
        name={DATA_BTN.DELETE}
        onPress={pressDeleteData}
        backgroundColor={isChecked && isEditable ? COLOR.BLUE : COLOR.LIGHTBLUE}
        disabled={!(isChecked && isEditable)}
        labelText={t('Data.label.delete')}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  button: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    margin: 20,
  },
});
