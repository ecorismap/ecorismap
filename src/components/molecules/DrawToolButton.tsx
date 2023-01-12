import React, { useState } from 'react';
import { COLOR, DRAWTOOL } from '../../constants/AppConstants';
import { DrawToolType, LineToolType } from '../../types';

import { Button } from '../atoms';
import SelectionalLongPressButton from '../atoms/SelectionalLongPressButton';

interface Props {
  disabled?: boolean;
  isPositionRight: boolean;
  currentLineTool: LineToolType;
  selectLineTool: (value: LineToolType) => void;
}

export const DrawToolButton = (props: Props) => {
  const { disabled, isPositionRight, currentLineTool, selectLineTool } = props;
  const [currentTool, setCurrentTool] = useState<DrawToolType>('DRAW');

  return (
    <SelectionalLongPressButton selectedButton={currentTool} directionRow={'row'} isPositionRight={isPositionRight}>
      <Button
        id={'DRAW'}
        name={DRAWTOOL.DRAW}
        disabled={disabled}
        backgroundColor={disabled ? COLOR.ALFAGRAY : currentLineTool === 'DRAW' ? COLOR.ALFARED : COLOR.ALFABLUE}
        borderRadius={10}
        onPressCustom={() => {
          setCurrentTool('DRAW');
          selectLineTool('DRAW');
        }}
      />
      <Button
        id={'AREA'}
        name={DRAWTOOL.AREA}
        disabled={disabled}
        backgroundColor={disabled ? COLOR.ALFAGRAY : currentLineTool === 'AREA' ? COLOR.ALFARED : COLOR.ALFABLUE}
        borderRadius={10}
        onPressCustom={() => {
          setCurrentTool('AREA');
          selectLineTool('AREA');
        }}
      />
    </SelectionalLongPressButton>
  );
};
