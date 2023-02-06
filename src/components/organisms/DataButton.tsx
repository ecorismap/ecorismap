import React, { useContext, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { COLOR, DATA_BTN } from '../../constants/AppConstants';
import { DataContext } from '../../contexts/Data';
import { Button } from '../atoms';

export const DataButton = () => {
  const { projectId, isChecked, pressAddData, pressDeleteData, pressExportData } = useContext(DataContext);

  const exportDisabled = useMemo(() => projectId !== undefined, [projectId]);

  return (
    <>
      <View style={styles.button}>
        <Button name={DATA_BTN.ADD} onPress={pressAddData} backgroundColor={COLOR.BLUE} />

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
