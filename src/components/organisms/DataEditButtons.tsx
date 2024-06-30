import React, { useContext } from 'react';
import { View, StyleSheet } from 'react-native';

import { Button } from '../atoms';
import { COLOR, DATAEDIT_BTN } from '../../constants/AppConstants';
import { DataEditContext } from '../../contexts/DataEdit';
import { t } from '../../i18n/config';

export const DataEditButtons = () => {
  const { layer, isEditingRecord, pressCopyData, pressDeleteData, gotoHomeAndJump, gotoGoogleMaps, pressEditPosition } =
    useContext(DataEditContext);

  return (
    <>
      <View style={styles.buttonContainer}>
        <Button
          name={DATAEDIT_BTN.JUMP}
          onPress={gotoHomeAndJump}
          backgroundColor={isEditingRecord ? COLOR.LIGHTBLUE : COLOR.BLUE}
          disabled={isEditingRecord}
          tooltipText={t('DataEdit.tooltip.jump')}
        />
        <Button
          name={DATAEDIT_BTN.GOOGLE}
          onPress={gotoGoogleMaps}
          backgroundColor={isEditingRecord ? COLOR.LIGHTBLUE : COLOR.BLUE}
          disabled={isEditingRecord}
          tooltipText={t('DataEdit.tooltip.google')}
        />
        {layer.type === 'POINT' && (
          <Button
            name={DATAEDIT_BTN.EDIT}
            onPress={pressEditPosition}
            backgroundColor={isEditingRecord ? COLOR.LIGHTBLUE : COLOR.BLUE}
            disabled={isEditingRecord}
            tooltipText={t('DataEdit.tooltip.edit')}
          />
        )}
        <Button
          name={DATAEDIT_BTN.COPY}
          onPress={pressCopyData}
          backgroundColor={isEditingRecord ? COLOR.LIGHTBLUE : COLOR.BLUE}
          disabled={isEditingRecord}
          tooltipText={t('DataEdit.tooltip.copy')}
        />
        <Button
          name={DATAEDIT_BTN.DELETE}
          onPress={pressDeleteData}
          backgroundColor={COLOR.BLUE}
          tooltipText={t('DataEdit.tooltip.delete')}
        />
      </View>
    </>
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
