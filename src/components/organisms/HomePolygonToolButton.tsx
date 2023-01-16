import React, { useState } from 'react';
import { COLOR, POLYGONTOOL } from '../../constants/AppConstants';
import { DrawToolType, PolygonToolType } from '../../types';
import { isPolygonTool } from '../../utils/General';

import { Button } from '../atoms';
import SelectionalLongPressButton from '../atoms/SelectionalLongPressButton';

interface Props {
  disabled?: boolean;
  isPositionRight: boolean;
  currentDrawTool: DrawToolType;
  selectDrawTool: (value: DrawToolType) => void;
}

export const HomePolygonToolButton = (props: Props) => {
  const { disabled, isPositionRight, currentDrawTool, selectDrawTool } = props;
  const [currentTool, setCurrentTool] = useState<PolygonToolType>(
    isPolygonTool(currentDrawTool) ? currentDrawTool : 'PLOT_POLYGON'
  );

  return (
    <SelectionalLongPressButton selectedButton={currentTool} directionRow={'row'} isPositionRight={isPositionRight}>
      <Button
        id={'PLOT_POLYGON'}
        name={POLYGONTOOL.PLOT_POLYGON}
        disabled={disabled}
        backgroundColor={
          disabled ? COLOR.ALFAGRAY : currentDrawTool === 'PLOT_POLYGON' ? COLOR.ALFARED : COLOR.ALFABLUE
        }
        borderRadius={10}
        onPressCustom={() => {
          setCurrentTool('PLOT_POLYGON');
          selectDrawTool('PLOT_POLYGON');
        }}
      />
      <Button
        id={'FREEHAND_POLYGON'}
        name={POLYGONTOOL.FREEHAND_POLYGON}
        disabled={disabled}
        backgroundColor={
          disabled ? COLOR.ALFAGRAY : currentDrawTool === 'FREEHAND_POLYGON' ? COLOR.ALFARED : COLOR.ALFABLUE
        }
        borderRadius={10}
        onPressCustom={() => {
          setCurrentTool('FREEHAND_POLYGON');
          selectDrawTool('FREEHAND_POLYGON');
        }}
      />
    </SelectionalLongPressButton>
  );
};
