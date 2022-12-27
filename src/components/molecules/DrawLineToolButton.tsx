import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { COLOR, DRAWLINETOOL } from '../../constants/AppConstants';
import { DrawLineToolType, LineToolType } from '../../types';

import { Button } from '../atoms';
import SelectionalLongPressButton from '../atoms/SelectionalLongPressButton';

interface Props {
  isPositionRight: boolean;
  currentLineTool: LineToolType;
  selectLineTool: (value: LineToolType) => void;
}

export const DrawLineToolButton = (props: Props) => {
  const { isPositionRight, currentLineTool, selectLineTool } = props;
  const [currentTool, setCurrentTool] = useState<DrawLineToolType>('DRAW');

  return (
    <View style={{ ...styles.button, width: undefined }}>
      <SelectionalLongPressButton selectedButton={currentTool} directionRow={'row'} isPositionRight={isPositionRight}>
        <Button
          id={'DRAW'}
          name={DRAWLINETOOL.DRAW}
          backgroundColor={currentLineTool === 'DRAW' ? COLOR.ALFARED : COLOR.ALFABLUE}
          borderRadius={10}
          onPressCustom={() => {
            setCurrentTool('DRAW');
            selectLineTool('DRAW');
          }}
        />
        <Button
          id={'AREA'}
          name={DRAWLINETOOL.AREA}
          backgroundColor={currentLineTool === 'AREA' ? COLOR.ALFARED : COLOR.ALFABLUE}
          borderRadius={10}
          onPressCustom={() => {
            setCurrentTool('AREA');
            selectLineTool('AREA');
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
