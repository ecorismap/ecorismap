import React from 'react';
import { COLOR, POINTTOOL } from '../../constants/AppConstants';
import { DrawToolType, PointToolType } from '../../types';

import { Button } from '../atoms';
import SelectionalLongPressButton from '../atoms/SelectionalLongPressButton';

interface Props {
  disabled?: boolean;
  isEditing: boolean;
  isPositionRight: boolean;
  currentDrawTool: DrawToolType;
  currentPointTool: PointToolType;
  selectDrawTool: (value: DrawToolType) => void;
  setPointTool: React.Dispatch<React.SetStateAction<PointToolType>>;
}

export const HomePointToolButton = (props: Props) => {
  const { disabled, isEditing, isPositionRight, currentDrawTool, currentPointTool, selectDrawTool, setPointTool } =
    props;

  return (
    <SelectionalLongPressButton
      selectedButton={currentPointTool}
      directionRow={'row'}
      isPositionRight={isPositionRight}
    >
      <Button
        id={'ADD_LOCATION_POINT'}
        name={POINTTOOL.ADD_LOCATION_POINT}
        disabled={disabled}
        backgroundColor={
          disabled ? COLOR.ALFAGRAY : currentDrawTool === 'ADD_LOCATION_POINT' ? COLOR.ALFARED : COLOR.ALFABLUE
        }
        borderRadius={10}
        onPressCustom={() => {
          setPointTool('ADD_LOCATION_POINT');
          selectDrawTool('ADD_LOCATION_POINT');
        }}
      />
      <Button
        id={'PLOT_POINT'}
        name={POINTTOOL.PLOT_POINT}
        disabled={disabled || isEditing}
        backgroundColor={disabled ? COLOR.ALFAGRAY : currentDrawTool === 'PLOT_POINT' ? COLOR.ALFARED : COLOR.ALFABLUE}
        borderRadius={10}
        onPressCustom={() => {
          setPointTool('PLOT_POINT');
          selectDrawTool('PLOT_POINT');
        }}
      />
    </SelectionalLongPressButton>
  );
};
