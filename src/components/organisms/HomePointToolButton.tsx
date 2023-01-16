import React, { useState } from 'react';
import { COLOR, POINTTOOL } from '../../constants/AppConstants';
import { DrawToolType, PointToolType } from '../../types';
import { isPointTool } from '../../utils/General';

import { Button } from '../atoms';
import SelectionalLongPressButton from '../atoms/SelectionalLongPressButton';

interface Props {
  disabled?: boolean;
  isPositionRight: boolean;
  currentDrawTool: DrawToolType;
  selectDrawTool: (value: DrawToolType) => void;
}

export const HomePointToolButton = (props: Props) => {
  const { disabled, isPositionRight, currentDrawTool, selectDrawTool } = props;
  const [currentTool, setCurrentTool] = useState<PointToolType>(
    isPointTool(currentDrawTool) ? currentDrawTool : 'ADD_LOCATION_POINT'
  );

  return (
    <SelectionalLongPressButton selectedButton={currentTool} directionRow={'row'} isPositionRight={isPositionRight}>
      <Button
        id={'ADD_LOCATION_POINT'}
        name={POINTTOOL.ADD_LOCATION_POINT}
        disabled={disabled}
        backgroundColor={
          disabled ? COLOR.ALFAGRAY : currentDrawTool === 'ADD_LOCATION_POINT' ? COLOR.ALFARED : COLOR.ALFABLUE
        }
        borderRadius={10}
        onPressCustom={() => {
          setCurrentTool('ADD_LOCATION_POINT');
          selectDrawTool('ADD_LOCATION_POINT');
        }}
      />
      <Button
        id={'ADD_POINT'}
        name={POINTTOOL.ADD_POINT}
        disabled={disabled}
        backgroundColor={disabled ? COLOR.ALFAGRAY : currentDrawTool === 'ADD_POINT' ? COLOR.ALFARED : COLOR.ALFABLUE}
        borderRadius={10}
        onPressCustom={() => {
          setCurrentTool('ADD_POINT');
          selectDrawTool('ADD_POINT');
        }}
      />
      <Button
        id={'MOVE_POINT'}
        name={POINTTOOL.MOVE_POINT}
        disabled={disabled}
        backgroundColor={disabled ? COLOR.ALFAGRAY : currentDrawTool === 'MOVE_POINT' ? COLOR.ALFARED : COLOR.ALFABLUE}
        borderRadius={10}
        onPressCustom={() => {
          setCurrentTool('MOVE_POINT');
          selectDrawTool('MOVE_POINT');
        }}
      />
    </SelectionalLongPressButton>
  );
};
