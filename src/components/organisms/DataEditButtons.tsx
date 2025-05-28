import React, { useContext } from 'react';
import { View, StyleSheet } from 'react-native';

import { Button } from '../atoms';
import { COLOR, DATAEDIT_BTN } from '../../constants/AppConstants';
import { DataEditContext } from '../../contexts/DataEdit';
import { t } from '../../i18n/config';

export const DataEditButtons = () => {
  const {
    layer,
    isEditingRecord,
    isEditable,
    pressCopyData,
    pressDeleteData,
    pressJumpToData,
    gotoGoogleMaps,
    pressEditPosition,
  } = useContext(DataEditContext);

  return (
    <View style={styles.buttonContainer}>
      <Button
        name={DATAEDIT_BTN.JUMP}
        onPress={pressJumpToData}
        backgroundColor={isEditingRecord ? COLOR.LIGHTBLUE : COLOR.BLUE}
        disabled={isEditingRecord}
        tooltipText={t('DataEdit.tooltip.jump')}
        labelText={t('DataEdit.label.jump')}
      />
      <Button
        name={DATAEDIT_BTN.GOOGLE}
        onPress={gotoGoogleMaps}
        backgroundColor={isEditingRecord ? COLOR.LIGHTBLUE : COLOR.BLUE}
        disabled={isEditingRecord}
        tooltipText={t('DataEdit.tooltip.google')}
        labelText={t('DataEdit.label.google')}
      />
      {(layer.type === 'POINT' || layer.type === 'LINE' || layer.type === 'POLYGON') && (
        <Button
          name={DATAEDIT_BTN.EDIT}
          onPress={pressEditPosition}
          backgroundColor={isEditingRecord || !isEditable ? COLOR.LIGHTBLUE : COLOR.BLUE}
          disabled={isEditingRecord || !isEditable}
          tooltipText={t('DataEdit.tooltip.edit')}
          labelText={t('DataEdit.label.edit')}
        />
      )}
      <Button
        name={DATAEDIT_BTN.COPY}
        onPress={pressCopyData}
        backgroundColor={isEditingRecord || !isEditable ? COLOR.LIGHTBLUE : COLOR.BLUE}
        disabled={isEditingRecord || !isEditable}
        tooltipText={t('DataEdit.tooltip.copy')}
        labelText={t('DataEdit.label.copy')}
      />
      <Button
        name={DATAEDIT_BTN.DELETE}
        onPress={pressDeleteData}
        backgroundColor={isEditingRecord || !isEditable ? COLOR.LIGHTBLUE : COLOR.BLUE}
        disabled={isEditingRecord || !isEditable}
        tooltipText={t('DataEdit.tooltip.delete')}
        labelText={t('DataEdit.label.delete')}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  buttonContainer: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    marginVertical: 20,
  },
});
