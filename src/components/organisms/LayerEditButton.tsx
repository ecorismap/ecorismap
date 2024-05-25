import React, { useContext } from 'react';
import { View, StyleSheet } from 'react-native';
import { COLOR, LAYEREDIT_BTN } from '../../constants/AppConstants';
import { LayerEditContext } from '../../contexts/LayerEdit';

import { Button } from '../atoms';
import { t } from '../../i18n/config';

export const LayerEditButton = () => {
  const { isEdited, pressSaveLayer, pressDeleteLayer, pressExportLayer } = useContext(LayerEditContext);
  const editable = true;
  return (
    <View style={styles.buttonContainer}>
      <Button
        name={LAYEREDIT_BTN.DELETE}
        backgroundColor={isEdited || !editable ? COLOR.LIGHTBLUE : COLOR.BLUE}
        disabled={isEdited || !editable}
        onPress={pressDeleteLayer}
        tooltipText={t('LayerEdit.tooltip.delete')}
      />

      <Button
        name={LAYEREDIT_BTN.EXPORT}
        onPress={pressExportLayer}
        backgroundColor={!isEdited ? COLOR.BLUE : COLOR.LIGHTBLUE}
        disabled={isEdited}
        tooltipText={t('LayerEdit.tooltip.export')}
      />
      <Button
        name={LAYEREDIT_BTN.SAVE}
        onPress={pressSaveLayer}
        backgroundColor={isEdited ? COLOR.BLUE : COLOR.LIGHTBLUE}
        disabled={!isEdited}
        tooltipText={t('LayerEdit.tooltip.save')}
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
