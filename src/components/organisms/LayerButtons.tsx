import React, { useContext } from 'react';
import { View, StyleSheet } from 'react-native';
import { LAYERS_BTN } from '../../constants/AppConstants';
import { LayersContext } from '../../contexts/Layers';
import { Button } from '../atoms';
import { t } from '../../i18n/config';

export const LayerButtons = () => {
  const { gotoLayerEditForAdd, pressImportLayerAndData } = useContext(LayersContext);

  return (
    <View style={styles.buttonContainer}>
      <View style={{ marginHorizontal: 9 }}>
        <Button name={LAYERS_BTN.IMPORT} onPress={pressImportLayerAndData} labelText={t('Layer.label.import')} />
      </View>
      <View style={{ marginHorizontal: 9 }}>
        <Button name={LAYERS_BTN.ADD} onPress={gotoLayerEditForAdd} labelText={t('Layer.label.add')} />
      </View>
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
