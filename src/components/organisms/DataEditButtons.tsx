import React, { useContext } from 'react';
import { View, StyleSheet } from 'react-native';

import { Button } from '../atoms';
import { COLOR, DATAEDIT_BTN } from '../../constants/AppConstants';
import { DataEditContext } from '../../contexts/DataEdit';
import { t } from '../../i18n/config';

export const DataEditButtons = () => {
  const { layer, isEditingRecord, pressCopyData, pressDeleteData, gotoHomeAndJump, gotoGoogleMaps } =
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
        <Button
          name={DATAEDIT_BTN.DELETE}
          onPress={pressDeleteData}
          backgroundColor={COLOR.BLUE}
          tooltipText={t('DataEdit.tooltip.delete')}
        />
        <Button
          name={DATAEDIT_BTN.COPY}
          onPress={pressCopyData}
          backgroundColor={isEditingRecord ? COLOR.LIGHTBLUE : COLOR.BLUE}
          disabled={isEditingRecord}
          tooltipText={t('DataEdit.tooltip.copy')}
        />
        {(layer.type === 'POINT' || layer.type === 'LINE' || layer.type === 'POLYGON') && (
          <Button
            name={DATAEDIT_BTN.EDIT}
            onPress={() => null}
            backgroundColor={isEditingRecord ? COLOR.LIGHTBLUE : COLOR.BLUE}
            disabled={isEditingRecord}
            tooltipText={t('DataEdit.tooltip.edit')}
          />
        )}
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
