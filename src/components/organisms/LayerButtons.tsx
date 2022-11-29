import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LAYERS_BTN } from '../../constants/AppConstants';
import { Button } from '../atoms';

interface Props {
  addLayer: () => void;
  pressImportLayerAndData: () => Promise<void>;
}

export const LayerButtons = (props: Props) => {
  const { addLayer, pressImportLayerAndData } = props;

  return (
    <View style={styles.buttonContainer}>
      <View style={{ marginHorizontal: 9 }}>
        <Button name={LAYERS_BTN.IMPORT} onPress={pressImportLayerAndData} />
      </View>
      <View style={{ marginHorizontal: 9 }}>
        <Button name={LAYERS_BTN.ADD} onPress={addLayer} />
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
