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
        id={'ERASER_THIN'}
        name={ERASER.ERASER_THIN}
        disabled={disabled}
        backgroundColor={
          disabled ? COLOR.ALFAGRAY : currentMapMemoTool === 'ERASER_THIN' ? COLOR.ALFARED : COLOR.ALFABLUE
        }
        borderRadius={10}
        onPressCustom={() => {
          setEraser('ERASER_THIN');
          selectMapMemoTool('ERASER_THIN');
        }}
      />
      <Button
        id={'ERASER_MEDIUM'}
        name={ERASER.ERASER_MEDIUM}
        disabled={disabled}
        backgroundColor={
          disabled ? COLOR.ALFAGRAY : currentMapMemoTool === 'ERASER_MEDIUM' ? COLOR.ALFARED : COLOR.ALFABLUE
        }
        borderRadius={10}
        onPressCustom={() => {
          setEraser('ERASER_MEDIUM');
          selectMapMemoTool('ERASER_MEDIUM');
        }}
      />
      <Button
        id={'ERASER_THICK'}
        name={ERASER.ERASER_THICK}
        disabled={disabled}
        backgroundColor={
          disabled ? COLOR.ALFAGRAY : currentMapMemoTool === 'ERASER_THICK' ? COLOR.ALFARED : COLOR.ALFABLUE
        }
        borderRadius={10}
        onPressCustom={() => {
          setEraser('ERASER_THICK');
          selectMapMemoTool('ERASER_THICK');
        }}
      />
    </SelectionalLongPressButton>
  );
};
