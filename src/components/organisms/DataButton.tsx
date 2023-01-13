import React from 'react';
import { View, StyleSheet } from 'react-native';
import { COLOR, DATA_BTN } from '../../constants/AppConstants';
import { Button } from '../atoms';

interface Props {
  exportDisabled: boolean;
  isChecked: boolean;
  addData: () => void;
  deleteData: () => void;
  pressExportData: () => void;
}
export const DataButton = (props: Props) => {
  const { exportDisabled, isChecked, addData, deleteData, pressExportData } = props;

  return (
    <>
      <View style={styles.button}>
        <Button name={DATA_BTN.ADD} onPress={addData} backgroundColor={COLOR.BLUE} />

        {!exportDisabled && (
          <Button
            name={DATA_BTN.EXPORT}
            onPress={pressExportData}
            backgroundColor={isChecked ? COLOR.BLUE : COLOR.LIGHTBLUE}
            disabled={!isChecked}
          />
        )}
        <Button
          name={DATA_BTN.DELETE}
          onPress={deleteData}
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
