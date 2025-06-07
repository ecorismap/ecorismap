import React, { useContext, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { COLOR, DATA_BTN } from '../../constants/AppConstants';
import { DataContext } from '../../contexts/Data';
import { Button } from '../atoms';
import { t } from '../../i18n/config';

export const DataButton = () => {
  const { layer, projectId, isChecked, isEditable, pressAddData, pressDeleteData, pressExportData } =
    useContext(DataContext);

  const exportDisabled = useMemo(() => false && projectId !== undefined, [projectId]);

  return (
    <>
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
        {!exportDisabled && (
          <Button
            name={DATA_BTN.DOWNLOAD}
            onPress={pressExportData}
            backgroundColor={isChecked && isEditable ? COLOR.BLUE : COLOR.LIGHTBLUE}
            disabled={!(isChecked && isEditable)}
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
    </>
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
