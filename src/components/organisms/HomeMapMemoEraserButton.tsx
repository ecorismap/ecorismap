import React from 'react';
import { COLOR, ERASER } from '../../constants/AppConstants';
import { MapMemoToolType, EraserType } from '../../types';

import { Button } from '../atoms';
import SelectionalLongPressButton from '../atoms/SelectionalLongPressButton';

interface Props {
  disabled?: boolean;
  isPositionRight: boolean;
  currentMapMemoTool: MapMemoToolType;
  currentEraser: EraserType;
  selectMapMemoTool: (value: MapMemoToolType) => void;
  setEraser: React.Dispatch<React.SetStateAction<EraserType>>;
}

export const HomeMapMemoEraserButton = (props: Props) => {
  const { disabled, isPositionRight, currentEraser, currentMapMemoTool, selectMapMemoTool, setEraser } = props;
  return (
    <SelectionalLongPressButton selectedButton={currentEraser} directionRow={'row'} isPositionRight={isPositionRight}>
      <Button
        id={'ERASER'}
        name={ERASER.ERASER}
        disabled={disabled}
        backgroundColor={disabled ? COLOR.ALFAGRAY : currentMapMemoTool === 'ERASER' ? COLOR.ALFARED : COLOR.ALFABLUE}
        borderRadius={10}
        onPressCustom={() => {
          setEraser('ERASER');
          selectMapMemoTool('ERASER');
        }}
      />
    </SelectionalLongPressButton>
  );
};
