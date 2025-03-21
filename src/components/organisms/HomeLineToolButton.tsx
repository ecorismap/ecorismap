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

export const HomeLineToolButton = (props: Props) => {
  const { disabled, isPositionRight, currentDrawTool, currentLineTool, selectDrawTool, setLineTool } = props;

  return (
    <SelectionalLongPressButton selectedButton={currentLineTool} directionRow={'row'} isPositionRight={isPositionRight}>
      <Button
        id={'PLOT_LINE'}
        name={LINETOOL.PLOT_LINE}
        disabled={disabled}
        backgroundColor={disabled ? COLOR.ALFAGRAY : currentDrawTool === 'PLOT_LINE' ? COLOR.ALFARED : COLOR.ALFABLUE}
        borderRadius={10}
        onPressCustom={() => {
          setLineTool('PLOT_LINE');
          selectDrawTool('PLOT_LINE');
        }}
        labelText="追加"
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
          setLineTool('FREEHAND_LINE');
          selectDrawTool('FREEHAND_LINE');
        }}
        labelText="フリー"
      />
      <Button
        id={'SPLIT_LINE'}
        name={LINETOOL.SPLIT_LINE}
        disabled={disabled}
        backgroundColor={disabled ? COLOR.ALFAGRAY : currentDrawTool === 'SPLIT_LINE' ? COLOR.ALFARED : COLOR.ALFABLUE}
        borderRadius={10}
        onPressCustom={() => {
          setLineTool('SPLIT_LINE');
          selectDrawTool('SPLIT_LINE');
        }}
        labelText="分割"
      />
    </SelectionalLongPressButton>
  );
};
