import React, { useContext } from 'react';
import { View, StyleSheet } from 'react-native';
import { COLOR, LAYEREDIT_BTN } from '../../constants/AppConstants';
import { LayerEditContext } from '../../contexts/LayerEdit';

import { Button } from '../atoms';
import { t } from '../../i18n/config';

export const LayerEditButton = () => {
  const { layer, isEdited, pressDeleteLayer, pressExportLayer } = useContext(LayerEditContext);
  // trackレイヤは軌跡記録の固定レイヤのため削除不可（エクスポートは可）
  const editable = layer.id !== 'track';
  return (
    <View style={styles.buttonContainer}>
      <Button
        name={LAYEREDIT_BTN.EXPORT}
        onPress={pressExportLayer}
        backgroundColor={!isEdited ? COLOR.BLUE : COLOR.LIGHTBLUE}
        disabled={isEdited}
        labelText={t('LayerEdit.label.export')}
        labelFontSize={9}
      />
      <Button
        name={LAYEREDIT_BTN.DELETE}
        backgroundColor={isEdited || !editable ? COLOR.LIGHTBLUE : COLOR.DARKRED}
        disabled={isEdited || !editable}
        onPress={pressDeleteLayer}
        labelText={t('LayerEdit.label.delete')}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  buttonContainer: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    margin: 20,
  },
});
