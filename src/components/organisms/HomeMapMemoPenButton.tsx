import React from 'react';
import { COLOR, PEN } from '../../constants/AppConstants';
import { MapMemoToolType, PenType } from '../../types';

import { Button } from '../atoms';
import SelectionalLongPressButton from '../atoms/SelectionalLongPressButton';

interface Props {
  disabled?: boolean;
  isPositionRight: boolean;
  currentMapMemoTool: MapMemoToolType;
  currentPen: PenType;
  penColor: string;
  selectMapMemoTool: (value: MapMemoToolType) => void;
  setPen: React.Dispatch<React.SetStateAction<PenType>>;
}

export const HomeMapMemoPenButton = (props: Props) => {
  const { disabled, isPositionRight, currentPen, currentMapMemoTool, penColor, selectMapMemoTool, setPen } = props;
  return (
    <SelectionalLongPressButton selectedButton={currentPen} directionRow={'row'} isPositionRight={isPositionRight}>
      <Button
        id={'PEN_THIN'}
        name={PEN.PEN_THIN}
        disabled={disabled}
        color={penColor}
        backgroundColor={disabled ? COLOR.ALFAGRAY : currentMapMemoTool === 'PEN_THIN' ? COLOR.ALFARED : COLOR.ALFABLUE}
        borderRadius={10}
        onPressCustom={() => {
          setPen('PEN_THIN');
          selectMapMemoTool('PEN_THIN');
        }}
      />
      <Button
        id={'PEN_MEDIUM'}
        name={PEN.PEN_MEDIUM}
        disabled={disabled}
        color={penColor}
        backgroundColor={
          disabled ? COLOR.ALFAGRAY : currentMapMemoTool === 'PEN_MEDIUM' ? COLOR.ALFARED : COLOR.ALFABLUE
        }
        borderRadius={10}
        onPressCustom={() => {
          setPen('PEN_MEDIUM');
          selectMapMemoTool('PEN_MEDIUM');
        }}
      />
      <Button
        id={'PEN_THICK'}
        name={PEN.PEN_THICK}
        disabled={disabled}
        color={penColor}
        backgroundColor={
          disabled ? COLOR.ALFAGRAY : currentMapMemoTool === 'PEN_THICK' ? COLOR.ALFARED : COLOR.ALFABLUE
        }
        borderRadius={10}
        onPressCustom={() => {
          setPen('PEN_THICK');
          selectMapMemoTool('PEN_THICK');
        }}
      />
    </SelectionalLongPressButton>
  );
};
