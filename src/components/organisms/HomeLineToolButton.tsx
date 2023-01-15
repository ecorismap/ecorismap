import React, { useState } from 'react';
import { COLOR, LINETOOL } from '../../constants/AppConstants';
import { DrawToolType, LineToolType } from '../../types';

import { Button } from '../atoms';
import SelectionalLongPressButton from '../atoms/SelectionalLongPressButton';

interface Props {
  disabled?: boolean;
  isPositionRight: boolean;
  currentDrawTool: DrawToolType;
  selectDrawTool: (value: DrawToolType) => void;
}

export const HomeLineToolButton = (props: Props) => {
  const { disabled, isPositionRight, currentDrawTool, selectDrawTool } = props;
  const [currentTool, setCurrentTool] = useState<LineToolType>('FREEHAND_LINE');

  return (
    <SelectionalLongPressButton selectedButton={currentTool} directionRow={'row'} isPositionRight={isPositionRight}>
      <Button
        id={'FREEHAND_LINE'}
        name={LINETOOL.FREEHAND_LINE}
        disabled={disabled}
        backgroundColor={
          disabled ? COLOR.ALFAGRAY : currentDrawTool === 'FREEHAND_LINE' ? COLOR.ALFARED : COLOR.ALFABLUE
        }
        borderRadius={10}
        onPressCustom={() => {
          setCurrentTool('FREEHAND_LINE');
          selectDrawTool('FREEHAND_LINE');
        }}
      />
    </SelectionalLongPressButton>
  );
};
