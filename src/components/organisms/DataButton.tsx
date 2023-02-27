import React, { useContext } from 'react';
import { View, StyleSheet } from 'react-native';
import { COLOR, DATA_BTN } from '../../constants/AppConstants';
import { DataContext } from '../../contexts/Data';
import { Button } from '../atoms';

export const DataButton = () => {
  const { layer, isChecked, isOwnerAdmin, pressAddData, pressDeleteData, pressExportData } = useContext(DataContext);

  return (
    <>
      <View style={styles.button}>
        {layer.type === 'NONE' ||
          (layer.type === 'POINT' && (
            <Button name={DATA_BTN.ADD} onPress={pressAddData} backgroundColor={COLOR.BLUE} />
          ))}
        {isOwnerAdmin && (
          <Button
            name={DATA_BTN.EXPORT}
            onPress={pressExportData}
            backgroundColor={isChecked ? COLOR.BLUE : COLOR.LIGHTBLUE}
            disabled={!isChecked}
          />
        )}
        <Button
          name={DATA_BTN.DELETE}
          onPress={pressDeleteData}
          backgroundColor={isChecked ? COLOR.BLUE : COLOR.LIGHTBLUE}
          disabled={!isChecked}
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
