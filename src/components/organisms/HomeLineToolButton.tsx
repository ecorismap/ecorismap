import React, { useState } from 'react';
import { COLOR, LINETOOL } from '../../constants/AppConstants';
import { DrawToolType, LineToolType } from '../../types';
import { isLineTool } from '../../utils/General';

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
  const [currentTool, setCurrentTool] = useState<LineToolType>(
    isLineTool(currentDrawTool) ? currentDrawTool : 'PLOT_LINE'
  );

  return (
    <SelectionalLongPressButton selectedButton={currentTool} directionRow={'row'} isPositionRight={isPositionRight}>
      <Button
        id={'PLOT_LINE'}
        name={LINETOOL.PLOT_LINE}
        disabled={disabled}
        backgroundColor={disabled ? COLOR.ALFAGRAY : currentDrawTool === 'PLOT_LINE' ? COLOR.ALFARED : COLOR.ALFABLUE}
        borderRadius={10}
        onPressCustom={() => {
          setCurrentTool('PLOT_LINE');
          selectDrawTool('PLOT_LINE');
        }}
      />
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
