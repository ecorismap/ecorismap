import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { COLOR, LINETOOL } from '../../constants/AppConstants';
import { LineToolType, SelectionToolType } from '../../types';

import { Button } from '../atoms';
import SelectionalLongPressButton from '../atoms/SelectionalLongPressButton';

interface Props {
  disabled: boolean;
  isPositionRight: boolean;
  currentLineTool: LineToolType;
  selectLineTool: (value: LineToolType) => void;
}

export const SelectionToolButton = (props: Props) => {
  const { disabled, isPositionRight, currentLineTool, selectLineTool } = props;
  const [currentTool, setCurrentTool] = useState<SelectionToolType>('INFO');

  return (
    <View style={{ ...styles.button, width: undefined }}>
      <SelectionalLongPressButton selectedButton={currentTool} directionRow={'row'} isPositionRight={isPositionRight}>
        <Button
          id={'INFO'}
          name={LINETOOL.INFO}
          backgroundColor={currentLineTool === 'INFO' ? COLOR.ALFARED : disabled ? COLOR.ALFAGRAY : COLOR.ALFABLUE}
          borderRadius={10}
          disabled={disabled}
          onPressCustom={() => {
            setCurrentTool('INFO');
            selectLineTool('INFO');
          }}
        />
        <Button
          id={'SELECT'}
          name={LINETOOL.SELECT}
          backgroundColor={currentLineTool === 'SELECT' ? COLOR.ALFARED : disabled ? COLOR.ALFAGRAY : COLOR.ALFABLUE}
          borderRadius={10}
          disabled={disabled}
          onPressCustom={() => {
            setCurrentTool('SELECT');
            selectLineTool('SELECT');
          }}
        />
      </SelectionalLongPressButton>
    </View>
  );
};
const styles = StyleSheet.create({
  button: {
    alignSelf: 'flex-start',
    marginTop: 5,
    width: 36,
  },
});
