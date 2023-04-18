import React from 'react';
import { COLOR, LINETOOL } from '../../constants/AppConstants';
import { DrawToolType, LineToolType } from '../../types';

import { Button } from '../atoms';
import SelectionalLongPressButton from '../atoms/SelectionalLongPressButton';

interface Props {
  disabled?: boolean;
  isPositionRight: boolean;
  currentDrawTool: DrawToolType;
  currentLineTool: LineToolType;
  selectDrawTool: (value: DrawToolType) => void;
  setLineTool: React.Dispatch<React.SetStateAction<LineToolType>>;
}

export const HomeMapMemoThicknessButton = (props: Props) => {
  const { disabled, isPositionRight, currentDrawTool, selectDrawTool, setLineTool } = props;

  const currentMapMemoThickness = 'FREEHAND_LINE';
  return (
    <SelectionalLongPressButton
      selectedButton={currentMapMemoThickness}
      directionRow={'row'}
      isPositionRight={isPositionRight}
    >
      <Button
        id={'FREEHAND_LINE'}
        name={LINETOOL.FREEHAND_LINE}
        disabled={disabled}
        backgroundColor={
          disabled ? COLOR.ALFAGRAY : currentDrawTool === 'FREEHAND_LINE' ? COLOR.ALFARED : COLOR.ALFABLUE
        }
        borderRadius={10}
        onPressCustom={() => {
          setLineTool('FREEHAND_LINE');
          selectDrawTool('FREEHAND_LINE');
        }}
      />
    </SelectionalLongPressButton>
  );
};
